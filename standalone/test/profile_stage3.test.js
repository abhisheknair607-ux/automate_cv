"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {addSection,manageSection,addRecord,patchRecord}=require("../profile_section_ops");
const {BASE_SECTIONS}=require("../profile_evidence");
function base(){
 return {candidate:"pooja",schema:2,revision:1,
  sections:BASE_SECTIONS.map(s=>({...s})),
  records:[{
    id:"drive-record",section:"experience",title:"Original job evidence",
    originalText:"Managed €50.1M portfolio and increased client satisfaction by 40%.",
    cvEligible:true,source:{kind:"master",fileId:"abc",locator:"PR-POOJA-BAJAJ"},
    metrics:["€50.1M","40%"],status:"needs-review",metricsReviewed:false,
    tags:[],star:{situation:"",task:"",action:"",result:""},cvBullet:""
  },{
    id:"router-record",section:"reference",title:"Router reference",
    originalText:"Use professional experience from source.",cvEligible:false,
    source:{kind:"router",fileId:"xyz"},status:"needs-review",metrics:[],tags:[],
    metricsReviewed:false,star:{situation:"",task:"",action:"",result:""},cvBullet:""
  }]
 }
}
test("custom sections can be added, renamed and reordered; native names are protected",()=>{
 const p=base(),name=addSection(p,{title:"Industry research"});
 assert.ok(name.startsWith("custom_"));
 assert.equal(p.sections.at(-1).title,"Industry research");
 manageSection(p,{id:name,action:"rename",title:"Transaction analysis"});
 assert.equal(p.sections.at(-1).title,"Transaction analysis");
 manageSection(p,{id:name,action:"move-up"});
 assert.equal(p.sections.at(-2).id,name);
 manageSection(p,{id:name,action:"move-down"});
 assert.equal(p.sections.at(-1).id,name);
 assert.throws(()=>manageSection(p,{id:"experience",action:"rename",title:"Another"}),/protected/);
 assert.throws(()=>addSection(p,{title:"TRANSACTION ANALYSIS"}),/already exists/);
});
test("archiving never hides existing records or built-in sections",()=>{
 const p=base(),id=addSection(p,{title:"Unsorted evidence"});
 patchRecord(p,{id:"drive-record",changes:{section:id,classificationReviewed:true}});
 assert.throws(()=>manageSection(p,{id,action:"archive"}),/Move the evidence/);
 assert.throws(()=>manageSection(p,{id:"experience",action:"archive"}),/Built-in sections/);
 patchRecord(p,{id:"drive-record",changes:{section:"experience"}});
 manageSection(p,{id,action:"archive"});
 assert.equal(p.sections.find(s=>s.id===id).archived,true);
 assert.throws(()=>patchRecord(p,{id:"drive-record",changes:{section:id}}),/unavailable/);
 manageSection(p,{id,action:"restore"});
 assert.equal(p.sections.find(s=>s.id===id).archived,false);
});
test("imported original evidence and provenance remain immutable",()=>{
 const p=base(),original=p.records[0].originalText;
 for(const changes of [
  {originalText:"Invented outcome"},{source:{kind:"user"}},{metrics:["100%"]},
  {cvEligible:false},{previousUserText:"tampered"}
 ])assert.throws(()=>patchRecord(p,{id:"drive-record",changes}),/protected|overwritten/);
 assert.equal(p.records[0].originalText,original);
 assert.equal(p.records[0].source.fileId,"abc");
});
test("classification, STAR and tags are saved only as reviewed overlays",()=>{
 const p=base();
 patchRecord(p,{id:"drive-record",changes:{
  section:"achievements",classificationReviewed:true,metricsReviewed:true,
  status:"verified",tags:["finance","HNW","finance"],
  star:{situation:"Client portfolio",task:"Assess suitability",action:"Reviewed risks",result:"40% higher satisfaction"},
  cvBullet:"Reviewed client portfolio risks supporting 40% higher satisfaction."
 }});
 const record=p.records[0];
 assert.equal(record.section,"achievements");assert.equal(record.classificationReviewed,true);
 assert.equal(record.status,"verified");assert.deepEqual(record.tags,["finance","HNW"]);
 assert.equal(record.star.result,"40% higher satisfaction");
 assert.match(record.originalText,/€50.1M/);
});
test("router evidence can never become a verified CV claim",()=>{
 const p=base();
 assert.throws(()=>patchRecord(p,{id:"router-record",changes:{status:"verified"}}),/Router references/);
 assert.equal(p.records[1].status,"needs-review");
});
test("new user facts are editable; material changes reset status and metric approval",()=>{
 const p=base();const id=addRecord(p,{section:"projects",title:"Analytical project",originalText:"Screened 200+ companies"});
 patchRecord(p,{id,changes:{metricsReviewed:true,status:"verified"}});
 patchRecord(p,{id,changes:{originalText:"Reviewed 500+ clients",metricsReviewed:true,status:"verified"}});
 const x=p.records.find(r=>r.id===id);
 assert.equal(x.status,"needs-review");assert.equal(x.metricsReviewed,false);
 assert.equal(x.previousUserText,"Screened 200+ companies");
 assert.ok(x.metrics.some(m=>/500/.test(m)));
 assert.equal(p.records[0].originalText,"Managed €50.1M portfolio and increased client satisfaction by 40%.");
});
test("unknown record attributes and unsafe section actions are rejected",()=>{
 const p=base();
 assert.throws(()=>patchRecord(p,{id:"drive-record",changes:{constructor:"oops"}}),/protected/);
 assert.throws(()=>manageSection(p,{id:"experience",action:"delete"}),/Unknown section operation/);
 assert.throws(()=>addRecord(p,{title:"x",originalText:"x",section:"projects"}),/title/);
 assert.throws(()=>patchRecord(p,{id:"drive-record",changes:{star:{situation:"x"}}}),/STAR/);
});
test("Stage 3 client is syntactically valid, and opt-in gate preserves original Jobs routes",()=>{
 const root=path.resolve(__dirname,"..");
 for(const name of ["profile_engine_v3.js","profile_section_ops.js","profile_service.js","server.js"]){
  const file=path.join(root,name),res=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});
  assert.equal(res.status,0,name+": "+res.stderr);
 }
 const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
 const client=fs.readFileSync(path.join(root,"profile_engine_v3.js"),"utf8");
 const bridge=fs.readFileSync(path.join(root,"bridge.js"),"utf8");
 assert.match(server,/profile_engine_v3\.js/);
 assert.match(server,/GARAMAAL_PROFILE_ENABLED==="true"/);
 assert.match(server,/app\.get\("\/social"/);
 assert.match(server,/app\.get\("\/legacy"/);
 assert.match(bridge,/"profile\/section"/);
 assert.doesNotMatch(client,/window\.prompt\(/);
 assert.doesNotMatch(client,/firebase\.initializeApp/);
 assert.match(client,/data-mobile-section/);
 assert.match(client,/data-field="classificationReviewed"/);
});
