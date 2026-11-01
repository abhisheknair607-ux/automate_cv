"use strict";
/*
 * Stage 5: explicit, non-destructive candidate-owned Drive refresh.
 * Never edit the original Drive file, never silently overwrite reviewed data,
 * and never carry STAR/verification into substantively new source text.
 */
const {createHash}=require("node:crypto");
const {candidate}=require("./profile_evidence");
const fail=(message,status=400)=>Object.assign(Error(message),{httpCode:status});
const sha=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone=x=>JSON.parse(JSON.stringify(x));
function sourceKey(record){
 const src=record?.source||{};
 return [src.kind||"",src.fileId||"",src.locator||""].join("\u001f");
}
function activeDrive(record){
 return record?.source?.kind!=="user"&&!record.sourceSuperseded&&!record.sourceMissing;
}
function checks(current,incoming){
 if(!current||!incoming||candidate(current.candidate)!==candidate(incoming.candidate))
  throw fail("Refresh candidate ownership mismatch",403);
 if(!current.imported||!Number.isInteger(current.revision)||current.revision<1)
  throw fail("Import candidate profile before refreshing",409);
 if(!Array.isArray(current.records)||!Array.isArray(incoming.records))
  throw fail("Invalid profile sources");
 if(!incoming.sources?.length||incoming.sources.some(s=>s.integrity?.complete!==true))
  throw fail("Drive text coverage is incomplete",422);
 const oldSources=new Map((current.sources||[]).map(s=>[s.kind,s.fileId]));
 if(incoming.sources.length!==oldSources.size||
    incoming.sources.some(s=>oldSources.get(s.kind)!==s.fileId))
  throw fail("Configured Drive source files differ from the originally imported files. Manual source migration required.",409);
}
function planRefresh(current,incoming){
 checks(current,incoming);
 const oldRecords=new Map(),nextRecords=new Map();
 for(const record of current.records.filter(activeDrive)){
  const key=sourceKey(record);
  if(oldRecords.has(key))throw fail("Duplicate existing source locator: manual reconciliation needed",409);
  oldRecords.set(key,record);
 }
 for(const record of incoming.records){
  if(record.source?.kind==="user")throw fail("Imported source cannot contain candidate-added entries");
  const key=sourceKey(record);
  if(nextRecords.has(key))throw fail("Duplicate incoming source locator: manual reconciliation needed",409);
  nextRecords.set(key,record);
 }
 const changes=[];
 const sourceFingerprint=sha(incoming.sources.map(s=>[s.kind,s.fileId,s.sha256]));
 const previousFingerprint=sha((current.sources||[]).map(s=>[s.kind,s.fileId,s.sha256]));
 const sourceMetadataChanged=sourceFingerprint!==previousFingerprint;
 for(const [key,after] of nextRecords){
  const before=oldRecords.get(key);
  const type=!before?"added":before.originalText===after.originalText?"unchanged":"changed";
  if(type==="unchanged")continue;
  const changeId=sha([type,key,before?.id||"",after.id]).slice(0,26);
  changes.push({id:changeId,type,key,beforeId:before?.id||null,afterId:after.id,
   beforeTitle:before?.title||null,afterTitle:after.title,
   beforeText:before?.originalText||null,afterText:after.originalText,
   beforeStatus:before?.status||null,locator:after.source?.locator||"",
   sourceKind:after.source?.kind||"",
   reviewRequired:true});
 }
 for(const [key,before] of oldRecords){
  if(nextRecords.has(key))continue;
  changes.push({id:sha(["removed",key,before.id]).slice(0,26),type:"removed",
   key,beforeId:before.id,afterId:null,beforeTitle:before.title,afterTitle:null,
   beforeText:before.originalText,afterText:null,beforeStatus:before.status,
   locator:before.source?.locator||"",sourceKind:before.source?.kind||"",reviewRequired:true});
 }
 const fingerprint=sha([current.candidate,current.revision,sourceFingerprint,
   changes.map(c=>[c.id,c.type,c.beforeId,c.afterId])]);
 return {candidate:current.candidate,revision:current.revision,
  sourceFingerprint,sourceMetadataChanged,fingerprint,changes,summary:{
   unchanged:nextRecords.size-changes.filter(c=>c.type==="added"||c.type==="changed").length,
   added:changes.filter(c=>c.type==="added").length,
   changed:changes.filter(c=>c.type==="changed").length,
   removed:changes.filter(c=>c.type==="removed").length},
  sourceCount:incoming.sources.length,sourceTypes:incoming.sources.map(s=>s.kind),
  requiresExplicitReview:true};
}
function markInactive(old,reason,replacementId){
 old.previousRefreshStatus=old.status;
 old.status="needs-review";
 old.cvEligible=false;
 old.metricsReviewed=false;
 old.classificationReviewed=false;
 old.sourceSuperseded=reason==="replaced";
 old.sourceMissing=reason==="missing";
 old.sourceDrift=reason==="kept";
 if(replacementId)old.supersededBy=replacementId;
 return old;
}
function applyRefresh(current,incoming,plan,decisions){
 const check=planRefresh(current,incoming);
 if(!plan||plan.fingerprint!==check.fingerprint||plan.revision!==check.revision)
  throw fail("Refresh preview has changed; run preview again",409);
 if(!decisions||typeof decisions!=="object"||Array.isArray(decisions))
  throw fail("Each Drive change requires an explicit review decision");
 const ids=check.changes.map(c=>c.id);
 if(Object.keys(decisions).length!==ids.length ||
    ids.some(id=>!Object.prototype.hasOwnProperty.call(decisions,id)))
  throw fail("Review every changed, new and removed item before refresh");
 const allowed={added:["accept","skip"],changed:["replace","keep"],removed:["archive","keep"]};
 for(const change of check.changes){
  if(!allowed[change.type].includes(decisions[change.id]))
   throw fail("Invalid review decision for "+change.type);
 }
 const updated=clone(current),originalByKey=new Map(incoming.records.map(r=>[sourceKey(r),r]));
 const currentIndex=new Map(updated.records.map(r=>[r.id,r]));
 for(const change of check.changes){
  const choice=decisions[change.id];
  if(change.type==="added"){
   if(choice==="accept"){
    const newRecord=clone(originalByKey.get(change.key));
    if(currentIndex.has(newRecord.id))throw fail("Incoming evidence ID collision");
    newRecord.status="needs-review";newRecord.classificationReviewed=false;
    newRecord.metricsReviewed=false;newRecord.tags=[];newRecord.cvBullet="";
    updated.records.push(newRecord);currentIndex.set(newRecord.id,newRecord);
   }
  }else if(change.type==="changed"){
   const old=currentIndex.get(change.beforeId);
   if(!old)throw fail("Source changed while applying diff",409);
   if(choice==="replace"){
    const newRecord=clone(originalByKey.get(change.key));
    if(currentIndex.has(newRecord.id))throw fail("Incoming evidence ID collision");
    newRecord.section=updated.sections.some(s=>s.id===old.section&&!s.archived)?
      old.section:newRecord.section;
    newRecord.status="needs-review";newRecord.classificationReviewed=false;
    newRecord.metricsReviewed=false;newRecord.tags=[];newRecord.cvBullet="";
    // Previous original and all original user overlays remain available in
    // immutable revision history and on the inactive archived record.
    markInactive(old,"replaced",newRecord.id);
    updated.records.push(newRecord);currentIndex.set(newRecord.id,newRecord);
   }else markInactive(old,"kept");
  }else{
   const old=currentIndex.get(change.beforeId);
   if(!old)throw fail("Removed source changed while applying diff",409);
   markInactive(old,choice==="archive"?"missing":"kept");
  }
 }
 // For skipped new records, source snapshot still records the latest Drive
 // hash; a later preview will propose them again because they're not stored.
 // Even when no extracted record changed, approved source-hash updates must
 // be versioned. They must never silently refresh the current manifest.
 updated.sources=clone(incoming.sources);
 updated.schema=Math.max(Number(updated.schema)||1,5);
 return updated;
}
module.exports={sourceKey,planRefresh,applyRefresh,activeDrive};
