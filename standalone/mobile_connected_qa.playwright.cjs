"use strict";
/** Read-only *full-source* browser QA. Node 22 + playwright chromium. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa-output', 'connected-mobile-v3');
const widths = [320, 390, 768];
process.env.APP_READ_ONLY = 'true';
process.env.SOCIAL_READ_ONLY = 'true';
process.env.SOCIAL_ALLOW_LIVE_WRITES = 'false';
process.env.ALLOW_MANUAL_CV_DISPATCH = 'false';
process.env.NODE_ENV = 'test';
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS','GITHUB_WORKFLOW_TOKEN','OPENAI_API_KEY',
  'FIREBASE_ADMIN_KEY','FRESHMAL_SPREADSHEET_ID','GOOGLE_SHEETS_ID']) delete process.env[key];
fs.mkdirSync(output, {recursive: true});
const report = {source: 'Actual unchanged Jobs/Social HTML over read-only local Express routes',
  data: 'Jobs built-in demo mode and Social isolated fixtures; NOT authenticated live data',
  checks: [], shots: [], pageErrors: [], blockedRequests: [], widths};
function check(name,pass,detail='') {report.checks.push({name,pass:!!pass,detail});}
async function localServer(app) {
  return new Promise((resolve,reject)=>{
    const server=app.listen(0,'127.0.0.1',()=>resolve(server));
    server.once('error',reject);
  });
}
const socialBridge = `(function(){
  window.__cvStandalone={requestSpecial:async function(endpoint,body){
    var candidate=body&&body.candidate==='Pooja'?'Pooja':'Abhishek';
    var items=[
      {key:'sample-001',name:'Sample Finance Contact',title:'Corporate Finance Manager',company:'Example Advisory',department:'Corporate Finance',profile:'https://example.com/profile',search:'Example Advisory Corporate Finance Dublin',relation:{status:'identified',city:'Dublin',next:''}},
      {key:'sample-002',name:'Sample Follow-up Contact',title:'Partner',company:'Example Capital',department:'Deals',profile:'https://example.com/profile2',relation:{status:'accepted',city:'Dublin',next:'2026-11-02'}}
    ];
    if(endpoint==='social/data')return {candidate:candidate,readOnly:true,items:items};
    if(endpoint==='social/templates/get')return {templates:[]};
    if(endpoint==='social/targets/list')return {targets:[],companies:[],departments:[]};
    if(endpoint==='social/inbox/list')return {files:[]};
    if(endpoint==='social/conversations/list')return {conversations:[]};
    throw Error('Read-only fixture blocked: '+endpoint);
  }};
})();`;
async function protectNetwork(page,base,kind) {
  const origin=new URL(base).origin;
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.startsWith('data:')||url.startsWith('blob:')) return route.continue();
    if(!url.startsWith(origin+'/')) {
      report.blockedRequests.push({kind,url:url.slice(0,140)});
      return route.abort('blockedbyclient');
    }
    const routePath=new URL(url).pathname;
    if(kind==='jobs'&&routePath==='/bridge.js')
      return route.fulfill({status:200,contentType:'text/javascript',body:'/* preserve full original Jobs UI in its built-in DEMO mode */'});
    if(kind==='social'&&routePath==='/social/bridge.js')
      return route.fulfill({status:200,contentType:'text/javascript',body:socialBridge});
    if(routePath.startsWith('/api/')||route.request().method()!=='GET')
      return route.fulfill({status:403,contentType:'application/json',body:'{"error":"Read-only QA blocked writes"}'});
    return route.continue();
  });
  page.on('pageerror',e=>report.pageErrors.push({kind,message:String(e).slice(0,350)}));
}
async function shot(page,name,width) {
  const file=path.join(output,name+'-'+width+'.png');
  await page.screenshot({path:file,fullPage:true,animations:'disabled',timeout:15000});
  report.shots.push(path.relative(root,file));
}
async function wait(page,selector) {
  try {await page.locator(selector).first().waitFor({timeout:7500});return true}
  catch {return false}
}
async function main() {
 let browser, jobsServer, socialServer;
 try {
  const jobs=require('./server').app, social=require('./social_server').app;
  jobsServer=await localServer(jobs); socialServer=await localServer(social);
  const jobsURL='http://127.0.0.1:'+jobsServer.address().port;
  const socialURL='http://127.0.0.1:'+socialServer.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of widths) {
   const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
   await protectNetwork(page,jobsURL,'jobs');
   await page.goto(jobsURL+'/prototype',{waitUntil:'domcontentloaded'});
   check('Intro is FIRST on Jobs '+width,
     await wait(page,'#gmv3-intro')&&await page.locator('#gmv3-intro').isVisible());
   check('Mobile/desktop intro file set '+width,
     (await page.locator('#gmv3-intro-film').getAttribute('src'))===
      (width<=820?'/prototype/intro/mobile.mp4':'/prototype/intro/desktop.mp4'));
   await shot(page,'jobs-intro-film',width);
   await page.locator('#gmv3-intro-skip').click();
   await page.locator('#gmv3-intro').waitFor({state:'hidden',timeout:3000});
   if(width===390){
     await page.locator('#gmv3-launch .gmv3-wordmark').click();
     check('Logo replays intro '+width,await page.locator('#gmv3-intro').isVisible());
     await page.locator('#gmv3-intro-skip').click();
     await page.locator('#gmv3-intro').waitFor({state:'hidden',timeout:3000});
   }
   check('Four original home cards '+width,await wait(page,'#gmv3-launch .gmv3-action')&&(await page.locator('#gmv3-launch .gmv3-action').count())===4);
   await shot(page,'home',width);
   await page.locator('#gmv3-launch .gmv3-action[data-gmv3="jobs"]').click();
   await page.evaluate(()=>window.GaramaalJobsHub.selectPage('discovery'));
   check('Discovery real job cards '+width,await wait(page,'.jobs article'));
   check('Discovery JD and preferences '+width,(await page.locator('.jobs [data-action="detail"]').count())>0&&
      (await page.locator('.jobs [data-action="preference-toggle"]').count())>0);
   await shot(page,'jobs-discovery',width);
   await page.evaluate(()=>window.GaramaalJobsHub.selectPage('fresh'));
   check('Make CV original cards '+width,await wait(page,'.jobs article'));
   check('CV, CL, Web, tier and status '+width,(await page.locator('.jobs [data-field="cv"]').count())>0&&
     (await page.locator('.jobs [data-field="cl"]').count())>0&&
     (await page.locator('.jobs [data-field="web"]').count())>0&&
     (await page.locator('.jobs select[data-action="tier-mode"]').count())>0&&
     (await page.locator('.jobs select[data-action="inline-status"]').count())>0);
   await shot(page,'jobs-makecv',width);
   await page.evaluate(()=>window.GaramaalJobsHub.selectPage('add'));
   check('Add Job complete original form '+width,await wait(page,'#addForm')&&
     (await page.locator('#add-company').count())===1&&(await page.locator('#add-role').count())===1&&(await page.locator('#add-jd').count())===1);
   await shot(page,'jobs-addjob',width);
   await page.evaluate(()=>window.GaramaalJobsHub.openSwipe());
   check('New Jobs Swipe remains read-only '+width,(await page.locator('#gmv3-jobs-swipe button[disabled]').count())>=2);
   await shot(page,'jobs-swipe',width);
   check('Jobs no horizontal overflow '+width,!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)));
   await page.close();
   const sp=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
   await protectNetwork(sp,socialURL,'social');
   await sp.goto(socialURL+'/social?gmv3=1',{waitUntil:'domcontentloaded'});
   check('Intro is FIRST on Social '+width,
     await wait(sp,'#gmv3-intro')&&await sp.locator('#gmv3-intro').isVisible());
   await shot(sp,'social-intro-film',width);
   await sp.locator('#gmv3-intro-skip').click();
   await sp.locator('#gmv3-intro').waitFor({state:'hidden',timeout:3000});
   check('Social 5 tabs and original content '+width,await wait(sp,'#gmv3-social-tabs button')&&
      (await sp.locator('#gmv3-social-tabs button').count())===5);
   await shot(sp,'social-targets',width);
   await sp.evaluate(()=>window.GaramaalSocialHub.selectPage('inbox'));
   check('Research original targets and sources '+width,await wait(sp,'.research-space')&&
      (await sp.locator('#targetCompany').count())===1&&(await sp.locator('#targetDepartment').count())===1&&
      (await sp.locator('#copyResearch').count())===1);
   await shot(sp,'social-research',width);
   await sp.evaluate(()=>window.GaramaalSocialHub.selectPage('swipe'));
   check('People Swipe original card '+width,await wait(sp,'#swipeCard'));
   await shot(sp,'social-swipe',width);
   await sp.evaluate(()=>window.GaramaalSocialHub.selectPage('followups'));
   check('Follow-ups original assistance '+width,await wait(sp,'#copyFollowupTabPrompt'));
   await shot(sp,'social-followups',width);
   check('Social no horizontal overflow '+width,!(await sp.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)));
   await sp.close();
  }
 } finally {
  if(browser) await browser.close();
  for(const server of [jobsServer,socialServer])if(server)await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(output,'QA_REPORT.json'),JSON.stringify(report,null,2));
 }
 const failures=report.checks.filter(x=>!x.pass);
 console.log(JSON.stringify({checks:report.checks.length,passes:report.checks.length-failures.length,failures,
   screenshots:report.shots.length,pageErrors:report.pageErrors.length},null,2));
 if(failures.length||report.pageErrors.length)process.exitCode=1;
}
main().catch(e=>{console.error('Local full-source QA failed:',e.stack||String(e));process.exitCode=1});
