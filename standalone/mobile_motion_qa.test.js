"use strict";
/* Run: node --test standalone/mobile_motion_qa.test.js
 * Structural guardrails only; visual QA uses Chrome at narrow viewports.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const base=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(base,name),"utf8");
const hash=data=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(data)+"\0"+data).digest("hex");

test("existing Jobs and Social HTML are byte-identical to the Stage 2 baseline",()=>{
 assert.equal(hash(read("webapp/Index.html")),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(hash(read("standalone/social.html")),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
});
test("flat editorial artwork has four panels and is stored locally",()=>{
 const art=read("standalone/mobile_motion_artwork.svg");
 assert.match(art,/<svg /);
 assert.match(art,/>/);
 for(const id of ['transform="translate(2,1)"','transform="translate(284,0)"','transform="translate(561,0)"','transform="translate(841,0)"'])
   assert.ok(art.includes(id),id);
 assert.ok(!art.includes("<script"),"Artwork must never contain scripts");
});
test("home art is exactly one image per card, and avatar opens drawer",()=>{
 const page=read("standalone/mobile_home_landing.html");
 for(const id of ["gmv3-art-profile","gmv3-art-jobs","gmv3-art-network","gmv3-art-stats"])assert.ok(page.includes(id));
 assert.match(page,/data-gmv3="drawer" aria-label="Open account drawer"/);
});
test("home press/hover, nav twist and drawer accessibility have reduced-motion support",()=>{
 const css=read("standalone/mobile_motion_qa.css");
 for(const needle of [".gmv3-action:hover",":active","gmv3-tabbar button:hover","gmv3-twist-in",
  ".gmv3-drawer-host","gmv3-drawer-enter","prefers-reduced-motion:reduce","focus-visible"])
  assert.ok(css.includes(needle),needle);
 assert.ok(css.includes("mobile_motion_artwork.svg")||css.includes("/prototype/motion-art.svg"));
});
test("drawer reads only recorded costs and never invents spend totals",()=>{
 const js=read("standalone/mobile_motion_drawer.js");
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/run\("getExpenses",null,\{quiet:true\}\)/);
 assert.match(js,/item\.recordedUsd/);
 assert.match(js,/Recorded estimates only, not a complete bill/);
 assert.match(js,/View in Jobs/);
 assert.match(js,/No verified recorded total/);
 assert.match(js,/Escape/);
 assert.match(js,/aria-modal/);
 assert.ok(!js.includes("updateExpenses")&&!js.includes("makeCv"),"No new write actions");
});
test("only opt-in prototype routes load new motion assets",()=>{
 const jobs=read("standalone/server.js"),social=read("standalone/social_server.js");
 for(const url of ["/prototype/motion-art.svg","/prototype/motion.css","/prototype/motion-drawer.js"])
  assert.ok(jobs.includes(url),url);
 for(const path of ["mobile_motion_qa.css","mobile_motion_drawer.js"])
  assert.ok(social.includes(path));
 assert.match(social,/req\.query\.gmv3!=="1"/);
 assert.match(jobs,/app\.get\("\/"/);
 assert.match(social,/app\.get\("\/social"/);
 assert.ok(!read("Dockerfile.social").includes("COPY webapp/"),"Social still isolated from Jobs code");
});
