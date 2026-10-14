"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ROOT=path.resolve(__dirname,"../..");

test("Garamaal is a standalone installable app with two real photo PNG icons",()=>{
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,"standalone/pwa/manifest.webmanifest"),"utf8"));
  assert.equal(m.short_name,"Garamaal");
  assert.equal(m.display,"standalone");
  assert.equal(m.scope,"/");
  assert.equal(m.start_url,"/");
  assert.equal(m.id,"/");
  for(const size of [192,512]){
    const icon=m.icons.find(x=>x.sizes===size+"x"+size&&x.purpose==="any");
    assert.ok(icon,"Missing standard "+size+"px app icon");
    assert.equal(icon.type,"image/png");
    assert.equal(icon.src,"/garamaal-icon-"+size+".png");
  }
  const bytes=fs.readFileSync(path.join(ROOT,"standalone/pwa/garamaal-icon-192.jpg"));
  assert.ok(bytes.length>1200,"Photo source must not be an empty placeholder");
  assert.equal(bytes.subarray(0,2).toString("hex"),"ffd8");
  assert.equal(bytes.subarray(-2).toString("hex"),"ffd9");
  assert.ok(m.icons.some(x=>x.purpose==="maskable"&&x.sizes==="512x512"));
  const server=fs.readFileSync(path.join(ROOT,"standalone/server.js"),"utf8");
  assert.match(server,/sharp\(source\)\.resize\(size,size\)\.png/);
  assert.match(server,/\/garamaal-icon-/);
});

test("Authenticated app and API responses are never stored by service worker",()=>{
  const sw=fs.readFileSync(path.join(ROOT,"standalone/pwa/sw.js"),"utf8");
  new vm.Script(sw,{filename:"sw.js"});
  assert.match(sw,/event.request.mode!=="navigate"/);
  assert.doesNotMatch(sw,/cache\.put\(event.request/);
  const source=fs.readFileSync(path.join(ROOT,"webapp/Index.html"),"utf8");
  assert.match(source,/rel="manifest"/);
  assert.match(source,/beforeinstallprompt/);
  assert.match(source,/garamaal-install-dock/);
  assert.match(source,/cl-tier-mode/);
  assert.match(source,/Garamaal — Job Control Centre/);
  const code=fs.readFileSync(path.join(ROOT,"webapp/Code.gs"),"utf8");
  assert.match(code,/clTier:48/);
  assert.match(code,/clTier:49/);
});

test("Garamaal Hosting proxies to existing authenticated Cloud Run service",()=>{
  const h=JSON.parse(fs.readFileSync(path.join(ROOT,"firebase.json"),"utf8")).hosting;
  assert.equal(h.site,"garamaal");
  assert.equal(h.rewrites[0].run.serviceId,"automate-cv-dashboard");
  assert.equal(h.rewrites[0].run.region,"europe-west1");
  const server=fs.readFileSync(path.join(ROOT,"standalone/server.js"),"utf8");
  assert.match(server,/app\.get\(route/);
  assert.match(server,/PWA_ASSETS/);
});
