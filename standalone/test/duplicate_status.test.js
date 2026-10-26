"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const {canonical,validate,markDuplicate}=require("../duplicate_status");

function fakeSheets({currentStatus="",company="EY",title="Tax Analyst",url="https://ie.linkedin.com/jobs/view/4499999001/",
  headerReady=true,midflightChange=false}={}){
 const calls=[];
 const fetcher=async(uri,options={})=>{
  calls.push({uri,method:options.method||"GET",body:options.body});
  const decoded=decodeURIComponent(uri);
  const data=(items,status=200)=>({ok:status===200,status,json:async()=>items});
  if(decoded.includes("A1:Q1"))return data({values:[[
   "Company Name","Designation","Link",...Array(13).fill(""),headerReady?"Duplicate Status":""
  ]]});
  if(decoded.includes("A2:Q2")){
   const cells=[company,title,url,...Array(13).fill(""),currentStatus];
   if(midflightChange && calls.filter(x=>decodeURIComponent(x.uri).includes("A2:Q2")).length>1)cells[0]="CHANGED";
   return data({values:[cells]});
  }
  if(decoded.includes("Q2")&&options.method==="PUT")return data({updatedRows:1});
  throw new Error("Unexpected Sheets endpoint: "+uri);
 };
 return {fetcher,calls};
}
const payload={row:2,status:"Dup",expected:{company:"EY",role:"Tax Analyst",
 url:"https://www.linkedin.com/comm/jobs/view/4499999001/?trk=email"}};

test("same job identity handles regional LinkedIn URLs and tracking",()=>{
 assert.equal(canonical("https://ie.linkedin.com/jobs/view/4499999001/"),
   canonical(payload.expected.url));
});
test("manual status validation rejects suspicious and unsupported changes",()=>{
 assert.throws(()=>validate({...payload,status:"Possible"}),/verified scan/);
 assert.throws(()=>validate({...payload,status:"Deleted"}),/Invalid duplicate status/);
 assert.throws(()=>validate({...payload,row:1}),/Invalid Jobs row/);
 assert.throws(()=>validate({...payload,expected:{...payload.expected,url:"not-url"}}),/verified job identity/);
});
test("mark Dup changes only the verified Q cell",async()=>{
 const f=fakeSheets();
 const result=await markDuplicate({token:"TEST",spreadsheetId:"test_sheet",payload,fetcher:f.fetcher});
 assert.deepEqual(result,{changed:true,row:2,status:"Dup"});
 const writes=f.calls.filter(x=>x.method!=="GET");
 assert.equal(writes.length,1);
 assert.equal(writes[0].method,"PUT");
 assert.match(decodeURIComponent(writes[0].uri),/Jobs'!Q2/);
 assert.match(writes[0].uri,/valueInputOption=RAW/);
 assert.deepEqual(JSON.parse(writes[0].body).values,[["Dup"]]);
 assert.doesNotMatch(writes[0].uri,/Freshmaal|A2:Q2/);
});
test("no-write if schema missing",async()=>{
 const f=fakeSheets({headerReady:false});
 await assert.rejects(markDuplicate({token:"TEST",spreadsheetId:"test_sheet",payload,fetcher:f.fetcher}),
  /not installed/);
 assert.equal(f.calls.filter(x=>x.method==="PUT").length,0);
});
test("no-write if stale company/row",async()=>{
 const f=fakeSheets({company:"DIFFERENT"});
 await assert.rejects(markDuplicate({token:"TEST",spreadsheetId:"test_sheet",payload,fetcher:f.fetcher}),
  /changed/);
 assert.equal(f.calls.filter(x=>x.method==="PUT").length,0);
});
test("no-write if concurrently changed between checks",async()=>{
 const f=fakeSheets({midflightChange:true});
 await assert.rejects(markDuplicate({token:"TEST",spreadsheetId:"test_sheet",payload,fetcher:f.fetcher}),
  /edited during update/);
 assert.equal(f.calls.filter(x=>x.method==="PUT").length,0);
});
test("idempotent when already Dup",async()=>{
 const f=fakeSheets({currentStatus:"Dup"});
 const result=await markDuplicate({token:"TEST",spreadsheetId:"test_sheet",payload,fetcher:f.fetcher});
 assert.equal(result.changed,false);
 assert.equal(f.calls.filter(x=>x.method==="PUT").length,0);
});
test("unmark and mark Not Dup supported",()=>{
 assert.equal(validate({...payload,status:""}).status,"");
 assert.equal(validate({...payload,status:"Not Dup"}).status,"Not Dup");
});
