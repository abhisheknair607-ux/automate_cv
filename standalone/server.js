"use strict";
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const {GoogleAuth} = require("google-auth-library");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {invoke,invokeSwipe,METHODS,SWIPE_METHODS} = require("./runtime");
const {getCvQueue} = require("./queue");
const {Readable} = require("node:stream");
const {DOCX,getDocument} = require("./download");
const {tokenUsageForJob} = require("./cost_usage");
const connections=require("./connections");
const {jdClues}=require("./job_clues");
const clueStore=require("./clue_store");
const contactsStore=require("./contacts_store");
const {repairRankFormulas}=require("./rank_formulas");
const duplicateStatus=require("./duplicate_status");
const alertWorkflows=require("./alert_workflows");
const jdRecoveryWorkflows=require("./jd_recovery_workflows");

const BASE = path.resolve(__dirname,"..");
const PORT = Number(process.env.PORT||8080);
// Safest default: never permit writes unless explicitly enabled after sign-off.
const READ_ONLY = process.env.APP_READ_ONLY !== "false";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "";
const ALLOWED = String(process.env.ALLOWED_EMAILS||"")
  .split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
const IDS = {
  taaza:process.env.TAAZA_SPREADSHEET_ID||"1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
  fresh:process.env.FRESHMAL_SPREADSHEET_ID||"1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"
};
// Prevent accidental production writes from either the pilot or a staging
// service. The final cutover requires a separately approved explicit gate.
const LIVE_SHEET_IDS = new Set([
  "1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY",
  "1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"
]);
if(!READ_ONLY && Object.values(IDS).some(id=>LIVE_SHEET_IDS.has(id)) &&
   process.env.APP_ALLOW_PRODUCTION_WRITES!=="true") {
  throw new Error("Production spreadsheet writes are locked pending explicit cutover approval");
}
if(!getApps().length)initializeApp({projectId:PROJECT||undefined});
const auth = new GoogleAuth({scopes:["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive.readonly"]});
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1);
app.use(express.json({limit:"120kb"}));
app.use((req,res,next)=>{
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","same-origin");
  res.set("Cache-Control","no-store");
  next();
});
app.get("/health",(req,res)=>res.json({
  ok:true,
  migrations:"standalone-read-write-compatibility",
  credentialsConfigured:!!PROJECT&&ALLOWED.length>0,
  readOnly:READ_ONLY,
  // This endpoint does not reveal emails, secret names or tokens.
}));
app.get("/config",(req,res)=>res.json({
  apiKey:process.env.FIREBASE_WEB_API_KEY||"",
  authDomain:process.env.FIREBASE_AUTH_DOMAIN||(PROJECT?PROJECT+".firebaseapp.com":""),
  projectId:PROJECT,
  appId:process.env.FIREBASE_WEB_APP_ID||"",
  readOnly:READ_ONLY,
}));
app.get("/dashboard-ranking.js",(req,res)=>res.type("text/javascript").sendFile(path.join(__dirname,"dashboard_ranking.js")));
app.get("/dashboard-connections.js",(req,res)=>res.type("text/javascript").sendFile(path.join(__dirname,"dashboard_connections.js")));
app.get("/bridge.js",(req,res)=>{
  res.type("text/javascript").sendFile(path.join(__dirname,"bridge.js"));
});
const PWA_ASSETS=Object.freeze({
  "/manifest.webmanifest":["manifest.webmanifest","application/manifest+json"],
  "/app-icon-192.png":["app-icon-192.png","image/png"],
  "/app-icon-512.png":["app-icon-512.png","image/png"],
  "/garamaal-icon-192.jpg":["garamaal-icon-192.jpg","image/jpeg"],
  "/garamaal-icon-512.jpg":["garamaal-icon-512.jpg","image/jpeg"],
  "/offline.html":["offline.html","text/html"],
  "/sw.js":["sw.js","text/javascript"]
});
// Real photographic PNG icons from the uploaded, mask-safe JPEG. Chrome and
// Android reliably recognise PNG install assets, including the 512px splash.
const iconCache=new Map();
for(const size of [192,512]){
  app.get("/garamaal-icon-"+size+".png",async(_req,res)=>{
    try{
      if(!iconCache.has(size)){
        const source=path.join(__dirname,"pwa","garamaal-icon-192.jpg");
        iconCache.set(size,sharp(source).resize(size,size).png({compressionLevel:9}).toBuffer());
      }
      res.type("png").send(await iconCache.get(size));
    }catch(error){
      iconCache.delete(size);
      console.error("[garamaal-icon]",size,String(error.message||"").slice(0,150));
      res.status(500).type("text/plain").send("App icon unavailable");
    }
  });
}
for(const [route,[file,mime]] of Object.entries(PWA_ASSETS)) {
  app.get(route,(req,res)=>{
    res.type(mime);
    if(route==="/sw.js"){res.set("Service-Worker-Allowed","/");res.set("Cache-Control","no-cache");}
    res.sendFile(path.join(__dirname,"pwa",file));
  });
}

