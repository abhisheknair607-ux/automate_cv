"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");

const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
const start=server.indexOf("async function publicFirebaseConfig(");
const end=server.indexOf('app.get("/config"',start);
assert.ok(start>0&&end>start,"Social-only /config helper must exist");
const publicFirebaseConfig=vm.runInNewContext(
 'const project="abhishek-cv-automation";'+
 'const bad=(message,httpCode)=>Object.assign(new Error(message),{httpCode});'+
 server.slice(start,end)+"\npublicFirebaseConfig",
 {fetch:async()=>({ok:false}),AbortSignal,Error}
);
const good={
 apiKey:"public-web-api-key",authDomain:"abhishek-cv-automation.firebaseapp.com",
 projectId:"abhishek-cv-automation",appId:"1:123:web:abcd"
};
const mock=obj=>async(url,opts)=>{
 assert.equal(url,"https://garamaal.web.app/config","Read public config only; no Jobs API calls");
 assert.equal(opts.headers.Accept,"application/json");
 return {ok:true,status:200,json:async()=>obj};
};
test("Social preview serves only public Firebase browser config from existing Hosting URL",async()=>{
 const actual=await publicFirebaseConfig(mock({...good,readOnly:false,allowedEmails:["private@example.org"],secret:"secret"}));
 assert.equal(JSON.stringify(actual),JSON.stringify(good));
 assert.equal(actual.secret,undefined);
 assert.equal(actual.readOnly,undefined);
 assert.equal(actual.allowedEmails,undefined);
});
test("Social preview rejects unrelated Firebase projects, missing keys, bad domains",async()=>{
 await assert.rejects(publicFirebaseConfig(mock({...good,projectId:"other-project"})),/mismatched/);
 await assert.rejects(publicFirebaseConfig(mock({...good,apiKey:""})),/incomplete/);
 await assert.rejects(publicFirebaseConfig(mock({...good,authDomain:"https://evil.test/"})),/mismatched/);
 await assert.rejects(publicFirebaseConfig(async()=>({ok:false,status:500})),/unavailable/);
});
test("Social Firebase config route and release checks cannot mutate Jobs",()=>{
 const deploy=fs.readFileSync(path.resolve(__dirname,"../deploy-social-oauth-guarded.sh"),"utf8");
 assert.match(server,/app.get\("\/config"/);
 assert.match(deploy,/SOCIAL_AUTH_CONFIG_OK/);
 assert.match(deploy,/ISOLATION_OK: Jobs untouched/);
 assert.doesNotMatch(server,/app.post\("\/api\/:method"/);
 assert.doesNotMatch(deploy,/gcloud run deploy "\$JOBS"/);
});
