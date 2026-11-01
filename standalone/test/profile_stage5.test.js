"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseAcl,permit,ownerDigest}=require("../profile_access");
const {planRefresh,applyRefresh}=require("../profile_refresh");
const {versionDoc,recordRevision,backfillBaseline,pad,verifyHistoryRead,historySummary}=require("../profile_history");
const {BASE_SECTIONS}=require("../profile_evidence");
const source=(kind,hash)=>({kind,fileId:"file-"+kind+"-012345678901",sha256:hash,integrity:{complete:true},records:2});
const row=(kind,locator,text,id,extra={})=>({
 id,section:"experience",title:locator,originalText:text,
 source:{kind,fileId:source(kind).fileId,locator},cvEligible:kind==="master",
 status:"needs-review",classificationReviewed:false,metricsReviewed:false,
 star:{situation:"",task:"",action:"",result:""},tags:[],cvBullet:"",metrics:[],...extra
});
function current(){
 const p={schema:2,candidate:"pooja",revision:3,imported:true,
  sections:BASE_SECTIONS.map(x=>({...x})),sources:[source("master","a"),source("router","b")],
  records:[
   row("master","EVIDENCE A","Screened 200+ companies","old-A",{
    status:"verified",classificationReviewed:true,metricsReviewed:true,
    star:{situation:"",task:"",action:"Screened 200+ companies",result:""},tags:["Benchmarking"],
    cvBullet:"Screened 200+ companies",workingText:"Reviewed 200+ companies"
   }),
   row("master","EVIDENCE B","Managed stakeholder reporting","old-B"),
   row("master","EVIDENCE D","Old role no longer listed","old-D"),
   row("router","ROOT","Retrieve matching material","router-A"),
   row("user","Manual fact","Candidate-added factual project","manual",{source:{kind:"user",fileId:"",locator:"manual"}})
  ]};
 return p;
}
function incoming(){
 return {schema:2,candidate:"pooja",revision:0,sections:BASE_SECTIONS.map(x=>({...x})),
  sources:[source("master","new-a"),source("router","b")],
  records:[
   row("master","EVIDENCE A","Screened 250+ companies","new-A"),
   row("master","EVIDENCE B","Managed stakeholder reporting","old-B"),
   row("master","EVIDENCE C","Built a forecasting model","new-C"),
   row("router","ROOT","Retrieve matching material","router-A")
  ]};
}
test("candidate-specific ACL denies missing/invalid mappings and cross-candidate reads",()=>{
 assert.throws(()=>parseAcl(""),/not configured/);
 assert.throws(()=>parseAcl('{"*":["pooja"]}'),/Invalid/);
 assert.throws(()=>parseAcl('{"user@example.com":["admin"]}'),/Unknown candidate/);
 const acl='{"user@example.com":["pooja"],"trusted@example.com":["pooja","abhishek"]}';
 assert.deepEqual(permit("USER@example.com","pooja",acl).candidate,"pooja");
 assert.throws(()=>permit("user@example.com","abhishek",acl),/does not have access/);
 assert.throws(()=>permit("other@example.com","pooja",acl),/does not have access/);
 assert.equal(ownerDigest("USER@example.com"),ownerDigest("user@example.com"));
 assert.notEqual(ownerDigest("user@example.com"),ownerDigest("other@example.com"));
});
test("Drive diff identifies only changed, added and removed keyed sources",()=>{
 const before=current(),next=incoming(),plan=planRefresh(before,next);
 assert.deepEqual(plan.summary,{unchanged:2,added:1,changed:1,removed:1});
 assert.deepEqual(plan.changes.map(x=>x.type).sort(),["added","changed","removed"]);
 assert.ok(plan.changes.some(x=>x.afterText==="Screened 250+ companies"&&x.beforeText==="Screened 200+ companies"));
 assert.equal(plan.revision,3);
 assert.equal(plan.fingerprint,planRefresh(before,next).fingerprint);
});
test("applying approved refresh retains all old evidence and user additions",()=>{
 const before=current(),next=incoming(),plan=planRefresh(before,next);
 const decisions=Object.fromEntries(plan.changes.map(c=>[c.id,
   c.type==="changed"?"replace":c.type==="added"?"accept":"archive"]));
 const updated=applyRefresh(before,next,plan,decisions);
 assert.equal(updated.records.length,7);
 const old=updated.records.find(x=>x.id==="old-A");
 assert.equal(old.originalText,"Screened 200+ companies");
 assert.equal(old.status,"needs-review");assert.equal(old.cvEligible,false);
 assert.equal(old.supersededBy,"new-A");
 assert.equal(old.workingText,"Reviewed 200+ companies");
 assert.equal(old.star.action,"Screened 200+ companies");
 const fresh=updated.records.find(x=>x.id==="new-A");
 assert.equal(fresh.originalText,"Screened 250+ companies");
 assert.equal(fresh.status,"needs-review");
 assert.equal(fresh.classificationReviewed,false);
 assert.equal(fresh.metricsReviewed,false);
 assert.equal(fresh.cvBullet,"");assert.deepEqual(fresh.tags,[]);
 assert.equal(fresh.section,"experience");
 assert.equal(updated.records.find(x=>x.id==="old-D").sourceMissing,true);
 assert.equal(updated.records.find(x=>x.id==="manual").originalText,"Candidate-added factual project");
 assert.equal(updated.records.find(x=>x.id==="old-B").sourceMissing,undefined);
 assert.equal(before.records.find(x=>x.id==="old-A").status,"verified");
 const follow=planRefresh({...updated,revision:4},next);
 assert.deepEqual(follow.summary,{unchanged:4,added:0,changed:0,removed:0});
});
test("every change requires explicit choice; no silent default overwrites",()=>{
 const p=planRefresh(current(),incoming());
 assert.throws(()=>applyRefresh(current(),incoming(),p,{}),/Review every/);
 const decisions=Object.fromEntries(p.changes.map(c=>[c.id,"accept"]));
 assert.throws(()=>applyRefresh(current(),incoming(),p,decisions),/Invalid review decision/);
 assert.throws(()=>applyRefresh(current(),incoming(),{...p,fingerprint:"other"},decisions),/preview has changed/);
});
test("kept changed or missing originals become non-CV eligible but remain for next review",()=>{
 const before=current(),next=incoming(),p=planRefresh(before,next);
 const choices=Object.fromEntries(p.changes.map(c=>[c.id,c.type==="added"?"skip":"keep"]));
 const updated=applyRefresh(before,next,p,choices);
 assert.equal(updated.records.length,before.records.length);
 assert.equal(updated.records.find(x=>x.id==="old-A").cvEligible,false);
 assert.equal(updated.records.find(x=>x.id==="old-D").sourceDrift,true);
 assert.equal(updated.records.find(x=>x.id==="old-A").originalText,before.records[0].originalText);
 assert.ok(planRefresh({...updated,revision:4},next).changes.some(c=>c.type==="changed"));
});
test("Drive source ID changes or incomplete imports fail closed",()=>{
 const x=incoming();x.sources[0].fileId="different-01234567890";
 assert.throws(()=>planRefresh(current(),x),/Configured Drive source files differ/);
 x.sources[0].fileId=source("master").fileId;
 x.sources[0].integrity.complete=false;
 assert.throws(()=>planRefresh(current(),x),/coverage is incomplete/);
});
test("source document edits cannot promote old verified STAR facts to new version",()=>{
 const before=current(),next=incoming(),plan=planRefresh(before,next);
 const decisions=Object.fromEntries(plan.changes.map(c=>[c.id,c.type==="changed"?"replace":c.type==="added"?"skip":"archive"]));
 const after=applyRefresh(before,next,plan,decisions);
 const newer=after.records.find(x=>x.id==="new-A");
 assert.equal(newer.star.action,"");
 assert.equal(newer.status,"needs-review");
});
test("versioned profile snapshot is immutable and transaction writes current plus revision",()=>{
 const p=current();
 const versions=versionDoc(p,{email:"user@example.com",action:"profile-record",at:"2026-10-31T16:00:00Z"});
 assert.equal(versions.revision,3);assert.equal(versions.actor,ownerDigest("user@example.com"));
 assert.equal(versions.profile.records[0].originalText,p.records[0].originalText);
 p.records[0].originalText="changed";
 assert.equal(versions.profile.records[0].originalText,"Screened 200+ companies");
 let calls=[];
 const ref={collection:name=>({doc:id=>({history:name,version:id})})};
 const tx={set:(...args)=>calls.push(args)};
 recordRevision(tx,ref,p,{email:"user@example.com",action:"profile-section"});
 assert.equal(calls.length,2);
 assert.equal(calls[0][0].version,pad(3));
 assert.equal(calls[1][0],ref);
 assert.equal(calls[0][1].action,"profile-section");
 const preview=historySummary({data:()=>calls[0][1]});
 assert.equal(preview.revision,3);
 assert.ok(!("profile" in preview));
});
test("historical read is candidate-scoped and revision-bounded",()=>{
 const p=current(),v=versionDoc(p,{email:"user@example.com",action:"profile-record"});
 assert.equal(verifyHistoryRead(p,v).candidate,"pooja");
 assert.throws(()=>verifyHistoryRead({...p,candidate:"abhishek"},v),/ownership/);
 assert.throws(()=>verifyHistoryRead({...p,revision:1},v),/Invalid history/);
});

