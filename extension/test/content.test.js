"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const core=require("../content.js");

const profile={
  basics:{fullName:"Jordan Sample",city:"Dublin",country:"Ireland"},
  work:[{employer:"Example Finance",title:"Analyst"}],
  education:[{institution:"Example University",qualification:"MSc Finance"}],
  skills:"Excel, Financial analysis"
};
test("recognises major ATS platform domains",()=>{
  assert.equal(core.platform("myworkdayjobs.com"),"Workday");
  assert.equal(core.platform("boards.greenhouse.io"),"Greenhouse");
  assert.equal(core.platform("jobs.lever.co"),"Lever");
  assert.equal(core.platform("example.com"),"Other");
});
test("extracts a JobPosting from structured metadata",()=>{
  const ld={ "@context":"https://schema.org","@type":"JobPosting",
    title:"Finance Analyst",hiringOrganization:{name:"Example Co"},
    jobLocation:{address:{addressLocality:"Dublin",addressCountry:"IE"}}};
  const doc={
    querySelectorAll:s=>s.includes("ld+json")?[{textContent:JSON.stringify(ld)}]:[],
    querySelector:()=>null,
    createElement:()=>({innerHTML:"",textContent:"",querySelectorAll:()=>[]})
  };
  const result=core.detectJob(doc,{hostname:"jobs.lever.co",href:"https://jobs.lever.co/test",protocol:"https:"});
  assert.equal(result.title,"Finance Analyst");
  assert.equal(result.company,"Example Co");
  assert.equal(result.location,"Dublin, IE");
  assert.equal(result.platform,"Lever");
});
test("maps supported fields using only saved evidence",()=>{
  assert.equal(core.classify("First Name"),"firstName");
  assert.equal(core.classify("emailAddress"),"email");
  assert.equal(core.classify("University name"),"institution");
  assert.equal(core.valueFor("firstName",profile),"Jordan");
  assert.equal(core.valueFor("lastName",profile),"Sample");
  assert.equal(core.valueFor("employer",profile),"Example Finance");
  assert.equal(core.valueFor("institution",profile),"Example University");
  assert.equal(core.valueFor("email",profile),"");
  assert.equal(core.valueFor("email",profile,{email:"person@example.com"}),"person@example.com");
});
test("does not infer last name from a single word",()=>{
  assert.equal(core.valueFor("lastName",{basics:{fullName:"Jordan"}}),"");
});
test("never maps sensitive questions or unknown fields",()=>{
  for(const q of ["Date of birth","Visa sponsorship","Right to work",
    "Disability status","Country of birth","Expected salary",
    "Gender","How many years experience?","What is your notice period?"]){
    assert.equal(core.classify(q),"",q);
  }
});
test("select options require an exact match",()=>{
  const options=[{textContent:"Select",value:""},{textContent:"Ireland",value:"IE"},{textContent:"France",value:"FR"}];
  assert.equal(core.selectValue({options},"Ireland"),"IE");
  assert.equal(core.selectValue({options},"India"),null);
});
test("never overwrites answered fields or ticks agreement checkboxes",()=>{
  assert.equal(core.hasValue({value:"Already supplied"}),true);
  assert.equal(core.eligible({tagName:"INPUT",type:"checkbox",disabled:false,readOnly:false}),false);
  assert.equal(core.eligible({tagName:"INPUT",type:"file",disabled:false,readOnly:false}),false);
});
test("candidate-specific profiles produce separate values",()=>{
  const pooja={basics:{fullName:"Pooja Example"}};
  assert.equal(core.valueFor("firstName",profile),"Jordan");
  assert.equal(core.valueFor("firstName",pooja),"Pooja");
});
