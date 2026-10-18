"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../..");
function read(file){return fs.readFileSync(path.join(root,file),"utf8")}
test("Firebase keeps the production Jobs catch-all rewrite unchanged and LAST",()=>{
 const config=JSON.parse(read("firebase.json"));
 assert.equal(config.hosting.site,"garamaal");
 const x=config.hosting.rewrites;
 assert.equal(x.length,4);
 assert.deepEqual(x.map(y=>y.source),["/social","/social/bridge.js","/api/social/**","**"]);
 assert.ok(x.slice(0,3).every(y=>y.run.serviceId==="automate-cv-social"&&y.run.region==="europe-west1"));
 assert.deepEqual(x[3],{source:"**",run:{serviceId:"automate-cv-dashboard",region:"europe-west1"}});
});
test("Social Docker build cannot package Jobs UI or CV runtime",()=>{
 const docker=read("Dockerfile.social");
 assert.match(docker,/CMD \["node","standalone\/social_server\.js"\]/);
 for(const forbidden of ["webapp/","standalone/server.js","standalone/runtime.js","src/","Google Apps Script"])
    assert.ok(!docker.includes("COPY "+forbidden),"Forbidden Jobs path in Social image: "+forbidden);
 assert.ok(docker.includes("COPY standalone/social_store.js"));
 assert.ok(docker.includes("COPY standalone/bridge.js"));
});
test("Social-only API defines no route for Jobs, CV, worker or ranking",()=>{
 const social=read("standalone/social_server.js");
 assert.ok(social.includes('app.get("/social"'));
 assert.ok(social.includes('app.get("/social/bridge.js"'));
 assert.ok(social.includes('app.post("/api/social/*"'));
 assert.ok(social.includes('app.use((_req,res)=>res.status(404)'));
 assert.ok(!social.includes('app.get("/"'));
 assert.ok(!social.includes('app.post("/api/:method"'));
 assert.ok(!social.includes('require("./runtime")'));
 assert.ok(!social.includes('require("./sheets")'));
 assert.ok(!social.includes("getCvQueue"));
 assert.ok(!social.includes("invoke("));
 assert.ok(!social.includes("runCvApiNow"));
});
test("Separate Social A/P preference never alters Jobs preference",()=>{
 const social=read("standalone/social.html");
 assert.ok(social.includes("garamaal-social-candidate"));
 assert.ok(!social.includes("freshmaal-candidate"));
 assert.ok(social.includes('src="/social/bridge.js"'));
});
test("Social writes require two independent opt-in environment flags",()=>{
 const social=read("standalone/social_server.js");
 assert.ok(social.includes('process.env.SOCIAL_READ_ONLY!=="false"'));
 assert.ok(social.includes('process.env.SOCIAL_ALLOW_LIVE_WRITES!=="true"'));
 assert.ok(social.includes("await authenticate(req)"));
 assert.ok(social.includes("selectedCandidate(req.body?.candidate)"));
 assert.ok(!social.includes("APP_READ_ONLY"));
 assert.ok(!social.includes("APP_ALLOW_PRODUCTION_WRITES"));
});
