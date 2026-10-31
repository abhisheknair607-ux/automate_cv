"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {parseSource,mergeImports,sourceCatalog,metricsFrom}=require("../profile_evidence");
function parse(key,kind,text){
 return parseSource({candidate:key,kind,fileId:"test-file-ID-123456789",title:"Test evidence",text});
}
test("rejects incomplete, placeholder and wrong-candidate sources",()=>{
 assert.throws(()=>parse("pooja","master","PLACEHOLDER — DO NOT RUN AUTOMATION"),/placeholder/i);
 assert.throws(()=>parse("abhishek","master","CANDIDATE KEY pooja\nOther text"),/mismatch/i);
 assert.throws(()=>parse("pooja","master",""),/Empty Drive source/);
});
test("Pooja explicit evidence IDs keep original text, metrics, and guarded source provenance",()=>{
 const input="Pooja master evidence bank\nCANDIDATE KEY pooja\n"+
 "EVIDENCE CORE-CREDENTIALS\nMSc Finance\nEND EVIDENCE CORE-CREDENTIALS\n"+
 "EVIDENCE PR-POOJA-BAJAJ\nManaged €50.1M in assets; 25% growth.\nEND EVIDENCE PR-POOJA-BAJAJ\n"+
 "EVIDENCE FIN-POOJA-P01\nPortfolio valuation model.\nEND EVIDENCE FIN-POOJA-P01";
 const p=parse("pooja","master",input);
 const work=p.records.find(r=>r.source.locator==="EVIDENCE PR-POOJA-BAJAJ");
 assert.equal(work.section,"experience");
 assert.match(work.originalText,/€50.1M/);
 assert.ok(work.metrics.some(m=>m.includes("25%")));
 assert.equal(work.metricsReviewed,false);
 assert.equal(work.status,"needs-review");
 assert.deepEqual(work.star,{situation:"",task:"",action:"",result:""});
 assert.equal(p.records.find(r=>r.source.locator==="EVIDENCE FIN-POOJA-P01").section,"projects");
 assert.equal(p.records.find(r=>r.source.locator==="EVIDENCE CORE-CREDENTIALS").section,"education");
});
test("Abhishek narrative headings are kept as separate source-linked records",()=>{
 const input="ABHISHEK NAIR\nPROFESSIONAL SUMMARY\nACCA member.\n"+
 "TAXLINK, MAYNOOTH, IRELAND\nClient liaison work.\n"+
 "EY INDIA\n1. Functional analysis, FAR interviews and value-chain assessment\n"+
 "Interviewed finance stakeholders and screened 200+ companies.\n";
 const p=parse("abhishek","master",input);
 assert.ok(p.records.some(r=>r.title==="TAXLINK, MAYNOOTH, IRELAND"&&r.section==="experience"));
 const work=p.records.find(r=>r.title.includes("Functional analysis"));
 assert.ok(work);
 assert.equal(work.section,"experience");
 assert.match(work.originalText,/200\+/);
});
test("tagged parser fails closed when evidence delimiters are mismatched",()=>{
 assert.throws(()=>parse("pooja","master","EVIDENCE CORE-CHRONOLOGY\nFacts\nEND EVIDENCE CORE-CREDENTIALS"),/Unmatched/);
 assert.throws(()=>parse("pooja","master","EVIDENCE CORE-CHRONOLOGY\nFacts"),/Unclosed/);
});
test("candidate configs are separated and never fall back to other candidate",()=>{
 const env={MASTER_EVIDENCE_BANK_FILE_ID:"abc",SUMMARY_DOC_FILE_ID:"xyz",
  POOJA_MASTER_EVIDENCE_BANK_FILE_ID:"pooja-master",POOJA_SUMMARY_DOC_FILE_ID:"pooja-summary"};
 assert.equal(sourceCatalog("abhishek",env)[0].fileId,"abc");
 assert.equal(sourceCatalog("pooja",env)[0].fileId,"pooja-master");
 assert.equal(sourceCatalog("pooja",{})[0].configured,false);
});
test("merging sources adds no invented STAR or metric verification",()=>{
 const p1=parse("pooja","master","EVIDENCE PR-POOJA-BAJAJ\nManaged €50.1M.\nEND EVIDENCE PR-POOJA-BAJAJ");
 const p2=parse("pooja","router","INVESTMENTS AND WEALTH MANAGEMENT\nAnnual portfolio review.");
 const out=mergeImports([p1,p2],"pooja");
 assert.equal(out.candidate,"pooja");
 assert.equal(out.sources.length,2);
 assert.ok(out.records.every(r=>!r.cvBullet&&r.status==="needs-review"&&!r.metricsReviewed));
 assert.throws(()=>mergeImports([p1],"unknown"),/Unknown candidate/);
});
test("numeric phrases are observations, not inferred outcomes",()=>{
 const m=metricsFrom("Reviewed 200+ companies, managed €50.1M and delivered 25% growth.");
 assert.ok(m.includes("€50.1M"));
 assert.ok(m.includes("25%"));
});
