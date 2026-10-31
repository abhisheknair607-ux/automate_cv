"use strict";
/* Normalised, candidate-owned career records. Intentionally separate from Drive
 * evidence archives and the production CV source; all writes are staging-only. */
const {getFirestore}=require("firebase-admin/firestore");
const {permit}=require("./profile_access");
const DATA_COLLECTION="garamaalCareerStructuredStagingV1";
const FIELDS=Object.freeze({
 experience:["employer","title","location","startDate","endDate","summary"],
 education:["institution","qualification","location","startDate","endDate","details"],
 projects:["name","role","period","description"],
 skills:["name","category","proficiency","notes"],
 certifications:["name","issuer","date","details"],
 awards:["title","organisation","date","details"],
 volunteering:["organisation","role","period","details"],
 preferences:["targetRole","location","workType","notes"],
});
const ENTRY_TYPES=Object.keys(FIELDS);
const BULLET_FIELDS=["title","situation","task","action","result","metricValue","metricContext","evidenceNote"];
const error=(msg,code=400)=>Object.assign(Error(msg),{httpCode:code});
const copy=x=>JSON.parse(JSON.stringify(x));
const empty=key=>({schema:1,candidate:key,revision:0,
 overview:{fullName:"",headline:"",summary:"",location:"",links:""},
 lists:Object.fromEntries(ENTRY_TYPES.map(type=>[type,[]]))});
