"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const html=fs.readFileSync(path.resolve(__dirname,"../../webapp/Index.html"),"utf8");
const begin=html.indexOf("function card(job)");
const end=html.indexOf("function pagination()",begin);
assert.ok(begin>=0&&end>begin,"Job card renderer is available");

function setup(section){
  const ctx=vm.createContext({
    state:{section,candidate:"Abhishek",bulk:new Map()},
    h:s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    safeUrl:s=>String(s||"").startsWith("https://")?String(s):null,
    icon:name=>"<svg data-icon='"+name+"'></svg>",
    preferenceMenu:()=>'<div class="preference-actions"><button>trash</button><button>heart</button></div>',
    activityFor:()=>null,
    activityMarkup:()=>"",
    compactMetrics:()=>'<div class="score-compact">79 #9</div>',
    tierChoices:()=>'<option value="Economy">Economy</option>',
    statusChoices:()=>'<option value="CV">CV</option>',
    usdCost:v=>"$"+Number(v).toFixed(4),
  });
  vm.runInContext(html.slice(begin,end)+"; this.renderCard=card;",ctx);
  return ctx;
}

const item={
  row:31,role:"Investment Analyst",company:"Fortis Recruitment",
  url:"https://example.org/jobs/investment-analyst",location:"Dublin South, Ireland",
  jdReady:true,transferred:false,notInterested:false,preference:"",cv:false,
  cl:false,web:false,selected:false,status:"CV",workflow:"COMPLETE"
};

test("Discovery title opens vacancy and obsolete card buttons are removed",()=>{
  const ctx=setup("discovery");
  const output=ctx.renderCard(item);
  assert.match(output,/class="joblink" href="https:\/\/example.org\/jobs\/investment-analyst"/);
  assert.match(output,/aria-label="Open vacancy: Investment Analyst"/);
  assert.match(output,/data-action="detail"[^>]+>.*Paste JD/);
  assert.doesNotMatch(output,/data-action="open-link"/);
  assert.doesNotMatch(output,/data-action="transfer"/);
  assert.doesNotMatch(output,/Seems Fresh|>Vacancy<\/button>/);
  assert.match(output,/data-icon='trash'/);
  assert.match(output,/data-icon='heart'/);
  assert.match(html,/Save JD · Auto transfer/);
  assert.match(html,/data-action="transfer" data-row="\$\{d\.row\}"/);
});

test("Make CV title opens vacancy, badges share one row, overflow opens details",()=>{
  const ctx=setup("fresh");
  const output=ctx.renderCard({...item,cv:true,cvLink:"https://example.org/cv.docx",costUsd:.0545,promptReady:true,score:79,rank:9});
  assert.match(output,/class="joblink" href="https:\/\/example.org\/jobs\/investment-analyst"/);
  assert.match(output,/Garam CV Ready/);
  assert.match(output,/COMPLETE/);
  assert.match(output,/Download CV/);
  assert.match(output,/Copy Prompt/);
  assert.match(output,/data-action="detail"[^>]*title="More options and job details"/);
  assert.match(output,/data-icon='more'/);
  assert.match(output,/class="job-settings"/);
  assert.match(output,/CV model/);
  assert.match(output,/Cover letter model/);
  assert.match(output,/Application status/);
  // Badges are outside the jobtop score/title grid: status pills get full card width.
  assert.ok(output.indexOf('class="job-badges"')===-1||output.indexOf('class="score-compact"')<output.indexOf('class="badges job-badges"'));
});

test("Compact mobile CSS retains three model/status dropdowns and tactile links",()=>{
  const css=html.slice(html.indexOf("<style>"),html.indexOf("</style>"));
  assert.match(css,/\.joblink:active/);
  assert.match(css,/text-decoration-style:dotted/);
  assert.match(css,/\.job-settings\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.score-compact\{flex-basis:108px/);
  assert.match(css,/\.job\.cv-ready \.job-more/);
  const inline=html.slice(html.indexOf("<script>")+8,html.lastIndexOf("</script>"));
  new vm.Script(inline,{filename:"webapp/Index.html"});
});