app.get("/",(req,res)=>{
  // Reversible release gate: the original interface and CV backend remain.
  if(process.env.GARAMAAL_UI_V3==="true")return res.redirect(302,"/prototype");
  let html=fs.readFileSync(path.join(BASE,"webapp/Index.html"),"utf8");
  // Preserve existing authenticated dashboard; inject its Cloud Run transport.
  // Installable PWA assets never cache authenticated Google Sheets responses.
  html=html.replace("<script>\n'use strict';",
    "<script src=\"/bridge.js\"></script>\n<script>\n'use strict';");
  html=html.replace("</body>",'<script src="/dashboard-ranking.js"></script><script src="/dashboard-connections.js"></script></body>');
  res.type("html").send(html);
});
// Read-only UI fallback path for instant user-visible rollback, with normal
// Firebase authentication and the exact original Jobs DOM.
app.get("/legacy",(req,res)=>{
  let html=fs.readFileSync(path.join(BASE,"webapp/Index.html"),"utf8");
  html=html.replace("<script>\n'use strict';",
    "<script src=\"/bridge.js\"></script>\n<script>\n'use strict';");
  html=html.replace("</body>",'<script src="/dashboard-ranking.js"></script><script src="/dashboard-connections.js"></script></body>');
  res.type("html").send(html);
});

// Feature-preserving MOBILE PROTOTYPE ROUTE.
// Existing GET /, /social and all API endpoints remain byte-for-byte as above.
// This route renders the exact original Jobs HTML/transport and adds a visual
// launcher IN FRONT. It does not replace the Dashboard/Discovery/Make CV/Add Job
// DOM or any of their event handlers.
app.get("/prototype/mobile-shell.css",(_req,res)=>
  res.type("text/css").sendFile(path.join(__dirname,"mobile_home_shell.css")));
app.get("/prototype/mobile-shell.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_home_shell.js")));
app.get("/prototype/hub.css",(_req,res)=>
  res.type("text/css").sendFile(path.join(__dirname,"mobile_hubs.css")));
app.get("/prototype/hub-jobs.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_jobs_hub.js")));
app.get("/prototype/hub-swipe.js",(_req,res)=>
  res.set("Cache-Control","no-cache, must-revalidate").type("text/javascript")
    .sendFile(path.join(__dirname,"mobile_jobs_swipe.js")));
app.get("/prototype/location-variants.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_location_variants.js")));
app.get("/prototype/filters-stats.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_jobs_filters_stats.js")));
app.get("/prototype/ui-polish.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_jobs_ui_polish.js")));
app.get("/prototype/account-drawer.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_profile_drawer.js")));
app.get("/prototype/profile-editor.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_profile_editor.js")));
app.get("/prototype/tactile-feedback.js",(_req,res)=>
  res.type("text/javascript").sendFile(path.join(__dirname,"mobile_tactile_feedback.js")));
// Allowlisted branch artwork and intro script; never publicize backend file paths.
const COLLAGE_ART=new Set(["home-collage-strip.webp","nav-collage-states.webp","back-avatar-controls.webp","swipe-sticker.svg","back-sticker.svg"]);
app.get("/prototype/assets/:file",(req,res)=>{
 if(!COLLAGE_ART.has(req.params.file))return res.status(404).end();
 res.type(req.params.file.endsWith(".svg")?"image/svg+xml":"image/webp").sendFile(path.join(__dirname,"assets",req.params.file));
});
// The authenticated preview consumes the approved video, not a separate mockup.
app.get("/prototype/media/:file",(req,res)=>{
 if(!["intro-mobile.mp4","intro-desktop.mp4"].includes(req.params.file))
  return res.status(404).end();
 res.type("video/mp4").sendFile(path.join(__dirname,"assets",req.params.file));
});
app.get("/prototype/collage.css",(_req,res)=>
  res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
    .sendFile(path.join(__dirname,"mobile_collage.css")));
