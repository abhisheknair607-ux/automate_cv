"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const read=filepath=>fs.readFileSync(path.join(root,filepath),"utf8");
const htmlPath=fs.existsSync(path.join(root,"garamaal-release-webapp/Index.html"))
 ?"garamaal-release-webapp/Index.html":"webapp/Index.html";

test("dashboard ranks and alert importer are visually equal without changing handlers",()=>{
 const html=read(htmlPath);
 assert.match(html,/data-action="copy-ranking"[^>]*>\$\{icon\('prompt'\)\} Ranking prompt/);
 assert.match(html,/class="btn btn-primary" type="button" data-action="import-alerts"/);
 assert.doesNotMatch(html,/data-action="copy-ranking"[^>]*>\$\{icon\('prompt'\)\} Copy ranking prompt/);
 assert.match(html,/if\(a==='import-alerts'\)/);
});

test("Chrome PWA manifest retains stable identity and has concrete working start route",()=>{
 const manifest=JSON.parse(read("standalone/pwa/manifest.webmanifest"));
 assert.equal(manifest.id,"/");
 assert.equal(manifest.start_url,"/prototype");
 assert.equal(manifest.scope,"/");
 assert.equal(manifest.display,"standalone");
 assert.deepEqual(manifest.icons.filter(x=>x.type==="image/png").map(x=>x.sizes),["192x192","512x512","512x512"]);
 assert.match(read("standalone/server.js"),/app\.get\("\/prototype"/);
 assert.match(read("standalone/server.js"),/garamaal-icon-/);
 assert.match(read("standalone/pwa/sw.js"),/if\(event\.request\.method!=="GET"\|\|event\.request\.mode!=="navigate"\)return/);
});

test("launcher install action stays visible above overlay and opens real Chrome prompt",()=>{
 const landing=read("standalone/mobile_home_landing.html");
 const shell=read("standalone/mobile_home_shell.js");
 const css=read("standalone/mobile_home_shell.css");
 const html=read(htmlPath);
 assert.match(landing,/id="gmv3-install-launcher"[^>]*data-gmv3="install"/);
 assert.match(shell,/if\(action==="install"\)/);
 assert.match(shell,/window\.__cvInstall\(\)/);
 assert.match(shell,/button\.hidden=!!installed/);
 assert.match(css,/\.gmv3-head-actions/);
 assert.match(html,/box\.style\.zIndex='3000'/);
 assert.match(html,/beforeinstallprompt/);
 assert.match(html,/serviceWorker\.register\('\/sw\.js'/);
});

test("a single paginated candidate-scoped feed replaces the dual blocking calls",()=>{
 const runtime=read("standalone/runtime.js"),bridge=read("standalone/bridge.js");
 const swipe=read("standalone/mobile_jobs_swipe.js");
 const {SOURCE}=require("../swipe_feed");
 new vm.Script(SOURCE);
 assert.match(runtime,/const SWIPE_METHODS = new Set/);
 assert.match(runtime,/"gmSwipeFeed"\]/);
 assert.match(runtime,/require\("\.\/swipe_feed"\)\.SOURCE/);
 assert.match(bridge,/"swipe\/gmSwipeFeed"/);
 assert.match(swipe,/read\("gmSwipeFeed",\{candidate,page,pageSize:15\}\)/);
 assert.match(swipe,/Promise\.race/);
 assert.match(swipe,/40000/);
 assert.match(swipe,/Could not load Swipe jobs/);
 assert.match(swipe,/data-gs="refresh"/);
 assert.doesNotMatch(swipe,/await read\("listJobs"/);
});

test("feed respects candidate preferences, skips transfers and pages reliably",()=>{
 const {SOURCE}=require("../swipe_feed");
 const mk=(row,url,role,more={})=>({row,company:"Company "+row,role,url,...more});
 const fresh=[
  mk(3,"https://jobs.example/1","Finance Analyst",{person:{Abhishek:{score:87,preference:""},Pooja:{score:67,preference:"Not Interested"}}}),
  mk(4,"https://jobs.example/2","Tax Associate",{person:{Abhishek:{score:76,preference:"Favorite"},Pooja:{score:79,preference:""}}})
 ];
 const taaza=[
  mk(12,"https://jobs.example/1","Finance Analyst",{preferences:{Abhishek:"",Pooja:""}}),
  mk(15,"https://jobs.example/3","Economist",{preferences:{Abhishek:"Not Interested",Pooja:""}}),
  mk(16,"https://jobs.example/4","Junior Analyst",{preferences:{Abhishek:"",Pooja:""}})
 ];
 const ctx=vm.createContext({
  authorise_:()=>{},
  person_:candidate=>{if(!["Abhishek","Pooja"].includes(candidate))throw Error("unknown candidate")},
  freshRows_:()=>fresh,taazaRows_:()=>taaza,
  canonical_:s=>String(s||"").toLowerCase(),
  effectivePreference_:(a,b)=>[a,b].includes("Not Interested")?"Not Interested":
    [a,b].includes("Favorite")?"Favorite":""
 });
 vm.runInContext(SOURCE,ctx);
 const one=candidate=>vm.runInContext('gmSwipeFeed({candidate:"'+candidate+'",page:1,pageSize:15})',ctx);
 const a=one("Abhishek"),p=one("Pooja");
 assert.deepEqual(Array.from(a.rows,x=>x.url),["https://jobs.example/1","https://jobs.example/2","https://jobs.example/4"]);
 assert.deepEqual(Array.from(p.rows,x=>x.url),["https://jobs.example/2","https://jobs.example/4","https://jobs.example/3"]);
 assert.equal(a.rows[1].favorite,true);
 assert.equal(a.rows.some(x=>x.url==="https://jobs.example/1"&&x.source==="taaza"),false);
 assert.equal(p.rows.some(x=>x.url==="https://jobs.example/1"),false);
 const paged=vm.runInContext('gmSwipeFeed({candidate:"Abhishek",page:2,pageSize:2})',ctx);
 assert.equal(paged.rows.length,1);
 assert.equal(paged.hasMore,false);
 assert.throws(()=>vm.runInContext('gmSwipeFeed({candidate:"Intruder"})',ctx),/unknown candidate/);
});

test("protected release probes installable PWA and live Swipe before promotion",()=>{
 const script=read("standalone/deploy-garamaal-production.sh");
 assert.match(script,/manifest\.webmanifest/);
 assert.match(script,/garamaal-icon-\$size\.png/);
 assert.match(script,/prototype\/hub-swipe\.js/);
 assert.match(script,/gmSwipeFeed/);
 assert.ok(script.indexOf("manifest.webmanifest")<script.indexOf("PROMOTION_ATTEMPTED=1"));
 assert.ok(script.includes('--to-revisions="$BASELINE"'));
});
