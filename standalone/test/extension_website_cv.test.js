"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const ROOT=path.join(__dirname,"../..");
const source=fs.readFileSync(path.join(ROOT,"chrome-extension/job_panel.js"),"utf8");
const contract=require(path.join(ROOT,"chrome-extension/cv_handoff.js"));
const url="https://careers.example.com/jobs/controller-101";
const job={company:"Example Company",role:"Plant Controller",url,
  jd:"Role responsibilities and qualifications including finance reporting. ".repeat(4),location:"Sligo, Ireland",deadline:"",salary:""};

function harness({queue={},initialFresh={},savedSession=null}={}){
  const nodes=new Map(),calls=[],session={gmCvJobSession:savedSession},timers=[];
  const el=id=>{
    if(!nodes.has(id))nodes.set(id,{id,value:"",checked:false,hidden:false,disabled:false,
      options:[],textContent:"",listeners:{},addEventListener(type,callback){this.listeners[type]=callback;},
      setAttribute(){}});
    return nodes.get(id);
  };
  el("job-candidate").value="Abhishek";
  el("cv-tier").value="Balanced";
  el("cv-make").checked=true;
  const fresh={source:"fresh",row:20,...job,cv:false,cl:false,web:false,tier:"Premium",
    cvLink:"",workflow:"",...initialFresh};
  async function siteCall(method,arg){
    calls.push({method,arg});
    switch(method){
      case "addDiscovery":return {created:true,row:10};
      case "getJob":
        return arg.source==="taaza"?{source:"taaza",row:10,...job}:{...fresh};
      case "transferJob":return {created:true,freshRow:20};
      case "updateFreshControl":fresh[arg.field]=arg.value;return {saved:true};
      case "getCvQueue":return {byJob:queue};
      case "runCvApiNow":return {message:"CV generation queued in Garamaal"};
      default:throw Error("Unexpected website API call: "+method);
    }
  }
  const chrome={
    permissions:{contains:async()=>true,request:async()=>true},
    tabs:{
      query:async options=>options?.url?[{id:6,url:"https://garamaal.web.app/prototype"}]:[{id:5,url}],
      create:async()=>{}
    },
    scripting:{executeScript:async({target,args})=>{
      if(target.tabId===5)return [{result:{...job,pageUrl:url,source:"Visible page"}}];
      if(target.tabId!==6)throw Error("Unexpected tab");
      return [{result:await siteCall(args[0],args[1])}];
    }},
    storage:{session:{
      get:async key=>({[key]:session[key]}),
      set:async obj=>Object.assign(session,obj),
      remove:async key=>{delete session[key];}
    }}
  };
  const sandbox={chrome,document:{getElementById:el,querySelectorAll:()=>[]},
    GaramaalCvHandoff:contract,URL,Date,Map,Set,Uint8Array,
    confirm:()=>true,alert:()=>{},console,setInterval:fn=>{timers.push(fn);return timers.length;},
    clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  vm.runInNewContext(source,sandbox,{filename:"chrome-extension/job_panel.js"});
  const click=async id=>{
    const listener=el(id).listeners.click;
    assert.equal(typeof listener,"function",id+" must have click handler");
    await listener();
  };
  return {el,click,calls,session,fresh,timers};
}

test("extension generates through the same authenticated Garamaal website API",async()=>{
  const h=harness();
  for(const [key,value] of Object.entries(job))h.el("job-"+key).value=value;
  await h.click("job-save");
  assert.equal(h.el("cvPanel").hidden,false,"saved job opens Make CV");
  await h.click("cv-save");
  assert.deepEqual(h.calls.filter(x=>x.method==="updateFreshControl").map(x=>x.arg.field),
    ["tier","cv","cl","web"]);
  await h.click("cv-run");
  assert.equal(h.calls.filter(x=>x.method==="runCvApiNow").length,1);
  const run=h.calls.find(x=>x.method==="runCvApiNow").arg;
  assert.equal(run.candidate,"Abhishek");
  assert.equal(run.row,20);
  assert.equal(run.confirm,true,"paid run must be explicitly confirmed");
  assert.equal(run.expected.url,url);
  assert.equal(h.el("cvPanel").hidden,false,"remain in Make CV to monitor generated CV");
  assert.match(h.el("cv-status").textContent,/queued/i);
});

test("extension reuses a queued website CV run instead of paying twice",async()=>{
  const h=harness({queue:{"abhishek:20":{state:"queued",runId:1234}}});
  for(const [key,value] of Object.entries(job))h.el("job-"+key).value=value;
  await h.click("job-save");
  await h.click("cv-save");
  await h.click("cv-run");
  assert.equal(h.calls.filter(x=>x.method==="runCvApiNow").length,0);
  assert.equal(h.el("cvPanel").hidden,false);
  assert.match(h.el("cv-upload-status").textContent,/already queued/i);
});

test("extension restores CV controls from the website's verified Freshmaal row",async()=>{
  const saved={candidate:"Pooja",row:20,...job,savedAt:Date.now(),taazaRow:10};
  const h=harness({savedSession:saved,initialFresh:{tier:"Economy",cv:true,cl:true,web:false}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.el("job-candidate").value,"Pooja");
  assert.equal(h.el("cv-tier").value,"Economy");
  assert.equal(h.el("cv-make").checked,true);
  assert.equal(h.el("cv-letter").checked,true);
  assert.equal(h.el("cv-web").checked,false);
  assert.equal(h.el("cvPanel").hidden,false);
  assert.equal(h.calls.filter(x=>x.method==="updateFreshControl").length,0,
    "restoring CV options must be read-only");
});