test("metadata-only Drive source changes require a versioned review rather than silently updating",()=>{
 const previous=current();
 const next={
  candidate:previous.candidate,
  records:previous.records.filter(r=>r.source.kind!=="user").map(r=>structuredClone(r)),
  sources:previous.sources.map(s=>({...s}))
 };
 next.sources[0].sha256="changed-by-document-metadata";
 const plan=planRefresh(previous,next);
 assert.equal(plan.changes.length,0);
 assert.equal(plan.sourceMetadataChanged,true);
 const updated=applyRefresh(previous,next,plan,{});
 assert.equal(updated.sources[0].sha256,"changed-by-document-metadata");
 assert.deepEqual(updated.records,previous.records);
 assert.equal(previous.sources[0].sha256,"a");
 const identical=planRefresh(previous,{...next,sources:previous.sources});
 assert.equal(identical.sourceMetadataChanged,false);
 assert.equal(identical.changes.length,0);
});
test("history read fails closed on corrupted revision or record-count metadata",()=>{
 const p=current(),v=versionDoc(p,{email:"user@example.com",action:"profile-record"});
 assert.throws(()=>verifyHistoryRead(p,{...v,profile:{...v.profile,revision:999}}),/metadata mismatch/);
 assert.throws(()=>verifyHistoryRead(p,{...v,recordCount:999}),/metadata mismatch/);
});
test("Profile read validates stored candidate before returning Firestore contents",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const service=fs.readFileSync(path.join(__dirname,"../profile_service.js"),"utf8");
 assert.match(service,/Stored profile ownership mismatch/);
 assert.match(service,/confirmMetadataOnly/);
 const client=fs.readFileSync(path.join(__dirname,"../profile_engine_v3.js"),"utf8");
 assert.match(client,/sourceMetadataChanged/);
 assert.match(client,/Approve source version update/);
});
