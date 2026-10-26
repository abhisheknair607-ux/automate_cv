"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const ui=fs.readFileSync(path.join(root,"standalone/mobile_jobs_ui_polish.js"),"utf8");
const css=fs.readFileSync(path.join(root,"standalone/mobile_collage.css"),"utf8");
const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
const backend=fs.readFileSync(path.join(root,"webapp/Code.gs"),"utf8");
const dashboard=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");

test("LIVE connection label only changes authenticated LIVE status, never DEMO/offline",()=>{
 assert.match(ui,/current==="GOOGLE SHEETS LIVE"\|\|current==="LIVE"/);
 assert.match(ui,/if\(current!=="LIVE"\)badge\.textContent="LIVE"/);
 assert.match(ui,/badge\.classList\.remove\("gmv3-live-badge"\)/);
 assert.match(ui,/MutationObserver\(syncBadge\)/);
 assert.match(css,/gmv3-live-pulse/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/#modeBadge\.gmv3-live-badge::before/);
});
test("original Jobs and CV functions remain untouched while only prototype injects UI",()=>{
 assert.match(server,/app\.get\("\/prototype\/ui-polish\.js"/);
 assert.match(server,/mobile_jobs_ui_polish\.js/);
 assert.match(server,/\/prototype\/ui-polish\.js\?v=m26-neon-held-13/);
 assert.doesNotMatch(dashboard,/gmv3-bulk-tools/);
 assert.doesNotMatch(backend,/gmv3-bulk-tools/);
 assert.match(backend,/function bulkSetJobPreferences\(payload\)/);
 assert.match(backend,/if\(payload\.source!=='taaza'\)/);
});
test("visible batch controls use original candidate-scoped 20-row selection and do not invoke APIs",()=>{
 assert.match(ui,/const BATCH_LIMIT=20/);
 assert.match(ui,/store\.set\(row,item\)/);
 assert.match(ui,/syncSelectionBar=function\(\)/);
 assert.match(ui,/nativeSyncSelectionBar\(\)/);
 assert.match(ui,/const nativeRender=render/);
 assert.match(ui,/selection\(\)\.clear\(\)/);
 assert.match(ui,/Select visible/);
 assert.match(ui,/Clear selection/);
 assert.match(css,/#selectionBarMount \.selectionbar/);
 assert.match(css,/position:fixed!important/);
 const executable=ui.replace(/\\/\\*[\\s\\S]*?\\*\\//g,"");\n assert.doesNotMatch(executable,/bulkSetJobPreferences|setJobPreference|\\.fetch\\(/);
 assert.doesNotMatch(ui,/\.setValues?\(/);
});