const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

test("Career Profile keeps an older draft and renders Jobright-style sections",()=>{
  const source=fs.readFileSync(require.resolve("../mobile_profile_editor.js"),"utf8");
  const values=new Map([["gmv3-career-profile-local-v1:Abhishek",JSON.stringify({
    basics:{fullName:"Alex Example",city:"Dublin"},
    education:[{institution:"Example University",qualification:"MSc",period:"2025-2026"}]
  })]]);
  const localStorage={getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value)};
  let mount;
  const document={
    body:{classList:{contains:()=>true},append(node){mount=node}},
    activeElement:null,
    createElement:()=>({innerHTML:"",querySelector:()=>({focus(){}})}),
    addEventListener(){}
  };
  const context={document,localStorage,window:{},state:{candidate:"Abhishek"}};
  vm.runInNewContext(source,context);
  context.window.GaramaalProfile.open();
  for(const label of ["Personal details","Education","Work experience",
    "Skills & interests","Equal Employment","Certifications","Projects",
    "Application email","Contact phone","Address","LinkedIn URL","Grade / result",
    "Are you a citizen of Ireland?"]){
    assert.ok(mount.innerHTML.includes(label),label);
  }
  assert.ok(mount.innerHTML.includes("Alex Example"));
  assert.ok(mount.innerHTML.includes("Example University"));
  assert.ok(!mount.innerHTML.includes("Private"));
});