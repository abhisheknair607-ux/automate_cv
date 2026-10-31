"use strict";
/*
 * Authenticated, opt-in Garamaal Profile storage and Drive import.
 * New profile records are isolated from the existing CV/CL worker.
 * Never sends user-supplied Drive IDs to Google and never edits Drive.
 */
const {createHash,randomUUID}=require("node:crypto");
const {getFirestore}=require("firebase-admin/firestore");
const mammoth=require("mammoth");
const {candidate,sourceCatalog,parseSource,mergeImports,BASE_SECTIONS}=require("./profile_evidence");
const COLLECTION="garamaalProfilesV1";
const MAX_PROFILE_CHARS=650000;
const NAME_RE=/^[a-zA-Z][a-zA-Z0-9_-]{1,39}$/;
const safeErr=(e)=>String(e&&e.message||"Profile request failed").slice(0,250);
function allowed(){
  if(process.env.GARAMAAL_PROFILE_ENABLED!=="true")
    throw Object.assign(Error("Garamaal Profile backend is not enabled yet"),{httpCode:503});
}
function docFor(email,key){
  const owner=createHash("sha256").update(String(email).toLowerCase().trim()).digest("hex");
  return getFirestore().collection(COLLECTION).doc(owner).collection("candidates").doc(candidate(key));
}
async function googleToken(auth){
  const access=await (await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  if(!token)throw Object.assign(Error("Cloud Run Drive access is not configured"),{httpCode:503});
  return token;
}
async function driveGet(fileId,token,metadata=false){
  if(!/^[\w-]{15,120}$/.test(fileId))throw Object.assign(Error("Invalid configured source ID"),{httpCode:503});
  const url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+
    (metadata?"?fields=id,name,mimeType,modifiedTime":"?alt=media");
  const response=await fetch(url,{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Object.assign(Error("Drive source unavailable ("+response.status+"). Check service-account access."),{httpCode:503});
  if(metadata)return response.json();
  const size=Number(response.headers.get("content-length")||0);
  if(size>8_000_000)throw Object.assign(Error("Drive source too large"),{httpCode:413});
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.length>8_000_000)throw Object.assign(Error("Drive source too large"),{httpCode:413});
  return buffer;
}
async function readSource(item,key,token){
  const meta=await driveGet(item.fileId,token,true);
  const mime=String(meta.mimeType||"");
  let text;
  if(mime==="application/vnd.google-apps.document"){
    const response=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(item.fileId)+"/export?mimeType=text%2Fplain",{
      headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Object.assign(Error("Drive document export denied"),{httpCode:503});
    text=await response.text();
  }else if(mime==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    const raw=await driveGet(item.fileId,token);
    text=(await mammoth.extractRawText({buffer:raw})).value;
  }else if(mime==="text/plain"){
    text=(await driveGet(item.fileId,token)).toString("utf8");
  }else{
    throw Object.assign(Error("Unsupported source type: "+mime),{httpCode:415});
  }
  // The legacy worker uses .docx evidence with exact markers; reject placeholders.
  if(key==="pooja"&&item.kind==="master"&&!/CANDIDATE KEY pooja/i.test(text.slice(0,1000)))
    throw Object.assign(Error("Pooja Master Evidence Bank lacks candidate ownership marker"),{httpCode:422});
  return parseSource({candidate:key,kind:item.kind,fileId:item.fileId,
    title:meta.name||item.label,modifiedTime:meta.modifiedTime||null,text});
}
async function collectImport(key,auth){
  const sources=sourceCatalog(key);
  if(sources.some(s=>!s.configured))throw Object.assign(Error(
    "Master Evidence Bank and Summary Router IDs must be configured for "+key),{httpCode:503});
  if(sources[0].fileId===sources[1].fileId)throw Object.assign(Error("Profile sources must be distinct"),{httpCode:503});
  const token=await googleToken(auth);
  const imports=[];
  for(const item of sources)imports.push(await readSource(item,key,token));
  const profile=mergeImports(imports,key);
  if(JSON.stringify(profile).length>MAX_PROFILE_CHARS)
    throw Object.assign(Error("Structured profile exceeds storage limit; split source blocks"),{httpCode:413});
  return profile;
}
function clone(data){return JSON.parse(JSON.stringify(data));}
function validSection(section,all){
  return all.some(s=>s.id===section);
}
function patchRecord(profile,body){
  const idx=profile.records.findIndex(r=>r.id===body.id);
  if(idx<0)throw Object.assign(Error("Record not found"),{httpCode:404});
  const changes=body.changes;
  if(!changes||typeof changes!=="object"||Array.isArray(changes))
    throw Object.assign(Error("Missing record changes"),{httpCode:400});
  const entry=profile.records[idx];
  for(const [k,value] of Object.entries(changes)){
    if(["title","section","cvBullet","status","metricsReviewed","star","tags"].indexOf(k)<0)
      throw Object.assign(Error("Original evidence is immutable"),{httpCode:400});
    if(k==="section"){
      if(!validSection(value,profile.sections))throw Object.assign(Error("Unknown profile section"),{httpCode:400});
      entry.section=value;
    }else if(k==="status"){
      if(!["needs-review","verified","exclude"].includes(value))throw Object.assign(Error("Invalid evidence status"),{httpCode:400});
      entry.status=value;
    }else if(k==="metricsReviewed"){
      if(typeof value!=="boolean")throw Object.assign(Error("Invalid metric verification"),{httpCode:400});
      entry.metricsReviewed=value;
    }else if(k==="star"){
      if(!value||typeof value!=="object"||Array.isArray(value))throw Object.assign(Error("Invalid STAR fields"),{httpCode:400});
      entry.star={};
      for(const name of ["situation","task","action","result"]){
        if(typeof value[name]!=="string"||value[name].length>4000)throw Object.assign(Error("Invalid STAR field"),{httpCode:400});
        entry.star[name]=value[name];
      }
    }else if(k==="tags"){
      if(!Array.isArray(value)||value.length>30||value.some(s=>typeof s!=="string"||s.length>60))
        throw Object.assign(Error("Invalid tags"),{httpCode:400});
      entry.tags=value;
    }else{
      if(typeof value!=="string"||value.length>(k==="cvBullet"?4000:180))
        throw Object.assign(Error("Invalid record text"),{httpCode:400});
      entry[k]=value;
    }
  }
}
function addRecord(profile,body){
  const section=String(body.section||"achievements");
  if(!validSection(section,profile.sections))throw Object.assign(Error("Unknown profile section"),{httpCode:400});
  const text=String(body.originalText||"").trim();
  if(!text||text.length>12000)throw Object.assign(Error("A source description is required (up to 12000 characters)"),{httpCode:400});
  const id=randomUUID();
  profile.records.push({id,section,title:String(body.title||"New evidence").slice(0,180),
    originalText:text,source:{kind:"user",fileId:"",locator:"Candidate-added evidence",index:-1},
    metrics:[],metricsReviewed:false,star:{situation:"",task:"",action:"",result:""},cvBullet:"",
    status:"needs-review",tags:[]});
}
function addSection(profile,body){
  const title=String(body.title||"").trim();
  if(title.length<2||title.length>90||profile.sections.length>=40)
    throw Object.assign(Error("Section name must be 2–90 characters; maximum 40 sections"),{httpCode:400});
  const id="custom_"+randomUUID().replace(/-/g,"").slice(0,18);
  profile.sections.push({id,title});
}
function register(app,{authenticate,auth}){
  async function handle(req,res,fn){
    try{
      allowed();
      const email=await authenticate(req);
      const key=candidate(req.body?.candidate);
      const ref=docFor(email,key);
      const data=await fn({key,ref,body:req.body||{}});
      res.json({data});
    }catch(error){const status=error.httpCode||500;
      console.error("[profile]",req.path,"status="+status,safeErr(error));
      res.status(status).json({error:safeErr(error)});
    }
  }
  app.post("/api/profile/read",(req,res)=>handle(req,res,async({key,ref})=>{
    const snapshot=await ref.get();
    return snapshot.exists?snapshot.data():{
      schema:1,candidate:key,sections:clone(BASE_SECTIONS),sources:[],records:[],revision:0,imported:false
    };
  }));
  app.post("/api/profile/import-preview",(req,res)=>handle(req,res,async({key})=>{
    const p=await collectImport(key,auth);
    // Preview is completely read-only and never changes CV or Firestore.
    return {candidate:key,sources:p.sources,counts:p.sections.map(s=>({
      section:s.id,records:p.records.filter(r=>r.section===s.id).length
    })),totalRecords:p.records.length};
  }));
  app.post("/api/profile/import",(req,res)=>handle(req,res,async({key,ref,body})=>{
    if(body.confirm!==true)throw Object.assign(Error("Confirm source import first"),{httpCode:400});
    const p=await collectImport(key,auth);
    await getFirestore().runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(snap.exists&&snap.data()?.imported)
        throw Object.assign(Error("Already imported. Existing edits were preserved; use the future reviewed refresh workflow."),{httpCode:409});
      p.revision=1;p.imported=true;p.importedAt=new Date().toISOString();
      tx.set(ref,p);
    });
    return {candidate:key,revision:1,records:p.records.length,sources:p.sources};
  }));
  async function mutate(req,res,type){
    return handle(req,res,async({key,ref,body})=>{
      const expected=Number(body.revision);
      if(!Number.isInteger(expected)||expected<1)throw Object.assign(Error("Revision required"),{httpCode:400});
      return getFirestore().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)throw Object.assign(Error("Import profile first"),{httpCode:409});
        const p=snap.data();
        if(p.candidate!==key||p.revision!==expected)
          throw Object.assign(Error("Profile was changed elsewhere. Reload before saving."),{httpCode:409});
        if(type==="record")patchRecord(p,body);
        if(type==="add-record")addRecord(p,body);
        if(type==="add-section")addSection(p,body);
        p.revision++;
        p.updatedAt=new Date().toISOString();
        if(JSON.stringify(p).length>MAX_PROFILE_CHARS)
          throw Object.assign(Error("Profile storage limit exceeded"),{httpCode:413});
        tx.set(ref,p);
        return {revision:p.revision,candidate:key};
      });
    });
  }
  for(const type of ["record","add-record","add-section"])
    app.post("/api/profile/"+type,(req,res)=>mutate(req,res,type));
}
module.exports={register};
