"use strict";
/**
 * Immutable, candidate-owned Firestore revision snapshots. Writes are in the
 * same transaction as the current profile document; no unversioned mutation.
 */
const {createHash}=require("node:crypto");
const fail=(msg,httpCode=400)=>Object.assign(Error(msg),{httpCode});
const asJSON=obj=>JSON.parse(JSON.stringify(obj));
const bytes=value=>Buffer.byteLength(JSON.stringify(value),"utf8");
const MAX_BYTES=850000;
const pad=number=>String(number).padStart(10,"0");
const actorId=email=>createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
function validateSnapshot(profile){
 if(!profile||!Number.isInteger(profile.revision)||profile.revision<1||
    !["pooja","abhishek"].includes(profile.candidate))throw fail("Invalid versioned profile",409);
 if(bytes(profile)>MAX_BYTES)throw fail("Profile exceeds the safe Firestore document size limit",413);
 return profile;
}
function versionDoc(profile,{email,action,at=new Date().toISOString()}){
 validateSnapshot(profile);
 if(!/^[a-z][a-z0-9-]{0,45}$/.test(String(action||"")))
  throw fail("Invalid history operation");
 const snapshot=asJSON(profile);
 const raw={
  revision:profile.revision,candidate:profile.candidate,actor:actorId(email),
  action,createdAt:at,recordCount:profile.records?.length||0,
  sourceHashes:(profile.sources||[]).map(x=>({kind:x.kind,sha256:x.sha256})),
  profile:snapshot
 };
 if(bytes(raw)>=MAX_BYTES)throw fail("Version snapshot exceeds Firestore size limit",413);
 return raw;
}
function recordRevision(tx,ref,profile,options){
 const history=versionDoc(profile,options);
 tx.set(ref.collection("versions").doc(pad(profile.revision)),history,{merge:false});
 tx.set(ref,profile,{merge:false});
 return {revision:profile.revision,candidate:profile.candidate,action:history.action};
}
function backfillBaseline(tx,ref,current,email){
 if(!current?.imported)return;
 const historic=versionDoc(current,{email,action:"legacy-baseline"});
 // Only called in a transaction that has already read and asserted that the
 // current document revision has not changed.
 tx.set(ref.collection("versions").doc(pad(current.revision)),historic,{merge:false});
}
function historySummary(doc){
 const x=doc.data(),d=x||{};
 return {
  revision:d.revision,createdAt:d.createdAt,action:d.action,
  recordCount:d.recordCount,sourceHashes:(d.sourceHashes||[]).map(z=>({kind:z.kind,sha256:z.sha256}))
 };
}
function verifyHistoryRead(current,version){
 if(!version||!current)throw fail("Missing historical profile",404);
 if(version.candidate!==current.candidate || version.profile?.candidate!==current.candidate)
  throw fail("Historical profile ownership mismatch",403);
 if(!Number.isInteger(version.revision)||version.revision>current.revision||version.revision<1)
  throw fail("Invalid history revision",409);
 return asJSON(version);
}
module.exports={MAX_BYTES,pad,recordRevision,backfillBaseline,versionDoc,historySummary,verifyHistoryRead,validateSnapshot};
