"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const root=path.resolve(__dirname,"..");
const read=x=>fs.readFileSync(path.join(root,x),"utf8");
const beta=require("../profile_beta_proxy");
test("Garamaal public website beta remains disabled without explicit 3-part flag",()=>{
 const names=["GARAMAAL_PROFILE_BETA_ENABLED","GARAMAAL_PROFILE_BETA_DATA_SCOPE","GARAMAAL_PROFILE_BETA_EMAIL"];
 const previous=Object.fromEntries(names.map(x=>[x,process.env[x]]));
 try{
  for(const k of names)delete process.env[k];
  assert.equal(beta.enabled(),false);
  process.env.GARAMAAL_PROFILE_BETA_ENABLED="true";
  assert.equal(beta.enabled(),false);
  process.env.GARAMAAL_PROFILE_BETA_DATA_SCOPE="staging";
  assert.equal(beta.enabled(),false);
  process.env.GARAMAAL_PROFILE_BETA_EMAIL="abhisheknair607@gmail.com";
  assert.equal(beta.enabled(),true);
 }finally{for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
test("Beta backend only forwards 6 authenticated Profile operations to tagged staging",()=>{
 assert.deepEqual([...beta.ALLOWED_ACTIONS].sort(),["cv-package","history","history-version","match","read","save"]);
 assert.match(beta.STAGING_SERVICE_URL,/^https:\/\/garamaal-profile-staging-/);
 assert.match(beta.STAGING_REVISION_URL,/^https:\/\/profile-edit---garamaal-profile-staging-/);
 const code=read("profile_beta_proxy.js");
 assert.match(code,/const email=await authenticate\(req\)/);
 assert.match(code,/GARAMAAL_PROFILE_BETA_EMAIL/);
 assert.match(code,/X-Garamaal-Firebase-Authorization/);
 assert.match(code,/getIdTokenClient\(STAGING_SERVICE_URL\)/);
 assert.doesNotMatch(code,/runCvApiNow|workflow_dispatch|SPREADSHEET_ID|production\/write/);
});
test("Beta frontend replaces only the staging Profile launch, not Jobs or CV source",()=>{
 const server=read("server.js"),bridge=read("bridge.js");
 const ui=read("profile_beta_ui.js"),css=read("profile_beta_ui.css");
 assert.match(server,/profileBeta\.register\(app,\{authenticate\}\)/);
 assert.match(server,/profileBeta\.enabled\(\)/);
 assert.match(server,/profile-beta-ui\.js\?v=sitebeta1/);
 assert.match(server,/hub-swipe\.js/);
 assert.match(bridge,/"profile\/structured\/match"/);
 assert.match(bridge,/"profile\/structured\/cv-package"/);
 assert.match(ui,/window\.GaramaalProfile=Object\.freeze/);
 assert.match(ui,/Find my strongest evidence/);
 assert.match(ui,/Candidate-confirmed/);
 assert.match(css,/gsp-match-panel/);
 assert.match(css,/@media\(max-width:720px\)/);
 for(const file of ["server.js","profile_beta_proxy.js","profile_beta_ui.js"]){
  const result=cp.spawnSync("node",["--check",path.join(root,file)],{encoding:"utf8"});
  assert.equal(result.status,0,file+": "+result.stderr);
 }
});
test("Website release guards preserve live environment, keep staging revision pinned and roll back traffic",()=>{
 const file=path.join(root,"deploy-garamaal-site-profile-beta.sh");
 const script=read("deploy-garamaal-site-profile-beta.sh");
 const result=cp.spawnSync("bash",["-n",file],{encoding:"utf8"});
 assert.equal(result.status,0,result.stderr);
 assert.match(script,/SERVICE="automate-cv-dashboard"/);
 assert.match(script,/STAGING="garamaal-profile-staging"/);
 assert.match(script,/PINNED_STAGING_REV=/);
 assert.match(script,/--no-traffic --tag="\$TAG"/);
 assert.match(script,/--update-env-vars=/);
 assert.match(script,/APPROVE_GARAMAAL_SITE_PROFILE_BETA/);
 assert.match(script,/--to-revisions="\$BASELINE"/);
 assert.match(script,/APP_ALLOW_PRODUCTION_WRITES/);
 assert.match(script,/GITHUB_WORKFLOW_TOKEN/);
 assert.doesNotMatch(script,/--allow-unauthenticated|--clear-env-vars|--set-env-vars|automate-cv-social/);
});
