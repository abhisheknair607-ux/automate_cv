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
const profileSuggestions=require("./profile_suggestions");
const {auditClaimNumbers}=require("./profile_claim_review");
const {permit}=require("./profile_access");
const {planRefresh,applyRefresh}=require("./profile_refresh");
const {recordRevision,backfillBaseline,historySummary,verifyHistoryRead,pad}=require("./profile_history");
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
function docFor(ownerDigest,key){
  return getFirestore().collection(COLLECTION).doc(ownerDigest).collection("candidates").doc(candidate(key));
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
      const grant=permit(email,key); // Separate candidate ACL, after Firebase auth.
      const ref=docFor(grant.ownerDigest,key);
      const data=await fn({key,ref,email:grant.email,body:req.body||{}});
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
  // Source-grounded, read-only assistance. No model calls, no Firestore writes,
  // no automatic approval of STAR or keyword claims.
  app.post("/api/profile/suggest",(req,res)=>handle(req,res,async({key,ref,body})=>{
    const id=String(body.recordId||"");
    if(!id||id.length>128)throw Object.assign(Error("Valid record ID required"),{httpCode:400});
    const snapshot=await ref.get();
    if(!snapshot.exists||!snapshot.data().imported)
      throw Object.assign(Error("Import this candidate profile first"),{httpCode:409});
    const profile=snapshot.data();
    if(profile.candidate!==key||profile.revision!==Number(body.revision))
      throw Object.assign(Error("Profile version changed. Reload before using suggestions."),{httpCode:409});
    const record=profile.records.find(r=>r.id===id);
    if(!record)throw Object.assign(Error("Record not found"),{httpCode:404});
    const suggestion=profileSuggestions.proposeStar(record);
    const claims=[record.workingText||"",record.cvBullet||"",
      ...Object.values(record.star||{})].join("\n");
    suggestion.claimReview={
      ...auditClaimNumbers(claims,record.originalText),
      allNumberContextRequiresReview:true,
      originalEvidenceImmutable:true
    };
    return {...suggestion,profileRevision:profile.revision};
  }));
  app.post("/api/profile/check-claims",(req,res)=>handle(req,res,async({key,ref,body})=>{
    const id=String(body.recordId||"");
    if(!id||id.length>128||typeof body.claimText!=="string"||body.claimText.length>20000)
      throw Object.assign(Error("Invalid claim review request"),{httpCode:400});
    const snap=await ref.get();
    if(!snap.exists||!snap.data().imported)
      throw Object.assign(Error("Import profile first"),{httpCode:409});
    const profile=snap.data();
    if(profile.candidate!==key||profile.revision!==Number(body.revision))
      throw Object.assign(Error("Profile changed; reload before reviewing claims"),{httpCode:409});
    const record=profile.records.find(r=>r.id===id);
    if(!record||record.cvEligible===false)
      throw Object.assign(Error("Eligible evidence record not found"),{httpCode:404});
    const audit=auditClaimNumbers(body.claimText,record.originalText);
    const observed=profileSuggestions.extractNumbers(record.originalText);
    return {recordId:id,profileRevision:profile.revision,...audit,
      originalNumbers:observed.slice(0,30),
      reviewRequired:true};
  }));
  app.post("/api/profile/jd-match",(req,res)=>handle(req,res,async({key,ref,body})=>{
    const snapshot=await ref.get();
    if(!snapshot.exists||!snapshot.data().imported)
      throw Object.assign(Error("Import this candidate profile first"),{httpCode:409});
    const profile=snapshot.data();
    if(profile.candidate!==key||profile.revision!==Number(body.revision))
      throw Object.assign(Error("Profile version changed. Reload before matching."),{httpCode:409});
    // JD text is analyzed only in this request; it is never logged or stored.
    const result=profileSuggestions.matchJD(body.jdText,profile.records);
    return {...result,candidate:key,profileRevision:profile.revision};
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
  app.post("/api/profile/import",(req,res)=>handle(req,res,async({key,ref,email,body})=>{
    writeGate();
    if(body.confirm!==true)throw Object.assign(Error("Confirm source import first"),{httpCode:400});
    const p=await collectImport(key,auth);
    await getFirestore().runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(snap.exists&&snap.data()?.imported)
        throw Object.assign(Error("Already imported. Existing edits were preserved; use the future reviewed refresh workflow."),{httpCode:409});
      p.revision=1;p.imported=true;p.importedAt=new Date().toISOString();
      p.historySchema=5;
      recordRevision(tx,ref,p,{email,action:"drive-import"});
    });
    return {candidate:key,revision:1,records:p.records.length,sources:p.sources};
  }));

  app.post("/api/profile/history",(req,res)=>handle(req,res,async({key,ref})=>{
    const current=await ref.get();
    if(!current.exists||!current.data().imported)
      throw Object.assign(Error("Import profile before viewing history"),{httpCode:409});
    if(current.data().candidate!==key)throw Object.assign(Error("Candidate mismatch"),{httpCode:403});
    const listing=await ref.collection("versions").orderBy("revision","desc").limit(20).get();
    return {candidate:key,currentRevision:current.data().revision,
      versions:listing.docs.map(historySummary),
      baselinePending:current.data().historySchema!==5};
  }));
  app.post("/api/profile/history-version",(req,res)=>handle(req,res,async({key,ref,body})=>{
    const rev=Number(body.version);
    if(!Number.isSafeInteger(rev)||rev<1)throw Object.assign(Error("Invalid history version"),{httpCode:400});
    const [current,snap]=await Promise.all([ref.get(),ref.collection("versions").doc(pad(rev)).get()]);
    if(!current.exists||current.data().candidate!==key)throw Object.assign(Error("Candidate profile not found"),{httpCode:404});
    if(!snap.exists)throw Object.assign(Error("History version not found"),{httpCode:404});
    const result=verifyHistoryRead(current.data(),snap.data());
    return {candidate:key,revision:result.revision,action:result.action,
      createdAt:result.createdAt,profile:result.profile};
  }));
  app.post("/api/profile/refresh-preview",(req,res)=>handle(req,res,async({key,ref,body})=>{
    const snapshot=await ref.get();
    if(!snapshot.exists||snapshot.data().candidate!==key)
      throw Object.assign(Error("Profile is not imported"),{httpCode:409});
    const old=snapshot.data(),expected=Number(body.revision);
    if(old.revision!==expected)throw Object.assign(Error("Profile changed. Reload before refreshing."),{httpCode:409});
    const incoming=await collectImport(key,auth);
    const plan=planRefresh(old,incoming);
    if(plan.changes.length>300)throw Object.assign(Error("Too many changes for one reviewed refresh"),{httpCode:413});
    return {candidate:key,revision:old.revision,fingerprint:plan.fingerprint,
      summary:plan.summary,sourceTypes:plan.sourceTypes,
      changes:plan.changes.map(c=>({
        id:c.id,type:c.type,locator:c.locator,sourceKind:c.sourceKind,
        beforeTitle:c.beforeTitle,afterTitle:c.afterTitle,beforeStatus:c.beforeStatus,
        beforeExcerpt:c.beforeText?.slice(0,850)||null,
        afterExcerpt:c.afterText?.slice(0,850)||null,
        beforeTruncated:(c.beforeText?.length||0)>850,
        afterTruncated:(c.afterText?.length||0)>850
      })),
      requiresExplicitReview:true};
  }));
  app.post("/api/profile/refresh-apply",(req,res)=>handle(req,res,async({key,ref,email,body})=>{
    writeGate();
    const revision=Number(body.revision);
    if(!Number.isSafeInteger(revision)||revision<1||typeof body.fingerprint!=="string")
      throw Object.assign(Error("Run a current refresh preview first"),{httpCode:400});
    const snapshot=await ref.get();
    if(!snapshot.exists||snapshot.data().candidate!==key||snapshot.data().revision!==revision)
      throw Object.assign(Error("Profile changed; repeat preview"),{httpCode:409});
    // Re-read Drive originals at commit time, so a changed source invalidates
    // the preview fingerprint instead of silently merging a newer document.
    const incoming=await collectImport(key,auth);
    return getFirestore().runTransaction(async tx=>{
      const existing=await tx.get(ref);
      if(!existing.exists||existing.data().candidate!==key||existing.data().revision!==revision)
        throw Object.assign(Error("Profile changed; repeat preview"),{httpCode:409});
      const old=existing.data(),plan=planRefresh(old,incoming);
      if(plan.fingerprint!==body.fingerprint)throw Object.assign(Error("Drive sources changed; repeat preview"),{httpCode:409});
      if(plan.changes.length===0)return {candidate:key,revision,changed:false};
      const updated=applyRefresh(old,incoming,plan,body.decisions);
      if(updated.historySchema!==5)backfillBaseline(tx,ref,old,email);
      updated.revision=revision+1;
      updated.historySchema=5;
      updated.updatedAt=new Date().toISOString();
      recordRevision(tx,ref,updated,{email,action:"drive-refresh-reviewed"});
      return {candidate:key,revision:updated.revision,changed:true,
        counts:plan.summary};
    });
  }));
  async function mutate(req,res,type){
    return handle(req,res,async({key,ref,email,body})=>{
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
        if(p.historySchema!==5)backfillBaseline(tx,ref,snap.data(),email);
        p.revision++;
        p.historySchema=5;
        p.updatedAt=new Date().toISOString();
        if(JSON.stringify(p).length>MAX_PROFILE_CHARS)
          throw Object.assign(Error("Profile storage limit exceeded"),{httpCode:413});
        recordRevision(tx,ref,p,{email,action:"profile-"+type});
        return {revision:p.revision,candidate:key};
      });
    });
  }
  for(const type of ["record","add-record","add-section","section"])
    app.post("/api/profile/"+type,(req,res)=>mutate(req,res,type));
}
module.exports={register};
