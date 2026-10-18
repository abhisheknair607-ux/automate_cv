"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const social=require("../social_store");

test("Social workspace is selected by A/P, independent of the user's Google email",()=>{
 assert.equal(social.selectedCandidate("Abhishek"),"Abhishek");
 assert.equal(social.selectedCandidate("Pooja"),"Pooja");
 assert.equal(social.selectedCandidate("Pooja Krishna Tirupati"),"Pooja");
 assert.equal(social.canonicalCandidate("Pooja Krishna Tirupati"),"Pooja");
 assert.equal(social.canonicalCandidate("Abhishek Nair"),"Abhishek");
 assert.throws(()=>social.selectedCandidate("any third user"),/Select Abhishek or Pooja/i);
 assert.throws(()=>social.selectedCandidate(undefined),/Select Abhishek or Pooja/i);
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

test("Social standalone HTML contains one syntax-valid inline UI script, no seeded contacts",()=>{
 const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
 const markup=fs.readFileSync(path.join(__dirname,"../social.html"),"utf8");
 const inline=[...markup.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.equal(inline.length,1);
 assert.doesNotThrow(()=>new vm.Script(inline[0],{filename:"social.html"}));
 assert.ok(markup.includes('src="/bridge.js"'),"Must use existing Firebase bridge");
 assert.ok(markup.includes('id="swipeCard"'),"Swipe card missing");
 assert.ok(markup.includes("Research Inbox"),"Research fourth section missing");
 assert.ok(!markup.includes("makeSeed"),"Must not show fictional contacts in live Social");
});

test("Existing Jobs navigation and controls remain while Social links are additive",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const jobs=fs.readFileSync(path.resolve(__dirname,"../../webapp/Index.html"),"utf8");
 const server=fs.readFileSync(path.resolve(__dirname,"../server.js"),"utf8");
 for(const marker of ['id="deskNav"','id="candidateToggle"','id="expenseToggle"','id="modeBadge"','id="crumbTitle"']){
   assert.ok(jobs.includes(marker),marker+" absent from Jobs baseline");
 }
 assert.ok(server.includes("socialSideLink"),"Social desktop sidebar link not added");
 assert.ok(server.includes("socialTopLink"),"Social mobile shortcut not added");
 assert.ok(server.includes('html=html.replace(\'<nav id="deskNav"></nav>\''),"Expected additive sidebar insertion");
 assert.ok(!server.includes('href="/social" class="btn btn-xs"'),"Avoid crowding existing topbar");
});

test("A/P selector is interactive and persists the same candidate as the Jobs application",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
 const server=fs.readFileSync(path.resolve(__dirname,"../server.js"),"utf8");
 assert.match(html, /getItem\("freshmaal-candidate"\)/);
 assert.match(html, /setItem\("freshmaal-candidate",candidate\)/);
 assert.match(html, /candA"\)\.onclick=\(\)=>switchCandidate\("Abhishek"\)/);
 assert.match(html, /candP"\)\.onclick=\(\)=>switchCandidate\("Pooja"\)/);
 assert.match(html, /state\.items=\[\];state\.query="";state\.company="";/);
 assert.match(server,/await authenticate\(req\);/);
 assert.match(server,/selectedCandidate\(req\.body\?\.candidate\)/);
 assert.ok(!server.includes("socialStore.candidateFromEmail"));
});

test("Research Now uses only company, department and city in LinkedIn People keywords",()=>{
 const {researchUrl}=require("../social_research");
 const url=new URL(researchUrl({company:"EY",department:"Valuations",city:"Dublin",searchUrl:"https://www.linkedin.com/search/results/people/?filters=not-requested"}));
 assert.equal(url.hostname,"www.linkedin.com");
 assert.equal(url.pathname,"/search/results/people/");
 assert.equal(url.searchParams.get("keywords"),"EY Valuations Dublin");
 assert.equal(url.searchParams.has("filters"),false);
 const fs=require("node:fs"),path=require("node:path");
 const html=fs.readFileSync(path.join(__dirname,"../social.html"),"utf8");
 assert.ok(html.includes("function linkedInPeopleUrl("));
 assert.ok(html.includes('id="researchNow"'));
 assert.ok(!html.includes('id="targetLink"'));
});
