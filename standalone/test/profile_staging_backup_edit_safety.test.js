"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const ui=fs.readFileSync(path.join(root,"profile_engine_v3.js"),"utf8");
const scriptPath=path.join(root,"deploy-profile-edit-backup-staging.sh");
const script=fs.readFileSync(scriptPath,"utf8");

test("Staging browser backup is a user-triggered export of an authorised saved profile",()=>{
 assert.match(ui,/buttons\("export-backup","Download backup for Drive"\)/);
 const block=ui.match(/if\(action==="export-backup"\)\{[\s\S]*?\n  if\(action==="history"\)/);
 assert.ok(block);
 assert.match(block[0],/if\(hasUnsaved\(\)\)/);
 assert.match(block[0],/request\("read",\{candidate:key\}\)/);
 assert.match(block[0],/snapshot\.candidate!==key/);
 assert.match(block[0],/snapshot\.imported!==true/);
 assert.match(block[0],/JSON\.stringify\(pack,null,2\)/);
 assert.match(block[0],/anchor\.download=/);
 assert.match(block[0],/source:"staging-firestore"/);
 assert.doesNotMatch(block[0],/\/drive\/v3\/files|window\.localStorage|profile\/import|profile\/record|profile\/refresh-apply/);
});

test("Frontend syntax and guarded zero-traffic staging script are valid",()=>{
 let x=spawnSync("node",["--check",path.join(root,"profile_engine_v3.js")],{encoding:"utf8"});
 assert.equal(x.status,0,x.stderr);
 x=spawnSync("bash",["-n",scriptPath],{encoding:"utf8"});
 assert.equal(x.status,0,x.stderr);
 assert.match(script,/SERVICE="garamaal-profile-staging"/);
 assert.match(script,/APPROVE_GARAMAAL_PROFILE_STAGING_EDITS/);
 assert.match(script,/--no-traffic --tag=profile-backup/);
 assert.ok("garamaal-profile-staging".length+"profile-backup".length<=46,"Cloud Run tag/service name length limit");
 assert.match(script,/--no-traffic --tag=profile-edit/);
 assert.match(script,/GARAMAAL_PROFILE_WRITES_APPROVED=true/);
 assert.match(script,/APP_READ_ONLY":"true"/);
 assert.match(script,/GARAMAAL_PROFILE_DATA_SCOPE":"staging"/);
 assert.match(script,/--no-allow-unauthenticated/);
 assert.doesNotMatch(script,/gcloud run services update-traffic|automate-cv-dashboard|automate-cv-social/);
});
