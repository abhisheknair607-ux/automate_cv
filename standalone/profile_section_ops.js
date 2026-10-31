"use strict";
/* Pure Stage 3 Profile mutations. Never alter imported original evidence in-place.
 * All operations run inside the existing authenticated Firestore revision transaction.
 */
const {randomUUID}=require("node:crypto");
const {metricsFrom}=require("./profile_evidence");
const error=(message,httpCode=400)=>Object.assign(Error(message),{httpCode});
const isObject=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
function section(profile,id){return profile.sections.find(s=>s.id===id);}
function addSection(profile,body){
 const title=String(body.title||"").trim();
 if(title.length<2||title.length>90)throw error("Section name must be 2–90 characters");
 if(profile.sections.length>=40)throw error("Maximum 40 sections");
 if(profile.sections.some(s=>s.title.toLowerCase()===title.toLowerCase()))throw error("A section with this name already exists");
 const id="custom_"+randomUUID().replace(/-/g,"").slice(0,18);
 profile.sections.push({id,title,archived:false,custom:true});
 return id;
}
function manageSection(profile,body){
 const id=String(body.id||"");
 const index=profile.sections.findIndex(s=>s.id===id);
 if(index<0)throw error("Section not found",404);
 const target=profile.sections[index],action=String(body.action||"");
 if(action==="rename"){
  if(!id.startsWith("custom_"))throw error("Built-in section names are protected");
  const title=String(body.title||"").trim();
  if(title.length<2||title.length>90)throw error("Section name must be 2–90 characters");
  if(profile.sections.some(s=>s.id!==id&&s.title.toLowerCase()===title.toLowerCase()))throw error("Section title already exists");
  target.title=title;return;
 }
 if(action==="move-up"||action==="move-down"){
  const to=index+(action==="move-up"?-1:1);
  if(to<0||to>=profile.sections.length)throw error("Section already at the edge");
  const other=profile.sections[to];
  profile.sections[to]=target;profile.sections[index]=other;
  return;
 }
 if(action==="archive"){
  if(!id.startsWith("custom_"))throw error("Built-in sections cannot be archived");
  if(profile.records.some(r=>r.section===id))throw error("Move the evidence to another section before archiving");
  if(target.archived)throw error("Section already archived");
  target.archived=true;return;
 }
 if(action==="restore"){
  if(!id.startsWith("custom_")||!target.archived)throw error("Section is not archived");
  target.archived=false;return;
 }
 throw error("Unknown section operation");
}
function addRecord(profile,body){
 const sectionId=String(body.section||"achievements");
 const to=section(profile,sectionId);
 if(!to||to.archived)throw error("Choose an active section");
 const text=String(body.originalText||"").trim();
 if(text.length<2||text.length>12000)throw error("Factual evidence description must be 2–12000 characters");
 const title=String(body.title||"").trim();
 if(title.length<2||title.length>180)throw error("Evidence title must be 2–180 characters");
 const id=randomUUID();
 profile.records.push({id,section:sectionId,title,
  originalText:text,source:{kind:"user",fileId:"",locator:"Candidate-added evidence",index:-1},
  metrics:metricsFrom(text),metricsReviewed:false,star:{situation:"",task:"",action:"",result:""},
  cvBullet:"",status:"needs-review",classificationReviewed:true,cvEligible:true,tags:[]});
 return id;
}
function patchRecord(profile,body){
 const entry=profile.records.find(r=>r.id===body.id);
 if(!entry)throw error("Record not found",404);
 const changes=body.changes;
 if(!isObject(changes)||Object.keys(changes).length===0)throw error("Missing record changes");
 const allowed=new Set(["title","section","cvBullet","status","metricsReviewed","star","tags","classificationReviewed","originalText"]);
 for(const key of Object.keys(changes))if(!allowed.has(key))throw error("Original evidence and provenance are protected");
 // Validate everything first so one invalid value never partially applies.
 if("title" in changes){
  if(typeof changes.title!=="string"||changes.title.trim().length<2||changes.title.length>180)throw error("Invalid evidence title");
 }
 if("originalText" in changes){
  if(entry.source?.kind!=="user")throw error("Imported Drive evidence cannot be overwritten");
  if(typeof changes.originalText!=="string"||changes.originalText.trim().length<2||changes.originalText.length>12000)throw error("Invalid original text");
 }
 if("section" in changes){
  const target=section(profile,changes.section);
  if(!target||target.archived)throw error("Cannot move evidence to an unavailable section");
 }
 if("cvBullet" in changes&&(typeof changes.cvBullet!=="string"||changes.cvBullet.length>4000))
  throw error("Invalid CV draft");
 if("status" in changes){
  if(!["needs-review","verified","exclude"].includes(changes.status))throw error("Invalid evidence status");
  if(changes.status==="verified"&&entry.cvEligible===false)throw error("Router references cannot be verified CV evidence");
 }
 if("metricsReviewed" in changes&&typeof changes.metricsReviewed!=="boolean")throw error("Invalid metrics approval");
 if("classificationReviewed" in changes&&typeof changes.classificationReviewed!=="boolean")throw error("Invalid classification review");
 if("tags" in changes&&(!Array.isArray(changes.tags)||changes.tags.length>30||
    changes.tags.some(x=>typeof x!=="string"||x.length>60)))throw error("Invalid keywords");
 if("star" in changes){
  if(!isObject(changes.star))throw error("Invalid STAR fields");
  for(const key of ["situation","task","action","result"])
   if(typeof changes.star[key]!=="string"||changes.star[key].length>4000)throw error("Invalid STAR field");
 }
 if("originalText" in changes&&changes.originalText!==entry.originalText){
  // Full user-authored change history is a later stage; retain previous text for review.
  entry.previousUserText=entry.originalText;
  entry.originalText=changes.originalText.trim();
  entry.metrics=metricsFrom(entry.originalText);
  entry.metricsReviewed=false;
  entry.status="needs-review";
 }
 if("title" in changes)entry.title=changes.title.trim();
 if("section" in changes)entry.section=changes.section;
 if("cvBullet" in changes)entry.cvBullet=changes.cvBullet;
 if("star" in changes)entry.star={...changes.star};
 if("tags" in changes)entry.tags=[...new Set(changes.tags.map(x=>x.trim()).filter(Boolean))];
 if("classificationReviewed" in changes)entry.classificationReviewed=changes.classificationReviewed;
 if("metricsReviewed" in changes&&!("originalText" in changes&&changes.originalText!==entry.previousUserText))
  entry.metricsReviewed=changes.metricsReviewed;
 if("status" in changes&&!("originalText" in changes&&entry.previousUserText===undefined))
  entry.status=changes.status;
 // When the factual text changed, never approve its numbers or verify the new claim in this request.
 if("originalText" in changes&&entry.previousUserText!==undefined){
  entry.metricsReviewed=false;entry.status="needs-review";
 }
}
module.exports={addSection,manageSection,addRecord,patchRecord};
