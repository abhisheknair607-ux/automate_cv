"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const source=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
const html=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
const start=source.indexOf('app.get("/",(req,res)=>{');
const end=source.indexOf('// Feature-preserving MOBILE PROTOTYPE ROUTE.',start);
assert.ok(start>=0 && end>start);
function hitRoute(flag,url){
 const handlers={};
 const ctx={app:{get:(path,fn)=>{handlers[path]=fn}},process:{env:{GARAMAAL_UI_V3:flag}},
  fs,path,BASE:root};
 vm.runInNewContext(source.slice(start,end),ctx,{timeout:2000});
 assert.deepEqual(Object.keys(handlers).sort(),["/","/legacy"]);
 const record={code:200,html:null,redirect:null};
 const res={type:()=>res,send:x=>{record.html=x;return res},redirect:(status,target)=>{
  record.code=status;record.redirect=target;return res}};
 handlers[url]({},res);
 return record;
}
test("default app homepage stays on original Jobs interface",()=>{
 const result=hitRoute("false","/");
 assert.equal(result.code,200);
 assert.equal(result.html.includes('<header class="topbar">'),true);
 assert.equal(result.html.includes("gmv3-landing"),false);
 assert.match(result.html,/\/bridge\.js/);
});
test("prod release flag redirects root to tested /prototype, preserving other APIs",()=>{
 const result=hitRoute("true","/");
 assert.equal(result.code,302);
 assert.equal(result.redirect,"/prototype");
 assert.equal(result.html,null);
});
test("/legacy remains the old authenticated app with either switch state",()=>{
 for(const enabled of ["true","false"]){
  const result=hitRoute(enabled,"/legacy");
  assert.equal(result.code,200);
  assert.equal(result.html.includes('<header class="topbar">'),true);
  assert.equal(result.html.includes("gmv3-landing"),false);
 }
});
test("homepage switch adds no CV workflow writes or worker modifications",()=>{
 assert.match(source,/if\(process\.env\.GARAMAAL_UI_V3==="true"\)return res\.redirect\(302,"\/prototype"\)/);
 assert.match(html,/function syncSelectionBar\(/);
});
