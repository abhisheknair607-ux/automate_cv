"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {folderId,amount,tokenUsageForJob}=require("../cost_usage");

const folder="1ABCDE12345ABCDEFGHIJKLMNOP";
const file="1ZYXWVUTabcdefghijklmnopqr";
const candidate="Abhishek",row=7;
const job={source:"fresh",row,url:"https://example.org/jobs/7",
  folder:"https://drive.google.com/drive/folders/"+folder,
  applicationId:"ABH-R7-f6dc6ca1",costUsd:0.7543};
const usage={candidate:"abhishek",application_id:job.applicationId,cumulative_cost_usd:0.75434,
  latest_stage_usage:{stage1:{model:"gpt-6-luna",cost:0.0012},stage3:{model:"gpt-5.6",cost:0.50}}};
const mockedFetch=({value=usage,missing=false,wrongFolder=false}={})=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(String(url).includes("?alt=media"))return {ok:true,json:async()=>value};
    const expected=[file];
    return {ok:true,json:async()=>({files:missing?[]:expected.map(id=>({id,name:"Token_Usage.json",trashed:false,
      parents:[wrongFolder?"anotherfolder":folder],size:"2000",mimeType:"application/json"}))})};
  };
  return {calls,fetchImpl};
};
test("Only a candidate's recorded Drive folder can identify usage data",()=>{
  assert.equal(folderId(job.folder),folder);
  assert.equal(folderId("https://drive.google.com/drive/folders/"+folder+"?usp=sharing"),folder);
  assert.equal(folderId("https://evil.example/folders/"+folder),null);
  assert.equal(folderId("https://drive.google.com/file/d/"+folder+"/view"),null);
  assert.equal(amount(""),null);
  assert.equal(amount("nan"),null);
  assert.equal(amount("0.9876"),0.9876);
  assert.equal(amount(-7),null);
});
test("On-demand proof verifies candidate, application and rounded Sheet cost",async()=>{
  const mock=mockedFetch();
  const data=await tokenUsageForJob({candidate,row,token:"secret",lookup:async()=>job,fetchImpl:mock.fetchImpl});
  assert.equal(data.verified,true);
  assert.equal(data.usageUsd,0.75434);
  assert.equal(data.recordedUsd,0.7543);
  assert.equal(data.url,"https://drive.google.com/file/d/"+file+"/view");
  assert.equal(data.stages.length,2);
  assert.equal(mock.calls.length,2);
  assert.ok(mock.calls[0].url.includes(encodeURIComponent(folder)));
  assert.ok(mock.calls.every(x=>x.options.headers.Authorization==="Bearer secret"));
});
test("Missing/mismatched usage never claims provider-invoice accuracy",async()=>{
  const badIdentity=mockedFetch({value:{...usage,candidate:"pooja"}});
  assert.equal((await tokenUsageForJob({candidate,row,token:"t",lookup:async()=>job,fetchImpl:badIdentity.fetchImpl})).verified,false);
  const badValue=mockedFetch({value:{...usage,cumulative_cost_usd:4.0}});
  assert.equal((await tokenUsageForJob({candidate,row,token:"t",lookup:async()=>job,fetchImpl:badValue.fetchImpl})).verified,false);
  const noFile=mockedFetch({missing:true});
  const result=await tokenUsageForJob({candidate,row,token:"t",lookup:async()=>job,fetchImpl:noFile.fetchImpl});
  assert.equal(result.found,false);
  assert.equal(noFile.calls.length,1);
  const other=mockedFetch({wrongFolder:true});
  assert.equal((await tokenUsageForJob({candidate,row,token:"t",lookup:async()=>job,fetchImpl:other.fetchImpl})).found,false);
  await assert.rejects(tokenUsageForJob({candidate:"Stranger",row,token:"t",lookup:async()=>job,fetchImpl:noFile.fetchImpl}),/Invalid usage request/);
  await assert.rejects(tokenUsageForJob({candidate,row:9,token:"t",lookup:async()=>job,fetchImpl:noFile.fetchImpl}),/Application not found/);
});
test("Cost UI and backend use existing Freshmaal costs with no automatic Drive polling",()=>{
  const root=path.resolve(__dirname,"../..");
  const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
  const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
  const backend=fs.readFileSync(path.join(root,"webapp/Code.gs"),"utf8");
  const html=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
  assert.match(server,/app.post\("\/api\/usage"/);
  assert.match(bridge,/async function loadTokenUsage\(/);
  assert.match(backend,/Abhishek: \{cv:8[\s\S]*cost:21/);
  assert.match(backend,/Pooja: \{cv:5[\s\S]*cost:31/);
  assert.match(html,/id="expenseToggle"/);
  assert.match(html,/function showExpenses\(/);
  assert.match(html,/function showCostSource\(/);
  assert.match(html,/data-action="cost-source"/);
  assert.match(html,/usdCost\(job.costUsd\)/);
  new vm.Script(backend);
  new vm.Script(html.match(/<script>([\s\S]+?)<\/script>/)[1]);
});
