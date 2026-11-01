"use strict";
/*
 * Stage 2: evidence classification, provenance, review hints, and completeness.
 * No CV claims are automatically verified. Router instructions are references.
 * All original source text is retained in review records; no automatic deletion.
 */
const {createHash}=require("node:crypto");
const hash=text=>createHash("sha256").update(String(text)).digest("hex").slice(0,20);
const BASE_SECTIONS=Object.freeze([
 {id:"identity",title:"Personal details"},
 {id:"experience",title:"Work experience"},
 {id:"education",title:"Education"},
 {id:"certifications",title:"Certifications & qualifications"},
 {id:"achievements",title:"Achievements & STAR"},
 {id:"projects",title:"Projects"},
 {id:"skills",title:"Skills, tools & languages"},
 {id:"volunteering",title:"Leadership & volunteering"},
 {id:"preferences",title:"Career preferences"},
 {id:"guardrails",title:"Claim restrictions"},
 {id:"reference",title:"Source router & reference"},
 {id:"other",title:"Other evidence — review needed"}
]);
function candidate(value){
 const key=String(value||"").trim().toLowerCase();
 if(!["abhishek","pooja"].includes(key))throw Object.assign(Error("Unknown candidate"),{httpCode:400});
 return key;
}
function sourceCatalog(key,env=process.env){
 candidate(key);
 const prefix=key==="pooja"?"POOJA_":"";
 return [
  {kind:"master",fileId:env[prefix+"MASTER_EVIDENCE_BANK_FILE_ID"]||"",label:"Master Evidence Bank"},
  {kind:"router",fileId:env[prefix+"SUMMARY_DOC_FILE_ID"]||"",label:"Summary / Evidence Router"}
 ].map(s=>({...s,configured:!!s.fileId}));
}
const classifyRules=[
 ["guardrails",/guardrail|claim restriction|claim constraint|^core-guardrails$|^fin-pooja-attribution$|^source hierarchy|^final usage rules|^how this master document should be used|^usage rules|duplicate.*exclusion/i],
 ["certifications",/certif|professional qualifications|licen[cs]e/i],
 ["volunteering",/volunteer|community leadership|club leadership/i],
 ["achievements",/achievement|award|recognition|case competition|challenge winner/i],
 ["education",/education|academic qualification|degree|^core-credentials$|^university /i],
 ["projects",/^fin-(?!pooja-attribution)|^p\d+$|project|portfolio index|^part [i-vx]+ .*project|final submissions|case study|^priority [12] .* submissions/i],
 ["skills",/competenc|technical methods|tools|skill|languages|^part (iii|iv) |^capability map|^pr-pooja-legacy-competencies$/i],
 ["preferences",/career preference|preferred roles|career targets|job targets|role-based project selection/i],
 ["identity",/^professional summary$|^personal details$|^contact detail|^personal profile$/i],
 ["experience",/^pr-|^core-chronology$|^taxlink|^ey india|^freelance accounting|^bajaj|^sharekhan|employment|work experience|professional experience|^analyst -|^proposition manager/i]
];
function classificationFor(title,text="",kind="master"){
 const s=String(title||"").toLowerCase();
 if(kind==="router")return {section:"reference",confidence:"high",reason:"Summary Router is a retrieval reference, not independently verified CV evidence",needsReview:false};
 for(const [section,pattern] of classifyRules)
  if(pattern.test(s)){
   const mixed=/education, credentials and recognition|^core-credentials$|source introduction|^pr-pooja-legacy-competencies$/.test(s);
   return {section,confidence:mixed?"medium":"high",reason:mixed?"Mixed source heading; review classification":"Matched original evidence heading",needsReview:mixed};
  }
 if(/^\d+[.)] [\w\s,/&-]{6,125}$/.test(s))
  return {section:"experience",confidence:"low",reason:"Numbered unclassified evidence: check employer and section",needsReview:true};
 return {section:"other",confidence:"low",reason:"No safe deterministic category; manually classify",needsReview:true};
}
function sectionFor(title,text="",kind="master"){return classificationFor(title,text,kind).section}
function metricsFrom(text){
 const pattern=/(?:[€£$]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion))?|\b\d[\d,.]*\s?%|\b\d[\d,.]*\s?\+?\s?(?:companies|clients|teams|projects|transactions|years|months|cases|countries|stakeholders|people|applications|portfolios)\b)/gi;
 return [...new Set((String(text).match(pattern)||[]).map(s=>s.trim()))].slice(0,30);
}
function record({key,kind,fileId,title,text,locator,idx,parentEvidenceKey,sourceLineStart,sourceLineEnd}){
 const originalText=String(text||"").trim();
 const classification=classificationFor(title,originalText,kind);
 return {
  id:hash(key+"\n"+kind+"\n"+locator+"\n"+originalText),
  section:classification.section,
  suggestedSection:classification.section,
  classification,
  title:String(title||"Untitled evidence").slice(0,180),
  source:{kind,fileId,locator:String(locator).slice(0,280),index:idx,
    evidenceKey:parentEvidenceKey||null,lineStart:sourceLineStart??null,lineEnd:sourceLineEnd??null},
  originalText,
  star:{situation:"",task:"",action:"",result:""},
  cvBullet:"",
  metrics:metricsFrom(originalText),
  metricsReviewed:false,
  status:"needs-review",
  cvEligible:kind==="master",
  duplicateOf:null,
  tags:[]
 };
}
const mixedCredentialHeadings=[
 {name:"PROFESSIONAL QUALIFICATIONS & CERTIFICATIONS",section:"certifications"},
 {name:"PROFESSIONAL RECOGNITION & AWARDS",section:"achievements"},
 {name:"VOLUNTEERING & LEADERSHIP",section:"volunteering"},
 {name:"ADDITIONAL ACTIVITIES & INTERESTS",section:"skills"}
];
function segmentCredentialBlock(lines){
 const parts=[],markers=new Set(mixedCredentialHeadings.map(x=>x.name));
 let current={title:"CORE-CREDENTIALS — education and core details",lines:[],offset:0};
 for(let i=0;i<lines.length;i++){
  const label=lines[i].trim();
  if(markers.has(label)){
   if(current.lines.length)parts.push(current);
   current={title:label,lines:[],offset:i};
  }
  current.lines.push(lines[i]);
 }
 if(current.lines.length)parts.push(current);
 return parts;
}
function taggedBlocks(raw,key,kind,fileId){
 const lines=String(raw).replace(/\r/g,"").split("\n");
 const entries=[],outside=[];const seen=new Set();
 let active=null,tagged=false;
 const pushActive=()=>{
  const chunks=active.id==="CORE-CREDENTIALS"?segmentCredentialBlock(active.lines):
   [{title:active.id,lines:active.lines,offset:0}];
  for(const chunk of chunks){
   const id=entries.length;
   const locator="EVIDENCE "+active.id+(chunks.length>1?" / "+chunk.title:"");
   entries.push(record({key,kind,fileId,title:chunk.title,text:chunk.lines.join("\n"),
     locator,idx:id,parentEvidenceKey:active.id,
     sourceLineStart:active.start+1+chunk.offset,sourceLineEnd:active.start+chunk.offset+chunk.lines.length}));
  }
 };
 for(let i=0;i<lines.length;i++){
  const line=lines[i],trimmed=line.trim();
  const begin=trimmed.match(/^EVIDENCE\s+([A-Z0-9][A-Z0-9-]+)$/);
  const end=trimmed.match(/^END EVIDENCE\s+([A-Z0-9][A-Z0-9-]+)$/);
  if(begin){
   if(active)throw Error("Overlapping evidence blocks: "+active.id);
   if(seen.has(begin[1]))throw Error("Duplicate evidence key "+begin[1]);
   seen.add(begin[1]);active={id:begin[1],lines:[],start:i+1};tagged=true;continue;
  }
  if(end){
   if(!active||active.id!==end[1])throw Error("Unmatched evidence end marker "+end[1]);
   pushActive();active=null;continue;
  }
  if(active)active.lines.push(line);
  else if(trimmed)outside.push({line:i+1,text:line});
 }
 if(active)throw Error("Unclosed evidence block "+active.id);
 if(!tagged)return null;
 if(outside.length)entries.unshift(record({key,kind,fileId,title:"Source introduction and remaining notes",
   text:outside.map(x=>x.text).join("\n"),locator:"untagged source prose",idx:-1,
   sourceLineStart:outside[0].line,sourceLineEnd:outside.at(-1).line}));
 return entries;
}
function isHeading(line){
 const s=line.trim();
 if(!s||s.length>135||/^[-•*]\s/.test(s))return false;
 // Numbered full-sentence claims remain body text. Numbered topic headings are headings.
 if(/^\d{1,3}[.)]\s/.test(s))return !/[.!?]$/.test(s)&&s.length<=125&&/^[0-9]+[.)]\s+[A-Za-z]/.test(s);
 if(/[.!?]$/.test(s))return false;
 if(s.length>=5&&s===s.toUpperCase()&&/[A-Z]{3}/.test(s))return true;
 return /^PART\s+[IVXLCDM]+\b/i.test(s);
}
function proseBlocks(raw,key,kind,fileId){
 const lines=String(raw).replace(/\r/g,"").split("\n");
 const groups=[];let title="Source introduction",parent="",buf=[],start=1;
 function flush(end){
  if(buf.some(v=>v.trim()))groups.push({title,text:buf.join("\n"),start,end});
  buf=[];
 }
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(isHeading(line)){
   flush(i);
   const next=line.trim();
   if(/^\d+[.)]\s/.test(next))title=parent?parent+" — "+next:next;
   else {title=next;if(next===next.toUpperCase()&&!/^PART\s/.test(next))parent=next;}
   start=i+1;
  }
  buf.push(line); // Keep headings in originalText, never discard the source line.
 }
 flush(lines.length);
 if(!groups.length&&String(raw).trim())groups.push({title:"Complete original source",text:raw,start:1,end:lines.length});
 return groups.map((g,i)=>record({key,kind,fileId,title:g.title,text:g.text,
   locator:g.title+" / block "+(i+1),idx:i,sourceLineStart:g.start,sourceLineEnd:g.end}));
}
function integrity(raw,entries){
 const sourceLines=String(raw).split("\n"),allNonEmpty=sourceLines.filter(s=>s.trim()).length;
 let segmentNonEmpty=0;
 for(const r of entries)segmentNonEmpty+=r.originalText.split("\n").filter(x=>x.trim()).length;
 const structureLines=sourceLines.filter(s=>/^(?:END )?EVIDENCE\s+[A-Z0-9][A-Z0-9-]+\s*$/.test(s.trim())).length;
 // Every nonempty source line must be represented exactly once, apart from the named evidence marker lines.
 if(segmentNonEmpty+structureLines!==allNonEmpty)
  throw Error("Source coverage mismatch: import would silently omit or duplicate content");
 return {contentLines:allNonEmpty,coveredLines:segmentNonEmpty,structuralLines:structureLines,complete:true};
}
function parseSource({candidate:key,kind,fileId,title,text,modifiedTime}){
 key=candidate(key);
 if(!["master","router"].includes(kind))throw Error("Unknown source kind");
 if(!fileId||!String(text||"").trim())throw Error("Empty Drive source");
 const raw=String(text).replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim();
 if(/^\s*PLACEHOLDER\b|DO NOT RUN AUTOMATION/i.test(raw.slice(0,500)))
  throw Object.assign(Error("Source is a placeholder; import stopped"),{httpCode:422});
 if(key==="pooja"&&/CANDIDATE KEY\s+abhishek/i.test(raw.slice(0,1000)))throw Error("Candidate/source mismatch");
 if(key==="abhishek"&&/CANDIDATE KEY\s+pooja/i.test(raw.slice(0,1000)))throw Error("Candidate/source mismatch");
 const entries=taggedBlocks(raw,key,kind,fileId)||proseBlocks(raw,key,kind,fileId);
 if(!entries.length)throw Error("Drive source yielded no evidence");
 const audit=integrity(raw,entries);
 return {source:{kind,fileId,title:String(title||""),modifiedTime:modifiedTime||null,
    sha256:createHash("sha256").update(raw).digest("hex"),characters:raw.length,
    records:entries.length,integrity:audit},
   records:entries};
}
function normalize(s){return String(s).toLowerCase().replace(/\s+/g," ").replace(/[^a-z0-9€£$%+ ]/g,"").trim()}
function mergeImports(imports,key){
 candidate(key);
 const sources=[],records=[],ids=new Set(),dupes=new Map();
 for(const entry of imports){
  sources.push(entry.source);
  for(const row of entry.records){
   if(ids.has(row.id))throw Error("Colliding source record IDs: import blocked");
   ids.add(row.id);
   const duplicateKey=normalize(row.originalText);
   if(duplicateKey.length>=85&&dupes.has(duplicateKey))
    row.duplicateOf=dupes.get(duplicateKey);
   else if(duplicateKey.length>=85)dupes.set(duplicateKey,row.id);
   records.push(row); // Duplicates are flagged, never deleted.
  }
 }
 return {schema:2,candidate:key,sections:BASE_SECTIONS.map(x=>({...x})),sources,records,revision:0};
}
module.exports={BASE_SECTIONS,candidate,sourceCatalog,classificationFor,sectionFor,metricsFrom,parseSource,mergeImports};
