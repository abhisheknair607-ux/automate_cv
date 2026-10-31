"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {proposeStar,extractNumbers,unsupportedNumbers,matchJD,sentenceUnits}=require("../profile_suggestions");
const {patchRecord}=require("../profile_section_ops");
const {BASE_SECTIONS}=require("../profile_evidence");
function record(overrides={}){
 return {id:"e1",section:"experience",title:"Portfolio evidence",cvEligible:true,
  originalText:"During client reviews, managed a €50.1M portfolio. Responsible for suitability reviews. Analysed financial goals. Improved client satisfaction by 40%.",
  source:{kind:"master",locator:"EVIDENCE PR-POOJA-BAJAJ",lineStart:23},
  classificationReviewed:false,metricsReviewed:false,status:"needs-review",
  star:{situation:"",task:"",action:"",result:""},cvBullet:"",tags:[],metrics:["€50.1M","40%"],
  ...overrides};
}
function profile(r=record()){return {candidate:"pooja",sections:BASE_SECTIONS.map(s=>({...s})),records:[r]}}
test("extractive STAR fields preserve verbatim original quotes, source offsets and genuine gaps",()=>{
 const r=record();const suggested=proposeStar(r);
 for(const field of Object.values(suggested.fields)){
  if(!field)continue;
  assert.equal(r.originalText.slice(field.source.start,field.source.end),field.text);
  assert.equal(field.type,"verbatim");
  assert.equal(field.reviewRequired,true);
 }
 assert.equal(suggested.fields.result.text,"Improved client satisfaction by 40%.");
 assert.deepEqual(suggested.metrics.map(m=>m.value),["40%"]);
 assert.equal(suggested.confidence,"extractive-preview-only");
 assert.notEqual(suggested.source.sha256.length,0);
});
test("unknown situation, task and numeric result are left blank instead of guessed",()=>{
 const r=record({originalText:"Reviewed source documents and prepared a summary."});
 const s=proposeStar(r);
 assert.equal(s.fields.situation,null);
 assert.equal(s.fields.task,null);
 assert.equal(s.fields.result,null);
 assert.equal(s.metrics.length,0);
});
test("decimal and currency amounts are preserved as single source-bound excerpts",()=>{
 const r=record({originalText:"Managed €50.1M across clients. Reduced turnaround time by 25%."});
 const s=proposeStar(r);
 assert.ok(s.sourceNumbers.some(m=>m.value==="€50.1M"));
 assert.ok(sentenceUnits(r.originalText).some(unit=>unit.quote==="Managed €50.1M across clients."));
 assert.ok(s.fields.result.text.includes("25%"));
});
test("router references cannot generate STAR suggestions",()=>{
 assert.throws(()=>proposeStar(record({cvEligible:false,source:{kind:"router"}})),/Routing references/);
});
test("source metric checks reject added percentages and monetary values; same number still needs context review",()=>{
 const base="Analysed 200+ companies and achieved 25% improvement in quality. Managed €50.1M.";
 assert.deepEqual(unsupportedNumbers("Achieved 25% improvement and screened 200+ companies.",base),[]);
 const missing=unsupportedNumbers("Achieved 85% improvement and managed €99M.",base);
 assert.deepEqual(missing.map(m=>m.value),["85%","€99M"]);
 assert.ok(extractNumbers(base).every(m=>m.contextReviewRequired&&!m.verified));
});
test("JD keywords require literal evidence and never add unsupported JD terms",()=>{
 const jd="Transfer pricing, economic benchmarking, financial modelling and Power BI required.";
 const a=record({id:"a",originalText:"Economic benchmarking for transfer pricing in international transactions.",status:"needs-review"});
 const b=record({id:"b",originalText:"Prepared financial modelling for M&A work.",status:"verified",classificationReviewed:true});
 const router=record({id:"c",cvEligible:false,source:{kind:"router"},originalText:"Power BI and dashboards."});
 const result=matchJD(jd,[a,b,router]);
 assert.ok(result.matchedTerms.some(x=>x.term==="transfer pricing"));
 assert.ok(result.matchedTerms.some(x=>x.term==="financial modelling"));
 assert.ok(result.unmatchedTerms.some(x=>x.term==="Power BI"));
 assert.equal(result.suggestedTags.includes("Power BI"),false);
 assert.equal(result.matchedTerms.find(x=>x.term==="transfer pricing").recordMatches[0].verifiedEvidence,false);
});
test("negative evidence and guardrail sections cannot support matched keywords",()=>{
 const jd="Looking for candidates with Excel and credit analysis experience.";
 const r=record({originalText:"Do not claim Excel experience from this source.",section:"experience"});
 const c=record({id:"r2",originalText:"Credit analysis is excluded from this project.",section:"guardrails"});
 const result=matchJD(jd,[r,c]);
 assert.equal(result.matchedTerms.length,0);
 assert.ok(result.unmatchedTerms.some(x=>x.term==="Excel"));
});
test("JD screening fails closed on short or oversized input",()=>{
 assert.throws(()=>matchJD("Excel",[]),/Paste a job description/);
 assert.throws(()=>matchJD("x".repeat(20001),[]),/Paste a job description/);
});
test("cannot approve invented result numbers in STAR drafts",()=>{
 const p=profile();const star={situation:"",task:"",action:"Reviewed files",result:"Increased satisfaction by 99%."};
 assert.throws(()=>patchRecord(p,{id:"e1",changes:{
  star,classificationReviewed:true,metricsReviewed:true,status:"verified"
 }}),/Unverified numerical claim/);
 assert.equal(p.records[0].status,"needs-review");
});
test("verified claim loses verified state when subsequent draft adds an unsupported number",()=>{
 const p=profile();
 patchRecord(p,{id:"e1",changes:{classificationReviewed:true,metricsReviewed:true,status:"verified"}});
 assert.equal(p.records[0].status,"verified");
 patchRecord(p,{id:"e1",changes:{cvBullet:"Delivered 900% portfolio returns."}});
 assert.equal(p.records[0].status,"needs-review");
 assert.equal(p.records[0].metricsReviewed,false);
});
