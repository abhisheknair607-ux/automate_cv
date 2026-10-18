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
app.use(express.json({limit:"120kb"}));
app.use((_req,res,next)=>{
  res.set("X-Content-Type-Options","nosniff");
  res.set("Referrer-Policy","same-origin");
  res.set("Cache-Control","no-store");
  next();
});
const bad=(message,httpCode)=>Object.assign(new Error(message),{httpCode});
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
app.get("/social",(_req,res)=>res.type("html").sendFile(path.join(__dirname,"social.html")));
app.get("/social/bridge.js",(_req,res)=>res.type("text/javascript").sendFile(path.join(__dirname,"bridge.js")));

app.post("/api/social/*",async(req,res)=>{
  try{
    await authenticate(req);
    if(!spreadsheetId||!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId))
      throw bad("Freshmaal sheet is not configured for Social.",503);
    const candidate=social.selectedCandidate(req.body?.candidate);
    const action=req.params[0]||"",payload=req.body||{};
    const supported=["data","status","followup","import","inbox/save","inbox/list"];
    if(!supported.includes(action))return res.status(404).json({error:"Unknown Social operation."});
    const write=["status","followup","import","inbox/save"].includes(action);
    if(write&&readOnly)throw bad("Social writes are disabled until release approval.",403);
    const token=await accessToken();
    const base={token,id:spreadsheetId,candidate};
    let data;
    if(action==="data")data={candidate,...await social.list(base)};
    else if(action==="status")data=await social.writeStatus({...base,key:payload.key,status:payload.status,
      next:payload.next,department:payload.department,city:payload.city,type:payload.type,confirm:payload.confirm});
    else if(action==="followup")data=await social.setFollowup({...base,key:payload.key,confirm:payload.confirm});
    else if(action==="import")data=await social.importContacts({...base,driveAccess:token,
      items:payload.items,sourceFileId:payload.sourceFileId,confirm:payload.confirm});
    else if(action==="inbox/save")data=await social.submitResearch({
      token,candidate,company:payload.company,department:payload.department,pageUrl:payload.pageUrl,pastedText:payload.pastedText});
    else if(action==="inbox/list")data=await social.listResearch({token,candidate});
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
module.exports={app};
