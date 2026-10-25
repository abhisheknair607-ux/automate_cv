"use strict";
// Stage 2 prototype tests. Run with: node --test standalone/mobile_hubs.test.js
// Requires only Node built-ins. Never contacts Sheets, Google, LinkedIn or OpenAI.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const BASE=path.resolve(__dirname,"..");
const read=filepath=>fs.readFileSync(path.join(BASE,filepath),"utf8");
const gitSha=text=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(text)+"\0"+text).digest("hex");
const basename=file=>path.basename(file);
function fakeEl(){
 return {hidden:false,innerHTML:"",scrollTop:0,children:[],listeners:{},className:"",
  append(...els){this.children.push(...els)},
  addEventListener(type,fn){this.listeners[type]=fn},
  setAttribute(key,value){this[key]=value},
  querySelector(){return {focus(){}}},
  focus(){},insertBefore(el){this.children.unshift(el)}
 };
}
test("original Jobs and Social feature HTML remain byte-identical",()=>{
 assert.equal(gitSha(read("webapp/Index.html")),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(gitSha(read("standalone/social.html")),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
 for(const key of ["const navigation=","function nav(","function listView(","function addView(","function fetchList("])
   assert.ok(read("webapp/Index.html").includes(key),key);
 for(const key of ["function dashboard(){","function swipe(){","function followups(){","function inboxView(){","function stats(){"])
   assert.ok(read("standalone/social.html").includes(key),key);
});
test("all four prototype scripts and two server programs parse",()=>{
 for(const name of ["standalone/server.js","standalone/social_server.js","standalone/mobile_home_shell.js",
  "standalone/mobile_jobs_hub.js","standalone/mobile_social_hub.js"]){
  assert.doesNotThrow(()=>new vm.Script(read(name),{filename:basename(name)}),name);
 }
});
test("Jobs /prototype contains full real feature DOM plus isolated hub assets",()=>{
 const source=read("standalone/server.js");
 const a=source.indexOf("// Feature-preserving MOBILE PROTOTYPE ROUTE.");
 const b=source.indexOf("async function authenticate(req) {",a);
 assert.ok(a>0&&b>a);
 const routes=new Map();
 const app={get(url,callback){routes.set(url,callback)}};
 const bridge={
  app,BASE:"/project",__dirname:"/project/standalone",
  fs:{readFileSync(file){
   if(file.endsWith("webapp/Index.html"))return read("webapp/Index.html");
   if(file.endsWith("standalone/mobile_home_landing.html"))return read("standalone/mobile_home_landing.html");
   throw Error("Unexpected read "+file);
  }},
  path:{join:(...parts)=>parts.join("/")}
 };
 vm.runInNewContext(source.slice(a,b),bridge);
 for(const name of ["/prototype","/prototype/hub.css","/prototype/hub-jobs.js"])assert.ok(routes.has(name));
 let html="";
 const res={type(){return this},status(){return this},send(x){html=x;return this}};
 routes.get("/prototype")({},res);
 for(const part of ["id=\"deskNav\"","id=\"mobileNav\"","function render(){","function nav(","function addView(){",
  "/prototype/hub.css","/prototype/hub-jobs.js","/prototype/mobile-shell.js",
  "/dashboard-ranking.js","/dashboard-connections.js","/bridge.js"]){
  assert.ok(html.includes(part),"Missing "+part);
 }
});
test("Social /social?gmv3=1 injects nav; unflagged /social still serves unchanged HTML",()=>{
 const code=read("standalone/social_server.js");
 const a=code.indexOf("// Only the ?gmv3=1 preview response gets");
 const b=code.indexOf('app.get("/social/bridge.js"',a);
 assert.ok(a>0&&b>a);
 const routes={};
 const ctx={
  app:{get:(name,cb)=>routes[name]=cb},
  __dirname:"/project/standalone",
  path:{join:(...xs)=>xs.join("/")},
  fs:{readFileSync(file){
   const name=path.basename(file);
   if(name==="social.html")return read("standalone/social.html");
   if(name==="mobile_hubs.css")return read("standalone/mobile_hubs.css");
   if(name==="mobile_collage.css")return read("standalone/mobile_collage.css");
   if(name==="mobile_social_hub.js")return read("standalone/mobile_social_hub.js");
   throw Error("Unexpected file "+file);
  }}
 };
 vm.runInNewContext(code.slice(a,b),ctx);
 let served="",unflaggedPath="";
 const res={type(){return this},status(){return this},send(v){served=v;return this},sendFile(p){unflaggedPath=p;return this}};
 routes["/social"]({query:{}},res);
 assert.ok(unflaggedPath.endsWith("/standalone/social.html"),"Default Social route changed");
 routes["/social"]({query:{gmv3:"1"}},res);
 assert.ok(served.includes('id="bottomNav"')&&served.includes('function inboxView(){'));
 assert.ok(served.includes('gmv3-social-workspace'));
 assert.ok(served.includes('gmv3-social-tabs'));
 assert.ok(served.includes('/social/bridge.js'));
 assert.equal((served.match(/id="candidatePair"/g)||[]).length,1);
});
test("new Jobs bottom actions call original nav, not CV generation",()=>{
 const dom=[];
 const body=fakeEl();
 body.classList={contains:x=>x==="gmv3-workspace",add(){}};
 body.append=(...els)=>dom.push(...els);
 const crumb=fakeEl(), root=fakeEl(),events={};
 const doc={body,
  createElement:fakeEl,
  getElementById:id=>id==="crumbTitle"?crumb:id==="gmv3-launch"?root:null,
  addEventListener:(name,fn)=>events[name]=fn,
  querySelector:()=>null
 };
 const calls=[];const urls=[];
 const window={addEventListener:()=>{},location:{assign:url=>urls.push(url)},
  GaramaalPrototypeHome:{showHome:()=>calls.push("home")}};
 const state={section:"dashboard"};
 vm.runInNewContext(read("standalone/mobile_jobs_hub.js"),{document:doc,window,state,nav:id=>{calls.push(id);state.section=id}});
 const hub=window.GaramaalJobsHub;assert.ok(hub);
 assert.equal(dom.length,3);
 hub.selectPage("discovery");assert.equal(calls.at(-1),"discovery");
 hub.selectPage("fresh");assert.equal(calls.at(-1),"fresh");
 hub.selectPage("swipe");assert.equal(dom[2].hidden,false);
 assert.ok(dom[2].innerHTML.includes("disabled"));
 assert.match(dom[2].innerHTML,/No application status, job preference/);
 const navCount=calls.length;
 hub.selectPage("more");assert.equal(dom[1].hidden,false);assert.equal(calls.length,navCount);
 hub.selectPage("add");assert.equal(calls.at(-1),"add");
 assert.equal(dom[2].hidden,true);
 assert.ok(!urls.length,"No implicit external navigation");
});
test("Social tabs delegate all four existing flows and stats are read-only",()=>{
 const els=[],originalClicks=[];
 const native={querySelector:selector=>({click(){originalClicks.push(selector)}})};
 const header=fakeEl();
 const body=fakeEl();body.append=(...items)=>els.push(...items);body.classList={add(){}};
 const doc={body,createElement:fakeEl,
  getElementById:id=>id==="app"?fakeEl():id==="bottomNav"?native:null,
  querySelector:selector=>selector==="body > header"?header:null
 };
 const window={location:{assign(){}},scrollTo(){}};
 const state={view:"dashboard",items:[{key:"demo"}],selected:""};
 const stats=()=>({total:7,sent:4,accepted:2,due:1});
 vm.runInNewContext(read("standalone/mobile_social_hub.js"),{document:doc,window,state,stats});
 const hub=window.GaramaalSocialHub;assert.ok(hub);
 for(const id of ["dashboard","inbox","swipe","followups"])hub.selectPage(id);
 assert.equal(originalClicks.length,4);
 assert.ok(originalClicks.some(s=>s.includes('data-view="inbox"')));
 assert.ok(originalClicks.some(s=>s.includes('data-view="swipe"')));
 hub.showStats();
 assert.equal(els[1].hidden,false);
 assert.match(els[1].innerHTML,/>7<\/strong>/);
 assert.match(els[1].innerHTML,/>4<\/strong>/);
 assert.match(els[1].innerHTML,/No new contact updates/);
});
