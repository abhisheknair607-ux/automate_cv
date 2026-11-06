"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const html=fs.readFileSync(path.resolve(__dirname,"../../garamaal-release-webapp/Index.html"),"utf8");

test("dashboard popup only shows duplicate matches, not GitHub importer controls",()=>{
 const page=html.slice(html.indexOf("/* Import and master sync"));
 assert.ok(page.includes('id="alerts-title">Duplicate Review'));
 assert.ok(page.includes('data-action="duplicate-review"'));
 for(const old of ['data-alert-run="preview"','data-alert-run="apply"','data-alert-run="dedupe"',
   "Preview Import","Run Import","GitHub controls unavailable","Review flagged emails"])
  assert.equal(page.includes(old),false,old);
 assert.match(page,/role="dialog" aria-modal="true"/);
 assert.match(page,/Inspect in master Sheet/);
 assert.match(page,/textContent=/);
});
test("app open triggers only server-side cooldown, never GitHub",()=>{
 const page=html.slice(html.indexOf("/* Import and master sync"));
 assert.match(page,/alerts\/auto\/check/);
 assert.match(page,/alerts\/auto\/status/);
 assert.match(page,/pageshow/);
 assert.match(page,/visibilitychange/);
 assert.match(page,/watchCompletion\(result\.lastSuccessAt/);
 assert.match(page,/garamaal:jobs-imported/);
 assert.match(html,/addEventListener\('garamaal:jobs-imported'/);
 assert.match(html,/if\(state\.section==='discovery'\)void fetchList\(\)/);
 assert.doesNotMatch(page,/setInterval\(/);
 assert.doesNotMatch(page,/alerts\/run/);
});
test("page scripts are syntax-valid",()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(Boolean);
 for(const [i,js] of scripts.entries())new vm.Script(js,{filename:"inline-"+i+".js"});
});
