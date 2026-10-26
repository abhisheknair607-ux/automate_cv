"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const swipe=fs.readFileSync(path.join(root,"standalone/mobile_jobs_swipe.js"),"utf8");
const css=fs.readFileSync(path.join(root,"standalone/mobile_collage.css"),"utf8");
const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
const hub=fs.readFileSync(path.join(root,"standalone/mobile_jobs_hub.js"),"utf8");
const progress=require("../swipe_progress");
const {SWIPE_METHODS,sourceWithSheetIds}=require("../runtime");
const {direction,postponeGesture,phase,HOLD_MS}=require("../mobile_jobs_swipe");

test("gesture requires stationary long-press or grip for down-to-later",()=>{
 assert.ok(HOLD_MS>=350&&HOLD_MS<=650);
 assert.equal(direction(0,95),"down");
 assert.equal(postponeGesture({dy:97,held:false,fromGrip:false}),false);
 assert.equal(postponeGesture({dy:97,held:true}),true);
 assert.equal(postponeGesture({dy:97,fromGrip:true}),true);
 assert.equal(postponeGesture({dy:97,held:true,scrolling:true}),false);
 assert.equal(postponeGesture({dx:100,dy:85,held:true}),false);
 assert.equal(direction(-103,4),"left");
 assert.equal(direction(102,5),"right");
 assert.match(swipe,/pointer\.timer=setTimeout\(/);
 assert.match(swipe,/node\.classList\.add\("gmv3-hold-ready"\)/);
 assert.match(swipe,/pointer\.scrolling=true;endHold\(pointer\)/);
 assert.match(swipe,/if\(active&&pointer\?\.held&&!pointer\.scrolling/);
 assert.match(swipe,/\{passive:false\}/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/gmv3-swipe-drag-grip\{touch-action:none\}/);
});

test("three formerly decorative directions are genuine accessible buttons",()=>{
 for(const [command,label] of [
  ["reject","Not interested"],["later","Maybe later"],["next","Interested"]]){
  assert.ok(swipe.includes('data-gs="'+command+'"'),command);
  assert.ok(swipe.includes('aria-label="'+label),label);
 }
 for(const command of ["reject","later","next"])
  assert.ok(swipe.includes('if(command==="'+command+'")'),command);
 assert.match(css,/\.gmv3-swipe-help :is\(button,span\)/);
 assert.match(hub,/Jobs live swipe/);
 assert.doesNotMatch(swipe,/Browser-only QA|Preview only — choices|localStorage/);
});

test("Swipe data actions are authenticated, candidate-scoped and have no paid CV dispatch",()=>{
 assert.match(server,/app\.post\("\/api\/swipe\/:method"/);
 assert.match(server,/await authenticate\(req\)/);
 assert.match(server,/SWIPE_METHODS\.has\(method\)/);
 assert.match(server,/readOnly:READ_ONLY/);
 assert.match(bridge,/"swipe\/listJobs","swipe\/getJob","swipe\/setJobPreference"/);
 assert.match(swipe,/liveRequest\("setJobPreference"/);
 assert.match(swipe,/value:"Not Interested"/);
 assert.match(swipe,/value:"Favorite"/);
 assert.match(swipe,/liveRequest\("updateFreshControl"/);
 assert.match(swipe,/field:"cv",value:true/);
 assert.match(swipe,/liveRequest\("updateApplicationProgress"/);
 assert.match(swipe,/expected:expected\(job\)/);
 assert.doesNotMatch(swipe,/runCvApiNow|paid.*dispatch/);
 assert.equal(SWIPE_METHODS.has("runCvApiNow"),false);
 assert.equal(SWIPE_METHODS.has("bulkTransfer"),false);
 assert.equal(SWIPE_METHODS.has("setJobPreference"),true);
 assert.equal(SWIPE_METHODS.has("updateApplicationProgress"),true);
 const snapshot=fs.existsSync(path.join(root,"garamaal-release-webapp/Code.gs"))
  ?path.join(root,"garamaal-release-webapp/Code.gs")
  :path.join(root,"webapp/Code.gs");
 const source=fs.readFileSync(snapshot,"utf8");
 const bound=sourceWithSheetIds({
  taaza:"MOCK_TAAZA_SHEET_ID_00123456789",
  fresh:"MOCK_FRESH_SHEET_ID_00123456789"
 },source);
 assert.match(bound,/function setJobPreference\(/);
 assert.match(bound,/MOCK_TAAZA_SHEET_ID_00123456789/);
});

test("candidate-specific fresh progress writes use existing BE/BF and verify identity",()=>{
 new vm.Script(progress.SOURCE);
 const writes=[];
 for(const [name,col]of [["Abhishek",57],["Pooja",58]]){
  const cell={setValue(v){this.v=v;writes.push({name,col,value:v})},
   getDisplayValue(){return this.v}};
  const script=vm.createContext({
   authorise_:()=>true,
   person_:candidate=>{if(!["Abhishek","Pooja"].includes(candidate))throw Error("bad candidate")},
   lockRun_:fn=>fn(),
   sheet_:src=>{assert.equal(src,"fresh");return {getRange:(row,c)=>{assert.equal(row,7);assert.equal(c,col);return cell}}},
   expected_:(sh,row,minimum,expected)=>{assert.equal(minimum,3);assert.equal(row,7);assert.equal(expected.url,"https://example.com/job");return row},
   invalidateDashboardReads_:()=>{},
   SpreadsheetApp:{flush(){}}
  });
  vm.runInContext(progress.SOURCE,script);
  const saved=vm.runInContext('updateApplicationProgress({candidate:"'+name+'",row:7,progress:"Applied + Connected",expected:{url:"https://example.com/job"}})',script);
  assert.equal(saved.saved,true);
  assert.equal(saved.progress,"Applied + Connected");
 }
 assert.equal(writes.length,2);
 assert.deepEqual(writes.map(x=>x.col),[57,58]);
});

test("Swipe source, scoped progress overlay and browser entrypoints compile",()=>{
 for(const f of [
  "standalone/mobile_jobs_swipe.js","standalone/swipe_progress.js",
  "standalone/runtime.js","standalone/bridge.js","standalone/server.js"
 ])new vm.Script(fs.readFileSync(path.join(root,f),"utf8"),{filename:f});
 assert.equal(phase({source:"fresh",status:"Applied",cvLink:""},{}),"connect");
 assert.equal(phase({source:"fresh",cv:true,cvLink:""},{}),"cv-pending");
 assert.equal(phase({source:"taaza",notInterested:true},{}),"hidden");
 const page=server;
 assert.match(page,/\/prototype\/hub-swipe\.js\?v=m26-live-swipe-17/);
 assert.match(page,/\/prototype\/collage\.css\?v=m26-live-swipe-17/);
});
