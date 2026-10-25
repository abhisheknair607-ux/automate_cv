"use strict";
/**
 * Full source route QA using ephemeral loopback servers, no cloud credentials.
 * Usage: APP_READ_ONLY=true NODE_ENV=test node --test standalone/mobile_fullapp_route_staging.test.js
 * Checks the ACTUAL Jobs and Social Express routes, not a recreated UI.
 * No OAuth, Sheets, Drive or paid OpenAI calls. No production deploy.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
process.env.APP_READ_ONLY="true";
process.env.NODE_ENV="test";
const root=path.resolve(__dirname,"..");
const blob=s=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(s)+String.fromCharCode(0)+s).digest("hex");
const jobsCode=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
const socialCode=fs.readFileSync(path.join(__dirname,"social.html"),"utf8");
test("original Jobs and Social feature source stays byte-for-byte protected",()=>{
 assert.equal(blob(jobsCode),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(blob(socialCode),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
});
async function withLocalServer(app,check){
 const server=await new Promise((resolve,reject)=>{
  const s=app.listen(0,"127.0.0.1",()=>resolve(s));
  s.once("error",reject);
 });
 try{
  const base="http://127.0.0.1:"+server.address().port;
  await check(base);
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
}
function assertAll(text,markers){
 for(const marker of markers)assert.ok(text.includes(marker),"Missing original or prototype marker: "+marker);
}
test("Jobs route serves COMPLETE original app and all opt-in mobile assets",{timeout:20000},async()=>{
 const {app}=require("./server");
 await withLocalServer(app,async base=>{
  const old=await fetch(base+"/");
  assert.equal(old.status,200);
  const rootHtml=await old.text();
  assertAll(rootHtml,['id="mobileNav"','id="deskNav"','function nav(','function render(){','function addView(){']);
  const resp=await fetch(base+"/prototype");
  assert.equal(resp.status,200);
  const html=await resp.text();
  assertAll(html,['id="gmv3-launch"','id="mobileNav"','id="deskNav"','function addView(){','/prototype/visual-qa.css','/prototype/approved-assets.css','/prototype/motion-drawer.js']);
  for(const route of ['/prototype/visual-qa.css','/prototype/assets/home.css','/prototype/approved-assets.css','/prototype/hub-jobs.js']){
   const asset=await fetch(base+route);
   assert.equal(asset.status,200,route+" must be self-hosted and available");
   assert.ok((await asset.text()).length>100,route+" empty");
  }
  const qaCSS=await (await fetch(base+"/prototype/visual-qa.css")).text();
  assertAll(qaCSS,['safe-area-inset-bottom','max-width:375px','width:53%!important','prefers-reduced-motion:reduce']);
 });
});
test("Social root is unchanged, opt-in Social retains original Research, Swipe and Follow-ups",{timeout:20000},async()=>{
 const {app}=require("./social_server");
 await withLocalServer(app,async base=>{
  const legacy=await fetch(base+"/social");
  assert.equal(legacy.status,200);
  assert.equal(await legacy.text(),socialCode);
  const optin=await fetch(base+"/social?gmv3=1");
  assert.equal(optin.status,200);
  const html=await optin.text();
  assertAll(html,[
   'id="bottomNav"','id="candidatePair"','function inboxView(){','function followups(){','function swipe(){',
   'gmv3-social-tabs','gmv3-account-drawer','max-height:510px'
  ]);
  assert.ok(!html.includes('src="/prototype/hub-jobs.js"'),"Social should not load Jobs-specific logic");
 });
});
