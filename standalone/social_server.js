"use strict";
/**
 * Garamaal Social-only Cloud Run service.
 * Does NOT import the CV runtime, routes, Sheets Jobs logic, or Apps Script.
 * Firebase Hosting / and all Jobs endpoints continue to use the original
 * automate-cv-dashboard service and its unchanged revision.
 */
const express=require("express");
const path=require("node:path");
const {GoogleAuth}=require("google-auth-library");
const {initializeApp,getApps}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const social=require("./social_store");
const research=require("./social_research");

const project=process.env.GOOGLE_CLOUD_PROJECT||process.env.FIREBASE_PROJECT_ID||"";
const allowed=new Set(String(process.env.ALLOWED_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
const readOnly=process.env.SOCIAL_READ_ONLY!=="false"||process.env.SOCIAL_ALLOW_LIVE_WRITES!=="true";
const spreadsheetId=process.env.FRESHMAL_SPREADSHEET_ID||"";
const release=String(process.env.SOCIAL_GIT_SHA||"unlabelled").replace(/[^0-9a-f]/g,"").slice(0,40)||"unlabelled";
if(!getApps().length)initializeApp({projectId:project||undefined});
const sheetsAuth=new GoogleAuth({scopes:[
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly"
]});
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1);
app.use("/api/social/inbox/image",express.json({limit:"5mb"}));
app.use("/api/social/conversations/save",express.json({limit:"5mb"}));
app.use(express.json({limit:"120kb"}));
app.use((_req,res,next)=>{
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","same-origin");
  res.set("Cache-Control","no-store");
  next();
});
const bad=(message,httpCode)=>Object.assign(new Error(message),{httpCode});
// Social-only delegated Google Drive authorization. Never accept a Drive token
// from a different Google account, even when that account may view Garamaal.
const SOCIAL_DRIVE_UPLOADER="abhisheknair607@gmail.com";
async function delegatedDriveToken(payload,sessionEmail,fetcher=fetch){
  const token=String(payload?.driveAccessToken||"");
  if(token.length<20||token.length>8192||!/^[A-Za-z0-9._~+/-]+$/.test(token))
    throw bad("Connect the approved Google Drive account before uploading.",403);
  if(sessionEmail!==SOCIAL_DRIVE_UPLOADER)
    throw bad("Social uploads require the approved Google account.",403);
  let response;
  try{response=await fetcher("https://www.googleapis.com/oauth2/v3/userinfo",{
    headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(10000)
  })}catch{throw bad("Google Drive authorization could not be verified. Reconnect and retry.",503)}
  if(!response.ok)throw bad("Google Drive permission has expired or was denied. Reconnect and retry.",403);
  const profile=await response.json().catch(()=>({}));
  if(profile.email_verified!==true||String(profile.email||"").trim().toLowerCase()!==SOCIAL_DRIVE_UPLOADER)
    throw bad("The Google Drive permission belongs to a different account.",403);
  return token;
}
async function authenticate(req){
  const token=String(req.headers.authorization||"").match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!token)throw bad("Sign in to Garamaal to continue.",401);
  let claims;
  try{claims=await getAuth().verifyIdToken(token)}catch{throw bad("Sign-in expired or invalid.",401)}
  const email=String(claims.email||"").toLowerCase().trim();
  if(!claims.email_verified||!allowed.has(email))throw bad("Google account is not authorised for Garamaal.",403);
  return email;
}
async function accessToken(){
  const c=await sheetsAuth.getClient();
  const a=await c.getAccessToken();
  const token=typeof a==="string"?a:a.token;
  if(!token)throw bad("Social storage credentials unavailable.",503);
  return token;
}

app.get("/health",(_req,res)=>res.json({
  ok:true,service:"garamaal-social",readOnly,release,credentialsConfigured:!!project&&!!allowed.size
}));
// Social-only preview /config. The shared browser bridge expects same-origin
// public Firebase web settings, while the isolated Cloud Run image deliberately
// has no Jobs configuration or secret environment variables. Read the existing
// PUBLIC Firebase config from Garamaal Hosting and emit only SDK-safe fields.
// This is a read-only request: Jobs routes, images and settings are untouched.
async function publicFirebaseConfig(fetcher=fetch){
  let response;
  try {
    response=await fetcher("https://garamaal.web.app/config",{
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)
    });
  }catch{throw bad("Public Firebase configuration unavailable.",503)}
  if(!response.ok)throw bad("Public Firebase configuration unavailable.",503);
  const body=await response.json().catch(()=>({}));
  const keys=["apiKey","authDomain","projectId","appId"];
  if(keys.some(k=>typeof body[k]!=="string"||!body[k]||body[k].length>1024)
     ||body.projectId!==project
     ||!/^[A-Za-z0-9.-]+$/.test(body.authDomain))
    throw bad("Public Firebase configuration is incomplete or mismatched.",503);
  return Object.fromEntries(keys.map(k=>[k,body[k]]));
}
app.get("/config",async(_req,res)=>{
 try{res.json(await publicFirebaseConfig())}
 catch{res.status(503).json({error:"Social sign-in configuration unavailable."})}
});

