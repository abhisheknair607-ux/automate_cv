"use strict";
// Run: node --test standalone/mobile_editorial_polish.test.js
// No live APIs, paid CV runs, or backend writes.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const base=path.resolve(__dirname,"..");
const source=p=>fs.readFileSync(path.join(base,p),"utf8");
const hash=s=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(s)+String.fromCharCode(0)+s).digest("hex");

test("Jobs and Social feature HTML remains byte-identical",()=>{
 assert.equal(hash(source("webapp/Index.html")),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(hash(source("standalone/social.html")),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
});
test("editorial crop fix removes label tiles and fades cutout boundary",()=>{
 const css=source("standalone/mobile_editorial_polish.css");
 for(const text of ["mask-composite:intersect","-webkit-mask-composite:source-in","gmv3-home-art","gmv3-action:after","background:transparent!important","border-radius:25px 22px 28px 22px"]){
  assert.ok(css.includes(text),"Missing "+text);
 }
});
test("surrounding screen uses a consistent zine/editorial style",()=>{
 const css=source("standalone/mobile_editorial_polish.css");
 for(const text of [".gmv3-pills button",".gmv3-wordmark",".gmv3-eyebrow",".gmv3-journey",".gmv3-jobs-workspace",".gmv3-social-workspace",".gmv3-tabbar"]){
  assert.ok(css.includes(text),text);
 }
 assert.ok(css.includes("prefers-reduced-motion:reduce"));
 assert.ok(css.includes("@media(max-width:380px)"));
});
test("new CSS affects opt-in routes and is packaged with Social only",()=>{
 const jobs=source("standalone/server.js");
 const social=source("standalone/social_server.js");
 const docker=source("Dockerfile.social");
 assert.ok(jobs.includes('app.get("/prototype/editorial-polish.css"'));
 assert.ok(jobs.includes('<link rel="stylesheet" href="/prototype/editorial-polish.css">'));
 assert.ok(social.includes('req.query.gmv3!=="1"'));
 assert.ok(social.includes("mobile_editorial_polish.css"));
 assert.ok(docker.includes("COPY standalone/mobile_editorial_polish.css"));
 assert.ok(!docker.includes("COPY webapp/"));
});
test("all original interactive destinations preserved in separate navigation scripts",()=>{
 const jobs=source("standalone/mobile_jobs_hub.js");
 const social=source("standalone/mobile_social_hub.js");
 for(const view of ["dashboard","discovery","swipe","fresh","more"])assert.ok(jobs.includes(view));
 for(const view of ["dashboard","inbox","swipe","followups","stats"])assert.ok(social.includes(view));
 assert.ok(jobs.includes("nav(id)"));
 assert.ok(social.includes("original.click()"));
});
