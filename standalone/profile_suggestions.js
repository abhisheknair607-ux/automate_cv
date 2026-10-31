"use strict";
/** Grounded evidence previews only. No generative model and no CV worker writes. */
const {createHash}=require("node:crypto");
const error=(message,httpCode=400)=>Object.assign(Error(message),{httpCode});
const sha=s=>createHash("sha256").update(String(s||"")).digest("hex");
const METRIC=/(?:[€£$]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion))?|\b\d[\d,.]*\s?%|\b\d[\d,.]*\s?\+?\s?(?:companies|clients|teams|projects|transactions|years|months|cases|countries|stakeholders|people|applications|portfolios|million|billion|basis points|bps|hours|days|members|deals|employees|files)\b|\b\d+(?:\.\d+)?\s?x\b|\b\d+(?:[,.]\d+)*(?:\s?(?:k|m|bn))?\+?(?=$|[^\w]))/gi;
const RESULT=/\b(?:increased?|improved?|grew|growth|reduced?|decreased?|saved?|achiev(?:ed|ing)|deliver(?:ed|ing)|generated?|result(?:ed|ing)|earned?|led to|enabled?|shortened?|raised?|doubled?|quadrupled?|fourfold|zero exceptions?|no exceptions?|higher|lower|faster|more accurate)\b/i;
const SITUATION=/\b(?:during|amid|in response to|facing|challenge|issue|client need|business need|business model|operating model|across|within|as part of|environment)\b/i;
const TASK=/\b(?:responsib(?:le|ility)|tasked|mandat(?:e|ed)|required|needed to|accountable|objective|goal|assigned|scope of work)\b/i;
const ACTION=/\b(?:analysed|analyzed|built|developed|led|managed|prepared|reviewed|conducted|created|designed|delivered|implemented|coordinated|reconciled|assessed|screened|evaluated|modelled|modeled|advised|supported|presented|mapped|automated|negotiated|identified|facilitated|investigated|liaised|mentored|drafted|performed|produced)\b/i;
function sentenceUnits(text){
 const raw=String(text||"").slice(0,20000),units=[];
 for(const lineMatch of raw.matchAll(/[^\n]+/g)){
  const line=lineMatch[0];
  // End a sentence at punctuation followed by whitespace or line-end,
  // but not at decimal points such as €50.1M.
  for(const match of line.matchAll(/(?:.+?[.!?](?=\s|$)|.+$)/g)){
   const fragment=match[0],trimLeft=fragment.length-fragment.trimStart().length;
   const value=fragment.trim();
   if(!value||!/[a-zA-ZÀ-ÿ]/.test(value)||value.length<9)continue;
   const quote=value.slice(0,5000),start=lineMatch.index+match.index+trimLeft;
   units.push({quote,start,end:start+quote.length});
   if(units.length>=1000)break;
  }
  if(units.length>=1000)break;
 }
 return units;
}
function extractNumbers(source){
 const evidence=String(source||""),found=[];
 for(const match of evidence.matchAll(METRIC)){
  const value=match[0].trim(),index=match.index;
  const start=Math.max(0,evidence.lastIndexOf("\n",index)+1);
  const endBreak=evidence.indexOf("\n",index),end=endBreak<0?evidence.length:endBreak;
  found.push({value,index,sourceQuote:evidence.slice(start,end).trim().slice(0,550),
    contextReviewRequired:true,verified:false});
  if(found.length>=100)break;
 }
 return found;
}
function normalizeMetric(s){return String(s).replace(/\s+/g,"").toLowerCase().replace(/,/g,"");}
function unsupportedNumbers(claim,original){
 const present=new Set(extractNumbers(original).map(x=>normalizeMetric(x.value)));
 const missing=[],seen=new Set();
 for(const m of extractNumbers(claim)){
  const key=normalizeMetric(m.value);
  if(!present.has(key)&&!seen.has(key)){missing.push(m);seen.add(key)}
 }
 return missing;
}
function selectQuote(units,pattern,used){
 for(const unit of units){
  if(used.has(unit.start)||!pattern.test(unit.quote))continue;
  used.add(unit.start);
  return {text:unit.quote,source:{start:unit.start,end:unit.end},type:"verbatim",reviewRequired:true};
 }
 return null;
}
function proposeStar(record){
 if(!record||record.cvEligible===false||record.source?.kind==="router")
  throw error("Routing references cannot generate STAR claims",422);
 const original=String(record.originalText||"");
 if(!original.trim())throw error("No original evidence");
 const units=sentenceUnits(original),used=new Set();
 const result=selectQuote(units,RESULT,used),action=selectQuote(units,ACTION,used);
 const task=selectQuote(units,TASK,used),situation=selectQuote(units,SITUATION,used);
 const fields={situation,task,action,result};
 const gaps=Object.entries(fields).filter(([,x])=>!x).map(([k])=>k);
 const sourceNumbers=extractNumbers(original);
 const metrics=(result?extractNumbers(result.text):[]).map(m=>({
  value:m.value,sourceQuote:result.text,sourceOffset:result.source.start,
  contextReviewRequired:true,verified:false
 }));
 return {
  recordId:record.id,source:{kind:record.source?.kind||"user",
   evidenceKey:record.source?.evidenceKey||record.source?.locator||null,
   lineStart:record.source?.lineStart||null,lineEnd:record.source?.lineEnd||null,
   sha256:sha(original)},
  fields,gaps,bullet:action?{text:action.text,source:action.source,kind:"verbatim",reviewRequired:true}:null,
  metrics,sourceNumbers:sourceNumbers.slice(0,30),confidence:"extractive-preview-only",
  warnings:[
   "Source excerpts, not approved STAR claims or CV wording.",
   "Check actor, ownership, chronology, impact and numeric context against the original.",
   ...(record.workingText?["Edited working facts were not used as evidence."]:[]),
   ...(result&&!metrics.length?["Result text has no directly extracted number; impact not inferred."]:[])
  ]
 };
}
const TERMS=[
 ["transfer pricing",["transfer pricing","intercompany pricing"]],
 ["functional analysis",["functional analysis","far analysis","far interviews"]],
 ["economic benchmarking",["economic benchmarking","benchmarking"]],
 ["OECD",["oecd"]],["Pillar Two",["pillar 2","pillar two"]],
 ["financial modelling",["financial modelling","financial modeling"]],
 ["valuation",["valuation","valuations"]],
 ["M&A",["m&a","mergers and acquisitions","merger and acquisition"]],
 ["financial due diligence",["financial due diligence","fdd","quality of earnings"]],
 ["working capital",["working capital"]],["cash flow",["cash flow","cashflow"]],
 ["credit analysis",["credit analysis","credit risk"]],
 ["financial statements",["financial statements","financial statement analysis"]],
 ["portfolio management",["portfolio management","investment portfolio"]],
 ["investment analysis",["investment analysis"]],
 ["private wealth",["private wealth","wealth management"]],
 ["financial planning",["financial planning"]],
 ["mortgage advice",["mortgage advice","mortgage advisory","mortgage"]],
 ["pensions",["pension","pensions","retirement planning"]],
 ["client relationship",["client relationships","client relationship","client management"]],
 ["stakeholder management",["stakeholder management","stakeholder engagement"]],
 ["project management",["project management","project lead"]],
 ["leadership",["leadership","mentoring","mentored","team leadership"]],
 ["regulatory compliance",["regulatory compliance","compliance"]],
 ["reconciliation",["reconciliation","reconciliations","reconciled"]],
 ["risk assessment",["risk assessment","risk profiling","risk analysis"]],
 ["QFA",["qfa","qualified financial adviser","qualified financial advisor"]],
 ["ACCA",["acca"]],["Excel",["excel"]],["Python",["python"]],
 ["Power BI",["power bi"]],["SQL",["sql"]],
 ["Bloomberg",["bloomberg"]],["Tableau",["tableau"]],
 ["financial forecasting",["financial forecasting","forecasting"]],
 ["client onboarding",["client onboarding","onboarding"]],
 ["investment recommendations",["investment recommendations","investment advice"]],
 ["corporation tax",["corporation tax","corporate tax"]],
 ["VAT",["vat"]],["ROS",["revenue online service","ros"]],
 ["data analysis",["data analysis","data analytics"]],
 ["business development",["business development"]],
 ["product management",["product management","proposition management"]],
 ["scenario analysis",["scenario analysis","scenario modelling","scenario modeling"]]
];
function phraseMatch(text,phrase){
 const hay=String(text||""),escaped=phrase.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
 const re=new RegExp("(^|[^a-z0-9])("+escaped+")(?=$|[^a-z0-9])","i");
 const hit=re.exec(hay);
 if(!hit)return null;
 const start=hit.index+hit[1].length;
 return {start,end:start+hit[2].length,text:hay.slice(start,start+hit[2].length)};
}
function matchJD(jd,records){
 if(typeof jd!=="string"||jd.trim().length<20||jd.length>20000)
  throw error("Paste a job description between 20 and 20,000 characters");
 if(!Array.isArray(records))throw error("Profile evidence missing");
 const matches=[],gaps=[];
 for(const [canonical,variants] of TERMS){
  const requirement=variants.map(v=>phraseMatch(jd,v)).find(Boolean);
  if(!requirement)continue;
  const evidenced=[];
  for(const record of records){
   if(record.cvEligible===false||record.status==="exclude"||record.source?.kind==="router"||
      record.section==="guardrails"||record.section==="reference")continue;
   const source=String(record.originalText||"");
   const hit=variants.map(v=>phraseMatch(source,v)).find(Boolean);
   if(!hit)continue;
   const left=Math.max(0,hit.start-65),right=Math.min(source.length,hit.end+85);
   const lineStart=source.lastIndexOf("\n",hit.start)+1;
   const lineEnd=source.indexOf("\n",hit.end);
   const context=source.slice(lineStart,lineEnd<0?source.length:lineEnd);
   if(/\b(?:do not|cannot claim|not direct|not owned|not verified|no evidence|no direct|not present|unsupported|hypothetical)\b/i.test(context))continue;
   evidenced.push({recordId:record.id,title:String(record.title||""),
    recordStatus:record.status,sourceQuote:source.slice(left,right).trim(),
    term:hit.text,locator:record.source?.locator||null,sourceOffset:hit.start,
    verifiedEvidence:record.status==="verified"&&record.classificationReviewed===true&&
      (!(record.metrics||[]).length||record.metricsReviewed===true)});
   if(evidenced.length>=8)break;
  }
  const item={term:canonical,jdQuote:requirement.text,recordMatches:evidenced,
    reviewerAction:"Confirm meaning and ownership; literal words alone do not prove competence"};
  if(evidenced.length)matches.push(item);else gaps.push({...item,reason:"No literal support in original candidate evidence"});
 }
 return {
  matchedTerms:matches,unmatchedTerms:gaps,
  examinedTerms:matches.length+gaps.length,suggestedTags:matches.map(x=>x.term),
  evidenceMode:"literal-original-source-only",
  warnings:[
   "Exact phrase/alias screen, not a recruiter-fit score.",
   "Unmatched JD terms must not be automatically added as skills.",
   "A matching word does not prove qualification, seniority or ownership.",
   "Only reviewed candidate-owned records may be used by a future CV adapter."
  ]
 };
}
module.exports={sentenceUnits,extractNumbers,unsupportedNumbers,proposeStar,matchJD,TERMS};
