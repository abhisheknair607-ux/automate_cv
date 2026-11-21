"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../mobile_capture_handoff.js"),"utf8");

function harness({mode="save",jd="",existing=false,confirm=false,alreadyPrepared=false}={}){
  const inputs={};
  for(const field of ["add-company","add-role","add-location","add-url","add-jd","add-deadline","add-salary"]){
    inputs[field]={value:field==="add-jd"?jd:"",focus(){}};
  }
  const buttons=[],calls=[],navigation=[],messages=[];
  let section=null;
  function element(){
    const node={
      style:{},hidden:false,disabled:false,children:[],events:{},
      textContent:"",value:"",className:"",type:"",
      setAttribute(){},append(...nodes){this.children.push(...nodes);},
      prepend(...nodes){this.children.unshift(...nodes);},
      addEventListener(evt,callback){this.events[evt]=callback;},
      focus(){},remove(){}
    };
    return node;
  }
  const form=element();
  const document={
    getElementById(id){return id==="addForm"?form:inputs[id]||null;},
    createElement(){const n=element();buttons.push(n);return n;}
  };
  const payload={
    company:"Sample Employer",role:"Finance Analyst",
    location:"Dublin",url:"https://jobs.example.org/careers/111",
    mode,jdAvailable:jd.length>=80
  };
  let callIndex=0;
  const job={...payload,row:11,source:"taaza",jd,jdReady:jd.length>=80};
  const fresh={
    company:payload.company,role:payload.role,url:payload.url,
    row:17,source:"fresh",candidate:"Abhishek",cv:alreadyPrepared,cl:false,
    cvLink:"",jd,notInterested:false,status:"",tier:"Balanced",workflow:""
  };
  const run=async(method,arg)=>{
    calls.push({method,arg});
    if(method==="addDiscovery"){
      return existing?{created:false,row:11,message:"duplicate"}:
        {created:true,row:11,autoTransferred:jd.length>=80,freshRow:jd.length>=80?17:undefined};
    }
    if(method==="getJob")return arg.source==="taaza"?job:{...fresh,cv:alreadyPrepared||calls.some(c=>c.method==="updateFreshControl")};
    if(method==="saveDiscovery")return {saved:true,autoTransferred:true,freshRow:17};
    if(method==="transferJob")return {created:true,freshRow:17};
    if(method==="updateFreshControl")return {saved:true};
    if(method==="runCvApiNow")return {queued:true,message:"CV queued"};
    throw Error("Unexpected backend call: "+method);
  };
  const context={
    location:{hash:"#gm-capture="+encodeURIComponent(JSON.stringify(payload)),pathname:"/prototype",search:""},
    history:{replaceState(){}},
    URL,JSON,decodeURIComponent,document,
    navigator:{clipboard:{readText:async()=>jd}},
    window:{GaramaalPrototypeHome:{enterJobs(){}},confirm:()=>confirm},
    state:{candidate:"Abhishek"},
    nav(tab){navigation.push(tab)},
    run,
  };
  vm.runInNewContext(source,context);
  for(const node of buttons)if(node.textContent&&node.events.click)messages.push(node);
  async function click(label){
    const b=messages.find(x=>x.textContent===label);
    assert.ok(b,"Button missing: "+label);
    return b.events.click();
  }
  return{buttons:messages,inputs,calls,navigation,click,form,payload};
}

test("Capturing metadata does not save or dispatch without explicit action",()=>{
  const h=harness({jd:"a".repeat(160)});
  assert.equal(h.calls.length,0);
  assert.equal(h.inputs["add-role"].value,"Finance Analyst");
  assert.equal(h.inputs["add-company"].value,"Sample Employer");
  assert.equal(h.inputs["add-url"].value,"https://jobs.example.org/careers/111");
});

test("Save Job invokes authenticated addDiscovery only, never a paid CV dispatch",async()=>{
  const h=harness({jd:"Finance duties ".repeat(12)});
  await h.click("Save Job");
  assert.deepEqual(h.calls.map(c=>c.method),["addDiscovery"]);
  assert.equal(h.calls[0].arg.jd,"Finance duties ".repeat(12).trim());
  assert.ok(h.buttons.find(b=>b.textContent==="Generate CV (paid)").hidden);
});

test("Save & Prepare CV uses verified Freshmaal row and candidate-specific checkbox",async()=>{
  const h=harness({mode:"cv",jd:"Forecasting and reporting ".repeat(8)});
  await h.click("Save & Prepare CV");
  assert.deepEqual(h.calls.map(c=>c.method),["addDiscovery","getJob","updateFreshControl"]);
  const edit=h.calls.find(c=>c.method==="updateFreshControl").arg;
  assert.equal(edit.candidate,"Abhishek");
  assert.equal(edit.row,17);
  assert.equal(edit.field,"cv");
  assert.equal(edit.value,true);
  assert.equal(h.calls.some(c=>c.method==="runCvApiNow"),false);
  await h.click("Generate CV (paid)");
  assert.equal(h.calls.some(c=>c.method==="runCvApiNow"),false,"No paid dispatch without consent");
});

test("Paid CV generation still requires explicit confirmation",async()=>{
  const h=harness({mode:"cv",jd:"Budgeting and finance ".repeat(10),confirm:true});
  await h.click("Save & Prepare CV");
  await h.click("Generate CV (paid)");
  const paid=h.calls.find(c=>c.method==="runCvApiNow");
  assert.equal(paid.arg.confirm,true);
  assert.equal(paid.arg.candidate,"Abhishek");
  assert.equal(paid.arg.row,17);
});

test("Already saved vacancy is reused, not overwritten or duplicated",async()=>{
  const h=harness({existing:true,jd:"Annual reporting and analysis ".repeat(8)});
  await h.click("Save Job");
  assert.deepEqual(h.calls.map(c=>c.method),["addDiscovery","getJob"]);
  assert.equal(h.calls.some(c=>c.method==="saveDiscovery"),false);
});

test("Incomplete JD cannot start CV preparation",async()=>{
  const h=harness({mode:"cv",jd:"short"});
  await h.click("Save & Prepare CV");
  assert.equal(h.calls.length,0);
});
