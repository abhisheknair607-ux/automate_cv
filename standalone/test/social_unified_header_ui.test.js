"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../");
const html=fs.readFileSync(path.join(root,"social.html"),"utf8");
const bridge=fs.readFileSync(path.join(root,"bridge.js"),"utf8");
const header=html.match(/<header class="garamaal-unified-header">([\s\S]*?)<\/header>/)?.[1]||"";
test("Social header exposes existing candidate A/P, costs, Google, Jobs/Social and status in logical order",()=>{
 assert.ok(header);
 const terms=['id="candidatePair"','id="candA"','id="candP"','class="mini garamaal-cost-symbol"','class="pill garamaal-job-link"','class="pill active garamaal-social-link"','id="socialModeBadge"'];
 let last=-1;for(const t of terms){const index=header.indexOf(t);assert.ok(index>last, "Wrong element order: "+t);last=index;}
 assert.match(header,/class="row tight top-actions garamaal-header-controls"/);
 assert.match(bridge,/button\.id="cv-account-switch"/);
 assert.match(bridge,/button\.textContent="Switch Google"/);
 assert.match(bridge,/actions\.appendChild\(button\)/);
 assert.match(bridge,/await authInstance\.signOut\(\)/);
 assert.match(header,/href="\/"/);
 assert.match(header,/aria-current="page"/);
});
test("G is only a visual alias for bridge switch; no new Social account-signout or candidate logic",()=>{
 assert.match(html,/#cv-account-switch::before\{content:"G"/);
 assert.match(html,/\.garamaal-header-controls #cv-account-switch\{order:3/);
 assert.match(html,/\.garamaal-header-controls #candidatePair\{order:1/);
 assert.match(html,/\.garamaal-header-controls \.garamaal-cost-symbol\{order:2/);
 assert.match(html,/\.garamaal-header-controls \.garamaal-job-link\{order:4/);
 assert.match(html,/\.garamaal-header-controls \.garamaal-social-link\{order:5/);
 assert.match(html,/document\.getElementById\("candA"\)\.onclick=\(\)=>switchCandidate\("Abhishek"\)/);
 assert.match(html,/document\.getElementById\("candP"\)\.onclick=\(\)=>switchCandidate\("Pooja"\)/);
 assert.doesNotMatch(html,/id="socialGoogleSwitch"/);
});
test("LIVE is connection status; amber EDITING reacts to local inputs/Enter without writes or submit changes",()=>{
 assert.match(html,/state\.readOnly\?"READ ONLY":"LIVE"/);
 assert.match(html,/badge\.textContent="EDITING"/);
 assert.match(html,/badge\.classList\.add\("garamaal-editing"\)/);
 assert.match(html,/document\.addEventListener\("input",showLocalEditing,true\)/);
 assert.match(html,/document\.addEventListener\("change",showLocalEditing,true\)/);
 assert.match(html,/document\.addEventListener\("keydown",e=>\{if\(e\.key==="Enter"\)showLocalEditing\(e\)\},true\)/);
 assert.match(html,/not simultaneous edits by other Google Sheets collaborators/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/state\.readOnly\)return/);
});
