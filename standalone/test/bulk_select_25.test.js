"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const html=fs.readFileSync(path.join(root,"garamaal-release-webapp/Index.html"),"utf8");
const release=fs.readFileSync(path.join(root,"garamaal-release-webapp/Code.gs"),"utf8");
const legacy=fs.readFileSync(path.join(root,"webapp/Code.gs"),"utf8");
const mobile=fs.readFileSync(path.join(root,"standalone/mobile_jobs_ui_polish.js"),"utf8");
const first=html.indexOf("const MAX_DISCOVERY_SELECTION=25;");
const end=html.indexOf("async function bulkSetPreferences(value){",first);
if(first<0||end<first)throw Error("Select All controller was not found in release UI");
const script=html.slice(first,end);
const make=(n=30)=>Array.from({length:n},(_,i)=>({
 row:i+2,company:"Company "+i,role:"Finance Analyst",url:"https://example.com/jobs/"+i,
 location:"Dublin"
}));
function fixture({total=70,visible=10,selectedRow=45,candidate="Abhishek"}={}){
 const jobs=make(Math.max(total,27)), requests=[],alerts=[],checkboxes=jobs.slice(0,visible)
   .map(j=>({dataset:{row:String(j.row)},checked:j.row===selectedRow}));
 const btn={disabled:false,isConnected:true};
 let redraws=0;
 const state={section:"discovery",candidate,listRequest:13,filter:"all",
   sort:"smart",tabId:"common",query:"analyst",bulk:new Map(),data:{
     total,rows:jobs.slice(0,visible),pages:Math.ceil(total/visible)
   }};
 const old=jobs.find(j=>j.row===selectedRow);
 state.bulk.set(selectedRow,old||{row:selectedRow,company:"Previous",role:"Previous",url:"https://example.com/old"});
 const ctx=vm.createContext({
  state,Number,Array,Map,document:{
   querySelector:q=>q==='[data-action="bulk-select-all"]'?btn:null,
   querySelectorAll:q=>q.includes('input[data-action="bulk-select"]')?checkboxes:[]
  },
  run:async (method,filters,options)=>{
   requests.push({method,filters,options});
   return {rows:jobs.slice(0,25),total};
  },
  toast:(...args)=>alerts.push(args),syncSelectionBar:()=>{redraws++}
 });
 vm.runInContext(script,ctx);
 return {ctx,state,btn,requests,alerts,checkboxes,redraws:()=>redraws,jobs};
}
test("Select All adds first 25 matching jobs without losing a previous selection",async()=>{
 const x=fixture();
 await x.ctx.selectAllMatchingJobs();
 assert.equal(x.state.bulk.size,25);
 assert.equal(x.state.bulk.has(45),true);
 assert.equal(x.state.candidate,"Abhishek");
 assert.equal(x.requests.length,1);
 assert.equal(x.requests[0].method,"listJobs");
 assert.equal(x.requests[0].filters.pageSize,25);
 assert.equal(x.requests[0].filters.sort,"smart");
 assert.equal(x.requests[0].filters.tabId,"common");
 assert.equal(x.requests[0].filters.candidate,"Abhishek");
 assert.equal(x.redraws(),1);
 assert.equal(x.btn.disabled,false);
 assert.ok(x.checkboxes.every(cb=>cb.checked===x.state.bulk.has(Number(cb.dataset.row))));
});
test("Exactly 25 is allowed, a full selection never re-fetches jobs",async()=>{
 const x=fixture({total:25,visible:25,selectedRow:2});
 await x.ctx.selectAllMatchingJobs();
 assert.equal(x.requests.length,0);
 assert.equal(x.state.bulk.size,25);
 await x.ctx.selectAllMatchingJobs();
 assert.equal(x.state.bulk.size,25);
 assert.equal(x.requests.length,0);
});
test("Candidate changes during async selection cannot cross-contaminate selections",async()=>{
 const x=fixture({selectedRow:50});
 let finish;
 x.ctx.run=()=>new Promise(resolve=>{finish=resolve});
 const pending=x.ctx.selectAllMatchingJobs();
 x.state.candidate="Pooja";
 finish({rows:x.jobs.slice(0,25)});
 await pending;
 assert.equal(x.state.bulk.size,1);
 assert.equal(x.redraws(),0);
});
test("The same popup keeps favourites, not interested and Select All without bulk transfer button",()=>{
 const start=html.indexOf("function selectionBar(){");
 const stop=html.indexOf("function syncSelectionBar()",start);
 assert.ok(start>0&&stop>start);
 const selection=html.slice(start,stop);
 assert.match(selection,/data-action="bulk-select-all"/);
 assert.match(selection,/data-action="bulk-preference" data-value="Not Interested"/);
 assert.match(selection,/data-action="bulk-preference" data-value="Favorite"/);
 assert.doesNotMatch(selection,/data-action="bulk-transfer"/);
 assert.match(html,/if\(a==='bulk-select-all'\)\{selectAllMatchingJobs\(\);return\}/);
 assert.match(mobile,/selectAll\.classList\.add\("gmv3-bulk-icon"\)/);
 assert.match(mobile,/Select all \(up to 25\)/);
});
test("Both transfer APIs enforce 25, and candidate preference writes enforce 25",()=>{
 for(const backend of [release,legacy]){
  assert.match(backend,/maxBulk: 25/);
  assert.match(backend,/Select 1–25 vacancies to transfer/);
 }
 assert.match(release,/jobs\.length>SETTINGS\.maxBulk/);
 assert.match(release,/Select 1–25 discovery jobs/);
 assert.match(html,/if\(state\.bulk\.size>=MAX_DISCOVERY_SELECTION\)/);
 assert.match(html,/if\(selected\.length>MAX_DISCOVERY_SELECTION\)/);
});
