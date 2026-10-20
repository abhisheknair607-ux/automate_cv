"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const review=require("../social_review");
const socialStore=require("../social_store");
function model(){
 const rows=[review.HEAD.slice()],writes=[];
 const fetcher=async(url,opts={})=>{
  const x=decodeURIComponent(String(url));const method=opts.method||"GET";
  const ok=(json={})=>({ok:true,status:200,json:async()=>json});
  if(x.includes("fields=sheets"))return ok({sheets:[{properties:{title:review.TAB}}]});
  if(method==="GET")return ok({values:x.includes("A1:T1")?[rows[0]]:rows});
  if(method==="POST"&&x.includes(":append")){
   const data=JSON.parse(opts.body).values;rows.push(...data.map(r=>r.slice()));writes.push({type:"append",data});return ok({});
  }
  if(method==="PUT"&&x.includes("A1:T1")){rows[0]=JSON.parse(opts.body).values[0];return ok({});}
  if(method==="PUT"){
   const parsed=x.match(/!A(\d+):T\d+/);assert.ok(parsed,"unexpected Sheet write: "+x);
   rows[Number(parsed[1])-1]=JSON.parse(opts.body).values[0].slice();writes.push({type:"edit",row:Number(parsed[1])});return ok({});
  }
  throw Error("Unmocked Sheet method "+method+": "+x);
 };
 return {rows,writes,fetcher};
}
function args(m){return {token:"fake",id:"example_sheet",candidate:"Abhishek",fetcher:m.fetcher};}
test("Review Sheet schema has candidate and verification stage, exact independent M:N:O draft",()=>{
 assert.equal(review.HEAD.length,20);
 assert.deepEqual(review.HEAD.slice(2,7),["Person Name","Company","Department","Designation","Location"]);
 assert.deepEqual(review.HEAD.slice(13,16),["Invitation Introduction","Invitation Middle","Invitation Closing"]);
 assert.equal(review.compose("Hi Dave","Career detail","Connect?"),"Hi Dave\n\nCareer detail\n\nConnect?");
});
test("Screenshot result stages Pending only, neither verified nor messaged",async()=>{
 const m=model();
 const result=await review.stage({...args(m),record:{name:"Dave Barry",company:"EY",department:"Transaction Tax",designation:"Partner",location:"Ireland",evidence:"Owner screenshot shows title"},confirm:true});
 assert.ok(result.id.startsWith("REV-"));
 const x=(await review.list(args(m))).items[0];
 assert.equal(x.status,"Pending");assert.deepEqual(x.purposes,[]);
 assert.equal(x.intro,"");assert.equal(x.middle,"");assert.equal(x.closing,"");
 assert.equal(x.company,"EY");assert.equal(x.designation,"Partner");
 assert.equal(m.writes.length,1);
 await assert.rejects(review.stage({...args(m),record:{name:"Dave Barry",company:"EY",evidence:"same screenshot"},confirm:true}),/already staged/);
});
test("Review must precede draft; candidate identity and stale updates fail closed",async()=>{
 const m=model();
 await review.stage({...args(m),record:{name:"Jane Doe",company:"EY",department:"Tax",designation:"Director",evidence:"screenshot"},confirm:true});
 const rec=(await review.list(args(m))).items[0];
 const record={...rec,company:"BDO",department:"Financial Services Tax",designation:"Partner",location:"Dublin",purposes:["Coffee chat","Inspired by profile"],primary:"Coffee chat"};
 await assert.rejects(review.update({...args(m),row:rec.row,reviewId:rec.id,expectedUpdated:rec.updated,record,status:"Draft Ready",confirm:true}),/Review the person's details/);
 await assert.rejects(review.update({...args(m),candidate:"Pooja",row:rec.row,reviewId:rec.id,expectedUpdated:rec.updated,record,status:"Reviewed",confirm:true}),/belongs to another candidate/);
 await assert.rejects(review.update({...args(m),row:rec.row,reviewId:rec.id,expectedUpdated:"stale",record,status:"Reviewed",confirm:true}),/changed since you opened/);
 const done=await review.update({...args(m),row:rec.row,reviewId:rec.id,expectedUpdated:rec.updated,record,status:"Reviewed",confirm:true});
 assert.equal(done.item.company,"BDO");assert.equal(done.item.designation,"Partner");assert.equal(done.item.primary,"Coffee chat");
 assert.equal(done.item.status,"Reviewed");assert.equal(m.writes.length,2);
 const draft={...record,intro:"Hi Jane,\n\nI am an ACCA member.",middle:"I saw your professional work.",closing:"Would you be open to a coffee?"};
 await assert.rejects(review.update({...args(m),row:rec.row,reviewId:rec.id,expectedUpdated:done.item.updated,record:{...draft,middle:"x".repeat(300)},status:"Draft Ready",confirm:true}),/maximum length|300-character/);
 const ok=await review.update({...args(m),row:rec.row,reviewId:rec.id,expectedUpdated:done.item.updated,record:draft,status:"Draft Ready",confirm:true});
 assert.equal(ok.item.status,"Draft Ready");
 assert.equal(ok.item.intro,draft.intro);
 assert.equal(ok.item.middle,draft.middle);
 assert.equal(ok.item.closing,draft.closing);
});
test("Promote only approved drafts, then mark imported after verifying Connections; never send LinkedIn",async()=>{
 const m=model(),prior=socialStore.list;let attempts=0;
 try{
  await review.stage({...args(m),record:{name:"Dave Barry",company:"EY",department:"Tax",designation:"Partner",evidence:"screenshot"},confirm:true});
  let c=(await review.list(args(m))).items[0];
  const updated={...c,purposes:["Just connect"],primary:"Just connect",intro:"Hi Dave",middle:"Verified note",closing:"Thanks"};
  let result=await review.update({...args(m),row:c.row,reviewId:c.id,expectedUpdated:c.updated,record:updated,status:"Reviewed",confirm:true});
  c=result.item;
  result=await review.update({...args(m),row:c.row,reviewId:c.id,expectedUpdated:c.updated,record:updated,status:"Draft Ready",confirm:true});
  c=result.item;
  socialStore.list=async()=>({items:[{name:c.name,company:c.company,sheetRow:77}]});
  const imp=await review.promote({...args(m),row:c.row,reviewId:c.id,expectedUpdated:c.updated,confirm:true,
    importContact:async p=>{attempts++;assert.equal(p.candidate,"Abhishek");assert.equal(p.items[0].introduction,c.intro);assert.equal(p.items[0].personalisedMiddle,c.middle);assert.equal(p.items[0].closing,c.closing);}});
  assert.equal(attempts,1);
  assert.equal(imp.connectionsRow,77);
  assert.equal((await review.list(args(m))).items[0].status,"Imported");
  await assert.rejects(review.promote({...args(m),row:c.row,reviewId:c.id,expectedUpdated:c.updated,confirm:true,importContact:async()=>{}}),/changed|approved/);
 }finally{socialStore.list=prior;}
});
test("Social app has a distinct Verify page, queue staging prompt and explicit approval",()=>{
 const src=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
 const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
 const docker=fs.readFileSync(path.resolve(__dirname,"../../Dockerfile.social"),"utf8");
 for(const t of ['["verify","✓","Verify"]','function verifyView(){','id="rvSaveReview"','id="rvSaveDraft"','id="rvApproveSwipe"','id="rvCopyDraftPrompt"','function reviewDraftPrompt(){','review/promote','review/list','review/update','review/stage'])
  assert.ok(src.includes(t),"Social UI missing "+t);
 assert.match(src,/ONLY ALLOWED WRITE: append new user-approved, unverified extracted people to SocialReviewQueue A:T/);
 assert.match(src,/NEVER write directly to Connections/);
 assert.match(server,/review\.promote\(/);
 assert.match(docker,/COPY standalone\/social_review\.js/);
 assert.doesNotMatch(src,/automatically send LinkedIn invitation/i);
});
