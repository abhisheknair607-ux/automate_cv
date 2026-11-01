"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const root=path.join(__dirname,"..");
const load=name=>fs.readFileSync(path.join(root,name),"utf8");
test("Stage 4 source-grounded UI and bridge are syntax-clean and opt-in",()=>{
 for(const name of ["profile_suggestions.js","profile_service.js","profile_engine_v3.js","profile_section_ops.js","bridge.js","server.js"]){
  const r=spawnSync(process.execPath,["--check",path.join(root,name)],{encoding:"utf8"});
  assert.equal(r.status,0,name+" syntax error: "+r.stderr);
 }
 const server=load("server.js"),bridge=load("bridge.js"),ui=load("profile_engine_v3.js");
 assert.match(server,/GARAMAAL_PROFILE_ENABLED==="true"/);
 assert.match(server,/profileService\.register\(app,\{authenticate,auth\}\)/);
 assert.match(bridge,/"profile\/suggest"/);
 assert.match(bridge,/"profile\/jd-match"/);
 assert.match(bridge,/"profile\/check-claims"/);
 assert.match(ui,/data-star-panel/);
 assert.match(ui,/data-numeric-panel/);
 assert.match(ui,/data-jd-text/);
 assert.match(ui,/if\(hasUnsaved\(\)\)/);
 assert.match(ui,/Nothing saved|nothing saved|not saved/);
});
test("Stage 4 endpoints stay read-only and source-bound",()=>{
 const server=load("profile_service.js");
 const head=server.slice(server.indexOf('app.post("/api/profile/suggest"'),
  server.indexOf('app.post("/api/profile/read"'));
 assert.match(head,/await ref\.get\(\)/);
 assert.match(head,/snapshot\.data\(\)\.imported/);
 assert.match(head,/profile\.revision!==Number\(body\.revision\)/);
 assert.doesNotMatch(head,/tx\.set|ref\.set|ref\.update|runTransaction|driveGet\(/);
 assert.match(head,/profileSuggestions\.proposeStar\(record\)/);
 assert.match(head,/profileSuggestions\.matchJD\(body\.jdText,profile\.records\)/);
 assert.match(head,/profileSuggestions\.unsupportedNumbers\(body\.claimText,record\.originalText\)/);
});
test("No worker-source switch and no automatic STAR acceptance",()=>{
 const ui=load("profile_engine_v3.js"),service=load("profile_service.js");
 assert.match(ui,/apply-star-preview/);
 assert.match(ui,/Insert selected excerpts/);
 assert.match(ui,/dirty=true;setStatus\("Source excerpts inserted into a draft only/);
 assert.match(ui,/request\("record"/);
 assert.match(service,/GARAMAAL_PROFILE_WRITES_APPROVED/);
 assert.doesNotMatch(service,/selected_evidence_ids|runCVWorkflow|child_process/);
});
