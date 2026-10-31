"use strict";
/**
 * Private, server-only candidate ACL. The existing Firebase allowlist grants
 * login to Garamaal; this separate ACL grants access to career evidence.
 * No client-supplied owner IDs, Firestore paths, or candidate impersonation.
 */
const {createHash}=require("node:crypto");
const {candidate}=require("./profile_evidence");
const unauthorized=(message,status)=>Object.assign(Error(message),{httpCode:status});
const normalizeEmail=email=>{
 const value=String(email||"").trim().toLowerCase();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)||value.length>320)
  throw unauthorized("Verified sign-in email is required",403);
 return value;
};
const ownerDigest=email=>createHash("sha256").update(normalizeEmail(email)).digest("hex");
/**
 * Env JSON example:
 * {"person@example.com":["pooja"],"trusted-admin@example.com":["pooja","abhishek"]}
 * Only the selected, already authenticated email may be checked; no delegated
 * access or wildcard matching. Invalid or missing ACL => 503 fail closed.
 */
function parseAcl(raw){
 if(!raw||!String(raw).trim())throw unauthorized("Candidate profile permissions are not configured",503);
 let obj;
 try{obj=JSON.parse(raw)}catch{throw unauthorized("Candidate profile permissions are invalid",503)}
 if(!obj||typeof obj!=="object"||Array.isArray(obj))throw unauthorized("Invalid candidate permission map",503);
 const normalized=Object.create(null);
 for(const [email,grants] of Object.entries(obj)){
  if(email!==normalizeEmail(email)||!Array.isArray(grants)||grants.length<1)
   throw unauthorized("Invalid candidate permission entry",503);
  const unique=[...new Set(grants)];
  if(unique.some(x=>!["abhishek","pooja"].includes(x)))
   throw unauthorized("Unknown candidate in permission map",503);
  normalized[email]=unique;
 }
 return normalized;
}
function permit(email,key,raw=process.env.GARAMAAL_PROFILE_CANDIDATE_ACL_JSON){
 const address=normalizeEmail(email),selected=candidate(key);
 const acl=parseAcl(raw);
 if(!Object.prototype.hasOwnProperty.call(acl,address) || !acl[address].includes(selected))
  throw unauthorized("This account does not have access to the selected candidate profile",403);
 return {email:address,ownerDigest:ownerDigest(address),candidate:selected};
}
module.exports={parseAcl,permit,ownerDigest,normalizeEmail};
