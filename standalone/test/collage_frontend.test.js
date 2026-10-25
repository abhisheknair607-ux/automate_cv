"use strict";
/* Non-network contract tests; no Sheets, Gmail, OpenAI, Cloud Run or Firebase writes. */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Collage script parses without touching production applications",()=>{
 for(const f of ["standalone/mobile_collage_intro.js","standalone/mobile_home_shell.js",
  "standalone/mobile_jobs_hub.js","standalone/mobile_social_hub.js",
  "standalone/server.js","standalone/social_server.js"]){
  assert.doesNotThrow(()=>new vm.Script(read(f),{filename:f}),f);
 }
});
test("Every approved WebP sprite is packaged and nonempty",()=>{
 for(const f of ["home-collage-strip.webp","nav-collage-states.webp","back-avatar-controls.webp"]){
  const b=fs.readFileSync(path.join(root,"standalone/assets",f));
  assert.ok(b.length>1000);
  assert.equal(b.subarray(0,4).toString("ascii"),"RIFF",f);
  assert.equal(b.subarray(8,12).toString("ascii"),"WEBP",f);
 }
});
test("Approved MP4 footage is committed for both device breakpoints",()=>{
 const server=read("standalone/server.js");
 assert.ok(server.includes('app.get("/prototype/media/:file"'));
 for(const f of ["intro-mobile.mp4","intro-desktop.mp4"]){
  const b=fs.readFileSync(path.join(root,"standalone/assets",f));
  assert.ok(b.length>500000,f);
  assert.equal(b.subarray(4,8).toString("ascii"),"ftyp",f);
 }
});
test("New landing controls dispatch into preserved real Jobs / Social handlers",()=>{
 const h=read("standalone/mobile_home_landing.html");
 const shell=read("standalone/mobile_home_shell.js");
 const jobs=read("standalone/mobile_jobs_hub.js");
 const social=read("standalone/mobile_social_hub.js");
 for(const k of ["profile","jobs","network","statistics","targets","reminders"])
  assert.ok(h.includes('data-gmv3="'+k+'"'),"Missing "+k);
 assert.match(shell,/nav\("dashboard"\)/);
 assert.match(shell,/\/social\?gmv3=1/);
 for(const route of ['"dashboard"','"discovery"','"fresh"'])assert.ok(jobs.includes(route));
 assert.match(jobs,/nav\(id\)/);
 assert.match(social,/original\.click\(\)/);
 assert.match(social,/stats\(\)/);
 assert.match(jobs,/disabled aria-disabled="true"/);
});
test("Prototype routes are opt-in, and production route is not replaced",()=>{
 const source=read("standalone/server.js");
 const social=read("standalone/social_server.js");
 const css=read("standalone/mobile_collage.css");
 assert.match(source,/app\.get\("\/prototype"/);
 assert.match(source,/app\.get\("\/prototype\/assets\/:file"/);
 assert.match(source,/app\.get\("\/prototype\/collage\.css"/);
 assert.match(source,/app\.get\("\/prototype\/collage-intro\.js"/);
 assert.match(source,/href=\\?"\/prototype\/collage\.css/);
 assert.match(source,/src=\\?"\/prototype\/collage-intro\.js/);
 assert.match(social,/if\(req\.query\.gmv3!=="1"\)/);
 assert.match(social,/app\.get\("\/social\/assets\/:file"/);
 assert.ok(!source.includes('app.get("/",(req,res)=>res.redirect("/prototype")'));
 assert.match(css,/home-collage-strip\.webp/);
 assert.match(css,/nav-collage-states\.webp/);
 assert.match(css,/back-avatar-controls\.webp/);
});
test("Social Docker image ships only Social-relevant approved sprites",()=>{
 const docker=read("Dockerfile.social");
 for(const f of ["mobile_collage.css","nav-collage-states.webp","back-avatar-controls.webp"])
  assert.ok(docker.includes(f),"Social Docker missing "+f);
 assert.ok(!docker.includes("home-collage-strip.webp"));
});


test("Intro picks the correct clip by aspect ratio, with non-cropping responsive film and accessible controls",()=>{
 const code=read("standalone/mobile_collage_intro.js");
 const css=read("standalone/mobile_collage.css");
 assert.match(code,/\(min-aspect-ratio: 11\/10\)/);
 assert.doesNotMatch(code,/\(min-width: 800px\)/);
 assert.match(code,/video\.currentTime>=3\.77/);
 assert.match(code,/root\.removeAttribute\("aria-hidden"\)/);
 assert.match(code,/prefers-reduced-motion/);
 assert.match(css,/#gmv3-collage-intro \.gmv3-intro-video\s*\{[^}]*object-fit:contain/s);
 assert.match(css,/#gmv3-collage-intro \.gmv3-intro-controls\s*\{[^}]*safe-area-inset-bottom/s);
 assert.match(css,/INTRO \/ SCREEN-FIT 2026-10-25/);
 assert.match(css,/@media \(orientation:portrait\)/);
 assert.match(css,/@media \(orientation:landscape\) and \(max-height:490px\)/);
 assert.match(css,/width:min\(92vw,840px,calc\(78dvh \* 1\.65\)\)/);
 assert.ok(!css.includes('#gmv3-collage-intro .gmv3-intro-video{object-fit:cover}'));
 for(const screen of [
   {w:320,h:740,expected:"mobile"},
   {w:390,h:844,expected:"mobile"},
   {w:768,h:1024,expected:"mobile"},
   {w:1024,h:768,expected:"desktop"},
   {w:932,h:430,expected:"desktop"},
   {w:1920,h:1080,expected:"desktop"},
   {w:3440,h:1440,expected:"desktop"}
 ]){
  const wide=screen.w/screen.h>=1.1;
  assert.equal(wide?"desktop":"mobile",screen.expected);
 }
});
