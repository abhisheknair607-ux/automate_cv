"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {colLetters,toSheetValue,createSpreadsheetApp}=require("../sheets");
const {invoke,METHODS,READ_ONLY_METHODS}=require("../runtime");

const root=path.resolve(__dirname,"../..");
const source=fs.readFileSync(path.join(root,"webapp/Code.gs"),"utf8");
const originalHTML=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");

test("legacy source unchanged and all exposed operations wrapped",()=>{
  const names=[...source.matchAll(/^function\s+([a-zA-Z_][a-zA-Z_0-9]*)\(/gm)].map(x=>x[1]);
  const operations=["getBootstrap","listJobs","getJob","setNotInterested","addDiscovery",
    "saveDiscovery","transferJob","bulkTransfer","updateFreshJD","getCopyPrompt",
    "updateFreshControl","getStats","runCvApiNow","syncDiscoveryMaster"];
  assert.deepEqual([...METHODS].sort(),operations.sort());
  for(const name of METHODS)assert.ok(names.includes(name),name+" missing");
  // The migration must not fork candidate-specific sheet mappings or logic.
  assert.match(source,/Abhishek:\s*\{cv:8/);
  assert.match(source,/Pooja:\s*\{cv:5/);
  assert.match(source,/function taazaJobTabs_/);
  assert.match(source,/function setNotInterested/);
  assert.match(source,/function getCopyPrompt/);
  assert.match(source,/function runCvApiNow/);
});

test("original dashboard remains syntactically valid and transport is injectable",()=>{
  const embedded=originalHTML.match(/<script>([\s\S]+?)<\/script>/);
  assert.ok(embedded,"Missing original browser code");
  new vm.Script(embedded[1],{filename:"webapp/Index.html"});
  new vm.Script(source,{filename:"webapp/Code.gs"});
  assert.match(originalHTML,/function call\(name,arg\)/);
  assert.match(originalHTML,/window\.google && google\.script && google\.script\.run/);
  assert.match(originalHTML,/Unapplied · CV ready/);
  assert.match(originalHTML,/Download CV/);
  assert.match(originalHTML,/Copy Prompt/);
  assert.match(originalHTML,/data-action="category"/);
  const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
  new vm.Script(bridge);
  assert.match(bridge,/google\.script\.run=chain/);
  assert.match(bridge,/Persistence\.LOCAL/);
  assert.match(bridge,/prompt:"select_account"/);
  const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
  assert.match(server,/"<script src=\\"\/bridge\.js\\"><\/script>\\n<script>\\n'use strict';"/);
});

test("Google Sheets compatibility uses standard column addresses and typed cells",()=>{
  assert.equal(colLetters(1),"A");
  assert.equal(colLetters(26),"Z");
  assert.equal(colLetters(27),"AA");
  assert.equal(colLetters(47),"AU");
  assert.equal(colLetters(702),"ZZ");
  assert.equal(toSheetValue(false),false);
  assert.equal(toSheetValue(0),0);
  assert.equal(toSheetValue(new Date("2026-10-14T00:00:00Z")),"2026-10-14T00:00:00.000Z");
  const app=createSpreadsheetApp("test-token",{taaza:"onlyTaaza",fresh:"onlyFresh"});
  assert.throws(()=>app.openById("unrecognised-sheet"),/not permitted/i);
  assert.equal(app.newDataValidation().requireValueInList(["CV","Applied"],true)
    .setAllowInvalid(false).build().strict,true);
});

test("API operation allowlist rejects unexpected methods before touching Google",async()=>{
  await assert.rejects(invoke("runArbitraryScript",{},{}),/Unknown application operation/);
  await assert.rejects(invoke("deleteRow",{},{}),/Unknown application operation/);
  assert.equal(METHODS.has("authorise_"),false);
  assert.equal(METHODS.has("lockRun_"),false);
});

test("Cloud Run image uses zero-extra-background-process deployment",()=>{
  const docker=fs.readFileSync(path.join(root,"Dockerfile.standalone"),"utf8");
  assert.match(docker,/USER node/);
  assert.match(docker,/CMD \["node","standalone\/server.js"\]/);
  const pkg=require("../../package.json");
  assert.ok(pkg.dependencies["firebase-admin"]);
  assert.ok(pkg.dependencies["google-auth-library"]);
  assert.ok(pkg.dependencies.express);
});


test("pilot prevents all mutations including paid GitHub dispatch",async()=>{
  const options={readOnly:true};
  for(const name of ["setNotInterested","addDiscovery","saveDiscovery","transferJob",
    "bulkTransfer","updateFreshJD","updateFreshControl","runCvApiNow",
    "syncDiscoveryMaster"]) {
    assert.equal(READ_ONLY_METHODS.has(name),false,name+" must not be callable in pilot");
    await assert.rejects(invoke(name,{},options),/Read-only pilot/);
  }
  for(const name of ["getBootstrap","listJobs","getJob","getStats","getCopyPrompt"])
    assert.equal(READ_ONLY_METHODS.has(name),true,name+" must remain readable");
  const deployment=fs.readFileSync(path.join(root,"standalone/deploy.sh"),"utf8");
  assert.match(deployment,/APP_READ_ONLY: "true"/);
  assert.match(deployment,/--min-instances=0/);
  assert.match(deployment,/--max-instances=1/);
});