app.get("/prototype/copper-porcelain.css",(_req,res)=>
  res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
    .sendFile(path.join(__dirname,"copper_porcelain.css")));
app.get("/prototype/copper-porcelain-fidelity.css",(_req,res)=>
  res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
    .sendFile(path.join(__dirname,"copper_porcelain_fidelity.css")));
app.get("/prototype/collage-intro.js",(_req,res)=>res.type("text/javascript").sendFile(path.join(__dirname,"mobile_collage_intro.js")));
// Approved Stage 3B launcher retains V9's byte-identical sphere and curve.
// Only the card and photographic visual layers are added; original V9 remains a rollback route.
app.get("/prototype/career-trail",(_req,res)=>
 res.set("Cache-Control","no-store, max-age=0").type("html")
 .sendFile(path.join(__dirname,"garamaal_career_trail_curve_review.html")));
app.get("/prototype/career-trail-v9",(_req,res)=>
 res.set("Cache-Control","no-store, max-age=0").type("html")
 .sendFile(path.join(__dirname,"garamaal_career_trail_v9.html")));
/* Stage 3 REVIEW only; the existing /prototype launcher continues using V9. */
app.get("/prototype/career-trail-v10-review",(_req,res)=>
 res.set("Cache-Control","no-store, max-age=0").type("html")
 .sendFile(path.join(__dirname,"garamaal_career_trail_v10_review.html")));
/* Stage 3B visual source: exact V9 roller/track, separate stock photography. */
app.get("/prototype/career-curve-review",(_req,res)=>
 res.set("Cache-Control","no-store, max-age=0").type("html")
 .sendFile(path.join(__dirname,"garamaal_career_trail_curve_review.html")));
app.get("/prototype/curve-art-review.js",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/javascript")
 .sendFile(path.join(__dirname,"garamaal_curve_art_review.js")));
app.get("/prototype/curve-overlay-review.js",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/javascript")
 .sendFile(path.join(__dirname,"garamaal_curve_overlay_review.js")));
app.get("/prototype/curve-overlay-review.css",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
 .sendFile(path.join(__dirname,"garamaal_curve_overlay_review.css")));
app.get("/prototype/career-theme.css",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
 .sendFile(path.join(__dirname,"garamaal_theme.css")));
/* Isolated Stage 2 colour-only layer, loaded after historic CSS on /prototype only. */
app.get("/prototype/royal-pages.css",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
 .sendFile(path.join(__dirname,"garamaal_royal_pages.css")));
/* Highest-priority UI-only corrective layer for legacy collage specificity. */
app.get("/prototype/royal-repair.css",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/css")
 .sendFile(path.join(__dirname,"garamaal_royal_repair.css")));
app.get("/prototype/career-bridge.js",(_req,res)=>
 res.set("Cache-Control","no-cache, must-revalidate").type("text/javascript")
 .sendFile(path.join(__dirname,"garamaal_theme_bridge.js")));
