"use strict";
/* Offline regression tests for the October 24 Stage 2.2 UI concept.
   Run from repository root:
   node --test prototypes/multiuser-20261024/full-app/stage22-home-swipe.test.cjs
*/
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const base=__dirname;
const source=(name)=>fs.readFileSync(path.join(base,name),"utf8");
const js=(html)=>[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
function setup(){
  const nodes={root:{innerHTML:""},"status-message":{textContent:"",hidden:true},"reminder-new":{value:"Review application"},"ranking-json":{value:""}};
  const handlers={};
  const document={
    getElementById:id=>nodes[id]||null,
    querySelector:()=>null,
    addEventListener:(type,fn)=>{handlers[type]=fn}
  };
  const window={addEventListener:(type,fn)=>{handlers["window:"+type]=fn},scrollTo(){}};
  const navigator={clipboard:{writeText:async()=>{}}};
  const sandbox=vm.createContext({document,window,navigator,alert(){},console});
  vm.runInContext(js(source("index.html"))[0],sandbox,{timeout:2000});
  return {sandbox,handlers,nodes,render:()=>vm.runInContext("render()",sandbox),state:vm.runInContext("app",sandbox)};
}
function click(t,act,val=""){
 return t.handlers.click({target:{closest:()=>({dataset:{action:act,value:val}})}});
}
test("all HTML scripts compile and network is disabled",()=>{
  for(const file of ["index.html","jobs.html","social.html"]){
    const html=source(file);
    assert.match(html,/connect-src 'none'/,file);
    for(const script of js(html))assert.doesNotThrow(()=>new vm.Script(script));
  }
});
test("home opens first with four reference-inspired actions and the exact title",()=>{
  const t=setup();
  assert.equal(t.state.uid,"sample-a");
  assert.match(t.nodes.root.innerHTML,/What do/);
  assert.match(t.nodes.root.innerHTML,/to do <em>today\?/);
  for(const str of ["Update profile","Apply jobs","Network","Statistics","START YOUR"])assert.ok(t.nodes.root.innerHTML.includes(str));
  assert.match(t.nodes.root.innerHTML,/Reminders/);
  assert.match(t.nodes.root.innerHTML,/Targets/);
});
test("Jobs five-tab footer preserves original Dashboard, Discovery and Make CV",()=>{
 const t=setup();t.state.view="jobs";t.render();
 for(const label of ["Dashboard","Discovery","Swipe","Make CV","More"])assert.ok(t.nodes.root.innerHTML.includes(label));
 assert.match(t.nodes.root.innerHTML,/src="jobs.html"/);
 t.state.jobsPage="discovery";t.render();
 assert.match(t.nodes.root.innerHTML,/data-value="add"/);
 assert.match(t.nodes.root.innerHTML,/focus-filter/);
 t.state.jobsPage="fresh";t.render();
 assert.match(t.nodes.root.innerHTML,/focus-filter/);
});
test("Jobs Swipe includes only passed Discovery entries with complete JD",async()=>{
 const t=setup();t.state.view="jobs";t.state.jobsPage="swipe";t.render();
 assert.match(t.nodes.root.innerHTML,/Read full job description/);
 const eligible=vm.runInContext("eligibleJobs()",t.sandbox);
 assert.equal(eligible.length,3);
 assert.ok(eligible.every(j=>j.jdComplete&&j.discoveryPassed&&j.jd.length>80));
 await click(t,"swipe-job","interested");
 assert.equal(t.state.profiles["sample-a"].jobPreferences["ready-fin-001"],"interested");
 assert.equal(t.state.profiles["sample-p"].weeklyTarget,8);
 assert.notEqual(t.state.profiles["sample-p"].reminders,t.state.profiles["sample-a"].reminders);
 await click(t,"swipe-job","not-interested");
 assert.equal(t.state.profiles["sample-a"].jobPreferences["ready-wealth-002"],"not-interested");
 assert.match(t.nodes.root.innerHTML,/Transfer Pricing/);
 await click(t,"swipe-job","interested");
 assert.match(t.nodes.root.innerHTML,/All caught up!/);
 await click(t,"reset-swipes");
 assert.match(t.nodes.root.innerHTML,/Read full job description/);
});
test("Job decisions are strictly sample-user-specific",async()=>{
 const t=setup();t.state.view="jobs";t.state.jobsPage="swipe";
 await click(t,"swipe-job","interested");
 t.state.uid="sample-p";t.state.profiles["sample-p"]=vm.runInContext('model("p")',t.sandbox);t.render();
 assert.equal(t.state.profiles["sample-p"].jobPreferences["ready-fin-001"],undefined);
 assert.equal(t.state.profiles["sample-a"].jobPreferences["ready-fin-001"],"interested");
});
test("Social bottom navigation includes five requested destinations",()=>{
 const t=setup();t.state.view="social";t.render();
 for(const label of ["Targets","Research","Swipe","Follow-ups","Stats"])assert.ok(t.nodes.root.innerHTML.includes(label));
 assert.match(t.nodes.root.innerHTML,/src="social.html"/);
 t.state.socialPage="stats";t.render();assert.match(t.nodes.root.innerHTML,/Social statistics/);
 assert.match(t.nodes.root.innerHTML,/Accepted/);
});
test("Local reminders and separate social vs Jobs goals",async()=>{
 const t=setup();t.state.view="stats";t.render();
 const before=t.state.profiles[t.state.uid].reminders.length;
 await click(t,"add-reminder");
 assert.equal(t.state.profiles[t.state.uid].reminders.length,before+1);
 assert.equal(t.state.profiles[t.state.uid].reminders.at(-1).text,"Review application");
 await click(t,"change-target","jobs:1");assert.equal(t.state.profiles[t.state.uid].weeklyTarget,9);
 await click(t,"change-target","social:1");assert.equal(t.state.profiles[t.state.uid].networkTarget,6);
});
test("No production HTML in source folders changed by Stage 2.2",()=>{
 for(const file of ["jobs.html","social.html"])assert.ok(source(file).length>110000);
 assert.match(source("jobs.html"),/const DEMO = true/);
 assert.match(source("social.html"),/Deliberately non-networked Social bridge/);
});
