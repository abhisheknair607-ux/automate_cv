"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {colLetters,toSheetValue,createSpreadsheetApp,Range}=require("../sheets");
const {invoke,METHODS,READ_ONLY_METHODS,sourceWithSheetIds}=require("../runtime");

const root=path.resolve(__dirname,"../..");
const source=fs.readFileSync(path.join(root,"webapp/Code.gs"),"utf8");
const originalHTML=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");

test("legacy source unchanged and all exposed operations wrapped",()=>{
  const names=[...source.matchAll(/^function\s+([a-zA-Z_][a-zA-Z_0-9]*)\(/gm)].map(x=>x[1]);
  const operations=["getBootstrap","listJobs","getJob","setNotInterested","addDiscovery",
    "saveDiscovery","transferJob","bulkTransfer","updateFreshJD","getCopyPrompt",
    "setJobPreference","bulkSetJobPreferences","migrateJobPreferences","updateFreshControl","updateApplicationProgress","getStats","getExpenses","runCvApiNow","syncDiscoveryMaster"];
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
  assert.match(originalHTML,/Copy post-CV prompt/);
  assert.match(originalHTML,/data-action="category"/);
  const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
  new vm.Script(bridge);
  assert.match(bridge,/google\.script\.run=chain/);
  assert.match(bridge,/Persistence\.LOCAL/);
  assert.match(bridge,/prompt:"select_account"/);
  assert.match(bridge,/cv-account-switch/);
  assert.match(bridge,/not authorised for Garamaal/);
  const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
  assert.match(server,/"<script src=\\"\/bridge\.js\\"><\/script>\\n<script>\\n'use strict';"/);
});

test("Firebase Sheets Range supports getDisplayValue for candidate application status",()=>{
  const sample=[["Application Status · Abhishek","Application Status · Pooja"],["", "Applied + Connected"]];
  const sheet={
    getMaxRows:()=>2,
    getMaxColumns:()=>2,
    grid:()=>sample,
  };
  const cell=new Range(sheet,2,2);
  assert.equal(cell.getDisplayValue(),"Applied + Connected");
  assert.deepEqual(cell.getDisplayValues(),[["Applied + Connected"]]);
  assert.equal(new Range(sheet,2,1).getDisplayValue(),"");
  assert.deepEqual(new Range(sheet,2,1,1,2).getDisplayValues(),[["","Applied + Connected"]]);
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


test("deployment binds spreadsheet IDs to copies without modifying the Apps Script source",()=>{
  const staging={
    taaza:"STAGING_TEST_TAAZA_FAKE_ID_DO_NOT_USE_001",
    fresh:"STAGING_TEST_FRESH_FAKE_ID_DO_NOT_USE_002"
  };
  const bound=sourceWithSheetIds(staging);
  assert.match(bound,/taazaId: 'STAGING_TEST_TAAZA_FAKE_ID_DO_NOT_USE_001'/);
  assert.match(bound,/freshId: 'STAGING_TEST_FRESH_FAKE_ID_DO_NOT_USE_002'/);
  assert.doesNotMatch(bound,/taazaId: '1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY'/);
  assert.doesNotMatch(bound,/freshId: '1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc'/);
  assert.match(source,/taazaId: '1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY'/);
  assert.match(source,/freshId: '1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc'/);
  new vm.Script(bound);
  assert.throws(()=>sourceWithSheetIds({taaza:"bad",fresh:staging.fresh}),/spreadsheet IDs/);
  const guard=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
  assert.match(guard,/APP_ALLOW_PRODUCTION_WRITES/);
  assert.match(guard,/Production spreadsheet writes are locked/);
  assert.match(guard,/ALLOW_MANUAL_CV_DISPATCH/);
  const enable=fs.readFileSync(path.join(root,"standalone/enable-run-cv-now.sh"),"utf8");
  assert.match(enable,/--update-secrets/);
  assert.match(enable,/GITHUB_WORKFLOW_TOKEN/);
  assert.match(enable,/roles\/secretmanager\.secretAccessor/);
  assert.match(enable,/ALLOW_MANUAL_CV_DISPATCH=true/);
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
    "setJobPreference","bulkSetJobPreferences","migrateJobPreferences",
    "syncDiscoveryMaster"]) {
    assert.equal(READ_ONLY_METHODS.has(name),false,name+" must not be callable in pilot");
    await assert.rejects(invoke(name,{},options),/Read-only pilot/);
  }
  for(const name of ["getBootstrap","listJobs","getJob","getStats","getExpenses","getCopyPrompt"])
    assert.equal(READ_ONLY_METHODS.has(name),true,name+" must remain readable");
  const deployment=fs.readFileSync(path.join(root,"standalone/deploy.sh"),"utf8");
  assert.match(deployment,/APP_READ_ONLY: "true"/);
  assert.match(deployment,/--min-instances=0/);
  assert.match(deployment,/--max-instances=1/);
});
