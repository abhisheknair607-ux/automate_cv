"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../.."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("KPI cards have actual filtered destinations and keyboard-readable controls",()=>{
 const source=read("standalone/mobile_jobs_filters_stats.js");
 assert.doesNotThrow(()=>new vm.Script(source));
 for(const dest of [
  '"discovery","all"',
  '"fresh","all"',
  '"fresh","prepared"',
  '"fresh","applied"',
  '"fresh","connected"'
 ])assert.ok(source.includes(dest),dest);
 assert.match(source,/<button type="button" class="gmv3-pipeline-kpi" data-gm-metric=/);
 assert.match(source,/data-gm-metric/);
 assert.match(source,/nav\(destination,status\)/);
 assert.match(source,/const next=defaultFilters\(\);next.status=status/);
 assert.match(source,/aria-label="View /);
});
test("Backend faceted filters distinguish prepared, applied and completed-connection rows",()=>{
 const src=read("standalone/prototype_queries.js");
 assert.match(src,/status==="prepared"&&source==="fresh"/);
 assert.match(src,/status==="connected"&&source==="fresh"/);
 assert.match(src,/String\(x\.cvLink\|\|""\)\.trim\(\)/);
 assert.match(src,/x\.progress==="Applied \+ Connected"/);
 assert.match(src,/x\.progress\)\);/);
 assert.ok(src.includes("gmCandidateRows_")); // still candidate scoped
});
test("Swipe card includes legitimate employer link and compact tap-expand without breaking gestures",()=>{
 const src=read("standalone/mobile_jobs_swipe.js");
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.match(src,/const url=safeLink\(job\.url\)/);
 assert.match(src,/class="gmv3-swipe-title-link"/);
 assert.match(src,/target="_blank" rel="noopener noreferrer"/);
 assert.match(src,/aria-expanded=/);
 assert.match(src,/gmv3-swipe-extra/);
 assert.match(src,/suppressCardClickUntil/);
 assert.match(src,/if\(e\.target\.closest\?\.\("a"\)\)return/);
 assert.match(src,/expanded=!expanded;render\(\);card\?\.focus\(\)/);
 assert.match(src,/if\(dir==="left"\|\|dir==="down"\)finishSwipe\(dir\)/);
 assert.match(src,/else if\(dir==="right"\)openOptions\(\)/);
 assert.match(src,/getJob/);
});
test("Card hover/press and expandable summary obey reduced-motion preferences",()=>{
 const css=read("standalone/mobile_collage.css");
 assert.match(css,/Stage 8 — minimal tactile job-card feedback/);
 assert.match(css,/\.jobs > \.job:hover/);
 assert.match(css,/translateY\(-1px\)/);
 assert.match(css,/button\.gmv3-pipeline-kpi:focus-visible/);
 assert.match(css,/Stage 8 Swipe: optional highlights/);
 assert.match(css,/\.gmv3-swipe-extra\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
