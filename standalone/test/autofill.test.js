const test=require("node:test");
const assert=require("node:assert/strict");
const {
  candidateForEmail,evidenceId,safeFields,profileEvidence,selectEvidence,
  validateAnswers,consumeQuota,answerApplication,readEvidenceDoc
}=require("../autofill");
const env={
  AUTOFILL_CANDIDATE_EMAILS:JSON.stringify({"alex@example.com":"abhishek"}),
  SUMMARY_DOC_FILE_ID:"summary-abhishek",MASTER_EVIDENCE_BANK_FILE_ID:"master-abhishek",
  POOJA_SUMMARY_DOC_FILE_ID:"summary-pooja",POOJA_MASTER_EVIDENCE_BANK_FILE_ID:"master-pooja"
};
const experience={id:"gm-autofill-0",type:"select",
  label:"Do you have financial forecasting experience?",
  options:[{label:"Select",value:""},{label:"Yes",value:"Y"},{label:"No",value:"N"}]};
const name={id:"gm-autofill-1",type:"text",label:"Full Name"};
const email={id:"gm-autofill-2",type:"email",label:"Email Address"};
test("verified account mapping isolates both candidate document IDs",()=>{
  assert.equal(candidateForEmail("Alex@Example.com",env.AUTOFILL_CANDIDATE_EMAILS),"abhishek");
  assert.equal(evidenceId("abhishek",env,"summary"),"summary-abhishek");
  assert.equal(evidenceId("abhishek",env,"master"),"master-abhishek");
  assert.throws(()=>candidateForEmail("other@example.com",env.AUTOFILL_CANDIDATE_EMAILS),/No autofill candidate/);
  assert.throws(()=>evidenceId("pooja",{...env,POOJA_MASTER_EVIDENCE_BANK_FILE_ID:""},"master"),/not configured/);
});
test("protected questions and action types never reach the model",()=>{
  const fields=safeFields([experience,{...name,id:"gm-autofill-3",label:"Salary expectation"},
    {...name,id:"gm-autofill-4",label:"Accept terms and declarations"}]);
  assert.equal(fields.length,1);
  assert.throws(()=>safeFields([{...experience,type:"submit"}]),/Invalid autofill fields/);
  assert.equal(safeFields([{...experience,label:"Management experience"}]).length,1);
});
test("answers require cited evidence and an enabled exact option",()=>{
  const evidence=[{id:"e0",text:"Built financial forecasts for three business units."}];
  assert.equal(validateAnswers([experience],evidence,{answers:[
    {fieldId:experience.id,answer:"Y",evidenceIds:["e0"]}]}).length,1);
  for(const answer of ["Yes","N"]){
    assert.equal(validateAnswers([experience],evidence,{answers:[
      {fieldId:experience.id,answer,evidenceIds:["e0"]}]}).length,0);
  }
  assert.equal(validateAnswers([experience],evidence,{answers:[
    {fieldId:experience.id,answer:"Y",evidenceIds:["missing"]}]}).length,0);
});
test("filled Career Profile answers the whole page without document reads",async()=>{
  let reads=0,calls=0;
  const result=await answerApplication({
    email:"alex@example.com",env,client:{},
    body:{fields:[name,experience],profile:{basics:{fullName:"Alex Example"},
      work:[{achievements:"Built financial forecasts for three business units"}]}},
    readEvidence:async()=>{reads++;throw Error("Document should not be read")},
    model:async input=>{calls++;return {answers:input.fields.map(f=>({
      fieldId:f.id,answer:f.id===name.id?"Alex Example":"Y",
      evidenceIds:[input.evidence.find(e=>f.id===name.id?
        e.text.includes("Alex Example"):e.text.includes("forecasts")).id]}))}}
  });
  assert.equal(reads,0);assert.equal(calls,1);
  assert.equal(result.answers.length,2);
  assert.equal(result.source,"profile");
});
test("page batches pending fields through Summary then Master",async()=>{
  const reads=[],batches=[];
  const result=await answerApplication({
    email:"alex@example.com",env,client:{},
    body:{fields:[name,email,experience],profile:{basics:{fullName:"Alex Example"}}},
    readEvidence:async(_client,id)=>{reads.push(id);
      return id==="summary-abhishek"?"Email Address: alex@example.com\n\nCareer summary paragraph.":
        "Built financial forecasts for three business units."},
    model:async input=>{
      batches.push(input.fields.map(f=>f.id));
      const source=input.evidence[0]?.source;
      const selected=source==="profile"?name:source==="summary"?email:experience;
      return {answers:[{fieldId:selected.id,
        answer:selected.id===name.id?"Alex Example":selected.id===email.id?"alex@example.com":"Y",
        evidenceIds:[input.evidence.find(e=>e.text.includes(
          selected.id===name.id?"Alex Example":selected.id===email.id?"alex@example.com":"forecasts")).id]}]};
    }
  });
  assert.deepEqual(batches,[[name.id,email.id,experience.id],
    [email.id,experience.id],[experience.id]]);
  assert.deepEqual(reads,["summary-abhishek","master-abhishek"]);
  assert.equal(result.answers.length,3);
});
test("Summary completes page without reading Master",async()=>{
  const reads=[];
  const result=await answerApplication({email:"alex@example.com",env,client:{},
    body:{fields:[experience]},
    readEvidence:async(_client,id)=>{reads.push(id);return "Built financial forecasts for three business units."},
    model:async input=>({answers:[{fieldId:experience.id,answer:"Y",
      evidenceIds:[input.evidence[0].id]}]})});
  assert.deepEqual(reads,["summary-abhishek"]);
  assert.equal(result.answers.length,1);
});
test("native Google Doc fallback exports text",async()=>{
  const calls=[];
  const text=await readEvidenceDoc({request:async({url})=>{
    calls.push(url);
    return {data:url.includes("fields=id,mimeType")?
      {mimeType:"application/vnd.google-apps.document"}:"Summary evidence paragraph"};
  }},"doc-id");
  assert.equal(text,"Summary evidence paragraph");
  assert.equal(calls.length,2);
});
test("evidence selection is bounded and includes question-specific facts",()=>{
  const profile=profileEvidence({basics:{fullName:"Alex Example",email:"alex@example.com"},
    work:[{achievements:"Built financial forecasts for three business units"}]});
  const selected=selectEvidence(profile,safeFields([name,email,experience]));
  assert.ok(selected.length<=18);
  assert.ok(selected.some(x=>x.text.includes("alex@example.com")));
  assert.ok(selected.some(x=>x.text.includes("forecasts")));
});
test("AI request budget limits repeated page runs per authenticated account",()=>{
  for(let i=0;i<30;i++)consumeQuota("quota@example.com",1000);
  assert.throws(()=>consumeQuota("quota@example.com",1000),/request limit/);
  assert.doesNotThrow(()=>consumeQuota("quota@example.com",601000));
});
