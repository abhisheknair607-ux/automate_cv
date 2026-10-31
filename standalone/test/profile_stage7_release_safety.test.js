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

test("Profile readiness checks the same valid candidate-owned Firestore path as read",()=>{
 const service=read("profile_service.js");
 const readiness=service.match(/app\.post\("\/api\/profile\/readiness"[\s\S]*?app\.post\("\/api\/profile\/suggest"/);
 assert.ok(readiness,"Profile readiness endpoint must exist");
 assert.match(readiness[0],/async\(\{key,ref\}\)=>/);
 assert.match(readiness[0],/await ref\.get\(\)/);
 assert.doesNotMatch(readiness[0],/__profile_readiness__/);
 assert.doesNotMatch(readiness[0],/\.set\(|\.update\(|\.create\(/);
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

test("Private source preview shows full exact record text and provenance before import",()=>{
 const server=read("profile_service.js");
 const ui=read("profile_engine_v3.js");
 const css=read("profile_engine.css");
 const preview=server.match(/app\.post\("\/api\/profile\/import-preview"[\s\S]*?app\.post\("\/api\/profile\/import"/);
 assert.ok(preview);
 assert.match(server,/res\.set\("Cache-Control","private, no-store"\)/);
 assert.match(preview[0],/originalText:r\.originalText/);
 assert.match(preview[0],/classification:r\.classification/);
 assert.match(preview[0],/source:r\.source/);
 assert.match(preview[0],/allSourcesComplete/);
 assert.doesNotMatch(preview[0],/\.set\(|\.update\(|\.create\(/);
 assert.match(ui,/function previewList\(\)/);
 assert.match(ui,/gmp-preview-original/);
 assert.match(ui,/esc\(r\.originalText/);
 assert.match(ui,/data-preview-search/);
 assert.match(ui,/data-preview-filter/);
 assert.match(ui,/previewLimit\+=12/);
 assert.match(css,/\.gmp-preview-record/);
 assert.match(css,/@media\(max-width:720px\)/);
});
test("Two-pass verification checks the authenticated candidate twice without writes",()=>{
 const ui=read("profile_engine_v3.js");
 const part=ui.match(/if\(action==="verify-twice"\)[\s\S]*?if\(action==="import"\)/);
 assert.ok(part);
 assert.match(part[0],/for\(let index=0;index<2;index\+\+\)/);
 assert.match(part[0],/api\("readiness",\{candidate:key\}\)/);
 assert.match(part[0],/api\("import-preview",\{candidate:key\}\)/);
 assert.match(part[0],/signature:/);
 assert.match(part[0],/source.*sha256/);
 assert.match(part[0],/passes\.every\(x=>x\.passed\)/);
 assert.doesNotMatch(part[0],/api\("import",|api\("record",|api\("refresh-apply",/);
});

test("Firebase-verified staging identity can be checked without candidate delegation",()=>{
 const service=read("profile_service.js"),bridge=read("bridge.js"),ui=read("profile_engine_v3.js");
 const identity=service.match(/app\.post\("\/api\/profile\/identity"[\s\S]*?app\.post\("\/api\/profile\/readiness"/);
 assert.ok(identity);
 assert.match(identity[0],/const email=await authenticate\(req\)/);
 assert.match(identity[0],/DATA_SCOPE!=="staging"/);
 assert.match(identity[0],/APP_READ_ONLY/);
 assert.match(identity[0],/parseAcl\(process\.env\.GARAMAAL_PROFILE_CANDIDATE_ACL_JSON\)/);
 assert.match(identity[0],/candidates:/);
 assert.doesNotMatch(identity[0],/\.set\(|\.create\(|\.update\(/);
 assert.match(bridge,/"profile\/identity"/);
 assert.match(ui,/api\("identity",\{\}\)/);
 assert.match(ui,/Verified Google sign-in/);
 assert.match(ui,/identityPane\(\)/);
});
test("Shared staging ACL grant needs exact browser email and explicit approval",()=>{
 const name="grant-shared-profile-staging-access.sh";
 const file=path.join(root,name),script=read(name);
 const syntax=spawnSync("bash",["-n",file],{encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.match(script,/SERVICE="garamaal-profile-staging"/);
 assert.match(script,/--no-traffic/);
 assert.match(script,/--no-allow-unauthenticated/);
 assert.match(script,/--update-env-vars/);
 assert.match(script,/GARAMAAL_PROFILE_WRITES_APPROVED":"false"/);
 assert.match(script,/APP_READ_ONLY":"true"/);
 assert.match(script,/if email not in old_acl or "abhishek" not in old_acl\[email\]/);
 assert.match(script,/APPROVE SHARED STAGING ACCESS/);
 assert.match(script,/--image="\$IMAGE"/);
 assert.doesNotMatch(script,/automate-cv-dashboard|automate-cv-social|--allow-unauthenticated|update-traffic|--set-env-vars|--clear-env-vars/);
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
