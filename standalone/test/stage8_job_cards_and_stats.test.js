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
 assert.match(src,/class="gmv3-swipe-company-link"/);
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
 assert.match(css,/translateY\(-4px\) scale\(1\.012\)/);
 assert.match(css,/button\.gmv3-pipeline-kpi:focus-visible/);
 assert.match(css,/Stage 8 Swipe: optional highlights/);
 assert.match(css,/\.gmv3-swipe-extra\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});


test("Scroll within expanded Swipe card is native and never mistaken for downward skip",()=>{
 const js=read("standalone/mobile_jobs_swipe.js");
 const css=read("standalone/mobile_collage.css");
 assert.match(js,/gmv3-swipe-drag-grip/);
 assert.match(js,/role="region" tabindex="0" aria-label="Scroll additional job highlights"/);
 assert.match(js,/if\(expanded&&!e\.target\.closest\("\.gmv3-swipe-drag-grip"\)\)return/);
 assert.match(js,/if\(e\.target\.closest\?\.\("\.gmv3-swipe-extra"\)\)return/);
 assert.match(js,/if\(command==="toggle"\)/);
 assert.match(js,/remaining\.slice\(0,maxExtra\)/);
 assert.match(js,/maxExtra=Math\.min\(760/);
 assert.match(css,/\.gmv3-drag-card\.gmv3-card-expanded\{\s*touch-action:pan-y!important/);
 assert.match(css,/\.gmv3-swipe-drag-grip\{[\s\S]*?touch-action:none!important/);
 assert.match(css,/\.gmv3-card-expanded \.gmv3-swipe-extra\{[\s\S]*?overflow-y:auto!important/);
 assert.match(css,/overscroll-behavior-y:contain/);
 assert.match(css,/-webkit-overflow-scrolling:touch/);
 assert.match(css,/scrollbar-width:thin/);
});


test("Dashboard KPI and pending counters share pronounced but accessible card lift",()=>{
 const css=read("standalone/mobile_collage.css");
 assert.match(css,/button\.gmv3-pipeline-kpi:hover\{\s*transform:translateY\(-4px\) scale\(1\.012\)!important/);
 assert.match(css,/Stage 9 — dashboard statistics match the tactile listing hover/);
 assert.match(css,/\.gmv3-followup-stats>div:hover\{\s*transform:translateY\(-4px\) scale\(1\.012\)!important/);
 assert.match(css,/\.gmv3-followup-stats>div,\s*body\.gmv3-jobs-workspace #content button\.gmv3-pipeline-kpi\{\s*transform:none!important;transition:none!important/);
});
