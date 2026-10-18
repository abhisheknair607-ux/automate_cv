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
test("New Research subviews coexist with campaign planner, coffee chat and Firebase bridge",()=>{
 const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
 const snippet=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
 assert.ok(snippet);
 assert.doesNotThrow(()=>new vm.Script(snippet));
 for(const element of ["Campaign planner","coffeeInvite","id=\"targetCompany\"","id=\"targetDepartment\"",
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
