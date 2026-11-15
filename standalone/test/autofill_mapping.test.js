const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const Mapping=require("../autofill_mapping");
const profile={basics:{fullName:"Alex Example",email:"alex@example.com",address:"Private road"},
  equalEmployment:{gender:"Private"},
  work:[{employer:"Fictional Finance",country:"Ireland",startDate:"2024-06",current:"yes"},
    {employer:"Example Accounting",country:"Ireland",startDate:"2022-06"}],
  education:[{institution:"Example University",qualification:"BSc Finance"}]};
const field=(id,context,label,type="text",extra={})=>({id,context,label,type,options:[],...extra});
test("AI mapping facts omit local-only data and select records needed by fields",()=>{
  const facts=Mapping.facts(profile);
  assert.ok(facts.some(x=>x.path==="basics.firstName"&&x.value==="Alex"));
  assert.ok(!facts.some(x=>/address|gender|equalEmployment/.test(x.path)));
  const relevant=Mapping.relevantFacts([field("f1","Experience (2)","Organisation")],facts);
  assert.ok(relevant.some(x=>x.path==="work.1.employer"));
  assert.ok(!relevant.some(x=>x.path==="work.0.employer"));
});
test("AI may map an unfamiliar work label only to the same numbered record",()=>{
  const f=field("f1","Professional Experience (2)","Organisation registered name");
  const facts=Mapping.facts(profile);
  const good=Mapping.validate(f,{fieldId:"f1",profilePath:"work.1.employer"},facts);
  assert.equal(good.answer,"Example Accounting");
  assert.equal(Mapping.validate(f,{fieldId:"f1",profilePath:"work.0.employer"},facts),null);
  assert.equal(Mapping.validate({...f,hasValue:true},{fieldId:"f1",profilePath:"work.1.employer"},facts),null);
  assert.equal(Mapping.validate(f,{fieldId:"f1",profilePath:"work.9.employer"},facts),null);
});
test("AI mappings require exact enabled option and known date precision",()=>{
  const facts=Mapping.facts(profile);
  const country=field("f1","Experience (1)","Nation","select",{options:[
    {label:"Select",value:""},{label:"Ireland",value:"IE",disabled:false}]});
  assert.equal(Mapping.validate(country,{fieldId:"f1",profilePath:"work.0.country"},facts).answer,"IE");
  assert.equal(Mapping.validate({...country,options:[{label:"Ireland",value:"IE",disabled:true}]},
    {fieldId:"f1",profilePath:"work.0.country"},facts),null);
  const date=field("f2","Experience (1)","Joining year","text",{datePart:"year"});
  assert.equal(Mapping.validate(date,{fieldId:"f2",profilePath:"work.0.startDate"},facts).answer,"2024");
  assert.equal(Mapping.validate({...date,datePart:"day"},{fieldId:"f2",profilePath:"work.0.startDate"},facts),null);
  assert.equal(Mapping.validate({...date,datePart:""},{fieldId:"f2",profilePath:"work.0.startDate"},facts),null);
});
test("AI cannot map a work fact into an unnumbered field or create unsupported control values",()=>{
  const facts=Mapping.facts(profile);
  assert.equal(Mapping.validate(field("f1","Application","Organisation"),
    {fieldId:"f1",profilePath:"work.0.employer"},facts),null);
  assert.equal(Mapping.validate(field("f1","Experience (1)","Employer","email"),
    {fieldId:"f1",profilePath:"work.0.employer"},facts),null);
  assert.equal(Mapping.validate(field("f1","Experience (1)","Current employer","checkbox"),
    {fieldId:"f1",profilePath:"work.0.current"},facts).answer,"true");
});
test("AI cannot map a profile summary into Current Position or a title into Company",()=>{
  const facts=Mapping.facts({...profile,basics:{...profile.basics,summary:"Finance professional with five years of experience"},
    work:[{...profile.work[0],title:"Analyst"}]});
  assert.equal(Mapping.validate(field("f1","Application","Current Position"),
    {fieldId:"f1",profilePath:"basics.summary"},facts),null);
  assert.equal(Mapping.validate(field("f2","Experience (1)","Company"),
    {fieldId:"f2",profilePath:"work.0.title"},facts),null);
});
test("browser and backend validators use the same mapping code",()=>{
  const browser=fs.readFileSync(require.resolve("../../experimental/garamaal-autofill/extension/mapping.js"),"utf8");
  const backend=fs.readFileSync(require.resolve("../autofill_mapping.js"),"utf8");
  assert.equal(browser,backend);
});
