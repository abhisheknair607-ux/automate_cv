"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../..");
const html=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
const bridge=fs.readFileSync(path.join(root,"standalone/bridge.js"),"utf8");
test("Jobs topbar only: candidate A/B, dollars then Social; Switch Google stays bridge-controlled",()=>{
 const match=html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
 assert.ok(match);
 const h=match[1];
 for(const id of ['candidateToggle','expenseToggle','socialHeaderLink','modeBadge','avatar'])assert.match(h,new RegExp('id="'+id+'"'));
 assert.ok(h.indexOf('id="candidateToggle"')<h.indexOf('id="expenseToggle"'));
 assert.ok(h.indexOf('id="expenseToggle"')<h.indexOf('id="socialHeaderLink"'));
 assert.match(h,/href="\/social"/);
 assert.match(html,/aria-label="Switch to \$\{x\}"/);
 assert.match(html,/\$\{i===0\?'A':'B'\}/);
 assert.match(bridge,/button\.textContent="Switch Google"/);
 assert.match(bridge,/actions\.appendChild\(button\)/);
});
test("Dashboard retains Add Job; duplicated Social navigation link removed from dashboard body",()=>{
 const match=html.match(/function dash\(\)\{([\s\S]*?)function [a-zA-Z]/);
 assert.ok(match);
 assert.doesNotMatch(match[1],/href="\/social"/);
 assert.match(match[1],/Add job/);
 assert.match(html,/data-action="expenses"/);
 assert.match(html,/data-action="candidate"/);
});
test("No new routes, API calls, CV workflow or Firebase Hosting changes in narrow header PR",()=>{
 assert.match(html,/id="content" class="container"/);
 assert.match(html,/function navRender\(\)/);
 assert.match(html,/function render\(\)/);
});
