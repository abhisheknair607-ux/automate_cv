"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const social=require("../social_store");

test("Social identity is tied to verified email mapping, never selected by client",()=>{
 const env={SOCIAL_ABHISHEK_EMAIL:"alpha@example.test",SOCIAL_POOJA_EMAIL:"beta@example.test"};
 assert.equal(social.candidateFromEmail("ALPHA@example.test",env),"Abhishek");
 assert.equal(social.candidateFromEmail("beta@example.test",env),"Pooja");
 assert.throws(()=>social.candidateFromEmail("third@example.test",env),/not authorised/i);
 assert.throws(()=>social.candidateFromEmail("alpha@example.test",{}),/not configured/i);
 assert.equal(social.canonicalCandidate("Pooja Krishna Tirupati"),"Pooja");
 assert.equal(social.canonicalCandidate("Abhishek Nair"),"Abhishek");
});
test("URL-only LinkedIn searches are never labelled verified profiles",()=>{
 assert.equal(social.validProfile("https://www.linkedin.com/company/ey"),"");
 assert.equal(social.validProfile("https://www.linkedin.com/search/results/people/?keywords=EY"),"");
 assert.equal(social.validProfile("https://example.com/in/jane"),"");
 assert.equal(social.validProfile("https://ie.linkedin.com/in/jane-doe"),"https://www.linkedin.com/in/jane-doe");
});
test("Candidate identity and conservative contact deduplication",()=>{
 const entries=[
 {company:"EY",name:"Sample Person",profile:"",candidate:"Abhishek"},
 {company:"EY",name:"Sample Person",profile:"",candidate:"Abhishek",message:"Tailored message"},
 {company:"EY",name:"Sample Person",profile:"",candidate:"Pooja"},
 {company:"Davy",name:"Sample Person",profile:"",candidate:"Abhishek"}
 ];
 const a=social.uniqueContacts(entries,"Abhishek");
 assert.equal(a.length,2);
 assert.equal(a.find(x=>x.company==="EY").message,"Tailored message");
 assert.equal(social.uniqueContacts(entries,"Pooja").length,1);
});
function fakeSheets(){
 let rows=[social.CONTACT_HEADERS],tracking=[],hasTracking=false,writes=[];
 const mock=async(raw,options={})=>{
  const url=decodeURIComponent(String(raw)),method=options.method||"GET",body=options.body?JSON.parse(options.body):{};
  const ok=data=>({ok:true,status:200,json:async()=>data});
  const fail=status=>({ok:false,status,json:async()=>({error:{code:status}})});
  writes.push({url,method});
  if(url.includes("fields=sheets(properties(title))"))return ok({sheets:[{properties:{title:"Connections"}},...(hasTracking?[{properties:{title:"SocialTracking"}}]:[])]});
  if(url.includes(":batchUpdate")){hasTracking=true;return ok({replies:[{}]})}
  if(url.includes("/values/")&&url.includes("Connections")){
   if(method==="GET")return ok({values:rows});
   if(method==="POST"){rows.push(...body.values);return ok({updates:{updatedRows:body.values.length}})}
  }
  if(url.includes("/values/")&&url.includes("SocialTracking")){
   if(!hasTracking)return fail(400);
   if(method==="GET")return ok({values:tracking});
   if(method==="PUT"&&url.includes("A1:K1")){tracking=[...body.values];return ok({})}
   if(method==="POST"){tracking.push(...body.values);return ok({})}
   if(method==="PUT"){const ix=Number(url.match(/!A(\d+)/)?.[1])-1;tracking[ix]=body.values[0];return ok({})}
  }
  return fail(404);
 };
 return {mock,rows:()=>rows,tracking:()=>tracking,writes};
}
test("Verified import writes to Connections and a separate SocialTracking tab without modifying Jobs sheet",async()=>{
 const original=global.fetch,db=fakeSheets();global.fetch=db.mock;
 try{
  const res=await social.importContacts({token:"test",driveAccess:"test",id:"testsheet",
   candidate:"Pooja",confirm:true,items:[{name:"Demo Person",company:"EY",title:"Valuations Manager",department:"Valuations",
    profile:"https://linkedin.com/in/demo-person",profileVerified:false,message:"Hi Demo"}]});
  assert.equal(res.saved,1);
  assert.equal(res.verified,true);
  assert.equal(db.rows().length,2);
  assert.equal(db.rows()[1][5],"Pooja Krishna Tirupati");
  assert.equal(db.rows()[1][2],"","Unverified profile must remain blank");
  assert.equal(db.tracking()[1][7],"Valuations");
  assert.equal(db.tracking()[1][2],"identified");
  const again=await social.importContacts({token:"test",id:"testsheet",candidate:"Pooja",confirm:true,
    items:[{name:"Demo Person",company:"EY",title:"Valuations Manager"}]});
  assert.equal(again.saved,0);
  assert.ok(db.writes.every(x=>!x.url.includes("Sheet1")&&!x.url.includes("Jobs")));
 }finally{global.fetch=original}
});
test("Import and status changes require explicit confirmation",async()=>{
 await assert.rejects(social.importContacts({candidate:"Abhishek",items:[{}],confirm:false}),/Approve/i);
 await assert.rejects(social.writeStatus({candidate:"Abhishek",confirm:false,key:"a".repeat(24),status:"sent"}),/Confirm/i);
});