app.get("/social",(_req,res)=>res.type("html").sendFile(path.join(__dirname,"social.html")));
app.get("/social/bridge.js",(_req,res)=>res.type("text/javascript").sendFile(path.join(__dirname,"bridge.js")));

app.post("/api/social/*",async(req,res)=>{
  try{
    const sessionEmail=await authenticate(req);
    if(!spreadsheetId||!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId))
      throw bad("Freshmaal sheet is not configured for Social.",503);
    const candidate=social.selectedCandidate(req.body?.candidate);
    const action=req.params[0]||"",payload=req.body||{};
    const supported=["data","status","followup","import","inbox/save","inbox/list","inbox/image","templates/get","templates/save","targets/list","targets/save","conversations/list","conversations/save","conversations/draft"];
    if(!supported.includes(action))return res.status(404).json({error:"Unknown Social operation."});
    const write=["status","followup","import","inbox/save","inbox/image","templates/save","targets/save","conversations/save","conversations/draft"].includes(action);
    if(write&&readOnly)throw bad("Social writes are disabled until release approval.",403);
    const delegatedRequired=["inbox/save","inbox/image","conversations/save"].includes(action)
      ||(action==="import"&&Boolean(payload.sourceFileId));
    const driveAccess=delegatedRequired?await delegatedDriveToken(payload,sessionEmail):null;
    const token=await accessToken();
    const base={token,id:spreadsheetId,candidate};
    let data;
    if(action==="data")data={candidate,readOnly,...await social.list(base)};
    else if(action==="status")data=await social.writeStatus({...base,key:payload.key,status:payload.status,
      next:payload.next,department:payload.department,city:payload.city,type:payload.type,confirm:payload.confirm});
    else if(action==="followup")data=await social.setFollowup({...base,key:payload.key,confirm:payload.confirm});
    else if(action==="import")data=await social.importContacts({...base,driveAccess,
      items:payload.items,sourceFileId:payload.sourceFileId,confirm:payload.confirm});
    else if(action==="inbox/save")data=await social.submitResearch({
      token:driveAccess,candidate,company:payload.company,department:payload.department,pageUrl:payload.pageUrl,pastedText:payload.pastedText});
    else if(action==="inbox/list")data=await social.listResearch({token,candidate});
    else if(action==="inbox/image")data=await research.saveLeadScreenshot({token:driveAccess,candidate,company:payload.company,department:payload.department,city:payload.city,imageData:payload.imageData,mimeType:payload.mimeType,confirm:payload.confirm});
    else if(action==="templates/get")data=await social.getTemplates(base);
    else if(action==="templates/save")data=await social.saveTemplate({...base,department:payload.department,introduction:payload.introduction,closing:payload.closing,confirm:payload.confirm});
    else if(action==="targets/list")data=await research.listTargets(base);
    else if(action==="targets/save"){
      data=payload.catalogKind
        ?await research.saveCatalogName({...base,kind:payload.catalogKind,name:payload.catalogName,confirm:payload.confirm})
        :await research.saveTarget({...base,company:payload.company,department:payload.department,city:payload.city,confirm:payload.confirm});
    }
    else if(action==="conversations/list")data=await research.listConversations(base);
    else if(action==="conversations/save")data=await research.saveConversation({...base,driveToken:driveAccess,contact:payload.contact,company:payload.company,chatText:payload.chatText,imageData:payload.imageData,mimeType:payload.mimeType,confirm:payload.confirm});
    else if(action==="conversations/draft")data=await research.saveDraft({...base,conversationId:payload.id,draft:payload.draft,next:payload.next,status:payload.status,confirm:payload.confirm});
    res.json({data});
  }catch(e){
    console.error("[garamaal-social]",String(req.params[0]||""),e.httpCode||500,
      String(e.message||"Social error").slice(0,130));
    res.status(e.httpCode||500).json({error:String(e.message||"Social operation failed").slice(0,260)});
  }
});
app.use((_req,res)=>res.status(404).type("text").send("Not found"));
if(require.main===module)app.listen(Number(process.env.PORT||8080),"0.0.0.0",
  ()=>console.log("[garamaal-social] listening; write gate="+(readOnly?"read-only":"enabled")));
module.exports={app,delegatedDriveToken,publicFirebaseConfig};
