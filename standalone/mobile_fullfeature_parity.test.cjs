"use strict";
/**
 * Garamaal UI feature-parity contract — Node builtins, no cloud credentials.
 * Run: node --test standalone/mobile_fullfeature_parity.test.cjs
 * Tests the real source components, not the reduced standalone UI showcase.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
const load=p=>fs.readFileSync(path.join(root,p),"utf8");
const sha=x=>crypto.createHash("sha1").update("blob "+Buffer.byteLength(x)+String.fromCharCode(0)+x).digest("hex");
const jobs=load("webapp/Index.html");
const social=load("standalone/social.html");
const editorial=load("standalone/mobile_design_language.css");
const jobHub=load("standalone/mobile_jobs_hub.js");
const socialHub=load("standalone/mobile_social_hub.js");
function assertAll(haystack,needles,label){
 for(const needle of needles)assert.ok(haystack.includes(needle),label+": missing "+needle);
}
test("Jobs & Social source remain EXACTLY the approved complete feature base",()=>{
 assert.equal(sha(jobs),"765acba0e663e291545f3ceb3083178a92431646");
 assert.equal(sha(social),"99b0fd9046c52ac2701e54ca3383c9597340c0ee");
});
test("Discovery renders actual original per-job controls — not a mock card",()=>{
 const html=renderActualJobCard("discovery");
 assertAll(html,['data-job-row="17"','data-action="bulk-select"','data-action="detail"',
   'Paste JD','data-action="preference-toggle"','Seems Taaza','Not transferred',
   'Senior Financial Analyst','Sample Corp'],'Discovery');
 assert.ok(!html.includes('data-action="run-cv-now"'),"Discovery must not inadvertently run CV");
});
test("Make CV renders actual full original action set with no hidden controls",()=>{
 const html=renderActualJobCard("fresh");
 assertAll(html,['data-job-row="17"','data-action="inline-control"','data-field="selected"',
   'data-field="cv"','data-field="cl"','data-field="web"','data-action="run-cv-now"',
   'data-action="preference-toggle"','data-action="connections"','data-action="detail"',
   'data-action="tier-mode"','data-action="cl-tier-mode"','data-action="inline-status"',
   'Application status','Cover letter model','CV model'],'Make CV');
});
test("Existing detail panel, download, transfer, preferences and status actions remain",()=>{
 assertAll(jobs,['data-action="save-jd"','data-action="transfer"',
  'data-action="save-fields"','data-action="sync-jd"','data-action="detail-control"',
  'data-action="download-options"','data-action="copy-prompt"','data-action="download-word"',
  'data-action="view-word-drive"','data-action="load-more"','data-action="bulk-preference"',
  'data-action="sort-jobs"','data-action="copy-ranking"'],'original Jobs HTML');
});
test("Social keeps original Targets, Research, Swipe, Follow-ups, filters and uploads",()=>{
 assertAll(social,["function dashboard(){","function inboxView(){","function swipe(){",
  "function followups(){","function stats(){","function render(){","loadResearch",
  "loadInbox","switchCandidate","bottomNav","desktopNav","upload","research",
  "screenshot","followup"],"original Social HTML");
 assertAll(socialHub,['["dashboard","Targets"','["inbox","Research"','["swipe","Swipe"',
   '["followups","Follow-ups"','["stats","Stats"','original.click()'],"new Social shell");
});
test("Five-button Jobs nav delegates to original views and Swipe stays read-only",()=>{
 assertAll(jobHub,['["dashboard","Dashboard"','["discovery","Discovery"','["swipe","Swipe"',
   '["fresh","Make CV"','["more","More"','nav(id)','disabled aria-disabled="true"',
   'No application status, job preference'],"Jobs shell");
});
test("Editorial design language only styles INSIDE original feature screens",()=>{
 // Four-card home, both bottom bars, Back and account drawer were previously approved.
 // Internal styling must not override them, even for future designs.
 const selectors=editorial.replace(/\/\*[\s\S]*?\*\//g,"").match(/[^{}]+\{/g)||[];
 for(const selector of selectors)assert.doesNotMatch(selector,
   /#gmv3-launch|\.gmv3-tabbar|\.gmv3-swipe-arrows|\.gmv3-drawer|#gmv3-home-button|#gmv3-social-back/,
   "Approved visual shell must remain frozen");
 assertAll(editorial,['body.gmv3-jobs-workspace.gmv3-workspace',
   'body.gmv3-social-workspace','.job-settings','.toolbar','.swipe-card',
   '.filter-panel','.jobcontrols','prefers-reduced-motion:reduce'],"internal CSS");
 assert.doesNotMatch(editorial,/display\s*:\s*none\s*!important/i,
   "No component controls may disappear via shared design language");
});
test("Optional preview shell leaves real app routing and backend files in place",()=>{
 const server=load("standalone/server.js"),socialServer=load("standalone/social_server.js");
 assertAll(server,['app.get("/prototype"','/prototype/design-language.css',
   '/dashboard-ranking.js','/dashboard-connections.js'],"Jobs preview route");
 assertAll(socialServer,['req.query.gmv3!=="1"','mobile_design_language.css',
   'sendFile(path.join(__dirname,"social.html"))'],"Social preview route");
});

function renderActualJobCard(section){
 const start=jobs.indexOf("function card(job)");
 const end=jobs.indexOf("\nfunction pagination()",start);
 assert.ok(start>=0&&end>start,"Original dynamic job card not found");
 // Test ONE function from real Jobs source, with only its API helpers replaced
 // by no-op label generators — do not call Sheets, run CV, or alter state.
 const fragment=jobs.slice(start,end);
 const state={section,candidate:"Abhishek",bulk:new Set([17])};
 const stubs={
 state,h:v=>String(v),safeUrl:u=>u,preferenceMenu:()=>'<button data-action="preference-toggle">Preference</button>',
 usdCost:v=>"$"+v,icon:v=>v,compactMetrics:()=>"<span>Scores</span>",
 activityFor:()=>null,activityMarkup:()=>"",tierChoices:()=>"<option>Default</option>",
 statusChoices:()=>"<option>Unapplied</option>"
 };
 const factory=new Function(...Object.keys(stubs),fragment+";return card;");
 const card=factory(...Object.values(stubs));
 return card({row:17,role:"Senior Financial Analyst",company:"Sample Corp",
   location:"Dublin",url:"https://example.com/jobs",cvLink:"",jdReady:true,
   transferred:false,cv:true,cl:true,selected:true,web:false,progress:"Unapplied",
   status:"",notInterested:false,promptReady:false,workflow:"",favorite:true,costUsd:null});
}