app.get("/prototype",(req,res)=>{
  if(typeof res.set==="function")res.set("Cache-Control","no-store, max-age=0");
  let html=fs.readFileSync(path.join(BASE,"webapp/Index.html"),"utf8");
  const fragment=fs.readFileSync(path.join(__dirname,"mobile_home_landing.html"),"utf8");
  const careerFragment=fragment.replace(/<\/section>\s*$/,
    '<iframe id="gm9-career-iframe" title="Garamaal Career Journey" src="/prototype/career-trail" loading="eager"></iframe></section>');
  if(careerFragment===fragment)return res.status(500).type("text/plain").send("Career launcher insertion marker missing");
  if(!html.includes("<body>")||!html.includes("</head>")||
     !html.includes("<script>\n'use strict';")){
    return res.status(500).type("text/plain").send("Prototype source marker missing");
  }
  // Restore approved Stage 6 header only on the isolated /prototype page.
  // The release baseline has an older header. Keep every native action ID and
  // listener, along with the original GET / route, entirely unchanged.
  const legacyHeader=html.match(/<header class="topbar">[^]*?<\/header>/g);
  if(!legacyHeader||legacyHeader.length!==1||
     !legacyHeader[0].includes('id="candidateToggle"')||
     !legacyHeader[0].includes('id="modeBadge"')||
     !legacyHeader[0].includes('id="expenseToggle"')){
    return res.status(500).type("text/plain").send("Prototype header marker missing");
  }
  const modernHeader='<header class="topbar garamaal-unified-header">'+
    '<div class="crumb">Workspace / <strong id="crumbTitle">Overview</strong></div>'+
    '<div class="top-actions garamaal-header-controls">'+
    '<div id="candidateToggle" class="switch" aria-label="Candidate workspace"></div>'+
    '<button id="expenseToggle" type="button" title="Recorded CV expenses" aria-label="Recorded CV expenses" data-action="expenses">$</button>'+
    '<a id="jobHeaderLink" class="btn garamaal-job-head-link active" href="/prototype" aria-current="page" title="Jobs">Job</a>'+
    '<a id="socialHeaderLink" href="/social?gmv3=1" class="btn garamaal-social-head-link" aria-label="Open Social Networking Hub" title="Social Networking Hub">Social</a>'+
    '<span id="modeBadge" class="demo garamaal-header-status" role="status" aria-live="polite" title="Google Sheets connection status">PREVIEW</span>'+
    '<div id="avatar" class="avatar">A</div></div></header>';
  html=html.replace(legacyHeader[0],modernHeader);
  // Use the same backend bridge and dashboard feature modules as GET /.
  html=html.replace("</head>",
    '<link rel="stylesheet" href="/prototype/mobile-shell.css?v=m26-neon-held-12">'+
    '<link rel="stylesheet" href="/prototype/hub.css?v=m26-neon-held-12">'+
    '<link rel="stylesheet" href="/prototype/collage.css?v=m26-cv-controls-18">'+
    '<link rel="stylesheet" href="/prototype/copper-porcelain.css?v=1">'+
    '<link rel="stylesheet" href="/prototype/copper-porcelain-fidelity.css?v=2">'+
    '<link rel="stylesheet" href="/prototype/career-theme.css?v=9">'+
    '<link rel="stylesheet" href="/prototype/royal-pages.css?v=stage2-review-1">'+
     '<link rel="stylesheet" href="/prototype/royal-repair.css?v=1"></head>');
  html=html.replace("<body>",'<body class="gmv3-landing">'+careerFragment);
  html=html.replace("<script>\n'use strict';",
    '<script src="/bridge.js"></script>\n<script>\n\'use strict\';');
  html=html.replace("</body>",
    '<script src="/dashboard-ranking.js"></script>'+
    '<script src="/dashboard-connections.js"></script>'+
    '<script src="/prototype/mobile-shell.js?v=m26-neon-held-12"></script>'+
    '<script src="/prototype/hub-jobs.js?v=m26-cv-controls-18"></script>'+ 
    '<script src="/prototype/hub-swipe.js?v=m26-cv-controls-18"></script>'+
    '<script src="/prototype/location-variants.js?v=m26-location-14"></script>'+
    '<script src="/prototype/filters-stats.js?v=m26-facets-15"></script>'+
     '<script src="/prototype/tactile-feedback.js?v=m26-neon-held-12"></script>'+
     '<script src="/prototype/ui-polish.js?v=m26-icons-16"></script>'+
     '<script src="/prototype/account-drawer.js?v=m26-neon-held-12"></script>'+
     '<script src="/prototype/profile-editor.js?v=m26-neon-held-12"></script>'+
    '<script src="/prototype/career-bridge.js?v=9"></script></body>');
  res.type("html").send(html);
});

