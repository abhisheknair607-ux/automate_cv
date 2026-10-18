"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,"Social page should have executable inline script");

function createHarness(handler){
 const nodes=new Map();
 const getNode=id=>{
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:"",value:"",style:{},classList:{toggle(){},add(){},remove(){}},focus(){},setSelectionRange(){},addEventListener(){}});
  return nodes.get(id);
 };
 const store=new Map();
 const context=vm.createContext({
  window:{isSecureContext:false,__cvStandalone:{requestSpecial:handler}},
  document:{getElementById:getNode,addEventListener(){},readyState:"complete"},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  navigator:{},confirm:()=>false,prompt:()=>"",
  setTimeout,clearTimeout,console,
 });
 new vm.Script(script,{filename:"social.html"}).runInContext(context);
 return {context,getNode,store,run:code=>vm.runInContext(code,context)};
}
const item=(candidate,name,status="identified")=>({
 candidate,company:candidate==="Abhishek"?"EY":"Davy",name,title:"Financial Planner",key:"0123456789abcdef01234567",
 profile:"",search:"https://www.linkedin.com/search/results/people/?keywords=person",message:"",
 relation:{status,sent:status==="accepted"?"2026-10-17T10:00:00Z":"",next:"2026-10-18",accepted:status==="accepted"?"2026-10-17T10:00:00Z":"",followupSent:"",department:"Wealth Management",city:"Dublin"}
});
test("Social renders Dashboard, Swipe, Follow-ups and Research without a runtime TDZ error",async()=>{
 const h=createHarness(async (method,opts)=>{
  assert.equal(method,"social/data");
  return {candidate:opts.candidate,items:[item(opts.candidate,"Sample User","accepted"),item(opts.candidate,"Sample Recruiter")]};
 });
 await new Promise(resolve=>setImmediate(resolve));
 const root=h.getNode("app").innerHTML;
 assert.match(root,/Networking/);
 assert.match(root,/Target organisations/);
 assert.match(root,/People/);
 assert.doesNotMatch(root,/Cannot access 'due' before initialization/);
 assert.match(h.getNode("bottomNav").innerHTML,/Follow-ups/);
 assert.match(h.getNode("bottomNav").innerHTML,/Research/);
 h.run('state.view="swipe"; render()');
 assert.match(h.getNode("app").innerHTML,/Sample Recruiter/);
 assert.match(h.getNode("app").innerHTML,/swipeCard/);
 h.run('state.view="followups"; render()');
 assert.match(h.getNode("app").innerHTML,/Sample User/);
 h.run('state.view="inbox"; render()');
 assert.match(h.getNode("app").innerHTML,/Research Inbox/);
});
test("Social A/P switch isolates candidate lists and does not change Jobs selection",async()=>{
 const h=createHarness(async (method,{candidate})=>({candidate,items:[item(candidate,candidate==="Abhishek"?"Person A":"Person P")]}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.getNode("app").innerHTML,/Person A/);
 await h.run('switchCandidate("Pooja")');
 assert.match(h.getNode("app").innerHTML,/Person P/);
 assert.doesNotMatch(h.getNode("app").innerHTML,/Person A/);
 assert.equal(h.store.get("garamaal-social-candidate"),"Pooja");
 assert.equal(h.store.has("freshmaal-candidate"),false);
});
test("Backend errors retain Social section navigation rather than blanking the screen",async()=>{
 const h=createHarness(async()=>{throw new Error("Test-only storage outage")});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.getNode("app").innerHTML,/Test-only storage outage/);
 assert.match(h.getNode("bottomNav").innerHTML,/Swipe/);
 assert.match(h.getNode("bottomNav").innerHTML,/Research/);
 h.run('state.view="swipe"; render()');
 assert.match(h.getNode("app").innerHTML,/No people remaining/);
 assert.match(h.getNode("app").innerHTML,/Test-only storage outage/);
});
