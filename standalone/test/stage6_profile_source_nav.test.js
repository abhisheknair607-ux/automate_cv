"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("Projects are repeatable structured evidence, not combined with general achievements",()=>{
 const editor=read("standalone/mobile_profile_editor.js");
 assert.doesNotThrow(()=>new vm.Script(editor));
 for(const key of ['["projects","06","Projects"','projects:[{name:"",role:"",period:"",summary:"",outcomes:"",tools:"",evidence:""}]','field("projects."+i+".name"','field("projects."+i+".evidence"','["work","education","projects"]']){
  assert.ok(editor.includes(key),key);
 }
 assert.match(editor,/localStorage\.setItem\(storeKey\(current\)/);
 assert.doesNotMatch(editor,/\brun\(|fetch\(|google\.script\.run|runCvApiNow/);
});
test("Source selector previews Drive and editable draft without switching the billable CV engine",()=>{
 const editor=read("standalone/mobile_profile_editor.js");
 for(const s of ['previewModeKey=name=>','data-gmp-source="drive"','data-gmp-source="profile"','CV engine: Drive','The CV generator does not read it yet']){
  if(s==="The CV generator does not read it yet")assert.ok(/CV generator does not read it yet/.test(editor));
  else assert.ok(editor.includes(s),s);
 }
 assert.match(editor,/Switching this view never generates a CV/);
 assert.doesNotMatch(editor,/process\.env\.CV_SOURCE|setJobPreference|updateFreshControl/);
});
test("E avatar, status-left and hidden top install controls delegate to one drawer card",()=>{
 const drawer=read("standalone/mobile_profile_drawer.js");
 const css=read("standalone/mobile_collage.css");
 const home=read("standalone/mobile_home_shell.js");
 assert.match(drawer,/button\.innerHTML='<span aria-hidden="true">E<\/span>'/);
 assert.match(drawer,/topbar\.insertBefore\(connection/);
 assert.match(drawer,/data-gm-account="install"/);
 assert.match(drawer,/getElementById\("cv-install-app"\)/);
 assert.match(home,/initial\.textContent="E"/);
 assert.match(css,/\.gmv3-account-install\{/);
 assert.match(css,/#garamaal-install-dock/);
 assert.match(css,/\.topbar \.crumb\{display:none!important\}/);
});
test("Jobs and Social bottom navigation retain the same five-column original artwork",()=>{
 const css=read("standalone/mobile_collage.css");
 const jobs=read("standalone/mobile_jobs_hub.js");
 const social=read("standalone/mobile_social_hub.js");
 for(const code of [jobs,social])assert.match(code,/"swipe","Swipe","⇄"/);
 assert.match(css,/background:url\("\/prototype\/assets\/nav-collage-states\.webp"\) no-repeat 50% 0%!important/);
 assert.match(css,/\.gmv3-social-workspace #gmv3-social-tabs/);
 assert.match(css,/background-image:url\("\/social\/assets\/nav-collage-states\.webp"\)!important/);
 assert.match(css,/background-size:500% 300%!important/);
 assert.doesNotMatch(css,/Stage 6: shared collage[\s\S]*background:#d493ef!important;box-shadow:3px 3px 0 #dfff58/);
});
