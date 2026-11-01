"use strict";
/* Private, authenticated, candidate-scoped proxy from the EXISTING Garamaal
 * site to the isolated staging Profile API. It does not activate the CV worker
 * or change Jobs/Social, Cloud Run routing, or spreadsheet permissions.
 */
const {GoogleAuth}=require("google-auth-library");

const STAGING_SERVICE_URL="https://garamaal-profile-staging-vv25bizjcq-ew.a.run.app";
const STAGING_REVISION_URL="https://profile-edit---garamaal-profile-staging-vv25bizjcq-ew.a.run.app";
const ALLOWED_ACTIONS=new Set(["read","save","history","history-version","match","cv-package"]);
const error=(message,httpCode)=>Object.assign(Error(message),{httpCode});

function enabled(){
 return process.env.GARAMAAL_PROFILE_BETA_ENABLED==="true"&&
  process.env.GARAMAAL_PROFILE_BETA_DATA_SCOPE==="staging"&&
  process.env.GARAMAAL_PROFILE_BETA_EMAIL==="abhisheknair607@gmail.com";
}
function register(app,{authenticate}){
 const auth=new GoogleAuth();
 let clientPromise=null;
 const getClient=()=>clientPromise||(clientPromise=auth.getIdTokenClient(STAGING_SERVICE_URL).catch(e=>{
   clientPromise=null;throw e;
 }));
 app.post("/api/profile/structured/:action",async(req,res)=>{
  res.set("Cache-Control","private, no-store");
  try{
   if(!enabled())throw error("Profile beta is not enabled",404);
   const action=req.params.action;
   if(!ALLOWED_ACTIONS.has(action))throw error("Unknown Profile beta action",404);
   const email=await authenticate(req);
   if(email!==process.env.GARAMAAL_PROFILE_BETA_EMAIL)
    throw error("Profile beta is restricted to the approved test account",403);
   const candidate=String(req.body?.candidate||"").toLowerCase();
   if(!["abhishek","pooja"].includes(candidate))throw error("Invalid candidate",400);
   if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))throw error("Invalid body",400);
   const token=String(req.headers.authorization||"");
   if(!/^Bearer\s+[^\s]+$/i.test(token))throw error("Firebase sign-in required",401);
   const client=await getClient();
   let result;
   try{
    result=await client.request({
      url:STAGING_REVISION_URL+"/api/profile/structured/"+encodeURIComponent(action),
      method:"POST",data:req.body,
      headers:{"X-Garamaal-Firebase-Authorization":token,"Content-Type":"application/json"},
      timeout:20000,responseType:"json"
    });
   }catch(err){
    const status=Number(err.response?.status)||502;
    if(status>=400&&status<500){
     return res.status(status).json({error:String(err.response?.data?.error||"Profile beta request was rejected").slice(0,180)});
    }
    console.error("[profile-beta] upstream status",status);
    throw error("Staging Profile service is temporarily unavailable",503);
   }
   return res.status(200).json(result.data);
  }catch(err){
   const status=err.httpCode||503;
   console.error("[profile-beta] response",status);
   return res.status(status).json({error:status>=500?"Profile beta is temporarily unavailable":String(err.message).slice(0,170)});
  }
 });
}
module.exports={register,enabled,ALLOWED_ACTIONS,STAGING_SERVICE_URL,STAGING_REVISION_URL};
