"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../.."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Profile + More are preview-only scripts, compile and are mounted after Jobs baseline",()=>{
 const editor=read("standalone/mobile_profile_editor.js");
 const drawer=read("standalone/mobile_profile_drawer.js");
 assert.doesNotThrow(()=>new vm.Script(editor));
 assert.doesNotThrow(()=>new vm.Script(drawer));
 const server=read("standalone/server.js");
 for(const uri of ["/prototype/account-drawer.js","/prototype/profile-editor.js"]){
  assert.match(server,new RegExp(uri.replaceAll("/","\\/")));
 }
 assert.match(server,/\/prototype\/mobile-shell\.js/);
 assert.match(drawer,/window\.GaramaalProfile\?\.open\(\)/);
 assert.match(read("standalone/mobile_jobs_hub.js"),/window\.GaramaalDrawer\.open\(\)/);
 assert.match(read("standalone/mobile_home_shell.js"),/if\(page==="profile" && window\.GaramaalProfile\)/);
});
test("Right drawer reuses A/P, costs, Google identity switch and original job routes",()=>{
 const drawer=read("standalone/mobile_profile_drawer.js");
 for(const x of ['#candidateToggle button','selected.click()','expenseToggle','cv-account-switch','GaramaalJobsHub','GaramaalPrototypeHome']){
  assert.ok(drawer.includes(x),x+" must delegate");
 }
 for(const candidate of ["Abhishek","Pooja"])assert.ok(drawer.includes(candidate));
 assert.doesNotMatch(drawer,/fetch\(|\/api\/update|localStorage\.setItem/);
});
test("Profile V1 keeps browser-local QA edits separate by candidate without CV writes",()=>{
 const editor=read("standalone/mobile_profile_editor.js");
 assert.match(editor,/storeKey=name=>/);
 assert.match(editor,/name\(\)/);
 for(const section of ["identity","work","education","certifications","achievements","skills","story","preferences"])
  assert.ok(editor.includes('"'+section+'"'));
 for(const field of ["employer","title","period","qualification","roles","departments","locations","visa"])
  assert.ok(editor.includes(field));
 assert.match(editor,/localStorage\.setItem/);
 assert.doesNotMatch(editor,/\bfetch\(|\brun\(|google\.script\.run|window\.__cvStandalone\.requestSpecial/);
 assert.match(editor,/Draft saved only in this browser/);
});
test("Narrow jobs toolbar remains one horizontal row, scoring is readable and Swipe has fallback",()=>{
 const css=read("standalone/mobile_collage.css");
 assert.match(css,/Stage 5 UI-only: compressed toolbar/);
 assert.match(css,/\.toolbar-main\{display:flex!important;flex-wrap:nowrap!important/);
 assert.match(css,/score-avg strong\{color:#dfff58!important/);
 assert.match(css,/score-rank strong\{color:#e6acff!important/);
 assert.match(css,/button\.gmv3-swipe-tab \.gmv3-tabicon:after\{/);
 assert.match(css,/content:"⇄"/);
 assert.match(css,/Profile V1 \+ More/);
});
