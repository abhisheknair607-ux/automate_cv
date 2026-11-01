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

test("Staging plan validator reads only the two JSON files and treats the pinned revision as a string",()=>{
 const script=read("deploy-garamaal-site-profile-beta.sh");
 assert.match(script,/for x in sys\.argv\[1:3\]/);
 const match=script.match(/BASELINE="\$\(python3 - "\$TMP\/prod\.json" "\$TMP\/stage\.json" "\$PINNED_STAGING_REV" <<'PY'\n([\s\S]*?)\nPY\n\)"/);
 assert.ok(match,"Plan validation heredoc must be identifiable");
 const os=require("node:os");
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"profile-beta-safety-"));
 const revision="garamaal-profile-staging-00012-lug";
 const prodEnv={
  APP_READ_ONLY:"false",APP_ALLOW_PRODUCTION_WRITES:"true",ALLOW_MANUAL_CV_DISPATCH:"true",
  TAAZA_SPREADSHEET_ID:"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
  FRESHMAL_SPREADSHEET_ID:"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"
 };
 const stageEnv={
  APP_READ_ONLY:"true",GARAMAAL_PROFILE_STAGING_ISOLATED:"true",
  GARAMAAL_PROFILE_DATA_SCOPE:"staging",GARAMAAL_PROFILE_ENABLED:"true",
  GARAMAAL_PROFILE_WRITES_APPROVED:"true",GARAMAAL_PROFILE_PRODUCTION_APPROVED:"false"
 };
 const env=x=>Object.entries(x).map(([name,value])=>({name,value}));
 const prod={spec:{template:{spec:{serviceAccountName:"automate-cv-pilot-reader@abhishek-cv-automation.iam.gserviceaccount.com",
  containers:[{env:[...env(prodEnv),{name:"GITHUB_WORKFLOW_TOKEN",valueFrom:{secretKeyRef:{name:"secret",key:"latest"}}}]}]}}},
  status:{traffic:[{revisionName:"automate-cv-dashboard-00047-kos",percent:100}]}};
 const stage={spec:{template:{spec:{serviceAccountName:"garamaal-profile-staging@abhishek-cv-automation.iam.gserviceaccount.com",
  containers:[{env:env(stageEnv)}]}}},
  status:{latestReadyRevisionName:revision,traffic:[{tag:"profile-edit",revisionName:revision,percent:0}]}};
 try{
  const a=path.join(tmp,"production.json"),b=path.join(tmp,"staging.json");
  fs.writeFileSync(a,JSON.stringify(prod));fs.writeFileSync(b,JSON.stringify(stage));
  const result=cp.spawnSync("python3",["-",a,b,revision],{input:match[1]+"\n",encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/automate-cv-dashboard-00047-kos=100/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});

test("Cloud Run EACCES regression: temporary release source and Node user retain readable app files",()=>{
 const script=read("deploy-garamaal-site-profile-beta.sh");
 const docker=fs.readFileSync(path.resolve(root,"..","Dockerfile.garamaal-ui"),"utf8");
 const ci=fs.readFileSync(path.resolve(root,"..",".github/workflows/garamaal-ui-check.yml"),"utf8");
 assert.match(script,/umask 077/);
 assert.match(script,/chmod -R a\+rX "\$TMP\/build"/);
 assert.ok(script.indexOf('chmod -R a+rX "$TMP/build"')>script.indexOf('cp -R "$ROOT/standalone"'));
 assert.ok(script.indexOf('chmod -R a+rX "$TMP/build"')<script.indexOf('gcloud run deploy "$SERVICE"'));
 assert.match(docker,/RUN chmod -R a\+rX \/app\/standalone \/app\/webapp \/app\/package\.json/);
 assert.match(docker,/USER node/);
 assert.match(ci,/chmod -R go-rwx "\$build_dir"/);
 assert.match(ci,/docker build --file "\$build_dir\/Dockerfile"/);
 assert.match(ci,/Smoke test the actual Cloud Run container entrypoint/);
});
