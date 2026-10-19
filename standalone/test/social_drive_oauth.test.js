"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
// The parity job intentionally runs without npm dependencies. Extract the
// Social-only identity helper without importing Express or any Cloud SDK.
const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
const start=server.indexOf("async function delegatedDriveToken(");
const end=server.indexOf("async function authenticate(",start);
assert.ok(start>0&&end>start,"delegated OAuth helper must precede authenticate");
const delegatedDriveToken=vm.runInNewContext(
  'const bad=(message,httpCode)=>Object.assign(new Error(message),{httpCode});\\n'+
  server.slice(start,end)+'\\ndelegatedDriveToken',
  {fetch:async()=>({ok:false,status:503}),AbortSignal,Error}
);

const owner="abhisheknair607@gmail.com";
const token="valid-google-oauth-test-token-123";
const mock=async(url,options)=>({
  ok:true,
  status:200,
  json:async()=>({email:owner,email_verified:true})
});
test("Social Drive OAuth accepts only verified owner token bound to same Firebase session",async()=>{
  assert.equal(await delegatedDriveToken({driveAccessToken:token},owner,mock),token);
  await assert.rejects(delegatedDriveToken({driveAccessToken:token},"other@example.com",mock),/approved Google account/);
  await assert.rejects(delegatedDriveToken({},owner,mock),/Connect the approved Google Drive account/);
  await assert.rejects(delegatedDriveToken({driveAccessToken:token},owner,async()=>({
    ok:true,status:200,json:async()=>({email:"another@example.com",email_verified:true})
  })),/different account/);
  await assert.rejects(delegatedDriveToken({driveAccessToken:token},owner,async()=>({
    ok:true,status:200,json:async()=>({email:owner,email_verified:false})
  })),/different account/);
  await assert.rejects(delegatedDriveToken({driveAccessToken:token},owner,async()=>({
    ok:false,status:401,json:async()=>({})
  })),/expired or was denied/);
});
test("OAuth tokens never modify the shared Jobs bridge and Social remains an isolated service",()=>{
  const social=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
  const bridge=fs.readFileSync(path.resolve(__dirname,"../bridge.js"),"utf8");
  const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
  const html=fs.readFileSync(path.resolve(__dirname,"../../webapp/Index.html"),"utf8");
  assert.match(social,/reauthenticateWithPopup/);
  assert.match(social,/provider.addScope\("https:\/\/www.googleapis.com\/auth\/drive"\)/);
  assert.match(social,/async function socialDriveToken/);
  assert.match(social,/NEW_.*USED_/s);
  assert.match(server,/delegatedDriveToken\(payload,sessionEmail\)/);
  assert.match(server,/token:driveAccess/);
  assert.match(server,/driveToken:driveAccess/);
  assert.match(bridge,/function requestSpecial/);
  assert.ok(!bridge.includes("socialDriveToken"));
  assert.ok(!html.includes("socialDriveToken"));
  const js=social.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(js);
  assert.doesNotThrow(()=>new vm.Script(js));
});
test("Only Social upload routes consume delegated OAuth tokens and make no Jobs requests",()=>{
  const s=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
  assert.match(s,/\["inbox\/save","inbox\/image","conversations\/save"\]/);
  assert.match(s,/action==="import"/);
  assert.match(s,/Boolean\(payload.sourceFileId\)/);
  assert.doesNotMatch(s,/require\("\.\/runtime"\)/);
  assert.doesNotMatch(s,/app.post\("\/api\/:method"/);
  assert.doesNotMatch(s,/runCvApiNow/);
});
