"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const src=fs.readFileSync(path.resolve(__dirname,"../mobile_tactile_feedback.js"),"utf8");

function setup({reducedMotion=false}={}){
 const handlers=new Map(),windowHandlers=new Map(),tokens=new Set();
 const node={
  classList:{
   add(v){tokens.add(v)},remove(v){tokens.delete(v)},contains(v){return tokens.has(v)}
  },
  closest(){return node},
  getBoundingClientRect(){return {left:0,top:0,right:330,bottom:190}}
 };
 const doc={
  body:{classList:{contains:k=>k==="gmv3-landing"}},
  addEventListener:(kind,callback)=>handlers.set(kind,callback)
 };
 const win={
  matchMedia:()=>({matches:reducedMotion}),
  addEventListener:(kind,callback)=>windowHandlers.set(kind,callback)
 };
 vm.runInNewContext(src,{document:doc,window:win});
 function fire(kind,props={}){
  const event={pointerType:"touch",isPrimary:true,pointerId:1,clientX:75,clientY:80,target:node,...props};
  assert.ok(handlers.has(kind),kind+" handler missing");
  handlers.get(kind)(event);
 }
 return {node,tokens,fire,windowHandlers};
}

test("Touch lift remains held across stationary time and small finger movements",()=>{
 const m=setup();
 m.fire("pointerdown");
 assert.ok(m.tokens.has("gmv3-tactile-held"));
 m.fire("pointermove",{clientX:77,clientY:83});
 assert.ok(m.tokens.has("gmv3-tactile-held"));
 m.fire("pointermove",{clientX:240,clientY:150});
 assert.ok(m.tokens.has("gmv3-tactile-held"));
 m.fire("pointerup");
 assert.ok(!m.tokens.has("gmv3-tactile-held"));
});

test("Press state releases on cancel, moving off-card, scroll or window blur",()=>{
 const m=setup();
 for(const kind of ["pointercancel","scroll"]){
  m.fire("pointerdown");assert.ok(m.tokens.has("gmv3-tactile-held"));
  m.fire(kind);assert.ok(!m.tokens.has("gmv3-tactile-held"));
 }
 m.fire("pointerdown");
 m.fire("pointermove",{clientX:600,clientY:400});
 assert.ok(!m.tokens.has("gmv3-tactile-held"));
 m.fire("pointerdown");
 m.windowHandlers.get("blur")();
 assert.ok(!m.tokens.has("gmv3-tactile-held"));
});

test("Mouse and reduced-motion touches do not acquire a synthetic mobile lift",()=>{
 const a=setup();
 a.fire("pointerdown",{pointerType:"mouse"});
 assert.ok(!a.tokens.has("gmv3-tactile-held"));
 const b=setup({reducedMotion:true});
 b.fire("pointerdown");
 assert.ok(!b.tokens.has("gmv3-tactile-held"));
});
