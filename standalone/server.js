"use strict";
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const {GoogleAuth} = require("google-auth-library");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {invoke,METHODS} = require("./runtime");
const {getCvQueue} = require("./queue");
const {Readable} = require("node:stream");
const {DOCX,getDocument} = require("./download");
const {tokenUsageForJob} = require("./cost_usage");
const connections=require("./connections");
const {jdClues}=require("./job_clues");
const clueStore=require("./clue_store");
const contactsStore=require("./contacts_store");
const socialStore=require("./social_store");
const socialResearch=require("./social_research");
const {repairRankFormulas}=require("./rank_formulas");

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
const auth = new GoogleAuth({scopes:["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/drive.file"]});
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1);
app.use("/api/social/conversations/save",express.json({limit:"5mb"}));
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

app.get("/social",(req,res)=>res.type("html").sendFile(path.join(__dirname,"social.html")));
app.get("/",(req,res)=>{
  let html=fs.readFileSync(path.join(BASE,"webapp/Index.html"),"utf8");
  // Preserve existing authenticated dashboard; inject its Cloud Run transport.
  // Installable PWA assets never cache authenticated Google Sheets responses.
  html=html.replace("<script>\n'use strict';",
    "<script src=\"/bridge.js\"></script>\n<script>\n'use strict';");
  html=html.replace("</body>",'<script src="/dashboard-ranking.js"></script><script src="/dashboard-connections.js"></script></body>');
  // Expose Social as a separate route; do not alter the existing Jobs controls.
  // Keep the established Jobs header controls intact. Social is an extra
  // desktop sidebar entry plus a compact mobile shortcut beside the breadcrumb.
  html=html.replace('<nav id="deskNav"></nav>',
    '<nav id="deskNav"></nav><a id="socialSideLink" href="/social" aria-label="Social Networking">👥 <span>Social</span></a>');
  html=html.replace('Workspace / <strong id="crumbTitle">Overview</strong></div>',
    'Workspace / <strong id="crumbTitle">Overview</strong><a id="socialTopLink" href="/social" aria-label="Open Social Networking" title="Social Networking">👥</a></div>');
  html=html.replace('</style>', `
#socialSideLink{display:flex;align-items:center;gap:10px;margin:6px 10px;padding:11px 15px;border-radius:10px;color:#c4d9f7;font-weight:720;text-decoration:none}
#socialSideLink:hover{color:white;background:#294968}
#socialTopLink{display:none;margin-left:8px;padding:4px 6px;border:1px solid #dce6f3;border-radius:8px;font-size:17px;text-decoration:none}
@media(max-width:720px){#socialTopLink{display:inline-flex;vertical-align:middle}#socialSideLink{display:none}.crumb{white-space:nowrap}}
@media(max-width:385px){.crumb{font-size:11px}#socialTopLink{margin-left:4px}}
</style>`);
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
// Read saved contacts without payment or requiring Web to remain checked.
app.post("/api/connections/saved",async(req,res)=>{
 try{
  const job=await authorisedJob(req);
  const access=await (await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  const saved=await contactsStore.read({token,spreadsheetId:IDS.fresh,job});
  res.json({data:{contacts:saved.contacts,sheetUrl:saved.url,count:saved.contacts.length,
    candidate:job.candidate,row:job.row}});
 }catch(error){
  res.status(error.httpCode||500).json({error:String(error.message||"Contacts unavailable").slice(0,230)});
 }
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
// Scoped Social/Research operations: require authenticated Garamaal user and
// an explicit A/P workspace selection. Candidate records stay separated in storage.
app.post("/api/social/*",async(req,res)=>{
 try{
  await authenticate(req); // Existing Garamaal Google sign-in still governs platform access.
  // A/P is a workspace selector, not an email-based permission boundary.
  const candidate=socialStore.selectedCandidate(req.body?.candidate);
  const action=req.params[0],body=req.body||{};
  if(!["data","status","followup","import","inbox/save","inbox/list","templates/get","templates/save","targets/list","targets/save","conversations/list","conversations/save","conversations/draft"].includes(action))
    return res.status(404).json({error:"Unknown Social operation"});
  const write=["status","followup","import","inbox/save","templates/save","targets/save","conversations/save","conversations/draft"].includes(action);
  if(write&&READ_ONLY)throw Object.assign(Error("Social writes are disabled by the server's read-only gate."),{httpCode:403});
  const access=await(await auth.getClient()).getAccessToken();
  const token=typeof access==="string"?access:access.token;
  if(!token)throw Error("Google Sheets / Drive credentials unavailable.");
  const base={token,candidate,id:IDS.fresh};
  let data;
  if(action==="data")data={candidate,...await socialStore.list(base)};
  else if(action==="templates/get")data=await socialStore.getTemplates(base);
  else if(action==="templates/save")data=await socialStore.saveTemplate({...base,department:body.department,introduction:body.introduction,closing:body.closing,confirm:body.confirm});
  else if(action==="targets/list")data=await socialResearch.listTargets(base);
  else if(action==="targets/save")data=await socialResearch.saveTarget({...base,company:body.company,department:body.department,city:body.city,searchUrl:body.searchUrl,confirm:body.confirm});
  else if(action==="conversations/list")data=await socialResearch.listConversations(base);
  else if(action==="conversations/save")data=await socialResearch.saveConversation({...base,contact:body.contact,company:body.company,chatText:body.chatText,imageData:body.imageData,mimeType:body.mimeType,confirm:body.confirm});
  else if(action==="conversations/draft")data=await socialResearch.saveDraft({...base,conversationId:body.id,draft:body.draft,next:body.next,status:body.status,confirm:body.confirm});
  else if(action==="status")data=await socialStore.writeStatus({...base,key:body.key,status:body.status,next:body.next,
     department:body.department,city:body.city,type:body.type,confirm:body.confirm});
  else if(action==="followup")data=await socialStore.setFollowup({...base,key:body.key,confirm:body.confirm});
  else if(action==="import")data=await socialStore.importContacts({...base,driveAccess:token,
     items:body.items,confirm:body.confirm,sourceFileId:body.sourceFileId});
  else if(action==="inbox/save")data=await socialStore.submitResearch({token,candidate,
     company:body.company,department:body.department,pageUrl:body.pageUrl,pastedText:body.pastedText});
  else if(action==="inbox/list")data=await socialStore.listResearch({token,candidate});
  res.json({data});
 }catch(error){
  console.error("[social]",req.params[0],String(error.message||"error").slice(0,180));
  res.status(error.httpCode||500).json({error:String(error.message||"Social operation failed").slice(0,300)});
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
