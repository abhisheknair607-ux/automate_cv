"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"../..");
const html=fs.readFileSync(path.join(root,"webapp/Index.html"),"utf8");
const js=html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
if(!js)throw new Error("Dashboard script missing");
const start=js.indexOf("function fitMetrics(job){");
const end=js.indexOf("function usdCost(v)",start);
if(start<0||end<0)throw Error("Preference and metric helpers missing");
const ctx=vm.createContext({
  h:value=>String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
  icon:name=>'<svg data-icon="'+name+'"></svg>'
});
vm.runInContext(js.slice(start,end),ctx);

test("Preference UI provides two symbolic buttons, no dropdown, and clear pressed state",()=>{
  const none=ctx.preferenceMenu({row:13,role:"Senior Analyst",preference:""});
  assert.equal((none.match(/<button /g)||[]).length,2);
  assert.doesNotMatch(none,/<select/i);
  assert.match(none,/data-value="Not Interested"/);
  assert.match(none,/data-value="Favorite"/);
  assert.match(none,/data-icon="trash"/);
  assert.match(none,/data-icon="heart"/);
  assert.equal((none.match(/aria-pressed="false"/g)||[]).length,2);
  const favorite=ctx.preferenceMenu({row:13,role:"Senior Analyst",preference:"Favorite"});
  assert.match(favorite,/data-value="Favorite"[^>]*aria-pressed="true"/);
  assert.match(favorite,/data-value="Not Interested"[^>]*aria-pressed="false"/);
  const rejected=ctx.preferenceMenu({row:13,role:"Senior Analyst",preference:"Not Interested"});
  assert.match(rejected,/data-value="Favorite"[^>]*aria-pressed="false"/);
  assert.match(rejected,/data-value="Not Interested"[^>]*aria-pressed="true"/);
});

test("A second tap clears; choosing the other icon replaces the prior preference",()=>{
  assert.equal(ctx.nextPreferenceValue("","Not Interested"),"Not Interested");
  assert.equal(ctx.nextPreferenceValue("Not Interested","Not Interested"),"");
  assert.equal(ctx.nextPreferenceValue("","Favorite"),"Favorite");
  assert.equal(ctx.nextPreferenceValue("Favorite","Favorite"),"");
  assert.equal(ctx.nextPreferenceValue("Favorite","Not Interested"),"Not Interested");
  assert.equal(ctx.nextPreferenceValue("Not Interested","Favorite"),"Favorite");
  assert.match(js,/run\('setJobPreference',\{source,candidate,row,value,expected:expected\(job\)\}\)/);
  assert.doesNotMatch(js,/run\('setNotInterested'/);
});

test("Small card-side box has screenshot's average and rank; detail keeps all four",()=>{
  const job={score:52,rank:57,profileFit:68,careerFit:73};
  const compact=ctx.compactMetrics(job);
  assert.match(compact,/class="score-compact"/);
  assert.match(compact,/<div class="score-avg"><strong[^>]*>52<\/strong>/);
  assert.match(compact,/>P 68 – C 73<\/span>/);
  assert.match(compact,/<div class="score-rank"><strong>#57<\/strong><span>Rank<\/span>/);
  assert.match(compact,/Profile Fit 68, Career Fit 73/);
  const full=ctx.fitMetrics(job);
  assert.match(full,/Profile/);
  assert.match(full,/Career/);
  assert.match(full,/Avg 55\/45/);
  assert.match(full,/Rank/);
  assert.match(js,/\$\{discovery\?'':compactMetrics\(job\)\}/);
  assert.match(js,/\$\{fitMetrics\(d\)\}/);
  assert.match(html,/\.jobtop\{flex-wrap:nowrap/);
  assert.match(html,/\.score-compact\{flex:0 0 150px/);
});
