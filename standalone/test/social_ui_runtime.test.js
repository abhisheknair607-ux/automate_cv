"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,"Social page should have executable inline script");

function createHarness(handler){
 const nodes=new Map();
 const getNode=id=>{
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:"",value:"",style:{},classList:{toggle(){},add(){},remove(){}},focus(){},setSelectionRange(){},setAttribute(){},showModal(){this.open=true},close(){this.open=false},addEventListener(){}});
  return nodes.get(id);
 };
 const store=new Map();
 const GoogleAuthProvider=class {addScope(){} setCustomParameters(){}};
 GoogleAuthProvider.credentialFromResult=()=>null;
 const firebaseSession={uid:"owner123",email:"abhisheknair607@gmail.com"};
 const authInstance={currentUser:firebaseSession,signInWithPopup:async()=>({
  user:firebaseSession,credential:{accessToken:"mock-owner-drive-token-123456"}
 })};
 const firebaseAuth=()=>authInstance;
 firebaseAuth.GoogleAuthProvider=GoogleAuthProvider;
 const firebase={apps:[{}],auth:firebaseAuth};
 const context=vm.createContext({
  window:{firebase,isSecureContext:false,__cvStandalone:{requestSpecial:(method,arg)=>method==="social/templates/get"?Promise.resolve({candidate:arg.candidate,templates:[]}):handler(method,arg)}},
  document:{getElementById:getNode,addEventListener(){},readyState:"complete"},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  navigator:{},confirm:()=>false,prompt:()=>"",
  setTimeout,clearTimeout,console,
 });
 new vm.Script(script,{filename:"social.html"}).runInContext(context);
 return {context,getNode,store,run:code=>vm.runInContext(code,context)};
}
const item=(candidate,name,status="identified")=>({
 candidate,company:candidate==="Abhishek"?"EY":"Davy",name,title:"Financial Planner",key:"0123456789abcdef01234567",
 profile:"",search:"https://www.linkedin.com/search/results/people/?keywords=person",message:"",
 relation:{status,sent:status==="accepted"?"2026-10-17T10:00:00Z":"",next:"2026-10-18",accepted:status==="accepted"?"2026-10-17T10:00:00Z":"",followupSent:"",department:"Wealth Management",city:"Dublin"}
});
test("Social renders Dashboard, Swipe, Follow-ups and Research without a runtime TDZ error",async()=>{
 const h=createHarness(async (method,opts)=>{
  assert.equal(method,"social/data");
  return {candidate:opts.candidate,items:[item(opts.candidate,"Sample User","accepted"),item(opts.candidate,"Sample Recruiter")]};
 });
 await new Promise(resolve=>setImmediate(resolve));
 const root=h.getNode("app").innerHTML;
 assert.match(root,/Networking/);
 assert.match(root,/Target organisations/);
 assert.match(root,/People/);
 assert.doesNotMatch(root,/Cannot access 'due' before initialization/);
 assert.match(h.getNode("bottomNav").innerHTML,/Follow-ups/);
 assert.match(h.getNode("bottomNav").innerHTML,/Research/);
 h.run('state.view="swipe"; render()');
 assert.match(h.getNode("app").innerHTML,/Sample Recruiter/);
 assert.match(h.getNode("app").innerHTML,/swipeCard/);
 h.run('state.view="followups"; render()');
 assert.match(h.getNode("app").innerHTML,/Sample User/);
 h.run('state.view="inbox"; render()');
 assert.match(h.getNode("app").innerHTML,/Outreach targets/);
});
test("Social A/P switch isolates candidate lists and does not change Jobs selection",async()=>{
 const h=createHarness(async (method,{candidate})=>({candidate,items:[item(candidate,candidate==="Abhishek"?"Person A":"Person P")]}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.getNode("app").innerHTML,/Person A/);
 await h.run('switchCandidate("Pooja")');
 assert.match(h.getNode("app").innerHTML,/Person P/);
 assert.doesNotMatch(h.getNode("app").innerHTML,/Person A/);
 assert.equal(h.store.get("garamaal-social-candidate"),"Pooja");
 assert.equal(h.store.has("freshmaal-candidate"),false);
});
test("Backend errors retain Social section navigation rather than blanking the screen",async()=>{
 const h=createHarness(async()=>{throw new Error("Test-only storage outage")});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.getNode("app").innerHTML,/Test-only storage outage/);
 assert.match(h.getNode("bottomNav").innerHTML,/Swipe/);
 assert.match(h.getNode("bottomNav").innerHTML,/Research/);
 h.run('state.view="swipe"; render()');
 assert.match(h.getNode("app").innerHTML,/No people remaining/);
 assert.match(h.getNode("app").innerHTML,/Test-only storage outage/);
});

