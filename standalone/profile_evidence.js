"use strict";
/**
 * Candidate-owned, lossless Drive evidence parsing for Garamaal Profile.
 * Import is a review step, not an instruction to rewrite the existing CV source.
 * No LLM required. Extracted numbers are observations, not verified outcomes.
 */
const {createHash}=require("node:crypto");
const BASE_SECTIONS=Object.freeze([
  {id:"identity",title:"Personal details"},
  {id:"experience",title:"Work experience"},
  {id:"education",title:"Education & qualifications"},
  {id:"achievements",title:"Achievements & STAR"},
  {id:"projects",title:"Projects"},
  {id:"skills",title:"Skills & tools"},
  {id:"preferences",title:"Career preferences"},
  {id:"guardrails",title:"Claim restrictions"},
  {id:"other",title:"Other source evidence"}
]);
const hash=(text)=>createHash("sha256").update(String(text)).digest("hex").slice(0,20);
function candidate(value) {
  const key=String(value||"").trim().toLowerCase();
  if(!["abhishek","pooja"].includes(key))throw Object.assign(Error("Unknown candidate"),{httpCode:400});
  return key;
}
function sourceCatalog(key,env=process.env){
  candidate(key);
  const prefix=key==="pooja"?"POOJA_":"";
  const entries=[
    {kind:"master",fileId:env[prefix+"MASTER_EVIDENCE_BANK_FILE_ID"]||"",label:"Master Evidence Bank"},
    {kind:"router",fileId:env[prefix+"SUMMARY_DOC_FILE_ID"]||"",label:"Summary / Evidence Router"}
  ];
  return entries.map(v=>({...v,configured:!!v.fileId}));
}
function sectionFor(title,text="") {
  const s=String(title).toLowerCase();
  if(/guardrail|caution|restriction|do not|claim constraint/.test(s))return "guardrails";
  if(/chronology|employment|professional experience|work experience|^pr-|^taxlink|^ey india|^bajaj|^sharekhan/.test(s))return "experience";
  if(/project|^fin-.*-p\d|^p\d+$|case study|competition/.test(s))return "projects";
  if(/credential|education|qualification|certif|degree|academic/.test(s))return "education";
  if(/achievement|award|recognition|impact|outcome/.test(s))return "achievements";
  if(/skill|technology|tool|competenc|technical capabilit|^capability/.test(s))return "skills";
  if(/preference|career target|location preference|job target/.test(s))return "preferences";
  if(/identity|contact|personal details|^professional summary|^profile/.test(s))return "identity";
  if(/^pr-/.test(s))return "experience";
  // Do not guess classification from body text: mixed-source blocks need review.
  return "other";
}
function metricsFrom(text){
  // These are merely numeric phrases present in source, never invented impact claims.
  const pattern=/(?:[€£$]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion))?|\b\d[\d,.]*\s?%|\b\d[\d,.]*\s?\+?\s?(?:companies|clients|teams|projects|transactions|years|months|cases|countries|stakeholders|people|applications|portfolios)\b)/gi;
  return [...new Set((String(text).match(pattern)||[]).map(s=>s.trim()))].slice(0,30);
}
function record({key,kind,fileId,title,text,locator,idx}){
  const sourceText=String(text||"").trim();
  return {
    id:hash(key+"\n"+kind+"\n"+locator+"\n"+sourceText),
    section:sectionFor(title,sourceText),
    title:String(title||"Untitled evidence").slice(0,180),
    source:{kind,fileId,locator:String(locator).slice(0,280),index:idx},
    originalText:sourceText,
    star:{situation:"",task:"",action:"",result:""},
    cvBullet:"", // never auto-label source prose as a verified STAR result
    metrics:metricsFrom(sourceText),
    metricsReviewed:false,
    status:"needs-review",
    tags:[]
  };
}
function taggedBlocks(text,key,kind,fileId){
  const lines=String(text).replace(/\r/g,"").split("\n");
  const records=[];let active=null;let matched=false;
  for(const line of lines){
    const begin=line.trim().match(/^EVIDENCE\s+([A-Z0-9][A-Z0-9-]+)$/);
    const end=line.trim().match(/^END EVIDENCE\s+([A-Z0-9][A-Z0-9-]+)$/);
    if(begin){
      if(active)throw Error("Overlapping evidence blocks: "+active.id);
      active={id:begin[1],lines:[]};matched=true;continue;
    }
    if(end){
      if(!active||active.id!==end[1])throw Error("Unmatched evidence end marker "+end[1]);
      records.push(record({key,kind,fileId,title:active.id,text:active.lines.join("\n"),locator:"EVIDENCE "+active.id,idx:records.length}));
      active=null;continue;
    }
    if(active)active.lines.push(line);
  }
  if(active)throw Error("Unclosed evidence block "+active.id);
  if(!matched)return null;
  // Keep any prose outside tagged blocks visible, not silently discarded.
  const leftovers=[];let inside=false;
  for(const line of lines){
    if(/^EVIDENCE\s+[A-Z0-9][A-Z0-9-]+\s*$/.test(line.trim())){inside=true;continue}
    if(/^END EVIDENCE\s+[A-Z0-9][A-Z0-9-]+\s*$/.test(line.trim())){inside=false;continue}
    if(!inside&&line.trim())leftovers.push(line);
  }
  if(leftovers.length)records.unshift(record({key,kind,fileId,title:"Source introduction and remaining notes",text:leftovers.join("\n"),locator:"untagged source prose",idx:-1}));
  return records;
}
function isHeading(line){
  const s=line.trim();
  if(!s||s.length>135||/^[-•*]\s/.test(s)||/^\d+[.)]\s/.test(s))return false;
  if(/[.!?]$/.test(s))return false;
  // Real experience headings include punctuation: "TAXLINK, MAYNOOTH, IRELAND".
  if(s.length>=5&&s===s.toUpperCase()&&/[A-Z]{3}/.test(s))return true;
  // Numbered subsection headings from the detailed Abhishek evidence document.
  return /^(?:\d+\.|PART\s+\d+:?)\s+[A-Z][^!?]{4,120}$/.test(s);
}
function proseBlocks(text,key,kind,fileId){
  const lines=String(text).replace(/\r/g,"").split("\n"),groups=[];
  let title="Source introduction",parent="",buf=[];
  const flush=()=>{if(buf.some(v=>v.trim()))groups.push({title,text:buf.join("\n").trim()});buf=[];};
  for(const line of lines){
    if(isHeading(line)){
      flush();
      const next=line.trim();
      if(/^\d+\.\s/.test(next))title=parent?parent+" — "+next:next;
      else {title=next;if(next===next.toUpperCase())parent=next;}
    }else buf.push(line);
  }
  flush();
  if(!groups.length&&String(text).trim())groups.push({title:"Complete original source",text:String(text).trim()});
  return groups.map((g,i)=>record({key,kind,fileId,title:g.title,text:g.text,locator:g.title+" / block "+(i+1),idx:i}));
}
function parseSource({candidate:key,kind,fileId,title,text,modifiedTime}){
  key=candidate(key);
  if(!["master","router"].includes(kind))throw Error("Unknown source kind");
  if(!fileId||!String(text||"").trim())throw Error("Empty Drive source");
  const raw=String(text).replace(/\r\n/g,"\n").trim();
  if(/^\s*PLACEHOLDER\b|DO NOT RUN AUTOMATION/i.test(raw.slice(0,500)))
    throw Object.assign(Error("Source is a placeholder; import stopped"),{httpCode:422});
  // In-source candidate ownership evidence is stronger than file names.
  if(key==="pooja"&&/CANDIDATE KEY\s+abhishek/i.test(raw.slice(0,1000)))throw Error("Candidate/source mismatch");
  if(key==="abhishek"&&/CANDIDATE KEY\s+pooja/i.test(raw.slice(0,1000)))throw Error("Candidate/source mismatch");
  const entries=taggedBlocks(raw,key,kind,fileId)||proseBlocks(raw,key,kind,fileId);
  if(!entries.length)throw Error("Drive source yielded no evidence");
  return {
    source:{kind,fileId,title:String(title||""),modifiedTime:modifiedTime||null,sha256:createHash("sha256").update(raw).digest("hex"),characters:raw.length,records:entries.length},
    records:entries
  };
}
function mergeImports(imports,key){
  candidate(key);
  const sources=[],records=[];
  const keys=new Set();
  for(const entry of imports){
    sources.push(entry.source);
    for(const record of entry.records) {
      if(keys.has(record.id))continue;
      keys.add(record.id);records.push(record);
    }
  }
  return {schema:1,candidate:key,sections:BASE_SECTIONS.map(x=>({...x})),sources,records,revision:0};
}
module.exports={BASE_SECTIONS,candidate,sourceCatalog,sectionFor,metricsFrom,parseSource,mergeImports};
