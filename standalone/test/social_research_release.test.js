"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const research=require("../social_research");
const social=require("../social_store");

test("Research Now generates a LinkedIn People keyword search, never user-supplied filters",()=>{
 const url=new URL(research.researchUrl({company:"EY",department:"Valuations",city:"Dublin",
   searchUrl:"https://www.linkedin.com/search/results/people/?facetCurrentCompany=999"}));
 assert.equal(url.hostname,"www.linkedin.com");
 assert.equal(url.pathname,"/search/results/people/");
 assert.equal(url.searchParams.get("keywords"),"EY Valuations Dublin");
 assert.equal(url.searchParams.size,1);
});
test("A/P templates are distinct with editable intro and blank evidence line",()=>{
 const a=social.defaultTemplate("Abhishek","Deals");
 const p=social.defaultTemplate("Pooja","Deals");
 assert.match(a.introduction,/ACCA/);
 assert.match(p.introduction,/CSP/);
 assert.match(p.introduction,/QFA/);
 assert.notEqual(a.introduction,p.introduction);
 assert.equal(a.custom,false);
 assert.ok(social.checkTemplateText("Hi {{first_name}}, welcome to {{company}}"));
 assert.throws(()=>social.checkTemplateText(""),/1 and 260/);
 assert.throws(()=>social.checkTemplateText("=IMPORTXML('https://example.test')"),/formula/);
});
test("Screenshot data must match allowed binary signatures",()=>{
 const fake=Buffer.alloc(150,1).toString("base64");
 assert.throws(()=>research.safeImage({imageData:fake,mimeType:"image/png"}),/bytes do not match/i);
 assert.throws(()=>research.safeImage({imageData:fake,mimeType:"image/svg+xml"}),/Only JPEG, PNG and WebP/i);
 const actual=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),Buffer.alloc(145)]).toString("base64");
 assert.equal(research.safeImage({imageData:actual,mimeType:"image/png"}).length,153);
});
test("New Research subviews preserve coffee chat and Firebase bridge without legacy campaign planner",()=>{
 const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
 const snippet=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
 assert.ok(snippet);
 assert.doesNotThrow(()=>new vm.Script(snippet));
 for(const element of ["coffeeInvite","id=\"targetCompany\"","id=\"targetDepartment\"",
 "id=\"targetCity\"","id=\"chatTranscript\"","id=\"chatScreenshot\"","function openTemplateEditor","function researchTabs","function legacyInboxView"])
  assert.ok(html.includes(element),element+" absent");
 assert.ok(!html.includes('id="targetLink"'),"Manual LinkedIn filter URL must not return");
 assert.ok(html.includes('src="/social/bridge.js"'));
});
test("The isolated Social service does not import Jobs or CV runtime",()=>{
 const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
 assert.ok(server.includes('require("./social_research")'));
 assert.ok(!server.includes('require("./runtime")'));
 assert.ok(!server.includes('require("./queue")'));
 const docker=fs.readFileSync(path.resolve(__dirname,"../../Dockerfile.social"),"utf8");
 assert.ok(docker.includes("COPY standalone/social_research.js"));
 assert.ok(!docker.includes("webapp/"));
});

test("Initial research screenshot is saved as NEW in the correct candidate Drive folder, never to Connections",async()=>{
 const previous=process.env.SOCIAL_INBOX_POOJA_FOLDER_ID;
 process.env.SOCIAL_INBOX_POOJA_FOLDER_ID="1tje5rYUj8aoYLtxCM7VDA9ym0sq5gaSc";
 const png=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),Buffer.alloc(148)]).toString("base64");
 const writes=[];
 const fakeFetch=async(url,opts)=>{
   writes.push({url:String(url),method:opts?.method,body:opts?.body});
   return {ok:true,status:200,json:async()=>({id:"image-test-123",name:"NEW_p_test.png"})};
 };
 try{
  const result=await research.saveLeadScreenshot({token:"test-only",candidate:"Pooja",
    company:"Davy",department:"Wealth Management",city:"Dublin",imageData:png,mimeType:"image/png",
    confirm:true,fetcher:fakeFetch});
  assert.equal(result.saved,true);
  assert.equal(result.pendingVerification,true);
  assert.equal(result.importedContacts,0);
  assert.equal(result.file.id,"image-test-123");
  assert.equal(writes.length,1);
  assert.match(writes[0].url,/googleapis.com\/upload\/drive\/v3\/files/);
  assert.match(writes[0].body.toString("utf8"),/NEW_p_[^\r\n]*davy_wealth-management_dublin_[a-f0-9]+\.png/);
  assert.match(writes[0].body.toString("utf8"),/1tje5rYUj8aoYLtxCM7VDA9ym0sq5gaSc/);
  assert.doesNotMatch(writes[0].url,/sheets\.googleapis\.com/);
 }finally{
   if(previous===undefined)delete process.env.SOCIAL_INBOX_POOJA_FOLDER_ID;
   else process.env.SOCIAL_INBOX_POOJA_FOLDER_ID=previous;
 }
});
test("Initial research screenshot cannot bypass consent, image validation or candidate mapping",async()=>{
 const image=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),Buffer.alloc(148)]).toString("base64");
 await assert.rejects(research.saveLeadScreenshot({candidate:"Abhishek",company:"EY",imageData:image,mimeType:"image/png",confirm:false}),/Confirm saving/);
 await assert.rejects(research.saveLeadScreenshot({candidate:"third-party",company:"EY",imageData:image,mimeType:"image/png",confirm:true}),/Choose Abhishek or Pooja/);
 await assert.rejects(research.saveLeadScreenshot({candidate:"Pooja",company:"EY",imageData:"invalid",mimeType:"image/png",confirm:true}),/Screenshot/);
});
test("Research Sources has initial screenshots and separate conversation uploads, both candidate-aware",()=>{
 const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
 assert.match(html,/id="initialScreenshot"/);
 assert.match(html,/id="chatScreenshot"/);
 assert.match(html,/id="saveResearchImage"/);
 assert.match(html,/id="researchTextFile"/);
 assert.match(html,/inbox\/image/);
 assert.match(html,/Read all candidate-scoped NEW_ \.txt, \.png, \.jpg and \.webp screenshot sources/);
 assert.match(html,/SocialReviewQueue A:T/);
 const bridge=fs.readFileSync(path.resolve(__dirname,"../bridge.js"),"utf8");
 assert.match(bridge,/social\/inbox\/image/);
 const server=fs.readFileSync(path.resolve(__dirname,"../social_server.js"),"utf8");
 assert.match(server,/inbox\/image/);
 assert.match(server,/write&&readOnly/);
});
