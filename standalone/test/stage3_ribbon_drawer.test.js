"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"../..");
const source=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
const original=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");

function prototypeHtml(){
 const start=source.indexOf('app.get("/prototype",(req,res)=>{');
 const end=source.indexOf("async function authenticate(req)",start);
 assert.ok(start>=0&&end>start,"Scoped prototype handler required");
 let handler=null;
 const ctx={
  app:{get:(name,fn)=>{assert.equal(name,"/prototype");handler=fn}},
  fs,path,BASE:root,__dirname:path.join(root,"standalone")
 };
 vm.runInNewContext(source.slice(start,end),ctx,{timeout:2000});
 assert.equal(typeof handler,"function");
 let rendered="";
 let status=200;
 const response={
  set:()=>response,
  status:s=>{status=s;return response},
  type:()=>response,
  send:s=>{rendered=s;return response}
 };
 handler({},response);
 assert.equal(status,200);
 return rendered;
}
test("release keeps original Jobs HTML and the existing candidate and expense handlers",()=>{
 assert.ok(original.includes('<header class="topbar">'),"Original Jobs baseline is intact");
 assert.ok(!original.includes('class="topbar garamaal-unified-header"'),
   "Do not fork or replace original standalone dashboard markup");
 assert.match(original,/id="candidateToggle"/);
 assert.match(original,/id="expenseToggle"/);
 assert.match(original,/id="modeBadge"/);
 const rootHandler=source.slice(source.indexOf('app.get("/",'),source.indexOf('// Feature-preserving MOBILE PROTOTYPE ROUTE.'));
 assert.ok(rootHandler.includes('fs.readFileSync(path.join(BASE,"webapp/Index.html")'));
});
test("prototype header provides approved ribbon and drawer mounting contract",()=>{
 const html=prototypeHtml();
 assert.equal((html.match(/class="topbar garamaal-unified-header"/g)||[]).length,1);
 assert.equal((html.match(/class="top-actions garamaal-header-controls"/g)||[]).length,1);
 for(const id of ["candidateToggle","expenseToggle","jobHeaderLink","socialHeaderLink","modeBadge","avatar"]){
  assert.equal((html.match(new RegExp('id="'+id+'"',"g"))||[]).length,1,id+" duplicated");
 }
 assert.match(html,/id="jobHeaderLink"[^>]+href="\/prototype"/);
 assert.match(html,/id="socialHeaderLink"[^>]+href="\/social\?gmv3=1"/);
 assert.match(html,/\/prototype\/account-drawer\.js\?v=m26-neon-held-12/);
 assert.match(html,/\/prototype\/collage\.css\?v=m26-(?:neon-held-12|location-14)/);
 assert.ok(!html.includes('<header class="topbar">'),"Legacy topbar must be replaced only in prototype");
});
test("More calls the actual account drawer, not the old fallback panel",()=>{
 const hub=fs.readFileSync(path.join(root,"standalone/mobile_jobs_hub.js"),"utf8");
 const drawer=fs.readFileSync(path.join(root,"standalone/mobile_profile_drawer.js"),"utf8");
 assert.match(hub,/if\(window\.GaramaalDrawer\)\{window\.GaramaalDrawer\.open\(\);return\}/);
 assert.match(drawer,/querySelector\("\.garamaal-header-controls"\)/);
 assert.match(drawer,/window\.GaramaalDrawer=Object\.freeze\(\{open,close\}\)/);
 assert.match(drawer,/gmv3-account-drawer/);
});