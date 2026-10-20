"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const store=fs.readFileSync(path.resolve(__dirname,"../social_store.js"),"utf8");
const tail=html.slice(html.lastIndexOf("/* Social Research layout:"),html.indexOf("</style>"));
test("Research section has no visible legacy Consulting and Wealth Campaign Planner",()=>{
 const start=html.indexOf("function inboxView(){"),end=html.indexOf("function openTemplateEditor(",start);
 assert.ok(start!==-1&&end>start);
 const view=html.slice(start,end);
 assert.doesNotMatch(view,/legacyInboxView|research-campaign|Campaign planner/);
 assert.match(view,/targetResearch\(\)\+sourceInbox\(\)/);
});
test("Saved targets is an independent dropdown directly after action buttons",()=>{
 const target=html.slice(html.indexOf("function targetResearch(){"),html.indexOf("function sourceInbox(){"));
 assert.ok(target.indexOf('id="saveTarget"')<target.indexOf('id="researchSavedTargets"'));
 assert.match(target,/class="research-target-dropdown"/);
 assert.match(target,/id="researchSavedTargets" open/);
 assert.match(target,/id="researchTargetResults"/);
 assert.match(target,/savedTargetRows\(\)/);
 assert.doesNotMatch(target,/savedTargetRows\(company\)/);
 const update=html.slice(html.indexOf("function updateTargetUrl(){"),html.indexOf("async function loadInbox(){"));
 assert.doesNotMatch(update,/researchTargetResults|targetMatchCount/);
});
test("Saved targets show five rows then scroll; Research Queue shows five then scroll",()=>{
 assert.match(tail,/\.research-target-dropdown \.research-target-scroll\{[^}]*max-height:240px;overflow-y:auto/);
 assert.match(tail,/\.research-target-dropdown \.research-target-mini\{min-height:48px\}/);
 assert.match(tail,/\.research-queue-scroll\{max-height:280px;overflow-y:auto/);
 assert.match(tail,/\.research-queue-scroll \.research-target-row\{min-height:56px\}/);
 assert.match(html,/class="research-queue-scroll" role="region" tabindex="0"/);
 // Drive already lists newest files first; keep entire list available by scrolling.
 assert.match(store,/orderBy=createdTime%20desc/);
 assert.doesNotMatch(html,/state\.inbox\.slice\(0,5\)/);
});
test("Research inputs and actions stay symmetrical across desktop/mobile",()=>{
 assert.match(tail,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) 48px/);
 assert.match(tail,/\.research-select-row\{display:grid;grid-template-columns:minmax\(0,1fr\) 40px/);
 assert.match(tail,/\.research-space \.research-action-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);max-width:none;width:100%/);
 assert.match(tail,/@media\(max-width:700px\)/);
 assert.match(tail,/@media\(max-width:390px\)/);
});
