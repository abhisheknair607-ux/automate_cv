"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("Profile frontend remains opt-in and does not alter the CV worker",()=>{
 const server=read("server.js");
 const ui=read("profile_engine_v3.js");
 const bridge=read("bridge.js");
 assert.match(server,/GARAMAAL_PROFILE_ENABLED==="true"/);
 assert.match(server,/profile_engine_v3\.js/);
 assert.match(ui,/window\.GaramaalProfile/);
 assert.match(ui,/data-mobile-section/);
 assert.match(ui,/data-star/);
 assert.match(ui,/classificationReviewed/);
 assert.match(ui,/guardExit/);
 assert.match(bridge,/"profile\/readiness"/);
 assert.doesNotMatch(ui,/firebase\.initializeApp/);
 assert.doesNotMatch(ui,/window\.prompt\(/);
});

test("Copper and porcelain dark/light and compact mobile styles have focus/reduced-motion support",()=>{
 const css=read("profile_engine.css");
 assert.match(css,/\.gmp-root\.gmp-dark/);
 assert.match(css,/@media\s*\(max-width:\s*720px\)/);
 assert.match(css, /focus-visible/);
 assert.match(css, /prefers-reduced-motion/);
 assert.match(css,/gmp-mobile-archived/);
});

test("Profile server enforces authenticated ACL, scoped source, and write approval",()=>{
 const server=read("profile_service.js");
 const acl=read("profile_access.js");
 assert.match(server,/const email=await authenticate\(req\)/);
 assert.match(server,/permit\(email,key\)/);
 assert.match(server,/GARAMAAL_PROFILE_STAGING_ISOLATED/);
 assert.match(server,/GARAMAAL_PROFILE_WRITES_APPROVED/);
 assert.match(server,/sourceCatalog\(key\)/);
 assert.match(server,/Profile saving is not approved/);
 assert.match(acl,/ownerDigest/);
 assert.match(acl,/does not have access to the selected candidate/);
});

test("Temporary Cloud Shell proxy can carry Firebase auth separately in isolated read-only staging",()=>{
 const server=read("server.js"),bridge=read("bridge.js");
 assert.match(server,/const PROFILE_PREVIEW_PROXY_AUTH = READ_ONLY/);
 assert.match(server,/GARAMAAL_PROFILE_STAGING_ISOLATED/);
 assert.match(server,/GARAMAAL_PROFILE_DATA_SCOPE === "staging"/);
 assert.match(server,/req\.path\.startsWith\("\/api\/profile\/"\)/);
 assert.match(server,/getAuth\(\)\.verifyIdToken\(match\[1\]\)/);
 assert.match(server,/x-garamaal-firebase-authorization/);
 assert.match(bridge,/profilePreviewProxyAuth===true/);
 assert.match(bridge,/endpoint\.startsWith\("profile\/"\)/);
 assert.match(bridge,/X-Garamaal-Firebase-Authorization/);
});

test("Profile proxy transport deploy script targets only tagged zero-traffic staging",()=>{
 const file=path.join(root,"deploy-profile-preview-transport.sh");
 const script=read("deploy-profile-preview-transport.sh");
 const syntax=spawnSync("bash",["-n",file],{encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.match(script,/SERVICE="garamaal-profile-staging"/);
 assert.match(script,/--no-traffic/);
 assert.match(script,/--no-allow-unauthenticated/);
 assert.match(script,/GARAMAAL_PROFILE_WRITES_APPROVED":"false"/);
 assert.match(script,/APP_READ_ONLY":"true"/);
 assert.doesNotMatch(script,/automate-cv-dashboard|automate-cv-social|update-traffic|GARAMAAL_PROFILE_WRITES_APPROVED":"true"/);
});

test("Staging audit is syntactically valid and contains no modifying cloud CLI commands",()=>{
 const audit=path.join(root,"profile-staging-readiness.sh");
 const result=spawnSync("bash",["-n",audit],{encoding:"utf8"});
 assert.equal(result.status,0,result.stderr);
 const text=read("profile-staging-readiness.sh");
 assert.match(text,/automate-cv-staging/);
 assert.match(text,/gcloud run services describe/);
 assert.match(text,/gcloud firestore databases describe/);
 assert.match(text,/ALLOW_PROFILE_PRODUCTION_INSPECTION/);
 assert.doesNotMatch(text,/gcloud\s+(?:run\s+services\s+(?:update|replace|delete)|run\s+deploy|projects\s+add-iam-policy-binding|firestore\s+databases\s+create)/);
});

test("Offline Word comparator and staging proxy do not invoke paid generation",()=>{
 const staging=read("staging_profile_cv_handoff.py");
 const comparison=read("profile_stage7_compare.py");
 assert.match(staging,/class ProfileStage3Sources/);
 assert.match(staging,/if mode == "drive":/);
 assert.match(staging,/if mode == "compare":/);
 assert.match(comparison,/def compare_docx/);
 assert.match(comparison,/humanSignoffRequired/);
 assert.doesNotMatch(comparison,/openai|cloud\.run|firestore\.googleapis/i);
});