async function authenticate(req) {
  const match=String(req.headers.authorization||"").match(/^Bearer\s+(.+)$/i);
  if(!match)throw Object.assign(new Error("Sign in to continue"),{httpCode:401});
  let claims;
  try { claims=await getAuth().verifyIdToken(match[1]); }
  catch { throw Object.assign(new Error("Your login has expired. Sign in again."),{httpCode:401}); }
  const email=String(claims.email||"").toLowerCase().trim();
  if(!claims.email_verified || !ALLOWED.includes(email))
    throw Object.assign(new Error("This Google account is not authorised for Automate CV"),{httpCode:403});
  return email;
}
// Lightweight authenticated live queue feed, polled by the Make CV cards.
app.post("/api/getCvQueue",async (req,res)=>{
  try {
    await authenticate(req);
    const result=await getCvQueue(process.env.GITHUB_WORKFLOW_TOKEN||"");
    res.json({data:result});
  } catch(error) {
    const status=error.httpCode||503;
    res.status(status).json({error:String(error.message||"Queue status unavailable").slice(0,300)});
  }
});
app.post("/api/download",async (req,res)=>{
  try {
    const email=await authenticate(req);
    const {candidate,row,kind}=req.body||{};
    const client=await auth.getClient();
    const access=await client.getAccessToken();
    const token=typeof access==="string"?access:access.token;
    if(!token)throw new Error("Cloud Run cannot access Google files");
    const document=await getDocument({candidate,row,kind,token,
      lookup:(person,jobRow)=>invoke("getJob",{source:"fresh",candidate:person,row:jobRow},{
        email,token,ids:IDS,readOnly:READ_ONLY,allowedEmails:ALLOWED.join(",")
      })
    });
    res.type(DOCX);
    res.set("Content-Disposition","attachment; filename=\""+document.name.replace(/\"/g,"")+"\"");
    if(document.size)res.set("Content-Length",String(document.size));
    Readable.fromWeb(document.response.body).on("error",()=>res.destroy()).pipe(res);
  } catch(error) {
    const status=error.httpCode||500;
    console.error("[cv-download] status="+status,String(error.message||"Error").slice(0,200));
    res.status(status).json({error:String(error.message||"Download failed").slice(0,300)});
  }
});
/* Only the authorised candidate and Freshmaal row can resolve a usage file.
 * Listing cost totals never downloads Token_Usage.json: zero added Drive traffic.
 */
app.post("/api/usage",async(req,res)=>{
  try{
    const email=await authenticate(req);
    const {candidate,row}=req.body||{};
    const client=await auth.getClient();
    const access=await client.getAccessToken();
    const token=typeof access==="string"?access:access.token;
    if(!token)throw new Error("Cloud Run cannot read Google Drive");
    const data=await tokenUsageForJob({candidate,row,token,
      lookup:(person,jobRow)=>invoke("getJob",{source:"fresh",candidate:person,row:jobRow},{
        email,token,ids:IDS,readOnly:READ_ONLY,allowedEmails:ALLOWED.join(",")
      })
    });
    res.json({data});
  }catch(error){
    const status=error.httpCode||500;
    console.error("[usage-proof]",status,String(error.message||"Error").slice(0,160));
    res.status(status).json({error:String(error.message||"Usage verification failed").slice(0,220)});
  }
});
// The ranking prompt itself is client-side and incurs no API charge.
// Formula repair is explicit, candidate-independent, and only touches AM/AO.
app.post("/api/repair-ranks",async(req,res)=>{
 try{
  const email=await authenticate(req);
  if(READ_ONLY)throw Object.assign(Error("Ranking repair requires live edit access."),{httpCode:403});
  const access=await (await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  if(!token)throw Error("Google spreadsheet permissions unavailable.");
  const result=await repairRankFormulas({token,spreadsheetId:IDS.fresh,
    confirm:req.body?.confirm===true,readOnly:READ_ONLY});
  console.log("[rank-formulas] repaired by authorised account; cells="+result.updatedCells);
  res.json({data:result});
 }catch(error){res.status(error.httpCode||500).json({error:String(error.message||"Rank repair failed").slice(0,250)})}
});
async function authorisedJob(req){
 const email=await authenticate(req);
 const candidate=String(req.body?.candidate||"");
 const row=Number(req.body?.row);
 if(!["Abhishek","Pooja"].includes(candidate)||!Number.isInteger(row)||row<3)
  throw Object.assign(Error("Invalid job."),{httpCode:400});
 const access=await (await auth.getClient()).getAccessToken();
 const token=typeof access==="string"?access:access.token;
 if(!token)throw Error("Google Sheets access unavailable.");
 const job=await invoke("getJob",{source:"fresh",candidate,row},{
   email,token,ids:IDS,readOnly:READ_ONLY,allowedEmails:ALLOWED.join(",")
 });
 if(!job||job.source!=="fresh"||job.row!==row)throw Object.assign(Error("Job row not found."),{httpCode:404});
 return {...job,candidate};
}
// Preview is free; a separate explicit click triggers one paid request.
// A long-lived key MUST be stored in a Cloud Run Secret Manager binding, never in the browser.
app.post("/api/clues/preview",async(req,res)=>{
 try{
  const job=await authorisedJob(req);
  if(!job.cvLink)throw Object.assign(Error("This insight is available after the CV is generated."),{httpCode:409});
  res.json({data:{job:{row:job.row,company:job.company,role:job.role,candidate:job.candidate},
    ...jdClues(job.jd),saved:false}});
 }catch(e){res.status(e.httpCode||500).json({error:String(e.message||"JD clues unavailable").slice(0,260)})}
});
app.post("/api/clues/save",async(req,res)=>{
 try{
  const job=await authorisedJob(req);
  if(!job.cvLink)throw Object.assign(Error("Save job insights after CV generation."),{httpCode:409});
  const access=await(await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  const result=await clueStore.save({token,spreadsheetId:IDS.fresh,job,
    clues:jdClues(job.jd),confirm:req.body?.confirm,readOnly:READ_ONLY});
  res.json({data:result});
 }catch(e){res.status(e.httpCode||500).json({error:String(e.message||"Unable to save JD clues").slice(0,260)})}
});
app.post("/api/connections/preview",async(req,res)=>{
 try{
  const job=await authorisedJob(req),tier=String(req.body?.tier||"1-5");
  const view=connections.preview(job,tier,!!process.env.OPENAI_API_KEY);
  // Existing saved contacts are read on demand (never during listing/refresh).
  const access=await (await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  const saved=await contactsStore.read({token,spreadsheetId:IDS.fresh,job});
  const enough=saved.contacts.length>=(connections.tiers[tier]?.min||Infinity);
  res.json({data:{...view,existingContacts:saved.contacts,sheetUrl:saved.url,
    cached:view.cached||enough,estimateUsd:enough?0:view.estimateUsd,permitted:view.permitted||enough}});
 }catch(e){res.status(e.httpCode||500).json({error:String(e.message||"Preview unavailable").slice(0,220)})}
});
app.post("/api/connections/research",async(req,res)=>{
 try{
  const job=await authorisedJob(req);
  const tier=String(req.body?.tier||"");
  if(req.body?.confirm!==true)throw Object.assign(Error("Confirm the estimated API charge before continuing."),{httpCode:400});
  // Prefer previously saved contacts when sufficient for this chosen tier.
  // Reopening a completed job never requires a paid search for the same count.
  const access=await (await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  const saved=await contactsStore.read({token,spreadsheetId:IDS.fresh,job});
  const plan=connections.tiers[tier];
  if(plan&&saved.contacts.length>=plan.min&&req.body?.refresh!==true){
    return res.json({data:{status:"ready",tier,contacts:saved.contacts,searches:connections.preview(job,tier,false).searches,
      costUsd:0,cached:true,persisted:true,sheetUrl:saved.url,
      warning:"Using existing Freshmaal Connections contacts at no additional model cost."}});
  }
  const data=await connections.research(job,tier,process.env.OPENAI_API_KEY||"");
  let persistence={saved:0,updated:0,skipped:0,url:saved.url};
  let persistenceError="";
  if(data.status==="ready"&&data.contacts.length){
    try{
      persistence=await contactsStore.save({token,spreadsheetId:IDS.fresh,job,contacts:data.contacts,readOnly:READ_ONLY});
    }catch(error){
      persistenceError="Research succeeded but contacts could not be saved to Freshmaal: "+String(error.message||error).slice(0,160);
      console.error("[connections-save]",String(error.message||"").slice(0,170));
    }
  }
  if(data.status==="ready"&&!data.cached)
    console.log("[connections] tier="+tier+" usedUsd="+data.costUsd+" people="+data.contacts.length);
  res.json({data:{...data,persisted:!persistenceError&&data.status==="ready",
    savedContacts:persistence.saved,updatedContacts:persistence.updated,sheetUrl:persistence.url,
    saveWarning:persistenceError}});
 }catch(e){console.error("[connections]",String(e.message||"").slice(0,180));
   res.status(e.httpCode||500).json({error:String(e.message||"Connections search failed").slice(0,260)})}
});
// Only manual duplicate-status Q updates: disabled unless explicitly approved.
// The existing CV / ranking / Social flows do not share this write gate.
const dupInFlight=new Set();
app.post("/api/duplicates/mark",async(req,res)=>{
 let lock=null;
 try{
  await authenticate(req);
  if(READ_ONLY||process.env.ALLOW_DUP_STATUS_WRITES!=="true")
   throw Object.assign(Error("Duplicate marking is staged and not enabled."),{httpCode:403});
  const prepared=duplicateStatus.validate(req.body||{});
  lock=String(prepared.row);
  if(dupInFlight.has(lock))throw Object.assign(Error("Duplicate status is being updated; retry."),{httpCode:409});
  dupInFlight.add(lock);
  const client=await auth.getClient();
  const result=await client.getAccessToken();
  const token=typeof result==="string"?result:result.token;
  if(!token)throw Object.assign(Error("Google Sheets identity unavailable"),{httpCode:503});
  const data=await duplicateStatus.markDuplicate({token,spreadsheetId:IDS.taaza,payload:req.body});
  res.json({data});
 }catch(error){
  res.status(error.httpCode||500).json({error:String(error.message||"Duplicate status update failed").slice(0,240)});
 }finally{
  if(lock)dupInFlight.delete(lock);
 }
});
// Manual Python workflows on GitHub, never paid OpenAI. Read-only is the
// default; write operations are doubly protected by a server-side gate and
// by GARAMAAL_ALERT_IMPORT_APPROVED in the Actions repository variables.
const alertRequests=new Map();
app.post("/api/alerts/run",async(req,res)=>{
 let action="";
 try{
  await authenticate(req);
  const kind=String(req.body?.kind||"");
  if(!["preview","dedupe","apply"].includes(kind))
   throw Object.assign(Error("Unsupported alert operation"),{httpCode:400});
  const cooldown=alertRequests.get(kind)||0;
  if(Date.now()-cooldown<60000)
   throw Object.assign(Error("Workflow was recently started. Check Last Run Status."),{httpCode:409});
  const flags={
   dispatchAllowed:process.env.ALLOW_ALERT_WORKFLOW_DISPATCH==="true",
   applyAllowed:process.env.GARAMAAL_ALERT_IMPORT_APPROVED==="true",
   token:process.env.GITHUB_WORKFLOW_TOKEN||""
  };
  action=kind;
  const data=await alertWorkflows.dispatch({kind,date:req.body?.date,
   startDate:req.body?.startDate,endDate:req.body?.endDate,token:flags.token,
   dispatchAllowed:flags.dispatchAllowed,applyAllowed:flags.applyAllowed,
    confirmed:req.body?.confirm===true});
  alertRequests.set(kind,Date.now());
  res.json({data});
 }catch(error){
  res.status(error.httpCode||503).json({error:String(error.message||"Workflow failed").slice(0,240)});
 }
});
app.post("/api/alerts/status",async(req,res)=>{
 try{
  await authenticate(req);
  const token=process.env.GITHUB_WORKFLOW_TOKEN||"";
  const flags=alertWorkflows.available({
   token,dispatchAllowed:process.env.ALLOW_ALERT_WORKFLOW_DISPATCH==="true",
   applyAllowed:process.env.GARAMAAL_ALERT_IMPORT_APPROVED==="true"
  });
  const runs=token?await alertWorkflows.latest({token}):{};
  let history=null;
  try {
   const access=await (await auth.getClient()).getAccessToken();
   const sheetToken=typeof access==="string"?access:access.token;
   history=await alertWorkflows.loadHistory({
    token:sheetToken,spreadsheetId:IDS.taaza
   });
  }catch(error){
   console.warn("[alert-history] optional log summary unavailable:",
    String(error.message||"error").slice(0,120));
  }
  res.json({data:{...flags,runs,history}});
 }catch(error){
  res.status(error.httpCode||503).json({error:String(error.message||"Workflow status unavailable").slice(0,240)});
 }
});
// JD recovery is ONLY user-triggered. Read GitHub state on demand; no timer or schedule
// starts a run. Guard both the dispatch permission and the actual Sheets write gate.
const jdRecoveryFlags=()=>({
 token:process.env.GITHUB_WORKFLOW_TOKEN||"",
 dispatchAllowed:process.env.ALLOW_JD_RECOVERY_DISPATCH==="true",
 applyAllowed:process.env.GARAMAAL_JD_RECOVERY_APPROVED==="true",
 readOnly:READ_ONLY
});
app.post("/api/jd-recovery/status",async(req,res)=>{
 try{
  await authenticate(req);
  res.json({data:await jdRecoveryWorkflows.status(jdRecoveryFlags())});
 }catch(error){
  res.status(error.httpCode||503).json({error:String(error.message||"JD recovery status unavailable").slice(0,240)});
 }
});
app.post("/api/jd-recovery/run",async(req,res)=>{
 try{
  await authenticate(req);
  // One click is affirmative consent for this one 25-vacancy batch.
  // Do not accept client-selected ref, workflow, CSV, job URLs or token.
  const result=await jdRecoveryWorkflows.dispatch(jdRecoveryFlags());
  res.json({data:result});
 }catch(error){
  res.status(error.httpCode||503).json({error:String(error.message||"JD recovery could not start").slice(0,240)});
 }
});
// Swipe uses a candidate-specific release controller with strict method allowlist.
// It never permits paid CV dispatch, new job insertion, or Social mutations.
app.post("/api/swipe/:method",async (req,res)=>{
  try {
    const method=req.params.method;
    if(!SWIPE_METHODS.has(method))
      return res.status(404).json({error:"Unsupported Swipe operation"});
    const email=await authenticate(req);
    const client=await auth.getClient();
    const access=await client.getAccessToken();
    const token=typeof access==="string"?access:access.token;
    if(!token)throw Object.assign(Error("Google Sheets access unavailable"),{httpCode:503});
    const data=await invokeSwipe(method,req.body?.arg,{
      email,token,ids:IDS,readOnly:READ_ONLY,
      githubToken:"",allowedEmails:ALLOWED.join(",")
    });
    res.json({data});
  }catch(error){
    res.status(error.httpCode||500).json({error:String(error.message||"Swipe action failed").slice(0,350)});
  }
});
app.post("/api/:method",async (req,res)=>{
  try {
    if(!METHODS.has(req.params.method))
      return res.status(404).json({error:"Unknown operation"});
    // Keep paid GitHub/OpenAI execution explicitly disabled during cutover.
    if(req.params.method==="runCvApiNow" && process.env.ALLOW_MANUAL_CV_DISPATCH!=="true")
      return res.status(403).json({error:"Manual CV dispatch is disabled until separately configured and approved."});
    const email=await authenticate(req);
    if(req.params.method==="runCvApiNow") {
      // GitHub's live job queue blocks another paid dispatch for the same job.
      // The legacy five-minute cache remains as a second safeguard.
      const body=req.body?.arg||{};
      const candidate=String(body.candidate||"").toLowerCase();
      const row=Number(body.row);
      if(["abhishek","pooja"].includes(candidate)&&Number.isInteger(row)&&row>=3) {
        const queue=await getCvQueue(process.env.GITHUB_WORKFLOW_TOKEN||"");
        if(queue.byJob[candidate+":"+row])
          throw Object.assign(new Error("This CV is already queued or running on GitHub Actions."),{httpCode:409});
      }
    }
    const client=await auth.getClient();
    const access=await client.getAccessToken();
    const token=typeof access==="string"?access:access.token;
    if(!token)throw new Error("Cloud Run cannot access the authorised Google Sheets");
    const data=await invoke(req.params.method,req.body?.arg,{
      email,token,ids:IDS,readOnly:READ_ONLY,githubToken:process.env.GITHUB_WORKFLOW_TOKEN||"",
      allowedEmails:ALLOWED.join(",")
    });
    res.json({data});
  } catch(error) {
    const status=error.httpCode||(/Invalid|No |changed in Google Sheets|job row|cannot|unknown/i.test(error.message)?400:500);
    console.error("[cv-api]",req.params.method,"status="+status,String(error.message||"Error").slice(0,350));
    res.status(status).json({error:String(error.message||"Operation failed").slice(0,500)});
  }
});
app.use((req,res)=>res.status(404).type("text").send("Not found"));
if(require.main===module)app.listen(PORT,"0.0.0.0",()=>console.log("[cv-api] listening port",PORT));
module.exports={app};
