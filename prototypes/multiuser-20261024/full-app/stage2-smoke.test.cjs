"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const folder=__dirname;
const files=["index.html","jobs.html","social.html"];
const html=Object.fromEntries(files.map(name=>[name,fs.readFileSync(path.join(folder,name),"utf8")]));
const scripts=s=>[...s.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());

test("Original feature pages remain full-size HTML copies",()=>{
 assert.ok(html["jobs.html"].length>100000);
 assert.ok(html["social.html"].length>100000);
 assert.match(html["jobs.html"],/const DEMO = true/);
 assert.match(html["social.html"],/Deliberately non-networked Social bridge/);
 assert.match(html["jobs.html"],/function dash\(\)/);
 assert.match(html["social.html"],/function swipe\(\)/);
});

test("No network and no indexing across the three preview files",()=>{
 for(const name of files){
  assert.match(html[name],/connect-src 'none'/,name);
  assert.match(html[name],/noindex,nofollow/,name);
 }
});

test("All embedded JavaScript blocks compile",()=>{
 for(const name of files){
  for(const [i,code] of scripts(html[name]).entries()){
   assert.doesNotThrow(()=>new vm.Script(code,{filename:name+":inline:"+i}),name+" script "+i);
  }
 }
});

test("Mobile-first CSS has phone, tablet and focus coverage",()=>{
 assert.match(html["index.html"],/@media\(max-width:720px\)/);
 assert.match(html["index.html"],/@media\(max-width:960px\)/);
 assert.match(html["index.html"],/@media\(max-width:365px\)/);
 assert.match(html["index.html"],/prefers-reduced-motion/);
 assert.match(html["index.html"],/min-height:44px/);
 assert.match(html["jobs.html"],/mu-embedded/);
 assert.match(html["social.html"],/@media\(max-width:700px\)/);
});

function makeContext(){
 const display={innerHTML:""},status={textContent:"",hidden:true};
 const nodes={root:display,"status-message":status,"ranking-json":{value:""}};
 const listeners={};
 const document={
  getElementById(id){return nodes[id]??null},
  querySelector(selector){return selector===".paper"?{textContent:"Sample prompt"}:null},
  addEventListener(type,fn){listeners[type]=fn}
 };
 const window={addEventListener(type,fn){listeners["window:"+type]=fn},scrollTo(){}};
 const navigator={clipboard:{writeText:async()=>{}}};
 const alerts=[];
 const sandbox=vm.createContext({document,window,navigator,alert:x=>alerts.push(String(x)),console});
 vm.runInContext(scripts(html["index.html"])[0],sandbox,{timeout:2000});
 const state=vm.runInContext("app",sandbox);
 return {display,status,nodes,listeners,sandbox,state,alerts,render:()=>vm.runInContext("render()",sandbox)};
}
function signInSample(env,suffix){
 vm.runInContext('app.uid="sample-'+suffix+'";app.profiles[app.uid]=model("'+suffix+'");',env.sandbox);
}
function click(env,action,value=""){
 const target={closest(){return {dataset:{action,value}}}};
 return env.listeners.click({target});
}
test("Home opens by default and seven screens and five profile sections render",()=>{
 const env=makeContext();
 assert.match(env.display.innerHTML,/What do/);
 signInSample(env,"a");
 for(const page of ["home","jobs","social","profile","rank","usage","account"]){
  env.state.view=page;env.render();
  assert.ok(env.display.innerHTML.length>1200,page);
 }
 for(const section of ["Work Experience","Education","Achievements","Interests","Skills"]){
  env.state.view="profile";env.state.section=section;env.render();
  assert.match(env.display.innerHTML,/profile-panel/);
  assert.ok(env.display.innerHTML.includes(section));
 }
});

test("Mobile More navigation is explicit and accessible",async()=>{
 const env=makeContext();signInSample(env,"a");
 await click(env,"toggle-more");
 assert.ok(env.state.moreOpen);
 assert.match(env.display.innerHTML,/mobile-more-menu/);
 assert.match(env.display.innerHTML,/Usage & credits/);
 await click(env,"close-more");
 assert.ok(!env.state.moreOpen);
});

test("Sample user profile data and rankings remain distinct",async()=>{
 const env=makeContext();signInSample(env,"a");
 env.state.view="rank";env.state.rankJobId="sample-job-2";env.render();
 assert.match(env.display.innerHTML,/sample-job-2/);
 env.nodes["ranking-json"].value=JSON.stringify({jobId:"sample-job-2",profileFit:80,careerFit:60,rationale:"Example matching evidence"});
 await click(env,"rank-import");
 const val=env.state.profiles["sample-a"].ranking["sample-job-2"];
 assert.equal(val.score,71);
 signInSample(env,"p");
 assert.equal(env.state.profiles["sample-p"].ranking["sample-job-2"],undefined);
});

test("Invalid or mismatched job rankings cannot overwrite a saved value",async()=>{
 const env=makeContext();signInSample(env,"a");env.state.view="rank";env.state.rankJobId="sample-job-1";
 env.nodes["ranking-json"].value=JSON.stringify({jobId:"sample-job-1",profileFit:78,careerFit:68,rationale:"Valid sample"});
 await click(env,"rank-import");const val=env.state.profiles["sample-a"].ranking["sample-job-1"].score;
 env.nodes["ranking-json"].value=JSON.stringify({jobId:"sample-job-2",profileFit:100,careerFit:100,rationale:"Cross-job overwrite"});
 await click(env,"rank-import");
 assert.equal(env.state.profiles["sample-a"].ranking["sample-job-1"].score,val);
 assert.equal(env.state.profiles["sample-a"].ranking["sample-job-2"],undefined);
});

test("Social preview is fictional, read-only, separated and rejects writes",async()=>{
 const source=scripts(html["social.html"]).find(x=>x.includes("Deliberately non-networked Social bridge"));
 assert.ok(source);
 const window={};
 vm.runInNewContext(source,{window});
 const api=window.__cvStandalone;
 const a=await api.requestSpecial("social/data",{candidate:"Abhishek"});
 const p=await api.requestSpecial("social/data",{candidate:"Pooja"});
 assert.equal(a.readOnly,true);
 assert.equal(p.readOnly,true);
 assert.notEqual(a.items[0].name,p.items[0].name);
 assert.ok(a.items.every(x=>/Example|Demo|Sample/.test(x.company)));
 await assert.rejects(api.requestSpecial("social/status",{candidate:"Abhishek"}));
});
