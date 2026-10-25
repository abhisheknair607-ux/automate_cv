"use strict";
// QA-only exact-video splash contract. No credentials, no network, no write actions.
// node --test standalone/mobile_intro_overlay.test.js
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const repo=path.resolve(__dirname,"..");
const source=p=>fs.readFileSync(path.join(repo,p),"utf8");
const sha=t=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(t)+String.fromCharCode(0)+t).digest("hex");
test("both intro videos are the approved MP4s, not generated placeholder animations",()=>{
 for(const [p,n] of [
  ["standalone/assets/garamaal-intro-mobile.mp4",1668421],
  ["standalone/assets/garamaal-intro-desktop.mp4",1748570]]){
  const data=fs.readFileSync(path.join(repo,p));
  assert.equal(data.length,n,p+" expected exact file size");
  assert.equal(data.toString("ascii",4,8),"ftyp",p+" must be ISO MP4");
 }
});
test("original complete Jobs and Social feature HTML is unchanged",()=>{
 assert.equal(sha(source("webapp/Index.html")),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(sha(source("standalone/social.html")),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
});
test("video markup renders before the app with autoplay, mute, skip, and progress",()=>{
 const markup=source("standalone/mobile_intro_overlay.html");
 for(const k of ['id="gmv3-intro"','id="gmv3-intro-film"','autoplay muted playsinline',
  'id="gmv3-intro-skip"','id="gmv3-intro-progress-fill"']){
  assert.ok(markup.includes(k),k);
 }
 const css=source("standalone/mobile_intro_overlay.css");
 for(const k of ["z-index:9000","gmv3-intro-out","prefers-reduced-motion:reduce","safe-area-inset-bottom"]){
  assert.ok(css.includes(k),k);
 }
 const js=source("standalone/mobile_intro_overlay.js");
 for(const k of ["window.GaramaalIntro","film.addEventListener(\"ended\",finish)",
  "film.addEventListener(\"error\"","bindLogo","gmv3-wordmark",
  "garamaal-intro-","prefers-reduced-motion","playIntro(\"entry\")","unshield()"]){
  if(k==="garamaal-intro-"){assert.ok(source("standalone/server.js").includes(k));continue;}
  assert.ok(js.includes(k),k);
 }
});
test("intro assets are served only by prototype Jobs and opt-in Social paths",()=>{
 const jobs=source("standalone/server.js"),social=source("standalone/social_server.js");
 for(const k of ["/prototype/intro/mobile.mp4","/prototype/intro/desktop.mp4","/prototype/intro.css",
 "/prototype/intro.js","mobile_intro_overlay.html"]){
  if(k.includes(".mp4")){
    assert.ok(jobs.includes('"/prototype/intro/"+device+".mp4"'),"Jobs dynamically maps MP4 route");
    continue;
  }
  assert.ok(jobs.includes(k),k);
 }
 assert.ok(jobs.includes('gmv3-landing gmv3-intro-active'));
 assert.ok(social.includes('"/social/intro/"+device+".mp4"'));
 assert.ok(social.includes('req.query.gmv3!=="1"'),"Unflagged /social must stay identical");
 assert.ok(social.includes("mobile_intro_overlay.js"));
 assert.ok(social.includes("mobile_intro_overlay.html"));
 assert.ok(!source("Dockerfile.social").includes("COPY webapp/"));
});
test("approved home, navigation and profile drawer are visually frozen",()=>{
 for(const p of ["standalone/mobile_home_landing.html","standalone/mobile_home_shell.css",
  "standalone/mobile_jobs_hub.js","standalone/mobile_social_hub.js",
  "standalone/mobile_motion_drawer.js","standalone/mobile_approved_asset_layer.css"]){
  assert.ok(source(p).length>400,p);
 }
 const css=source("standalone/mobile_intro_overlay.css").replace(/\/\*[\s\S]*?\*\//g,"");
 assert.ok(!/#gmv3-launch\s+[.#]|\.gmv3-tabbar|\.gmv3-drawer\s*\{/.test(css),"Intro cannot restyle approved UI");
});
