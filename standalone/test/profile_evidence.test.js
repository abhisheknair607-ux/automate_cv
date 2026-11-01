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

test("mixed Pooja credentials are split into education, certifications, awards and volunteering",()=>{
 const text=[
  "Pooja master evidence bank","CANDIDATE KEY pooja",
  "EVIDENCE CORE-CREDENTIALS",
  "MSc Finance - University College Dublin",
  "PROFESSIONAL QUALIFICATIONS & CERTIFICATIONS","Qualified Financial Adviser",
  "PROFESSIONAL RECOGNITION & AWARDS","Gold Retirement Club Awardee",
  "VOLUNTEERING & LEADERSHIP","Finance Director Rotaract",
  "ADDITIONAL ACTIVITIES & INTERESTS","French - Intermediate",
  "END EVIDENCE CORE-CREDENTIALS"
 ].join("\n");
 const p=parse("pooja","master",text);
 for(const section of ["education","certifications","achievements","volunteering","skills"])
  assert.ok(p.records.some(r=>r.section===section),section);
 assert.ok(p.records.filter(r=>r.source.evidenceKey==="CORE-CREDENTIALS").length===5);
 assert.equal(p.source.integrity.complete,true);
 assert.equal(p.source.integrity.coveredLines+p.source.integrity.structuralLines,p.source.integrity.contentLines);
});
test("router facts are accessible as references but never silently marked CV-ready",()=>{
 const p=parse("abhishek","router","MASTER EVIDENCE ROUTER & RETRIEVAL INDEX\nPR-EY-BENCH\nRetrieve original benchmarks.");
 assert.ok(p.records.every(r=>r.section==="reference"&&!r.cvEligible));
 assert.equal(p.source.integrity.complete,true);
});
test("numbered factual bullets stay inside source body rather than disappearing as false headings",()=>{
 const p=parse("pooja","router","INVESTMENTS AND WEALTH MANAGEMENT\n1. Managed a €50.1M portfolio and delivered 25% growth.\n2. Reviewed 40+ client files.");
 assert.ok(p.records.some(r=>r.originalText.includes("Managed a €50.1M")));
 assert.ok(p.records.some(r=>r.originalText.includes("Reviewed 40+ client files")));
 assert.equal(p.source.integrity.complete,true);
 assert.equal(p.source.integrity.coveredLines,p.source.integrity.contentLines);
});
test("duplicate evidence is flagged without erasing either source",()=>{
 const repeated="Performed a structured cross-border advisory project and delivered documented financial review across several client teams.";
 const a=parse("pooja","master","EVIDENCE PR-POOJA-BAJAJ\n"+repeated+"\nEND EVIDENCE PR-POOJA-BAJAJ");
 const b=parse("pooja","router","ADDITIONAL REFERENCE\n"+repeated);
 const out=mergeImports([a,b],"pooja");
 assert.equal(out.sources.length,2);
 assert.ok(out.records.length>=2);
 assert.ok(out.records.every(r=>r.originalText));
 assert.equal(out.records.find(r=>r.source.kind==="router").cvEligible,false);
});
test("duplicate tagged keys are rejected rather than overwriting previous facts",()=>{
 assert.throws(()=>parse("pooja","master","EVIDENCE PR-POOJA-BAJAJ\nA\nEND EVIDENCE PR-POOJA-BAJAJ\nEVIDENCE PR-POOJA-BAJAJ\nB\nEND EVIDENCE PR-POOJA-BAJAJ"),/Duplicate evidence key/);
});
test("unmatched sections and all lines are preserved with stable source anchors",()=>{
 const p=parse("abhishek","master","ABHISHEK NAIR\nPROFESSIONAL SUMMARY\nFinance specialist.\nEY INDIA\n1. Economic benchmarking and comparable analysis\nScreened 200+ companies.\nSELECTED FINANCE, VALUATION AND TRANSACTION PROJECTS\nTransaction model.");
 assert.equal(p.source.integrity.complete,true);
 assert.ok(p.records.every(r=>Number.isInteger(r.source.lineStart)&&r.source.lineStart>=1));
 assert.ok(p.records.some(r=>r.section==="projects"));
 assert.ok(p.records.some(r=>r.section==="experience"));
});
