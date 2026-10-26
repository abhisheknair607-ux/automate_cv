"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p.startsWith("garamaal-release-webapp/")&&
 !fs.existsSync(path.join(root,p))?p.replace("garamaal-release-webapp/","webapp/"):p),"utf8");
test("all original Make CV configuration switches are available in Swipe",()=>{
 const swipe=read("standalone/mobile_jobs_swipe.js");
 const app=read("garamaal-release-webapp/Code.gs");
 const css=read("standalone/mobile_collage.css");
 new vm.Script(swipe,{filename:"mobile_jobs_swipe.js"});
 for(const [key,title] of [["cv","Make CV"],["cl","Make cover letter"],["web","Web research"]]){
  assert.ok(swipe.includes('["'+key+'","'+title+'"]'),key);
  assert.ok(app.includes("field:'"+key+"'")||app.includes("cv:p.cv,cl:p.cl,web:p.web"),key);
 }
 for(const tier of ["Economy","Balanced","Premium"])assert.ok(swipe.includes('"'+tier+'"'));
 for(const selector of ['data-swipe-field="tier"','data-swipe-field="clTier"',
   'data-gs-option="save-settings"','data-gs-option="run-cv-now"'])
  assert.ok(swipe.includes(selector),selector);
 assert.match(css,/\.gmv3-cv-settings/);
 assert.match(css,/\.gmv3-cv-tiers/);
});
test("each setting persists through the existing scoped identity-checked API",()=>{
 const swipe=read("standalone/mobile_jobs_swipe.js");
 const app=read("garamaal-release-webapp/Code.gs");
 assert.match(swipe,/const base=\{candidate,row:job\.row,expected:expected\(job\)\}/);
 assert.match(swipe,/liveRequest\("updateFreshControl",\{\.\.\.base,\.\.\.change\}\)/);
 assert.match(app,/function updateFreshControl\(payload\)/);
 assert.match(app,/expected_\(sh,payload\.row,3,payload\.expected\)/);
 assert.match(app,/\['Economy', 'Balanced', 'Premium'\]/);
 assert.match(swipe,/field==="clTier"\)job\.clTierExplicit=true/);
});
test("the paid run requires explicit confirmation and uses the legacy guarded API",()=>{
 const swipe=read("standalone/mobile_jobs_swipe.js");
 const server=read("standalone/server.js");
 const app=read("garamaal-release-webapp/Code.gs");
 const runtime=read("standalone/runtime.js");
 assert.match(swipe,/window\.confirm\(/);
 assert.match(swipe,/run\("runCvApiNow",\{\.\.\.base,confirm:true\}\)/);
 assert.match(server,/ALLOW_MANUAL_CV_DISPATCH/);
 assert.match(server,/queue\.byJob\[candidate\+":"\+row\]/);
 assert.match(app,/payload\.confirm !== true/);
 assert.match(app,/Already queued recently/);
 assert.match(app,/A completed CV already exists/);
 assert.doesNotMatch(runtime,/SWIPE_METHODS[^;]*"runCvApiNow"/);
 assert.doesNotMatch(swipe,/liveRequest\("runCvApiNow"/);
});
test("Discovery transfers to the verified Freshmaal row and exposes its own controls",()=>{
 const swipe=read("standalone/mobile_jobs_swipe.js");
 assert.match(swipe,/transferred\.freshRow/);
 assert.match(swipe,/source:"fresh",candidate,row:Number\(transferred\.freshRow\)/);
 assert.match(swipe,/safeLink\(ready\.url\)===safeLink\(job\.url\)/);
 assert.match(swipe,/current=\{\.\.\.ready,source:"fresh"\}/);
 assert.match(swipe,/render\(\);openOptions\(\);return/);
});
