"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../..");
const html=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
const header=html.match(/<header class="topbar garamaal-unified-header">([\s\S]*?)<\/header>/)?.[1]||"";
test("Jobs header has only visual changes and the existing A/P, expenses, auth switch, Jobs and Social controls",()=>{
 assert.ok(header);
 const terms=['id="candidateToggle"','id="expenseToggle"','id="jobHeaderLink"','id="socialHeaderLink"','id="modeBadge"'];
 let last=-1;for(const term of terms){const i=header.indexOf(term);assert.ok(i>last,"Wrong order: "+term);last=i;}
 assert.match(header,/class="top-actions garamaal-header-controls"/);
 assert.match(header,/data-action="expenses"/);
 assert.match(header,/href="\/social"/);
 assert.match(header,/id="jobHeaderLink"[^>]*href="\/"/);
 assert.match(bridge,/button\.textContent="Switch Google"/);
 assert.match(bridge,/await authInstance\.signOut\(\)/);
 assert.match(html,/document\.getElementById\('candidateToggle'\)\.innerHTML=\['Abhishek','Pooja'\]/);
});
test("Google alias uses CSS order only; Jobs cost and auth events remain existing",()=>{
 assert.match(html,/#cv-account-switch::before\{content:"G"/);
 for(const term of ['#candidateToggle{order:1','#expenseToggle{order:2','#cv-account-switch{order:3','#jobHeaderLink{order:4','#socialHeaderLink{order:5','#modeBadge{order:6'])assert.ok(html.includes(term),term);
 assert.match(html,/if\(a==='expenses'\)\{showExpenses\(\);return\}/);
 assert.match(html,/if\(a==='preference-toggle'\)/);
 assert.match(html,/if\(e\.target\.id==='addForm'\)\{e\.preventDefault\(\)/);
});
test("Status warns on local input and Enter, never claims remote-user tracking or performs writes",()=>{
 assert.match(html,/document\.getElementById\('modeBadge'\)\.textContent=DEMO\?'PREVIEW':'LIVE'/);
 assert.match(html,/badge\.textContent='EDITING'/);
 assert.match(html,/document\.addEventListener\('input',showLocalEditing,true\)/);
 assert.match(html,/document\.addEventListener\('change',showLocalEditing,true\)/);
 assert.match(html,/document\.addEventListener\('keydown',e=>\{if\(e\.key==='Enter'\)showLocalEditing\(e\)\},true\)/);
 assert.match(html,/Local input detected/);
 assert.match(html,/not other users' editing activity/);
 assert.match(html,/if\(DEMO\)return/);
 assert.match(html,/aria-live="polite"/);
});
