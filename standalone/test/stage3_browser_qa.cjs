"use strict";
// Browser-emulated release QA only: mock candidate data, never real identities or writes.
// Real signed-in Sheets/backend checks require a human login on the separate QA domain.
const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||"playwright-core");
const base=process.env.GARAMAAL_QA_URL;
if(!base||!/^https:\/\/garamaal--collage-release-qa-[\w-]+\.web\.app\/prototype/.test(base)){
 throw new Error("Refusing browser QA on any URL other than isolated release QA /prototype");
}
const mock=String.raw`(()=>{
 "use strict";
 const candidateJobs={
 Abhishek:[
 {row:3,source:"fresh",company:"Example Finance One",role:"Corporate Finance Analyst",url:"https://example.com/job/3",location:"Dublin",score:87,rank:1,status:"NA",progress:"Applied + Connected",cvLink:"https://example.com/cv/3",clLink:"",cv:false,selected:true,cl:false,web:false,preference:""},
 {row:4,source:"fresh",company:"Example Finance Two",role:"Transfer Pricing Senior",url:"https://example.com/job/4",location:"London, UK",score:81,rank:2,status:"NA",progress:"Applied",cvLink:"",cv:false,cl:false,web:false,selected:false,preference:""},
 {row:5,source:"fresh",company:"Example Finance Three",role:"Investment Analyst",url:"https://example.com/job/5",location:"Cork",score:76,rank:3,status:"NA",progress:"Unapplied",cvLink:"https://example.com/cv/5",cv:false,cl:false,web:false,selected:false,preference:""}
 ],
 Pooja:[
 {row:3,source:"fresh",company:"Example Finance One",role:"Corporate Finance Analyst",url:"https://example.com/job/3",location:"Dublin",score:89,rank:1,status:"NA",progress:"Applied",cvLink:"",cv:false,cl:false,web:false,selected:false,preference:""},
 {row:4,source:"fresh",company:"Example Finance Two",role:"Transfer Pricing Senior",url:"https://example.com/job/4",location:"London, UK",score:91,rank:2,status:"NA",progress:"Applied + Connected",cvLink:"https://example.com/cv/4",cv:false,cl:false,web:false,selected:true,preference:""},
 {row:5,source:"fresh",company:"Example Finance Three",role:"Investment Analyst",url:"https://example.com/job/5",location:"Cork",score:70,rank:3,status:"NA",progress:"Applied + Connected",cvLink:"",cv:false,cl:false,web:false,selected:false,preference:""}
 ]};
 const discovery=[
 {row:7,source:"taaza",company:"Sample Partner A",role:"Valuations Analyst",url:"https://example.com/job/7",location:"Dublin, Ireland",jdReady:true,preference:"",categories:"Common",score:68},
 {row:8,source:"taaza",company:"Sample Partner B",role:"Private Wealth Associate",url:"https://example.com/job/8",location:"London, UK",jdReady:true,preference:"",categories:"Common",score:60},
 {row:9,source:"taaza",company:"Sample Partner C",role:"Financial Planner",url:"https://example.com/job/9",location:"Manchester, United Kingdom",jdReady:false,preference:"",categories:"Common",score:65},
 {row:10,source:"taaza",company:"Sample Partner D",role:"Finance Controller",url:"https://example.com/job/10",location:"United States",jdReady:true,preference:"",categories:"Common",score:67},
 {row:11,source:"taaza",company:"Sample Partner E",role:"Investment Analyst",url:"https://example.com/job/11",location:"Ukraine",jdReady:true,preference:"",categories:"Common",score:65}
 ];
 window.__gmMockWrites=[];
 window.__gmMockCalls=[];
 function rows(source,candidate){return source==="fresh"?candidateJobs[candidate||"Abhishek"]||[]:discovery}
 function summary(candidate){
  const r=candidateJobs[candidate]||[];
  return {candidate,discoveryJobs:discovery.length,makeCvJobs:r.length,cvPrepared:r.filter(x=>x.cvLink).length,
   applied:r.filter(x=>x.progress==="Applied"||x.progress==="Applied + Connected").length,
   appliedConnected:r.filter(x=>x.progress==="Applied + Connected").length,
   waitingToApply:r.filter(x=>x.cvLink&&x.progress==="Unapplied").length,
   waitingToConnect:r.filter(x=>x.progress==="Applied").length,cvQueued:0};
 }
 function list(method,arg){
  const source=arg.source||"taaza",candidate=arg.candidate||"Abhishek";
  let out=rows(source,candidate).map(x=>({...x,
   department:/transfer pricing/i.test(x.role)?"Transfer Pricing":
     /wealth|planning|planner/i.test(x.role)?"Wealth & Financial Planning":
     /valuation|corporate finance/i.test(x.role)?"Corporate Finance & Deals":
     /investment/i.test(x.role)?"Investments & Funds":"Accounting & Control",
   statusOptions:["NA","Applied"],favorite:false,notInterested:false}));
  const q=String(arg.query||"").toLowerCase();
  const choices={company:[...new Set(out.map(x=>x.company))],location:[...new Set(out.map(x=>x.location))],
    designation:[...new Set(out.map(x=>x.role))],department:[...new Set(out.map(x=>x.department))]};
  if(q)out=out.filter(x=>(x.company+" "+x.role+" "+x.location).toLowerCase().includes(q));
  const f=arg.filter||"all";
  if(f==="missing")out=out.filter(x=>!x.jdReady);
  if(f==="ready")out=out.filter(x=>x.jdReady);
  if(f==="prepared"||f==="unapplied")out=out.filter(x=>!!x.cvLink&&(f!=="unapplied"||x.progress==="Unapplied"));
  if(f==="applied")out=out.filter(x=>["Applied","Applied + Connected"].includes(x.progress));
  if(f==="connected")out=out.filter(x=>x.progress==="Applied + Connected");
  if(f==="selected")out=out.filter(x=>x.selected);
  if(f==="cv")out=out.filter(x=>x.cv);
  if(f==="favorites"||f==="not-interested"||f==="unscored")out=[];
  const selection=arg.locationSelection||{mode:"all",values:[]};
  if(selection.mode==="except")out=out.filter(x=>!selection.values.includes(x.location));
  if(selection.mode==="only")out=out.filter(x=>selection.values.includes(x.location));
  for(const [field,key] of [["company","company"],["designation","role"],["department","department"]]){
   const rule=arg.facetSelections?.[field]||{mode:"all",values:[]};
   if(rule.mode==="only")out=out.filter(x=>rule.values.includes(x[key]));
   if(rule.mode==="except")out=out.filter(x=>!rule.values.includes(x[key]));
  }
  for(const [field,key] of [["company","company"],["designation","role"]]){
    const want=String(arg.facets?.[field]||"").toLowerCase();
    if(want)out=out.filter(x=>String(x[key]||"").toLowerCase().includes(want));
  }
  out.sort((a,b)=>b.row-a.row);
  const pageSize=arg.pageSize||15,page=arg.page||1,total=out.length,offset=arg.offset??(page-1)*pageSize;
  return {source,candidate,total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize)),
    rows:out.slice(offset,offset+pageSize),facetOptions:choices,tabs:[],tabId:arg.tabId||"all",counts:{total}};
 }
 function handle(method,arg){
  window.__gmMockCalls.push(method);
  if(["getBootstrap","getStats","gmPipelineStats","listJobs","gmListJobsFaceted","getJob","getExpenses","getCvQueue"].includes(method)){
   if(method==="getBootstrap")return {email:"qa-test@example.invalid",people:["Abhishek","Pooja"],links:{}};
   if(method==="getStats")return {discovered:3,applications:3,selected:1,cvRequested:0,applied:2,missingJD:1};
   if(method==="getCvQueue")return {data:[]};
   if(method==="gmPipelineStats")return summary(arg);
   if(method==="listJobs"||method==="gmListJobsFaceted")return list(method,arg||{});
   if(method==="getExpenses")return {entries:[],total:0};
   if(method==="getJob"){
    const r=rows(arg.source,arg.candidate).find(x=>x.row===arg.row);
    return r?{...r,jd:("Detailed example role duties and relevant qualifications; stakeholder research, financial reporting, valuation models, reporting to directors, software processes. ").repeat(40),statusOptions:["NA","Applied"]}:null;
   }
  }
  window.__gmMockWrites.push(method);
  throw Error("QA mock forbids write operations: "+method);
 }
 function chain(onSuccess,onFailure){
  return new Proxy({}, {get(_target,key){
   if(key==="withSuccessHandler")return fn=>chain(fn,onFailure);
   if(key==="withFailureHandler")return fn=>chain(onSuccess,fn);
   return arg=>queueMicrotask(()=>{try{const value=handle(String(key),arg);onSuccess?.(value)}
        catch(err){onFailure?.(err)}});
  }});
 }
 window.google={script:{run:chain()}};
})();`;
async function wait(page,selector){return page.locator(selector).first().waitFor({state:"visible",timeout:15000});}
async function check(viewport){
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
 try {
 const context=await browser.newContext({...viewport,ignoreHTTPSErrors:false,locale:"en-IE"});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/bridge.js",route=>route.fulfill({status:200,contentType:"application/javascript",body:mock}));
 const url=base+(base.includes("?")?"&":"?")+"qa="+viewport.name;
 await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
 await page.waitForFunction(()=>!!window.GaramaalPrototypeHome && !!window.GaramaalJobsHub && !!window.GaramaalSwipeDeck,{timeout:20000});
 await page.evaluate(()=>window.GaramaalPrototypeHome.enterJobs());
 await wait(page,"#content .gmv3-pipeline-kpi");
 await page.waitForFunction(()=>document.querySelector("#modeBadge")?.textContent?.trim()==="LIVE",{timeout:10000});
 assert.equal(await page.locator("#modeBadge").innerText(),"LIVE","Header must say LIVE, not GOOGLE SHEETS LIVE");
 assert.equal(await page.locator("#modeBadge").getAttribute("aria-label"),"Live Google Sheets connection");
 assert.equal(await page.locator("#modeBadge").evaluate(n=>getComputedStyle(n,"::before").animationName),"gmv3-live-pulse","Subtle status dot animation");
 assert.equal(await page.locator("#content .gmv3-pipeline-kpi").count(),5,"Dashboard five KPI tiles");
 await page.waitForFunction(()=>document.querySelector('[data-gm-metric="fresh:connected"] strong')?.textContent==="1");
 let candidates=await page.locator('#content [data-gm-metric="fresh:connected"] strong').innerText();
 assert.equal(candidates,"1","Abhishek connected mock count");
 if(viewport.name==="desktop"){
  const display=await page.locator(".shell > .sidebar").evaluate(x=>getComputedStyle(x).display);
  assert.equal(display,"none","Desktop legacy sidebar must be hidden");
 }
 await page.locator('#gmv3-jobs-tabbar [data-g3-jobs="discovery"]').click();
 await wait(page,"#content .jobs > .job");
 assert.ok(await page.locator("#content .jobs > .job").count()>=2,"Discovery job listing visible");
 await wait(page,'#gmv3-bulk-tools [data-gmv3-bulk="select-visible"]');
 await page.locator('#gmv3-bulk-tools [data-gmv3-bulk="select-visible"]').click();
 await wait(page,'#selectionBarMount .selectionbar');
 assert.equal(await page.locator('#content .jobs .job [data-action="bulk-select"]:checked').count(),5,
   "Select visible checks all five available example listings");
 assert.match(await page.locator('#selectionBarMount .selectionbar').innerText(),/5 selected/);
 assert.equal(await page.locator('#selectionBarMount [data-action="bulk-preference"]').count(),2,
   "Original Favorites and Not Interested bulk actions retained");
 const barPos=await page.locator('#selectionBarMount .selectionbar').evaluate(el=>getComputedStyle(el).position);
 assert.equal(barPos,"fixed","Selected action bar must remain visible on phone and desktop");
 await page.locator('#selectionBarMount [data-gmv3-bulk="clear"]').click();
 assert.equal(await page.locator('#selectionBarMount .selectionbar').count(),0,"Clear selection dismisses bulk action bar");
 assert.equal(await page.locator('#content .jobs .job [data-action="bulk-select"]:checked').count(),0,
   "Clear selection does not edit job preferences");
 await page.locator("#gmv3-filter-button").click();
 await wait(page,"#gmv3-filter-form");
 assert.equal(await page.locator('input[data-gmf-field="location"]').count(),0,"No native location datalist");
 await page.locator("#gmv3-location-trigger").click();
 await wait(page,"#gmv3-location-picker");
 const windowSize=await page.locator("#gmv3-location-picker .gmv3-location-panel").evaluate(n=>({
  height:n.getBoundingClientRect().height,viewport:window.innerHeight,
  overflow:getComputedStyle(document.querySelector("#gmv3-location-list")).overflowY
 }));
 assert.ok(windowSize.height<=windowSize.viewport+1,"Location dialog fits available phone/desktop viewport");
 assert.equal(windowSize.overflow,"auto","List uses native vertical scrolling");
 await page.locator("#gmv3-location-search").fill("UK");
 assert.equal(await page.locator("#gmv3-location-list input[type=checkbox]").count(),2,"UK aliases shown together");
 await page.locator('[data-gmf-loc="exclude"]').click();
 assert.equal(await page.locator("#gmv3-location-list input[type=checkbox]:checked").count(),0,"Exclude UK matches");
 await page.locator("#gmv3-location-search").fill("United");
 assert.equal(await page.locator("#gmv3-location-list input[type=checkbox]").count(),3,"Both UK aliases and the US label visible for United");
 await page.locator('[data-gmf-loc="exclude"]').click();
 await page.locator('[data-gmf-loc="done"]').click();
 assert.match(await page.locator("#gmv3-location-trigger").innerText(),/3 excluded/);
 await page.locator('#gmv3-filter-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelectorAll("#content .jobs > .job").length===2,{timeout:15000});
 assert.equal(await page.locator("#content .jobs > .job").count(),2,"Only Dublin and Ukraine remain after exclusion");
 await page.locator("#gmv3-filter-button").click();
 await page.locator('[data-gmf-act="clear"]').click();
 await page.waitForFunction(()=>document.querySelectorAll("#content .jobs > .job").length===5,{timeout:15000});
 await page.locator("#gmv3-filter-button").click();
 await wait(page,"#gmv3-filter-form");
 for(const field of ["company","location","department","designation"])
  assert.equal(await page.locator("#gmv3-"+field+"-trigger").count(),1,"All primary filters have a picker");
 await page.locator("#gmv3-company-trigger").click();
 await page.locator("#gmv3-location-search").fill("Partner B");
 assert.equal(await page.locator("#gmv3-location-list input[type=checkbox]").count(),1);
 await page.locator('[data-gmf-loc="only"]').click();
 await page.locator('[data-gmf-loc="done"]').click();
 assert.match(await page.locator("#gmv3-company-trigger").innerText(),/1 included/);
 await page.locator('#gmv3-filter-form button[type="submit"]').click();
 await page.waitForTimeout(500);
 assert.equal(await page.locator("#content .jobs > .job").count(),1,"Company filter narrows listings");
 await page.locator("#gmv3-filter-button").click();
 await page.locator("#gmv3-department-trigger").click();
 await page.locator("#gmv3-location-search").fill("Wealth");
 assert.equal(await page.locator("#gmv3-location-list input[type=checkbox]").count(),1);
 await page.locator('[data-gmf-loc="only"]').click();
 await page.locator('[data-gmf-loc="done"]').click();
 await page.locator("#gmv3-designation-trigger").click();
 await page.locator("#gmv3-location-search").fill("Private Wealth");
 await page.locator('[data-gmf-loc="only"]').click();
 await page.locator('[data-gmf-loc="done"]').click();
 await page.locator('#gmv3-filter-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelectorAll("#content .jobs > .job").length===1,{timeout:15000});
 assert.match(await page.locator("#content .jobs > .job").first().innerText(),/Partner B/,"Combined facets");

 if(viewport.name==="mobile"){
  const card=page.locator("#content .jobs > .job").first();
  await card.evaluate(node=>node.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,pointerId:53,pointerType:"touch",isPrimary:true,clientX:15,clientY:15})));
  assert.equal(await card.evaluate(el=>el.classList.contains("gmv3-tactile-held")),true,"Touch lift starts");
  await page.waitForTimeout(600);
  assert.equal(await card.evaluate(el=>el.classList.contains("gmv3-tactile-held")),true,"Touch lift remains until release");
  await card.evaluate(node=>node.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:53,pointerType:"touch",isPrimary:true,clientX:15,clientY:15})));
  assert.equal(await card.evaluate(el=>el.classList.contains("gmv3-tactile-held")),false,"Touch lift ends on release");
 }
 await page.locator('#gmv3-jobs-tabbar [data-g3-jobs="fresh"]').click();
 await wait(page,"#content .jobs > .job");
 await page.locator("#gmv3-filter-button").click();
 await page.locator("#gmv3-location-trigger").click();
 await wait(page,"#gmv3-location-picker");
 await page.locator("#gmv3-location-search").fill("UK");
 await page.locator('[data-gmf-loc="only"]').click();
 await page.locator('[data-gmf-loc="done"]').click();
 await page.locator('#gmv3-filter-form button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelectorAll("#content .jobs > .job").length===1,{timeout:15000});
 assert.match(await page.locator("#content .jobs > .job").first().innerText(),/Example Finance Two/,"Make CV only matching UK row");
 await page.locator("#gmv3-filter-button").click();
 await page.locator('[data-gmf-act="clear"]').click();
 await page.waitForFunction(()=>document.querySelectorAll("#content .jobs > .job").length===3,{timeout:15000});
 assert.ok(await page.locator('#content .jobs > .job [data-action="inline-control"]').count()>0,"Make CV existing controls");
 await page.locator('#gmv3-jobs-tabbar [data-g3-jobs="swipe"]').click();
 await wait(page,'#gmv3-jobs-swipe .gmv3-drag-card');
 const link=await page.locator('#gmv3-jobs-swipe .gmv3-swipe-title-link').first().getAttribute("href");
 assert.ok(link?.startsWith("https://example.com/job/"),"Swipe vacancy hyperlink");
 await page.locator('#gmv3-jobs-swipe [data-gs="toggle"]').click();
 await wait(page,'#gmv3-swipe-quick-details');
 assert.equal(await page.locator('.gmv3-drag-card').getAttribute('aria-expanded'),"true","Swipe tap expands card");
 const overflow=await page.locator("#gmv3-swipe-quick-details").evaluate(el=>getComputedStyle(el).overflowY);
 assert.equal(overflow,"auto","Expanded details have native scrolling");
 await page.locator("#gmv3-account-drawer-button").click();
 await wait(page,'[data-gm-candidate="Pooja"]');
 await page.locator('[data-gm-candidate="Pooja"]').click();
 await page.waitForTimeout(150);
 await page.evaluate(()=>window.GaramaalJobsHub.selectPage("dashboard"));
 await page.waitForFunction(()=>document.querySelector('[data-gm-metric="fresh:connected"] strong')?.textContent==="2");
 assert.equal(await page.locator('#content [data-gm-metric="fresh:connected"] strong').innerText(),"2","Pooja mock counts independent");
 const writes=await page.evaluate(()=>window.__gmMockWrites);
 assert.deepEqual(writes,[],"Browser QA must never attempt mock writes");
 assert.deepEqual(errors,[],"Browser JavaScript errors: "+JSON.stringify(errors));
 const screenshot=process.env.GARAMAAL_QA_SHOTS;
 if(screenshot)await page.screenshot({path:screenshot+"/"+viewport.name+".png",fullPage:true});
 console.log("BROWSER_QA_PASS",viewport.name,"dashboard, candidate separation, cards, filters, Swipe, CV controls, touch state, no writes");
 } finally {await browser.close().catch(()=>{});}
}
(async()=>{
 await check({name:"desktop",viewport:{width:1440,height:900},isMobile:false,hasTouch:false});
 await check({name:"mobile",viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
})().catch(err=>{console.error("BROWSER_QA_FAILED",err.stack||err);process.exitCode=1});