const string=(v,limit=6000)=>{
 if(typeof v!=="string"||v.length>limit)throw error("Invalid or overly long Profile field");
 return v;
};
function parse(input,key){
 if(!input||Array.isArray(input)||typeof input!=="object")throw error("Invalid structured Profile data");
 if(input.candidate!==key)throw error("Candidate mismatch",403);
 if(!input.overview||!input.lists||typeof input.lists!=="object"||Array.isArray(input.lists))throw error("Missing structured Profile fields");
 const out=empty(key),summary=["fullName","headline","summary","location","links"];
 if(Object.keys(input.overview).some(k=>!summary.includes(k)))throw error("Unexpected summary field");
 for(const k of summary)out.overview[k]=string(input.overview[k]??"",k==="summary"?10000:1200);
 if(Object.keys(input.lists).some(k=>!ENTRY_TYPES.includes(k)))throw error("Unexpected career section");
 let count=0;
 for(const type of ENTRY_TYPES){
  const rows=input.lists[type];
  if(!Array.isArray(rows)||rows.length>120)throw error("Too many career entries");
  const seen=new Set();
  out.lists[type]=rows.map(row=>{
   count++;
   if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(row.id)||seen.has(row.id))throw error("Invalid or repeated entry ID");
   seen.add(row.id);
   const allowed=[...FIELDS[type],"id",...(type==="experience"||type==="projects"?["achievements"]:[])];
   if(Object.keys(row).some(k=>!allowed.includes(k)))throw error("Unexpected field in "+type);
   const clean={id:row.id};
   for(const k of FIELDS[type])clean[k]=string(row[k]??"",k==="summary"||k==="description"?10000:3000);
   if(type==="experience"||type==="projects"){
    if(!Array.isArray(row.achievements)||row.achievements.length>45)throw error("Too many job achievements");
    const ids=new Set();
    clean.achievements=row.achievements.map(a=>{
     if(!a||typeof a!=="object"||typeof a.id!=="string"||
        !/^[a-zA-Z0-9_-]{8,64}$/.test(a.id)||ids.has(a.id))throw error("Invalid achievement ID");
     ids.add(a.id);
     if(Object.keys(a).some(k=>!["id",...BULLET_FIELDS].includes(k)))throw error("Unexpected achievement field");
     return {id:a.id,...Object.fromEntries(BULLET_FIELDS.map(k=>[k,string(a[k]??"",3500)]))};
    });
   }
   return clean;
  });
 }
 if(count>240)throw error("Too many Profile entries");
 const size=Buffer.byteLength(JSON.stringify(out),"utf8");
 if(size>110000)throw error("Structured Profile exceeds the safe staging size limit",413);
 return out;
}
function allowWrites(){
 if(process.env.GARAMAAL_PROFILE_ENABLED!=="true"||
    process.env.GARAMAAL_PROFILE_DATA_SCOPE!=="staging"||
    process.env.GARAMAAL_PROFILE_STAGING_ISOLATED!=="true"||
    process.env.APP_READ_ONLY!=="true"||
    process.env.GARAMAAL_PROFILE_PRODUCTION_APPROVED!=="false"||
    process.env.GARAMAAL_PROFILE_WRITES_APPROVED!=="true")
  throw error("Structured Profile editing is locked in this environment",403);
}
function readEnabled(){
 if(process.env.GARAMAAL_PROFILE_ENABLED!=="true"||
    process.env.GARAMAAL_PROFILE_DATA_SCOPE!=="staging"||
    process.env.GARAMAAL_PROFILE_STAGING_ISOLATED!=="true")
  throw error("Structured Profile available only in private staging",403);
}
function register(app,{authenticate}){
 async function run(req,res,handler){
  try{
   res.set("Cache-Control","private, no-store");
   readEnabled();
   const email=await authenticate(req);
   const key=String(req.body?.candidate||"").toLowerCase();
   const owner=permit(email,key);
   const ref=getFirestore().collection(DATA_COLLECTION).doc(owner.ownerDigest).collection("candidates").doc(key);
   const response=await handler({req,ref,key,email});
   res.json({data:response});
  }catch(e){
   const status=e.httpCode||500;
   console.error("[profile-structured] status="+status,String(e.message||"Error").slice(0,180));
   res.status(status).json({error:status>=500?"Structured Profile temporarily unavailable":String(e.message||"Request failed").slice(0,220)});
  }
 }
 app.post("/api/profile/structured/read",(req,res)=>run(req,res,async({ref,key})=>{
  const snap=await ref.get();
  const p=snap.exists?snap.data():empty(key);
  if(p.candidate!==key)throw error("Profile ownership mismatch",403);
  return {profile:copy(p),writesApproved:process.env.GARAMAAL_PROFILE_WRITES_APPROVED==="true"};
 }));
 app.post("/api/profile/structured/save",(req,res)=>run(req,res,async({req,ref,key,email})=>{
  allowWrites();
  const expected=req.body?.revision;
  if(!Number.isSafeInteger(expected)||expected<0)throw error("Revision required");
  const cleaned=parse(req.body?.profile,key);
  return getFirestore().runTransaction(async tx=>{
   const old=await tx.get(ref);
   const previous=old.exists?old.data():empty(key);
   if(previous.candidate!==key||previous.revision!==expected)
    throw error("Profile changed in another session. Reload before saving.",409);
   const now=new Date().toISOString();
   const saved={...cleaned,revision:expected+1,updatedAt:now,createdAt:previous.createdAt||now};
   const snapshot={revision:saved.revision,candidate:key,createdAt:now,
     action:expected===0?"created":"edited",profile:copy(saved)};
   tx.create(ref.collection("versions").doc(String(saved.revision).padStart(10,"0")),snapshot);
   tx.set(ref,saved,{merge:false});
   return {revision:saved.revision,updatedAt:now};
  });
 }));
 app.post("/api/profile/structured/history",(req,res)=>run(req,res,async({ref,key})=>{
  const snap=await ref.get();
  if(!snap.exists)return {candidate:key,versions:[]};
  if(snap.data().candidate!==key)throw error("Profile ownership mismatch",403);
  const snapshots=await ref.collection("versions").orderBy("revision","desc").limit(30).get();
  return {candidate:key,versions:snapshots.docs.map(d=>({
   revision:d.data().revision,createdAt:d.data().createdAt,action:d.data().action
  }))};
 }));
 app.post("/api/profile/structured/history-version",(req,res)=>run(req,res,async({req,ref,key})=>{
  const v=Number(req.body?.revision);
  if(!Number.isSafeInteger(v)||v<1)throw error("Invalid history revision");
  const [current,version]=await Promise.all([ref.get(),ref.collection("versions").doc(String(v).padStart(10,"0")).get()]);
  if(!current.exists||current.data().candidate!==key||!version.exists||version.data().candidate!==key)throw error("History revision not available",404);
  const p=version.data().profile;
  if(p?.candidate!==key||p.revision!==v)throw error("History mismatch",409);
  return {profile:copy(p),createdAt:version.data().createdAt,revision:v};
 }));
}
module.exports={register,empty,parse,allowWrites,readEnabled,ENTRY_TYPES,FIELDS};
