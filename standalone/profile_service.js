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
const sectionOps=require("./profile_section_ops");
const COLLECTION="garamaalProfilesV1";
const MAX_PROFILE_CHARS=650000;
const safeErr=(e)=>String(e&&e.message||"Profile request failed").slice(0,250);
function allowed(){
  if(process.env.GARAMAAL_PROFILE_ENABLED!=="true")
    throw Object.assign(Error("Garamaal Profile backend is not enabled yet"),{httpCode:503});
}
function writeGate(){
  if(process.env.APP_READ_ONLY!=="false" || process.env.GARAMAAL_PROFILE_WRITES_APPROVED!=="true")
    throw Object.assign(Error("Profile saving is locked until staging writes are explicitly approved"),{httpCode:403});
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
  app.post("/api/profile/readiness",(req,res)=>handle(req,res,async({key})=>{
    const sources=sourceCatalog(key);
    const status={candidate:key,profileEnabled:true,profileWritesApproved:
      process.env.APP_READ_ONLY==="false"&&process.env.GARAMAAL_PROFILE_WRITES_APPROVED==="true",
      firestore:{ready:false},drive:sources.map(s=>({kind:s.kind,configured:s.configured,accessible:false}))};
    try{
      await getFirestore().collection(COLLECTION).doc("__profile_readiness__").get();
      status.firestore.ready=true;
    }catch(error){status.firestore.message="Firestore read access not ready";}
    if(sources.every(s=>s.configured)){
      try{
        const token=await googleToken(auth);
        for(let i=0;i<sources.length;i++){
          try{await driveGet(sources[i].fileId,token,true);status.drive[i].accessible=true;}
          catch(error){status.drive[i].message="Drive file inaccessible to Cloud Run identity";}
        }
      }catch(error){status.drive.forEach(item=>item.message="Drive service credentials unavailable");}
    }
    status.ready=status.firestore.ready&&status.drive.every(s=>s.accessible);
    return status;
  }));
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
    })),totalRecords:p.records.length,
    classificationReview:p.records.filter(r=>r.classification?.needsReview).length,
    routerReferences:p.records.filter(r=>r.cvEligible===false).length,
    duplicateCandidates:p.records.filter(r=>r.duplicateOf).length,
    allSourcesComplete:p.sources.every(s=>s.integrity?.complete===true)};
  }));
  app.post("/api/profile/import",(req,res)=>handle(req,res,async({key,ref,body})=>{
    writeGate();
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
      writeGate();
      const expected=Number(body.revision);
      if(!Number.isInteger(expected)||expected<1)throw Object.assign(Error("Revision required"),{httpCode:400});
      return getFirestore().runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists)throw Object.assign(Error("Import profile first"),{httpCode:409});
        const p=snap.data();
        if(p.candidate!==key||p.revision!==expected)
          throw Object.assign(Error("Profile was changed elsewhere. Reload before saving."),{httpCode:409});
        if(type==="record")sectionOps.patchRecord(p,body);
        if(type==="add-record")sectionOps.addRecord(p,body);
        if(type==="add-section")sectionOps.addSection(p,body);
        if(type==="section")sectionOps.manageSection(p,body);
        p.revision++;
        p.updatedAt=new Date().toISOString();
        if(JSON.stringify(p).length>MAX_PROFILE_CHARS)
          throw Object.assign(Error("Profile storage limit exceeded"),{httpCode:413});
        tx.set(ref,p);
        return {revision:p.revision,candidate:key};
      });
    });
  }
  for(const type of ["record","add-record","add-section","section"])
    app.post("/api/profile/"+type,(req,res)=>mutate(req,res,type));
}
module.exports={register};
