"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const script=fs.readFileSync(path.join(root,"deploy-social-oauth-guarded.sh"),"utf8");
const html=fs.readFileSync(path.join(root,"social.html"),"utf8");

test("Social release preflight and canary validate visible Research dropdown and bounded queue",()=>{
 for(const marker of ['id="researchSavedTargets"','class="research-queue-scroll"']){
  assert.ok(html.includes(marker),"Required live Research UI marker missing: "+marker);
  assert.ok(script.includes("grep -Fq '"+marker+"' \"$ROOT/standalone/social.html\""),"Source preflight must check "+marker);
  assert.ok(script.includes("grep -Fq '"+marker+"' \"$TMP/social.html\""),"Preview HTML must check "+marker);
 }
 assert.doesNotMatch(script,/savedTargetRows\(query\)/,"No brittle old helper signature allowed in release script");
 assert.match(html,/function savedTargetRows\(\)/);
});

test("Social-only preview release cannot deploy Jobs, reroute Hosting, or promote without second flag",()=>{
 assert.match(script,/--no-traffic --tag social-oauth-preview/);
 assert.match(script,/ISOLATION_OK: Jobs untouched/);
 assert.match(script,/GARAMAAL_SOCIAL_OAUTH_PROMOTE:-/);
 assert.match(script,/YES_AFTER_CANARY_CHECK/);
 assert.doesNotMatch(script,/gcloud run deploy "\$JOBS"/);
 assert.doesNotMatch(script,/firebase deploy|hosting:channel:deploy/);
});
