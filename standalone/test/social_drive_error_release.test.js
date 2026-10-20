"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {safeDriveReason,uploadError}=require("../social_research");
test("Drive upload errors expose only allowlisted reasons, never private messages or folder IDs",()=>{
 const quota={error:{errors:[{reason:"storageQuotaExceeded",message:"private folder ID 123"}],message:"private folder ID 123"}};
 assert.equal(safeDriveReason(quota),"storageQuotaExceeded");
 const e=uploadError({status:403},quota,"screenshot");
 assert.equal(e.httpCode,403);
 assert.match(e.message,/HTTP 403; storageQuotaExceeded/);
 assert.doesNotMatch(e.message,/private folder/);
 assert.equal(safeDriveReason({error:{errors:[{reason:"private-folder-name"}]}}),"");
 const unknown=uploadError({status:403},{error:{message:"secret",errors:[{reason:"secret"}]}},"conversation");
 assert.doesNotMatch(unknown.message,/secret/);
 assert.match(unknown.message,/HTTP 403/);
 assert.equal(safeDriveReason({error:{details:[{reason:"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}),"ACCESS_TOKEN_SCOPE_INSUFFICIENT");
});
test("Owner Social release checks the same OAuth preview tag for URL, revision and canary",()=>{
 const script=fs.readFileSync(path.resolve(__dirname,"../deploy-social-oauth-guarded.sh"),"utf8");
 assert.doesNotMatch(script,/social-edit-preview/);
 assert.ok((script.match(/social-oauth-preview/g)||[]).length>=4);
 assert.match(script,/GARAMAAL_SOCIAL_OAUTH_CONFIRM/);
 assert.match(script,/SOCIAL_PRODUCTION_UNCHANGED/);
 assert.doesNotMatch(script,/gcloud run deploy "\$JOBS"/);
 assert.doesNotMatch(script,/gcloud run services update-traffic "\$JOBS"/);
});
test("TXT save retains Drive reason without leaking Google response message",()=>{
 const store=fs.readFileSync(path.resolve(__dirname,"../social_store.js"),"utf8");
 assert.match(store,/safeDriveReason\(data\)/);
 assert.match(store,/Could not save TXT to candidate Drive folder/);
 assert.match(store,/if\(!data\.id\)throw bad/);
 assert.doesNotMatch(store,/console\.log\(data/);
});
