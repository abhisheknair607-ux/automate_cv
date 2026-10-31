"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),read=n=>fs.readFileSync(path.join(root,n),"utf8");
test("all Stage 5 modules and read-only audit script pass syntax checks",()=>{
 for(const name of ["profile_access.js","profile_refresh.js","profile_history.js","profile_service.js",
                     "profile_engine_v3.js","bridge.js","server.js"]){
  const r=spawnSync(process.execPath,["--check",path.join(root,name)],{encoding:"utf8"});
  assert.equal(r.status,0,name+": "+r.stderr);
 }
 const bash=spawnSync("bash",["-n",path.join(root,"profile-staging-readiness.sh")],{encoding:"utf8"});
 assert.equal(bash.status,0,bash.stderr);
});
test("all Profile entrypoints require verified auth and candidate-scoped ACL",()=>{
 const service=read("profile_service.js");
 assert.match(service,/const email=await authenticate\(req\)/);
 assert.match(service,/const grant=permit\(email,key\)/);
 assert.match(service,/const ref=docFor\(grant\.ownerDigest,key\)/);
 assert.doesNotMatch(service,/req\.body\?\.email|req\.body\?\.ownerDigest/);
 assert.match(service,/GARAMAAL_PROFILE_CANDIDATE_ACL_JSON/,"ACL may be in its dedicated module");
});
test("read-only staging and production writes use disjoint permissions and data scopes",()=>{
 const service=read("profile_service.js");
 assert.match(service,/garamaalProfilesStagingV1/);
 assert.match(service,/garamaalProfilesV1/);
 assert.match(service,/GARAMAAL_PROFILE_STAGING_ISOLATED/);
 assert.match(service,/GARAMAAL_PROFILE_PRODUCTION_APPROVED/);
 assert.match(service,/process\.env\.APP_READ_ONLY!=="false"/);
 assert.match(service,/process\.env\.APP_READ_ONLY==="false"/);
 assert.match(service,/writeGate\(\)/);
 const audit=read("profile-staging-readiness.sh");
 assert.doesNotMatch(audit,/gcloud run deploy|update-traffic|set-iam-policy|firebase deploy/);
 assert.match(audit,/GARAMAAL_PROFILE_CANDIDATE_ACL_JSON/);
});
test("history and refresh write only inside existing Firestore transactions",()=>{
 const service=read("profile_service.js");
 assert.match(service,/app\.post\("\/api\/profile\/history"/);
 assert.match(service,/app\.post\("\/api\/profile\/history-version"/);
 assert.match(service,/app\.post\("\/api\/profile\/refresh-preview"/);
 assert.match(service,/app\.post\("\/api\/profile\/refresh-apply"/);
 const preview=service.slice(service.indexOf('app.post("/api/profile/refresh-preview"'),
    service.indexOf('app.post("/api/profile/refresh-apply"'));
 assert.doesNotMatch(preview,/tx\.set|runTransaction|writeGate/);
 const apply=service.slice(service.indexOf('app.post("/api/profile/refresh-apply"'),
    service.indexOf('async function mutate('));
 assert.match(apply,/writeGate\(\)/);
 assert.match(apply,/getFirestore\(\)\.runTransaction/);
 assert.match(apply,/plan\.fingerprint!==body\.fingerprint/);
 assert.match(apply,/recordRevision\(tx,ref,updated/);
 assert.match(service,/recordRevision\(tx,ref,p,\{email,action:"drive-import"\}/);
});
test("original CV generation and live Jobs/Social routes are not switched by Profile",()=>{
 const server=read("server.js"),bridge=read("bridge.js");
 assert.match(server,/profileService\.register\(app,\{authenticate,auth\}\)/);
 assert.match(server,/GARAMAAL_PROFILE_ENABLED==="true"/);
 assert.match(bridge,/"profile\/refresh-preview"/);
 assert.match(bridge,/"profile\/history"/);
 assert.match(server,/app\.get\("\/social"/);
 assert.doesNotMatch(read("profile_service.js"),/runCVWorkflow|writeToSheet|updateCVSource/);
});
