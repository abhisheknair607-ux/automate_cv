"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {extractStructuredProfile}=require("../autofill_structured");
const {structuredProfileForEmail}=require("../autofill");
const text=[
  "EVIDENCE CORE-CHRONOLOGY",
  "Alex Example | Dublin, Ireland",
  "Product Lead | Current Finance Ltd | Ireland | July 2026 to current",
  "Adviser | Previous Capital Ltd | Mumbai, India | March 2022 to August 2025",
  "Intern | Early Firm | August 2018",
  "END EVIDENCE CORE-CHRONOLOGY",
  "EVIDENCE CORE-CREDENTIALS",
  "MSc Finance - Example University",
  "Dublin, Ireland | Aug 2025 - Sep 2026",
  "Bachelor of Commerce - Earlier College",
  "India | May 2020",
  "PROFESSIONAL QUALIFICATIONS & CERTIFICATIONS",
  "VOLUNTEERING & LEADERSHIP",
  "Finance Director - Rotaract Club | Aug 2026 - Jul 2027"
].join("\n");
test("structured chronology keeps current and past jobs separate",()=>{
  const profile=extractStructuredProfile(text);
  assert.equal(profile.basics.fullName,"Alex Example");
  assert.equal(profile.work.length,3);
  assert.deepEqual(profile.work.map(x=>x.employer),
    ["Current Finance Ltd","Previous Capital Ltd","Early Firm"]);
  assert.equal(profile.work[0].current,"yes");
  assert.equal(profile.work[1].current,"no");
  assert.equal(profile.work[0].startDate,"2026-07");
  assert.equal(profile.work[1].endDate,"2025-08");
  assert.equal(profile.work[2].startDate,"2018-08");
  assert.equal(profile.work.some(x=>/Rotaract/.test(x.employer)),false);
  assert.equal(profile.education.length,2);
  assert.equal(profile.education[0].qualification,"MSc Finance");
  assert.equal(profile.education[0].endDate,"2026-09");
});
test("authenticated candidate selects only their configured master file",async()=>{
  let requested="";
  const env={AUTOFILL_CANDIDATE_EMAILS:JSON.stringify({"alex@example.com":"pooja"}),
    POOJA_MASTER_EVIDENCE_BANK_FILE_ID:"pooja-master"};
  const result=await structuredProfileForEmail({email:"alex@example.com",env,client:{},
    readEvidence:async(_client,id)=>{requested=id;return text;}});
  assert.equal(requested,"pooja-master");
  assert.equal(result.candidate,"pooja");
  assert.equal(result.profile.work[0].title,"Product Lead");
});
