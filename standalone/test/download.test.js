"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {ReadableStream}=require("node:stream/web");
const fs=require("node:fs");
const path=require("node:path");
const {driveId,filename,getDocument,DOCX}=require("../download");

const id="aB9_-12345678901234567890";
const job={source:"fresh",row:8,url:"https://example.com/job",cvLink:`https://drive.google.com/file/d/${id}/view`,clLink:`https://docs.google.com/document/d/${id}/edit`};

test("only supported Google document links yield an ID",()=>{
  assert.equal(driveId(job.cvLink),id);
  assert.equal(driveId(job.clLink),id);
  assert.equal(driveId(`https://drive.google.com/open?id=${id}`),id);
  for(const link of [`https://drive.google.com.evil.test/file/d/${id}/view`,`http://drive.google.com/file/d/${id}/view`,
    `https://drive.google.com/drive/folders/${id}`,`https://example.com/d/${id}`])assert.equal(driveId(link),null);
});

test("download fetches only the candidate row's DOCX and keeps credentials server side",async()=>{
  const calls=[];
  const bytes=Buffer.from("DOCX test bytes");
  const lookup=async(candidate,row)=>{assert.equal(candidate,"Pooja");assert.equal(row,8);return job;};
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.includes("fields="))return {ok:true,json:async()=>({id,name:"Pooja CV.docx",mimeType:DOCX,size:bytes.length,trashed:false})};
    return {ok:true,body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
  };
  const result=await getDocument({candidate:"Pooja",row:8,kind:"cv",token:"private-token",lookup,fetchImpl});
  assert.equal(result.name,"Pooja CV.docx");
  assert.equal(result.size,bytes.length);
  assert.equal(calls.length,2);
  assert.ok(calls.every(call=>call.url.startsWith("https://www.googleapis.com/drive/v3/files/"+id)));
  assert.ok(calls.every(call=>call.options.headers.Authorization==="Bearer private-token"));
});

test("invalid requests and mismatched rows stop before Drive is called",async()=>{
  let reads=0;
  const fetchImpl=async()=>{reads++;throw Error("should not fetch");};
  for(const request of [{candidate:"Unknown",row:8,kind:"cv"},{candidate:"Pooja",row:2,kind:"cv"},{candidate:"Pooja",row:8,kind:"pdf"}])
    await assert.rejects(getDocument({...request,token:"t",lookup:async()=>job,fetchImpl}),/Invalid document request/);
  await assert.rejects(getDocument({candidate:"Pooja",row:9,kind:"cv",token:"t",lookup:async()=>job,fetchImpl}),/Application not found/);
  await assert.rejects(getDocument({candidate:"Pooja",row:8,kind:"cl",token:"t",lookup:async()=>({...job,clLink:""}),fetchImpl}),/unavailable/);
  assert.equal(reads,0);
});

test("rejects non-DOCX metadata and sanitizes attachment names",async()=>{
  assert.equal(filename("../evil\r\n.docx","cv"),"_evil__.docx");
  assert.equal(filename("untrusted.pdf","cl"),"CL.docx");
  await assert.rejects(getDocument({candidate:"Pooja",row:8,kind:"cv",token:"t",lookup:async()=>job,
    fetchImpl:async()=>({ok:true,json:async()=>({id,name:"bad.docx",mimeType:"text/html"})})}),/not a DOCX/);
});

test("dashboard downloads use the authenticated same-origin bridge",()=>{
  const root=path.resolve(__dirname,"../..");
  const ui=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
  const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
  assert.ok(ui.includes("__cvStandalone.downloadDocument(state.candidate,row,kind)"));
  assert.ok(!ui.includes("drive.google.com/uc?export=download"));
  assert.match(bridge,/fetch\("\/api\/download"/);
  assert.match(bridge,/anchor\.download=name/);
});
