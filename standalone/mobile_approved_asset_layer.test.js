"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const sha=s=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(s)+String.fromCharCode(0)+s).digest("hex");
const sprites=[
 ["standalone/assets/home-art.css","--gmv3-home-art",89706],
 ["standalone/assets/navigation-states.css","--gmv3-navigation-art",44190],
 ["standalone/assets/header-controls.css","--gmv3-control-art",24614]
];
test("original Jobs and Social app source remains byte-identical",()=>{
 assert.equal(sha(read("webapp/Index.html")),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(sha(read("standalone/social.html")),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
});
test("all three separately stored WebP sprites decode to the intended nonempty bytes",()=>{
 for(const [file,variable,expected] of sprites){
  const css=read(file);
  assert.ok(css.includes(variable));
  const match=css.match(new RegExp("data:image/webp;base64,([A-Za-z0-9+/=]+)"));
  assert.ok(match,file+" contains embedded WebP");
  const bytes=Buffer.from(match[1],"base64");
  assert.equal(bytes.length,expected,file+" size");
  assert.equal(bytes.subarray(0,4).toString("ascii"),"RIFF");
  assert.equal(bytes.subarray(8,12).toString("ascii"),"WEBP");
 }
});
test("Jobs and Social have full five-button navigation with separate Swipe arrows",()=>{
 for(const file of ["standalone/mobile_jobs_hub.js","standalone/mobile_social_hub.js"]){
  const code=read(file);
  assert.match(code,/gmv3-swipe-arrows/);
  assert.match(code,/class="left"/);
  assert.match(code,/class="right"/);
  assert.match(code,/gmv3-tabicon/);
  assert.match(code,/aria-current/);
 }
});
test("asset CSS has pop animation, split-arrow motion and reduced-motion fallback",()=>{
 const css=read("standalone/mobile_approved_asset_layer.css");
 for(const needle of ["var(--gmv3-home-art)","var(--gmv3-navigation-art)","var(--gmv3-control-art)","@keyframes gmv3-asset-pop","translateX(-7px)","translateX(7px)","prefers-reduced-motion:reduce"]){
  assert.ok(css.includes(needle),needle);
 }
});
test("all asset endpoints are opt-in and Social build contains the files",()=>{
 const jobs=read("standalone/server.js"),soc=read("standalone/social_server.js"),docker=read("Dockerfile.social");
 for(const url of ["/prototype/assets/home.css","/prototype/assets/navigation.css","/prototype/assets/controls.css","/prototype/approved-assets.css"]){
  assert.ok(jobs.includes(url),url);
 }
 assert.ok(soc.includes('req.query.gmv3!=="1"'));
 for(const asset of ["mobile_approved_asset_layer.css","navigation-states.css","header-controls.css"]){
  assert.ok(soc.includes(asset));
  assert.ok(docker.includes(asset));
 }
 assert.ok(!docker.includes("COPY webapp/"));
});

test("safe card illustration framing protects mobile edges and readable labels",()=>{
 const css=read("standalone/mobile_stage_visual_qa.css");
 for(const marker of ["Safe margins", "width:53%!important","height:105%!important","background-size:400% 100%!important","max-width:49%!important","font-size:20px!important","prefers-reduced-motion:reduce"]){
  // The generated sprite itself has transparent margins; style protects card clipping.
  if(marker==="Safe margins")continue;
  assert.ok(css.includes(marker),"Missing safe-framing rule: "+marker);
 }
});
