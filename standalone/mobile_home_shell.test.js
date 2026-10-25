"use strict";
// Dependency-free test: node --test standalone/mobile_home_shell.test.js
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");
const gitBlobSha=(s)=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(s)+"\0"+s).digest("hex");

test("Jobs and Social feature files are exactly the proven baseline snapshots",()=>{
 assert.equal(gitBlobSha(read("webapp/Index.html")),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(gitBlobSha(read("standalone/social.html")),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
 const jobs=read("webapp/Index.html");
 for(const text of ["function nav(","function render(){","function fetchList","function addView","function listView","id=\"deskNav\"","id=\"mobileNav\""])assert.ok(jobs.includes(text),text);
 const social=read("standalone/social.html");
 for(const text of ["function dashboard(){","function swipe(){","function followups(){","function inboxView(){","id=\"bottomNav\""])assert.ok(social.includes(text),text);
});
test("Standalone /prototype route composes the original bridge and unchanged feature pages",()=>{
 const server=read("standalone/server.js");
 const a=server.indexOf("// Feature-preserving MOBILE PROTOTYPE ROUTE.");
 const b=server.indexOf("async function authenticate(req) {",a);
 assert.ok(a>0&&b>a);
 const handlers=new Map();
 const app={get(url,handler){handlers.set(url,handler)}};
 const fakeFs={readFileSync(file){
  if(file.endsWith("/webapp/Index.html"))return read("webapp/Index.html");
  if(file.endsWith("/standalone/mobile_home_landing.html"))return read("standalone/mobile_home_landing.html");
  if(file.endsWith("/standalone/mobile_intro_overlay.html"))return read("standalone/mobile_intro_overlay.html");
  throw Error("Unexpected read: "+file);
 }};
 const fakePath={join:(...parts)=>parts.join("/")};
 const sandbox={app,fs:fakeFs,path:fakePath,BASE:"/repo",__dirname:"/repo/standalone"};
 vm.runInNewContext(server.slice(a,b),sandbox,{timeout:1000});
 for(const url of ["/prototype","/prototype/mobile-shell.css","/prototype/mobile-shell.js"])assert.ok(handlers.has(url));
 let served="";
 const res={type(){return this},status(){return this},send(data){served=data;return this}};
 handlers.get("/prototype")({},res);
 assert.ok(served.startsWith("<!DOCTYPE html>"));
 for(const fragment of [
  '<body class="gmv3-landing gmv3-intro-active">','What do','Update profile','Apply jobs','Network','Statistics',
  'id="deskNav"','id="mobileNav"','function nav(','function render(){',
  'src="/bridge.js"','src="/dashboard-ranking.js"','src="/dashboard-connections.js"',
  'src="/prototype/mobile-shell.js"','href="/prototype/mobile-shell.css"'
 ])assert.ok(served.includes(fragment),"Missing output "+fragment);
 assert.equal((served.match(/id="gmv3-launch"/g)||[]).length,1);
 assert.equal((served.match(/id="deskNav"/g)||[]).length,1);
});
test("Stage 1 client script compiles and launcher actions never override the legacy tabs",()=>{
 const source=read("standalone/mobile_home_shell.js");
 assert.doesNotThrow(()=>new vm.Script(source));
 const classes=new Set(["gmv3-landing"]);
 const subview={hidden:true},subtitle={textContent:""},subbody={innerHTML:""};
 const avatar={textContent:""};
 const launch={handlers:{},addEventListener(type,fn){this.handlers[type]=fn}};
 let barButton=null,navigation=[],opened=[];
 const bar={insertBefore(button){barButton=button},firstChild:null};
 const document={
  body:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}},
  getElementById(id){
   if(id==="gmv3-launch")return launch;
   if(id==="gmv3-subview")return subview;
   if(id==="gmv3-subtitle")return subtitle;
   if(id==="gmv3-subbody")return subbody;
   if(id==="gmv3-initial")return avatar;
   if(id==="gmv3-home-button")return null;
   return null;
  },
  querySelector:q=>q===".shell .topbar"?bar:null,
  createElement:()=>({handlers:{},addEventListener(type,fn){this.handlers[type]=fn},
    setAttribute(){},focus(){}})
 };
 const win={location:{assign(url){opened.push(url)}}};
 vm.runInNewContext(source,{document,window:win,state:{candidate:"Abhishek"},nav:page=>navigation.push(page)},{timeout:1000});
 assert.ok(launch.handlers.click);
 assert.ok(barButton);
 assert.equal(avatar.textContent,"A");
 const click=(action)=>{
  const target={closest:()=>({getAttribute:()=>action})};
  launch.handlers.click({target});
 };
 click("profile");assert.ok(subbody.innerHTML.includes("Work Experience"));
 click("home");assert.equal(subview.hidden,true);
 click("jobs");assert.equal(navigation.at(-1),"dashboard");assert.ok(classes.has("gmv3-workspace")&&!classes.has("gmv3-landing"));
 assert.equal(barButton.textContent,"‹");barButton.handlers.click();assert.ok(classes.has("gmv3-landing"));
 click("statistics");assert.ok(subbody.innerHTML.includes("Existing live Jobs statistics"));
 click("targets");assert.ok(subbody.innerHTML.includes("weekly target"));
 click("reminders");assert.ok(subbody.innerHTML.includes("Review shortlisted jobs"));
 click("network");assert.equal(opened[0],"/social?gmv3=1");
});
test("Launcher stylesheet is scoped to prototype-only body classes",()=>{
 const css=read("standalone/mobile_home_shell.css");
 assert.match(css,/body\.gmv3-landing/);
 assert.match(css,/body\.gmv3-workspace/);
 assert.match(css,/@media\(max-width:375px\)/);
 assert.match(css,/prefers-reduced-motion/);
});
