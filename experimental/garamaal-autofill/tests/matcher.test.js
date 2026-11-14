const test=require("node:test");
const assert=require("node:assert/strict");
const {suggest,isEmployerFamilyQuestion}=require("../extension/matcher.js");
const profile=require("../examples/sample-profile.json");
const f=(label,type="text",extra={})=>({id:"x",label,type,hasValue:false,...extra});
const noYes=[{label:"Yes",value:"yes"},{label:"No",value:"no"}];
test("known safe fields",()=>{
  assert.equal(suggest(f("First Name"),profile).value,"Alex");
  assert.equal(suggest(f("Email Address","email"),profile).value,"alex@example.com");
});
test("protected and unknown fields remain blank",()=>{
  for(const s of ["Salary Expectation","Visa sponsorship","Passport Number",
      "Security Email","Reference First Name","Date of Birth"]){
    assert.equal(suggest(f(s),profile),null,s);
  }
  assert.equal(suggest(f("First Name","password"),profile),null);
  assert.equal(suggest(f("First Name","text",{hasValue:true}),profile),null);
});
test("family-at-employer native dropdown defaults to No without extra confirmation",()=>{
  const field=f("Do you have relatives employed at this organisation?","select",{options:noYes});
  assert.equal(suggest(field,profile).value,"no");
  assert.equal(suggest({...field,hasValue:true},profile),null,"never override answered field");
});
test("family-at-employer radio selects the actual No option value",()=>{
  const field=f("Do any family members work at this company?","radio",{
    options:[{label:"Yes",value:"Y"},{label:"No",value:"N"}]});
  assert.equal(suggest(field,profile).value,"N");
});
test("employer-specific verified Yes overrides default No only for matching employer",()=>{
  const p={...profile,declarations:{relativesByCompany:{"Example Corp":true}}};
  const field=f("Are any relatives working in this company?","select",{options:noYes});
  assert.equal(suggest(field,p,{companyName:"Example Corp"}).value,"yes");
  assert.equal(suggest(field,p,{companyName:"Other Corp"}).value,"no");
  assert.equal(suggest(field,p,{}).value,"no");
});
test("unrelated eligibility and family contact questions cannot use default No",()=>{
  assert.equal(isEmployerFamilyQuestion("Do you require work visa sponsorship?"),false);
  assert.equal(isEmployerFamilyQuestion("Emergency contact for family member"),false);
  assert.equal(suggest(f("Have you worked for this company before?","select",{options:noYes}),profile),null);
  assert.equal(suggest(f("Do you have a criminal conviction?","radio",{options:noYes}),profile),null);
});
