"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"../../webapp/Code.gs"),"utf8");
function fixture(){
  const entries=new Map();
  let readCount=0,unlockCount=0;
  const sandbox={
    CacheService:{getScriptCache:()=>({
      get:k=>entries.get(k)??null,
      put:(k,v)=>entries.set(k,String(v)),
      remove:k=>entries.delete(k)
    })},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>unlockCount++})},
  };
  const ctx=vm.createContext(sandbox);
  vm.runInContext(source,ctx);
  ctx.read=()=>++readCount;
  ctx.readCount=()=>readCount;
  ctx.unlockCount=()=>unlockCount;
  return ctx;
}

test("Garamaal caches repeated projections and invalidates after writes",()=>{
  const c=fixture();
  vm.runInContext(`
    var x=dashboardReadCache_('taaza-rows-v2',()=>({count:read()}),30);
    var y=dashboardReadCache_('taaza-rows-v2',()=>({count:read()}),30);
  `,c);
  assert.equal(c.x.count,1);
  assert.equal(c.y.count,1);
  assert.equal(c.readCount(),1);
  vm.runInContext(`
    lockRun_(()=>true);
    var z=dashboardReadCache_('taaza-rows-v2',()=>({count:read()}),30);
  `,c);
  assert.equal(c.z.count,2);
  assert.equal(c.readCount(),2);
  assert.equal(c.unlockCount(),1);
});

test("Quota fix avoids background master sync on each read operation",()=>{
  const getMethod=(name,next)=>source.slice(source.indexOf("function "+name+"("),source.indexOf("function "+next+"("));
  for(const body of [
    getMethod("getBootstrap","taazaRows_"),
    getMethod("listJobs","getJob"),
    getMethod("getStats","runCvApiNow")
  ])assert.doesNotMatch(body,/syncTaazaMaster_\(/);
  assert.match(getMethod("listJobs","getJob"),/const tabs=taazaCategoryTabs_\(\)/);
  assert.match(getMethod("listJobs","getJob"),/job\.categories/);
  const master=getMethod("taazaRows_","freshRows_");
  assert.match(master,/jdReady:jdReady_\(a\[3\]\)/);
  assert.doesNotMatch(master,/jd:String\(a\[3\]/);
});
