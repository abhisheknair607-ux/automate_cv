"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const store=fs.readFileSync(path.resolve(__dirname,"../social_store.js"),"utf8");
const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
test("partial import never marks a source USED without explicit whole-source confirmation",()=>{
 assert.match(store,/sourceComplete=false/);
 assert.match(store,/if\(sourceFileId&&sourceComplete===true\)/);
 assert.doesNotMatch(store,/if\(sourceFileId\)\{try\{await markUsed/);
 assert.match(store,/if\(!allSaved\)throw bad/);
 assert.match(store,/await markUsed\(\{token:driveAccess,candidate,fileId:sourceFileId,verifiedCount:rows.length,confirm:true\}\)/);
});
test("UI gives manual reviewer an unchecked whole-source approval and retains NEW for partial processing",()=>{
 assert.match(html,/id="importSourceComplete" type="checkbox"/);
 assert.match(html,/no unresolved entries/);
 assert.match(html,/const sourceComplete=Boolean\(source&&document\.getElementById\("importSourceComplete"\)\?\.checked\)/);
 assert.match(html,/sourceFileId:source,sourceComplete,driveAccessToken/);
 assert.match(html,/Source remains NEW until full review/);
 assert.match(html,/completed\.checked=false/);
});
test("only isolated Social API forwards explicit sourceComplete; Jobs unchanged",()=>{
 assert.match(server,/sourceComplete:payload\.sourceComplete===true/);
 assert.doesNotMatch(server,/require\("\.\/runtime"\)/);
 assert.doesNotMatch(server,/app.post\("\/api\/:method"/);
});
