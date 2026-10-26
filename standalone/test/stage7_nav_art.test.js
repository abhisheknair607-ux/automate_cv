"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../.."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Swipe and Back are genuinely illustrated SVG assets with transparent surrounding canvas",()=>{
 for(const basename of ["swipe-sticker.svg","back-sticker.svg"]){
  const svg=read("standalone/assets/"+basename);
  assert.match(svg,/<svg\s/);
  assert.match(svg,/viewBox="0 0 100 100"/);
  assert.match(svg,/<path\s/);
  assert.doesNotMatch(svg,/<script|<foreignObject|<image|<rect\s|fill="white"/i);
 }
});
test("Both Jobs/Social navigation buttons include icon only, no duplicate visible labels",()=>{
 for(const [filename,codeNeedle] of [
  ["standalone/mobile_jobs_hub.js","data-g3-jobs"],
  ["standalone/mobile_social_hub.js","data-g3-social"]
 ]){
  const code=read(filename);
  assert.doesNotThrow(()=>new vm.Script(code));
  assert.match(code,/aria-label="['"]\+label\+['"]" title="['"]\+label/);
  assert.match(code,/aria-hidden="true"/);
  assert.doesNotMatch(code,/<\/span>['"]\+label\+['"]<\/button>/);
  assert.ok(code.includes(codeNeedle));
 }
});
test("Both preview services explicitly serve sticker assets; production routes unaffected",()=>{
 const jobs=read("standalone/server.js"),social=read("standalone/social_server.js");
 const docker=read("Dockerfile.social");
 for(const s of [jobs,social]){
  assert.match(s,/swipe-sticker\.svg/);
  assert.match(s,/back-sticker\.svg/);
  assert.match(s,/image\/svg\+xml/);
 }
 for(const asset of ["swipe-sticker.svg","back-sticker.svg"])
  assert.ok(docker.includes("COPY standalone/assets/"+asset));
});
test("Final CSS overrides raised Swipe glyph and white Back tile on both apps",()=>{
 const css=read("standalone/mobile_collage.css");
 const stage7=css.slice(css.indexOf("/* Stage 7: One visual language."));
 assert.ok(stage7.startsWith("/* Stage 7"));
 assert.match(stage7,/\/prototype\/assets\/swipe-sticker\.svg/);
 assert.match(stage7,/\/social\/assets\/swipe-sticker\.svg/);
 assert.match(stage7,/\/prototype\/assets\/back-sticker\.svg/);
 assert.match(stage7,/\/social\/assets\/back-sticker\.svg/);
 assert.match(stage7,/content:none!important;display:none!important/);
 assert.match(stage7,/font-size:0!important;letter-spacing:0!important/);
 assert.match(stage7,/background:transparent url\("\/prototype\/assets\/back-sticker\.svg"\)/);
 assert.match(stage7,/background:transparent url\("\/prototype\/assets\/swipe-sticker\.svg"\)/);
});