test("Compact dashboard hides firm chips until one of the two industry buttons is selected",async()=>{
 const h=createHarness(async (_method,{candidate})=>({candidate,readOnly:true,items:[item(candidate,"Demo Person")]}));
 await new Promise(resolve=>setImmediate(resolve));
 let page=h.getNode("app").innerHTML;
 assert.match(page,/Corporate Finance/);
 assert.match(page,/Wealth Management/);
 assert.doesNotMatch(page,/data-company="EY"/,"Firm options must remain collapsed");
 assert.match(page,/Target organisations/);
 h.run('state.industry="consulting";state.orgOpen=true;render()');
 page=h.getNode("app").innerHTML;
 assert.match(page,/data-company="EY"/);
 assert.match(page,/data-company="Deloitte"/);
 h.run('state.industry="wealth";state.orgOpen=true;render()');
 assert.match(h.getNode("app").innerHTML,/data-company="Davy"/);
});
test("Research campaign order follows each corporate finance team for each firm",async()=>{
 const h=createHarness(async(_method,{candidate})=>({candidate,readOnly:true,items:[]}));
 await new Promise(resolve=>setImmediate(resolve));
 const labels=JSON.parse(h.run('JSON.stringify(campaignSteps.slice(0,10).map(x=>x.company+" "+x.department))'));
 assert.deepEqual(labels,[
  "EY Deals","EY Transaction Services","EY Valuations",
  "Deloitte Deals","Deloitte Transaction Services","Deloitte Valuations",
  "KPMG Deals","KPMG Transaction Services","KPMG Valuations",
  "PwC Deals"
 ]);
 h.run('state.view="inbox"; render()');
 assert.match(h.getNode("app").innerHTML,/EY · Deals/);
 assert.match(h.getNode("app").innerHTML,/nextCampaign/);
 h.run('state.campaignIndex=3;render()');
 assert.match(h.getNode("app").innerHTML,/Deloitte · Deals/);
});
test("Individual coffee invitations remain optional and within LinkedIn character budget",async()=>{
 const h=createHarness(async(_method,{candidate})=>({candidate,readOnly:true,items:[item(candidate,"Demo Recruiter")]}));
 await new Promise(resolve=>setImmediate(resolve));
 const length=h.run('coffeeInvite(state.items[0]).length');
 assert.ok(length>70&&length<=300);
 h.run('state.view="swipe";render()');
 assert.match(h.getNode("app").innerHTML,/Coffee chat/);
 assert.match(h.getNode("app").innerHTML,/Read-only preview/);
 h.run('state.selected=state.items[0].key;render()');
 assert.match(h.getNode("app").innerHTML,/Coffee chat/);
 assert.match(h.getNode("app").innerHTML,/Coffee invitation|Coffee chat/);
});
test("Read-only right swipe does not show misleading sent confirmation or write statuses",async()=>{
 const writes=[];
 const h=createHarness(async(method,opts)=>{writes.push(method);return {candidate:opts.candidate,readOnly:true,items:[item(opts.candidate,"Demo Person")]}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.getNode("socialModeBadge").textContent,"READ ONLY");
 await h.run('updateStatus(state.items[0].key,"sent","")');
 assert.deepEqual(writes,["social/data"]);
 assert.equal(h.run('state.items[0].relation.status'),"identified");
 assert.match(h.getNode("toast").textContent,/read-only/i);
});

test("Research combines Targets and Sources without repeated input fields, keeping chats separate",async()=>{
 const h=createHarness(async (_method,{candidate})=>({candidate,readOnly:true,items:[]}));
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchMode="research";render()');
 const research=h.getNode("app").innerHTML;
 assert.match(research,/id="initialScreenshot"/);
 assert.match(research,/id="saveResearchImage"/);
 assert.match(research,/id="targetCompany"/);
 assert.match(research,/id="inboxText"/);
 assert.match(research,/id="copyResearch"/);
 assert.match(research,/Saved targets/);
 assert.match(research,/Research queue/);
 assert.doesNotMatch(research,/id="inboxCompany"/);
 assert.doesNotMatch(research,/id="chatScreenshot"/);
 assert.equal(research.split('role="tab"').length-1,2);
 h.run('state.researchMode="followups";render()');
 const followups=h.getNode("app").innerHTML;
 assert.match(followups,/id="chatScreenshot"/);
 assert.doesNotMatch(followups,/id="initialScreenshot"/);
});

test("Research and Follow-ups have distinct GPT prompts in the merged view",async()=>{
 const h=createHarness(async (_method,{candidate})=>({candidate,readOnly:true,items:[]}));
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchMode="research";render()');
 const researchPage=h.getNode("app").innerHTML;
 assert.equal(researchPage.split('id="copyResearch"').length-1,1);
 assert.doesNotMatch(researchPage,/id="copyFollowupTabPrompt"/);
 assert.doesNotMatch(researchPage,/id="copyGeneralFollowPrompt"/);
 h.run('state.researchMode="followups";render()');
 assert.match(h.getNode("app").innerHTML,/id="copyGeneralFollowPrompt"/);
 assert.doesNotMatch(h.getNode("app").innerHTML,/id="copyResearch"/);
 h.run('state.view="followups";render()');
 assert.match(h.getNode("app").innerHTML,/id="copyFollowupTabPrompt"/);
 const research=h.run('researchPrompt()');
 const follow=h.run('conversationResearchPrompt({contact:"Test Person",company:"EY"})');
 assert.match(research,/FRESHMAAL IMPORT/);
 assert.match(research,/Read all candidate-scoped NEW_/);
 assert.match(follow,/FOLLOW-UP RESEARCH/);
 assert.match(follow,/Do not send LinkedIn messages/);
 assert.doesNotMatch(follow,/FRESHMAAL IMPORT/);
});

test("Compact merged Research UI keeps one metadata form and two predictable stages",async()=>{
 const h=createHarness(async(_method,{candidate})=>({candidate,readOnly:false,items:[]}));
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchMode="research";render()');
 let page=h.getNode("app").innerHTML;
 assert.match(page,/class="research-space"/);
 assert.match(page,/class="research-tabs"/);
 assert.match(page,/class="research-action-grid"/);
 assert.match(page,/Campaign planner/);
 assert.match(page,/Outreach targets/);
 assert.match(page,/research-expand/);
 assert.match(page,/research-tip/);
 for(const id of ["researchNow","saveTarget","copyResearch","targetCompany","targetDepartment","targetCity","initialScreenshot","saveResearchImage","researchTextFile","inboxUrl","inboxText","saveInbox","reloadInbox"])
   assert.equal(page.split('id="'+id+'"').length-1,1,"Exactly one "+id+" in Research");
 for(const id of ["inboxCompany","inboxDepartment","inboxCity"])
   assert.doesNotMatch(page,new RegExp('id="'+id+'"'),"Duplicate source metadata removed: "+id);
 assert.equal(page.split('role="tab"').length-1,2,"Only Research and Chat Follow-ups sub-tabs remain");
 assert.match(page,/Saved targets/);
 assert.match(page,/Research queue/);
 assert.equal(h.getNode("socialModeBadge").textContent,"LIVE SHEET");
 h.run('state.researchMode="followups";render()');
 page=h.getNode("app").innerHTML;
 for(const id of ["chatContact","chatCompany","chatTranscript","chatScreenshot","saveConversation","copyGeneralFollowPrompt"])
   assert.match(page,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(page,/id="initialScreenshot"/);
});

test("Targets are above uploads and offer only Search Now and Save Target",async()=>{
 const h=createHarness(async(_method,{candidate})=>({candidate,readOnly:true,items:[]}));
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchMode="research";render()');
 const page=h.getNode("app").innerHTML;
 const top=page.slice(page.indexOf('class="card research-card research-targets"'),page.indexOf('class="card research-card research-sources"'));
 assert.ok(top.length>100);
 assert.ok(page.indexOf('id="saveTarget"')<page.indexOf('id="initialScreenshot"'));
 assert.match(top,/id="researchNow"/);
 assert.match(top,/id="saveTarget"/);
 assert.match(top,/id="researchTargetResults"/);
 assert.doesNotMatch(top,/id="copyResearch"/);
 assert.doesNotMatch(top,/id="initialScreenshot"/);
 assert.equal((top.match(/<button[^>]+id=/g)||[]).length,4,"Only two add controls, location and Save Target");
 assert.match(top,/id="researchAddCompany"/);
 assert.match(top,/id="researchAddDepartment"/);
 assert.match(top,/id="researchLocationOpen"/);
 assert.match(top,/<select id="targetCompany"/);
 assert.match(top,/<select id="targetDepartment"/);
 assert.match(top,/type="hidden" id="targetCity"/);
 assert.doesNotMatch(top,/<input id="targetCompany"/);
 assert.doesNotMatch(top,/<input id="targetDepartment"/);
 assert.match(page,/id="initialScreenshot" type="file"[^>]*multiple/);
 assert.match(page,/research-target-scroll/);
 assert.match(page,/id="researchTextFile"/);
});
test("saved targets show every company in a latest-first dropdown independent of selected company",async()=>{
 const h=createHarness(async(_method,{candidate})=>({candidate,readOnly:true,items:[]}));
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchMode="research";state.targets=[{row:2,company:"EY",department:"Deals",city:"Dublin",updated:"2026-10-18"},{row:3,company:"EY",department:"Valuations",city:"Dublin",updated:"2026-10-19"},{row:4,company:"Davy",department:"Wealth",city:"Dublin",updated:"2026-10-20"}];render()');
 const matches=h.run("savedTargetRows()");
 assert.match(matches,/Deals/);
 assert.match(matches,/Valuations/);
 assert.match(matches,/Davy/);
 assert.equal((matches.match(/data-use-target=/g)||[]).length,3);
 assert.match(matches,/linkedin.com\/search\/results\/people\/\?keywords=/);
 assert.ok(matches.indexOf("Davy")<matches.indexOf("Valuations"),"Latest saved target is first");
 const before=matches;
 h.getNode("targetCompany").value="Davy";
 h.getNode("targetDepartment").value="Wealth";
 h.getNode("targetCity").value="Dublin";
 h.run("updateTargetUrl()");
 assert.equal(h.run("savedTargetRows()"),before,"Changing selectors must not filter the list");
 const rendered=h.getNode("app").innerHTML;
 assert.match(rendered,/id="researchSavedTargets" open/);
 assert.match(rendered,/role="region" tabindex="0" aria-label="Scrollable saved target/);
 assert.doesNotMatch(rendered,/Consulting & Wealth Campaign planner/);
 assert.match(rendered,/class="research-queue-scroll"/);
});
test("TXT file is read locally and posted as private candidate text, without AI generation",async()=>{
 const saved=[];
 const h=createHarness(async(method,args)=>{
  if(method==="social/data")return {candidate:args.candidate,readOnly:false,items:[]};
  if(method==="social/inbox/save"){saved.push(args);return {name:"NEW_a_test.txt"}}
  if(method==="social/inbox/list")return {files:[]};
  if(method==="social/targets/list")return {targets:[]};
  if(method==="social/conversations/list")return {items:[]};
  return {candidate:args.candidate,items:[]};
 });
 await new Promise(resolve=>setImmediate(resolve));
 h.context.confirm=()=>true;
 h.getNode("targetCompany").value="EY";
 h.getNode("targetDepartment").value="Deals";
 h.getNode("inboxUrl").value="";
 h.getNode("inboxText").value="";
 h.getNode("researchTextFile").files=[{name:"people.txt",size:24,text:async()=>"John | EY | Deals"}];
 await h.run("saveInitialResearchText()");
 assert.equal(saved.length,1);
 assert.equal(saved[0].candidate,"Abhishek");
 assert.equal(saved[0].company,"EY");
 assert.equal(saved[0].department,"Deals");
 assert.equal(saved[0].pastedText,"John | EY | Deals");
 assert.equal(saved[0].driveAccessToken,"mock-owner-drive-token-123456");
});
