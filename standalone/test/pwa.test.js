"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ROOT=path.resolve(__dirname,"../..");

test("Chrome install manifest has standalone app, PNG icons and stable scope",()=>{
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,"standalone/pwa/manifest.webmanifest"),"utf8"));
  assert.equal(m.display,"standalone");
  assert.equal(m.scope,"/");
  assert.equal(m.start_url,"/");
  assert.equal(m.id,"/");
  for(const size of [192,512]){
    const icon=m.icons.find(x=>x.sizes===size+"x"+size);
    assert.equal(icon.type,"image/png");
    const bytes=fs.readFileSync(path.join(ROOT,"standalone/pwa/app-icon-"+size+".png"));
    assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16),size);
    assert.equal(bytes.readUInt32BE(20),size);
  }
});
test("PWA shell never caches private authenticated responses",()=>{
  const sw=fs.readFileSync(path.join(ROOT,"standalone/pwa/sw.js"),"utf8");
  new vm.Script(sw,{filename:"sw.js"});
  assert.match(sw,/event.request.mode!=="navigate"/);
  assert.doesNotMatch(sw,/cache\.put\(event.request/);
  const source=fs.readFileSync(path.join(ROOT,"webapp/Index.html"),"utf8");
  assert.match(source,/rel="manifest"/);
  assert.match(source,/beforeinstallprompt/);
  assert.match(source,/cl-tier-mode/);
  const code=fs.readFileSync(path.join(ROOT,"webapp/Code.gs"),"utf8");
  assert.match(code,/clTier:48/);
  assert.match(code,/clTier:49/);
});
test("Short Hosting link proxies to existing authenticated Cloud Run service",()=>{
  const h=JSON.parse(fs.readFileSync(path.join(ROOT,"firebase.json"),"utf8")).hosting;
  assert.equal(h.site,"freshmaal-cv");
  assert.equal(h.rewrites[0].run.serviceId,"automate-cv-dashboard");
  assert.equal(h.rewrites[0].run.region,"europe-west1");
  const server=fs.readFileSync(path.join(ROOT,"standalone/server.js"),"utf8");
  assert.match(server,/app\.get\(route/);
  assert.match(server,/PWA_ASSETS/);
});
