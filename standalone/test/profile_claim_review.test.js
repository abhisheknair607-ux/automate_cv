"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditClaimNumbers}=require("../profile_claim_review");
const {unsupportedNumbers,proposeStar,matchJD}=require("../profile_suggestions");
const {patchRecord}=require("../profile_section_ops");
const {BASE_SECTIONS}=require("../profile_evidence");
const original="Managed a €50.1M investment portfolio. Improved client satisfaction by 40%. Analysed 200+ companies.";
const fake=()=>({
 id:"source-1",section:"experience",title:"Work evidence",originalText:original,
 source:{kind:"master",fileId:"example"},cvEligible:true,
 status:"needs-review",classificationReviewed:false,metricsReviewed:false,
 metrics:["€50.1M","40%","200+ companies"],star:{situation:"",task:"",action:"",result:""},
 cvBullet:"",tags:[]
});
test("numeric audit distinguishes verified presence from meaning",()=>{
 const review=auditClaimNumbers("Improved client satisfaction by 40%. Managed €50.1M investment portfolio.",original);
 assert.equal(review.unsupportedNumbers.length,0);
 assert.equal(review.contextWarnings.length,0);
 assert.ok(review.checks.every(x=>x.status==="matching-number-needs-review"));
 assert.ok(review.checks.every(x=>x.sourceContexts.length));
 assert.equal(review.automaticallyVerified,false);
});
test("reusing 40% to invent revenue growth triggers a context mismatch",()=>{
 const audit=auditClaimNumbers("Grew revenue by 40%.",original);
 assert.equal(audit.unsupportedNumbers.length,0);
 assert.equal(audit.contextWarnings.length,1);
 assert.equal(audit.contextWarnings[0].value,"40%");
 assert.match(audit.contextWarnings[0].sourceContexts[0].sourceQuote,/client satisfaction/i);
});
test("unsourced currencies and bare numbers are blocked",()=>{
 const review=auditClaimNumbers("Managed €99M and worked with 5000 client accounts in 2027.",original);
 assert.ok(review.unsupportedNumbers.some(x=>x.value.includes("€99M")));
 assert.ok(review.unsupportedNumbers.some(x=>x.value==="5000"));
 assert.ok(review.unsupportedNumbers.some(x=>x.value==="2027"));
 assert.equal(review.automaticallyVerified,false);
});
test("protected record cannot be approved if a claimed number changes outcome type",()=>{
 const entry=fake(),profile={candidate:"pooja",sections:BASE_SECTIONS.map(x=>({...x})),records:[entry]};
 assert.throws(()=>patchRecord(profile,{id:entry.id,changes:{
  classificationReviewed:true,metricsReviewed:true,status:"verified",
  cvBullet:"Grew revenue by 40%."
 }}),/different outcome context/);
 assert.equal(entry.cvBullet,"");
 assert.equal(entry.status,"needs-review");
 assert.equal(entry.metricsReviewed,false);
});
test("new mismatch revokes previously verified record",()=>{
 const entry=fake(),profile={candidate:"pooja",sections:BASE_SECTIONS.map(x=>({...x})),records:[entry]};
 patchRecord(profile,{id:entry.id,changes:{classificationReviewed:true,metricsReviewed:true,status:"verified"}});
 assert.equal(entry.status,"verified");
 patchRecord(profile,{id:entry.id,changes:{cvBullet:"Grew revenue by 40%."}});
 assert.equal(entry.status,"needs-review");
 assert.equal(entry.metricsReviewed,false);
 assert.match(entry.originalText,/client satisfaction/);
});
test("no metrics do not imply the whole STAR suggestion is verified",()=>{
 const out=auditClaimNumbers("Performed risk reviews.",original);
 assert.equal(out.checks.length,0);
 assert.equal(out.reviewRequired,true);
 assert.equal(out.automaticallyVerified,false);
});
test("JD keywords cannot create missing experience or reuse router content",()=>{
 const main=fake();
 const router={...fake(),id:"router",source:{kind:"router"},cvEligible:false,originalText:"Power BI and advanced reporting."};
 const result=matchJD("Looking for Power BI, investment analysis and financial modelling experience.",[main,router]);
 assert.ok(result.unmatchedTerms.some(x=>x.term==="Power BI"));
 assert.ok(result.unmatchedTerms.some(x=>x.term==="financial modelling"));
 assert.equal(result.suggestedTags.includes("Power BI"),false);
 const proposal=proposeStar(main);
 assert.ok(Object.values(proposal.fields).filter(Boolean).every(v=>original.slice(v.source.start,v.source.end)===v.text));
});
