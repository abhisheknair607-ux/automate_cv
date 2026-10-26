"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const root=path.resolve(__dirname,"../..");
test("Social-only guarded canary includes reviewed-queue module and does not deploy Jobs",()=>{
 const script=fs.readFileSync(path.join(root,"standalone/deploy-social-oauth-guarded.sh"),"utf8");
 const docker=fs.readFileSync(path.join(root,"Dockerfile.social"),"utf8");
 const res=cp.spawnSync("bash",["-n",path.join(root,"standalone/deploy-social-oauth-guarded.sh")],{encoding:"utf8"});
 assert.equal(res.status,0,res.stderr);
 assert.match(script,/for file in social_server\.js social_store\.js social_research\.js social_review\.js social\.html bridge\.js/);
 assert.match(docker,/COPY standalone\/social_review\.js/);
 assert.match(script,/--no-traffic --tag social-oauth-preview/);
 assert.match(script,/SAFE STOP: Jobs revision\/traffic changed/);
 assert.doesNotMatch(script,/gcloud run deploy "\$JOBS"/);
 assert.doesNotMatch(script,/firebase deploy/);
});
