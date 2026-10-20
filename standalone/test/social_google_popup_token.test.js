"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const start=html.indexOf("async function socialDriveToken(){");
const end=html.indexOf("function norm(s)",start);
assert.ok(start>0&&end>start,"Isolated Social OAuth function must exist");
function harness({credential,extracted,chosenEmail="abhisheknair607@gmail.com",chosenUid="uid123",popupError}={}){
 const log={scopes:[],params:[],popups:0};
 const original={email:"abhisheknair607@gmail.com",uid:"uid123"};
 const signedIn={email:chosenEmail,uid:chosenUid};
 class GoogleAuthProvider {
  addScope(scope){log.scopes.push(scope)}
  setCustomParameters(params){log.params.push(params)}
  static credentialFromResult(){return extracted||null}
 }
 const instance={currentUser:original,signInWithPopup:async()=>{
  log.popups++;
  if(popupError)throw popupError;
  instance.currentUser=signedIn;
  return {user:signedIn,...(credential===undefined?{}:{credential})};
 }};
 const auth=()=>instance;
 auth.GoogleAuthProvider=GoogleAuthProvider;
 const firebase={apps:[{}],auth};
 const run=vm.runInNewContext(html.slice(start,end)+"\nsocialDriveToken",{
  window:{firebase},Error
 });
 return {run,log,instance};
}
test("Social Google popup obtains provider access token from compat result.credential",async()=>{
 const h=harness({credential:{accessToken:"TEST_GOOGLE_ACCESS_TOKEN"}});
 assert.equal(await h.run(),"TEST_GOOGLE_ACCESS_TOKEN");
 assert.equal(h.log.popups,1);
 assert.deepEqual(h.log.scopes,["https://www.googleapis.com/auth/drive"]);
 assert.equal(h.log.params[0].login_hint,"abhisheknair607@gmail.com");
 assert.equal(h.log.params[0].prompt,"consent select_account");
});
test("Social popup can use credentialFromResult as fallback",async()=>{
 const h=harness({credential:null,extracted:{accessToken:"fallback-token"}});
 assert.equal(await h.run(),"fallback-token");
});
test("Social popup refuses missing OAuth credential, unexpected Google owner or changed user",async()=>{
 await assert.rejects(harness({credential:null}).run(),/without a Drive access token/);
 await assert.rejects(harness({credential:{accessToken:"fake"},chosenEmail:"outsider@example.org"}).run(),/account mismatch/);
 await assert.rejects(harness({credential:{accessToken:"fake"},chosenUid:"different-uid"}).run(),/account mismatch/);
});
test("Social popup exposes safe error code, not raw provider error",async()=>{
 const h=harness({popupError:{code:"auth/popup-closed-by-user",message:"private token abc123"}});
 await assert.rejects(h.run(),/auth\/popup-closed-by-user/);
 await assert.rejects(h.run(),error=>!String(error.message).includes("private token"));
});
test("OAuth changes do not touch Jobs or any shared bridge source",()=>{
 const bridge=fs.readFileSync(path.resolve(__dirname,"../bridge.js"),"utf8");
 const jobs=fs.readFileSync(path.resolve(__dirname,"../../webapp/Index.html"),"utf8");
 const deploy=fs.readFileSync(path.resolve(__dirname,"../deploy-social-oauth-guarded.sh"),"utf8");
 assert.doesNotMatch(bridge,/socialDriveToken|TEST_GOOGLE_ACCESS_TOKEN/);
 assert.doesNotMatch(jobs,/socialDriveToken|TEST_GOOGLE_ACCESS_TOKEN/);
 assert.match(deploy,/auth\.signInWithPopup\(provider\)/);
 assert.doesNotMatch(deploy,/reauthenticateWithPopup/);
 assert.doesNotMatch(deploy,/gcloud run deploy "\$JOBS"/);
});
