"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const html=fs.readFileSync(path.resolve(__dirname,"../../garamaal-release-webapp/Index.html"),"utf8");

test("Import Alerts popup is compact with no informational cards or workflow banner",()=>{
  const popup=html.slice(html.indexOf("/* Import Alerts control lives"),html.indexOf("  async function trigger(kind)"));
  for(const phrase of [
    "The dashboard will trigger Python", "No OpenAI API or paid AI ranking",
    "Read alerts and review extracted jobs", "Only verified Ireland/UK jobs",
    "Read-only Python audit verifies", "This popup does not claim a run",
    "Not active yet: parser approval"
  ])assert.equal(popup.includes(phrase),false,phrase);
  assert.doesNotMatch(popup,/alerts-flow|alerts-steps|alerts-step|alerts-text/);
  assert.match(popup,/aria-modal="true"/);
  assert.match(popup,/aria-labelledby="alerts-title"/);
});
test("All three original operations, manual safety gates and direct links remain",()=>{
  for(const kind of ["preview","dedupe","apply"])
    assert.ok(html.includes('data-alert-run="'+kind+'" disabled'),kind);
  for(const label of ["Preview Import","Check Duplicates","Run Import","First alert email date","Actions ↗","Workflow ↗","Audit ↗","Close"])
    assert.ok(html.includes(label),label);
  assert.match(html,/data\.previewEnabled/);
  assert.match(html,/data\.dedupeEnabled/);
  assert.match(html,/data\.applyEnabled/);
  assert.match(html,/if\(!button\|\|button\.disabled\)return/);
  assert.match(html,/requestSpecial/);
  assert.match(html,/rel="noopener noreferrer"/);
});
test("HTML scripts remain JavaScript syntax-valid and no stale date is shown",()=>{
  const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match=>match[1]).filter(Boolean);
  for(const [i,js] of inline.entries())new vm.Script(js,{filename:"inline-"+i+".js"});
  assert.doesNotMatch(html,/value="2026-10-25"/);
  assert.match(html,/getFullYear\(\)/);
});

test("Sequential UI shows Preview, Run Import, Check Duplicates and setup-required state",()=>{
  const page=html.slice(html.indexOf('/* Import Alerts control lives'));
  const preview=page.indexOf('data-alert-run="preview" disabled');
  const apply=page.indexOf('data-alert-run="apply" disabled');
  const dedupe=page.indexOf('data-alert-run="dedupe" disabled');
  assert.ok(preview>=0&&apply>preview&&dedupe>apply,"three controls must match user workflow order");
  assert.match(page,/Live import authorisation off/);
  assert.doesNotMatch(page,/Import setup required/);
  assert.doesNotMatch(page,/Import locked/);
  assert.match(page,/data\.previewEnabled/);
  assert.match(page,/data\.dedupeEnabled/);
  assert.match(page,/data\.applyEnabled/);
});
