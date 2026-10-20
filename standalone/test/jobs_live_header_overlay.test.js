"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {patch}=require("../maintenance/jobs_header_patch.cjs");
const header='<header class="topbar"><div class="crumb">Workspace / <strong id="crumbTitle">Overview</strong></div><div class="top-actions">'+
 '<span id="modeBadge" class="demo">PREVIEW</span><div id="candidateToggle" class="switch"></div>'+
 '<button id="expenseToggle" type="button" title="Recorded CV expenses" data-action="expenses">$</button>'+
 '<div id="avatar" class="avatar">A</div></div></header>';
const app='<script>function navRender(){return "Pooja"};document.addEventListener("click",()=>{ /* keep native Jobs handlers */ });</script>';
const html='<html><head><style>.topbar{display:flex}</style></head><body>'+header+
 '<main>'+("Original CV processing interface. ".repeat(45))+'</main>'+app+'</body></html>';
test("Patch reuses old Jobs image contents and changes only HTML header+CSS+passive warning",()=>{
 const out=patch(html);
 for(const original of [
  '<span id="modeBadge" class="demo">PREVIEW</span>',
  '<div id="candidateToggle" class="switch"></div>',
  '<button id="expenseToggle" type="button" title="Recorded CV expenses" data-action="expenses">$</button>',
  '<div id="avatar" class="avatar">A</div>',
  app
 ])assert.ok(out.includes(original),"native Jobs component changed: "+original);
 assert.match(out,/<header class="topbar garamaal-unified-header">/);
 assert.match(out,/id="jobHeaderLink"[^>]*href="\/"/);
 assert.match(out,/id="socialHeaderLink"[^>]*href="\/social"/);
 assert.match(out,/#cv-account-switch::before\{content:"G"/);
 assert.match(out,/#candidateToggle button:nth-child\(2\)::after\{content:"P"/);
 assert.match(out,/order:1/);assert.match(out,/order:2/);assert.match(out,/order:3/);
 assert.match(out,/GOOGLE SHEETS LIVE\|\^LIVE\$/);
 assert.match(out,/data-garamaal-jobs-live-overlay/);
 assert.match(out,/garamaal-local-editing/);
 assert.match(out,/Other users editing are not detected|other users editing are not detected/i);
 assert.equal((out.match(/<header/g)||[]).length,1);
 assert.equal((out.match(/<script>function navRender/g)||[]).length,1);
});
test("Unexpected header changes, repeat overlays and missing controls fail closed",()=>{
 const amended=patch(html);
 assert.throws(()=>patch(amended),/already patched/i);
 assert.throws(()=>patch(html.replace('id="expenseToggle"','id="expenseBroken"')),/legacy control missing/i);
 assert.throws(()=>patch(html.replace('class="top-actions"','class="top-actions-new"')),/header differs from reviewed baseline/i);
 assert.throws(()=>patch(html.replace('</header>','<a id="socialHeaderLink">Social</a></header>')),/differs from reviewed baseline/i);
 assert.throws(()=>patch(html+header),/one legacy Jobs topbar required/i);
});
test("No event handler, candidate source, cost logic, CV run or backend code is imported from current repo",()=>{
 const out=patch(html);
 const h=out.match(/<header[\s\S]*?<\/header>/)[0];
 assert.ok(h.includes('data-action="expenses"'));
 assert.ok(out.includes(app));
 assert.doesNotMatch(out,/getBootstrap\(|getCvQueue\(|getStats\(/);
 assert.match(out,/document\.addEventListener\("keydown",e=>\{if\(e\.key==="Enter"\)onLocalEdit\(e\)\},true\)/);
});
