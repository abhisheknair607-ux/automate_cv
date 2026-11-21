"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const receiver=fs.readFileSync(path.join(root,"mobile_capture_handoff.js"),"utf8");
const capture=fs.readFileSync(path.join(root,"../mobile/android/app/src/main/assets/job_capture.js"),"utf8");
const server=fs.readFileSync(path.join(root,"server.js"),"utf8");

test("Android handoff script and DOM extractor parse",()=>{
  new vm.Script(receiver);
  new vm.Script(capture);
  assert.match(server,/mobile-capture-handoff\.js/);
  assert.match(server,/mobile_capture_handoff\.js/);
  assert.doesNotMatch(receiver,/fetch\s*\(|addDiscovery\s*\(/);
  assert.doesNotMatch(capture,/document\.cookie|localStorage|sessionStorage|\.value\b/);
});

function executeHandoff(data){
  const inputs={};
  for(const id of ["add-company","add-role","add-location","add-url","add-jd"]){
    inputs[id]={value:"",focus(){}};
  }
  let prepended=false, navigated=[],enterCount=0,clearCount=0;
  const form={prepend(){prepended=true}};
  const document={
    getElementById(id){return id==="addForm"?form:inputs[id]||null;},
    createElement(){return{style:{},setAttribute(){},append(){},addEventListener(){},textContent:"",type:"",className:"",id:""};}
  };
  const ctx={
    location:{hash:data,pathname:"/prototype",search:""},
    history:{replaceState(){clearCount++;}},
    document,URL,JSON,decodeURIComponent,
    navigator:{clipboard:{readText:async()=>""}},
    window:{GaramaalPrototypeHome:{enterJobs(){enterCount++}}},
    nav(id){navigated.push(id)}
  };
  vm.runInNewContext(receiver,ctx,{filename:"mobile_capture_handoff.js"});
  return {inputs,prepended,navigated,enterCount,clearCount};
}

test("Valid external job metadata opens existing Add Job form without saving",()=>{
  const payload={
    company:"Example Technologies",role:"Senior Analyst",
    url:"https://jobs.example.com/job/123",location:"Dublin"
  };
  const r=executeHandoff("#gm-capture="+encodeURIComponent(JSON.stringify(payload)));
  assert.equal(r.inputs["add-company"].value,payload.company);
  assert.equal(r.inputs["add-role"].value,payload.role);
  assert.equal(r.inputs["add-location"].value,payload.location);
  assert.equal(r.inputs["add-url"].value,payload.url);
  assert.deepEqual(r.navigated,["add"]);
  assert.equal(r.enterCount,1);
  assert.equal(r.clearCount,1);
  assert.equal(r.prepended,true);
});

test("LinkedIn capture and invalid URLs are refused, navigation remains possible",()=>{
  const p={company:"A",role:"B",url:"https://www.linkedin.com/jobs/view/123"};
  const bad=executeHandoff("#gm-capture="+encodeURIComponent(JSON.stringify(p)));
  assert.equal(bad.prepended,false);
  assert.equal(bad.navigated.length,0);
  const nav=executeHandoff("#gm-view=fresh");
  assert.deepEqual(nav.navigated,["fresh"]);
});

test("Capture code blocks LinkedIn and never enumerates input fields",()=>{
  assert.match(capture,/LinkedIn extraction is disabled/);
  assert.match(capture,/querySelectorAll\('script\[type="application\/ld\+json"\]'\)/);
  assert.match(capture,/MAX_DESCRIPTION = 49000/);
});
