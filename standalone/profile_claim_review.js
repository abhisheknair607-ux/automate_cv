"use strict";
/**
 * Stage 4 metric audit. Exact matching is NOT factual verification.
 * Adds sentence-level comparison to make reused values from different outcomes
 * visible to a reviewer. Never infers outcomes or marks any metric "verified".
 */
const {extractNumbers,unsupportedNumbers,sentenceUnits}=require("./profile_suggestions");
const LABELS=[
 ["client outcome",/\b(?:satisfaction|retention|referrals?|customer experience|nps|client-base growth)\b/i],
 ["revenue / profit",/\b(?:revenues?|profits?|earnings|margins?|turnover|sales|ebitda|income)\b/i],
 ["cost / savings",/\b(?:costs?|expenses?|savings?|budget|spend|expenditure)\b/i],
 ["delivery speed",/\b(?:turnaround|processing time|hours?|days?|minutes?|speed|timeliness|deadline)\b/i],
 ["operational quality",/\b(?:accuracy|error|defect|quality|productivity|efficiency|rework)\b/i],
 ["assets / investment",/\b(?:portfolio|assets?|aum|funds?|investment|capital|returns?|valuation)\b/i],
 ["risk / compliance",/\b(?:risk|compliance|exceptions?|audit|regulatory|control|breaches?)\b/i],
 ["volume / coverage",/\b(?:companies|clients|customers|teams?|people|projects?|transactions?|cases?|countries|employees|stakeholders|files)\b/i]
];
function metricKey(value){return String(value||"").trim().toLowerCase().replace(/[\s,]+/g,"")}
function sentenceAt(text,index){
 const units=sentenceUnits(text);
 const item=units.find(s=>index>=s.start&&index<s.end);
 if(item)return item.quote;
 const raw=String(text||"");
 const start=raw.lastIndexOf("\n",index)+1;
 const end=raw.indexOf("\n",index);
 return raw.slice(start,end<0?raw.length:end).trim().slice(0,600);
}
function categories(sentence){
 return LABELS.filter(([,pattern])=>pattern.test(sentence)).map(([label])=>label);
}
function auditClaimNumbers(claim,original){
 if(typeof claim!=="string"||typeof original!=="string"||claim.length>20000||original.length>250000)
  throw Object.assign(Error("Invalid evidence review input"),{httpCode:400});
 const observed=extractNumbers(original),candidates=extractNumbers(claim);
 const lookup=new Map();
 for(const item of observed){
  const key=metricKey(item.value);
  if(!lookup.has(key))lookup.set(key,[]);
  lookup.get(key).push(item);
 }
 const checks=[];
 for(const item of candidates){
  const supports=lookup.get(metricKey(item.value))||[];
  const claimQuote=sentenceAt(claim,item.index),requested=categories(claimQuote);
  const contexts=supports.slice(0,5).map(s=>({
   sourceQuote:sentenceAt(original,s.index),
   sourceIndex:s.index,
   categories:categories(sentenceAt(original,s.index))
  }));
  const hasCompatible=contexts.some(s=>!requested.length||!s.categories.length||
   requested.some(c=>s.categories.includes(c)));
  const status=!supports.length?"unsupported-number":
   !hasCompatible?"context-review":"matching-number-needs-review";
  checks.push({
   value:item.value,claimQuote,
   status,sourceContexts:contexts,
   warning:status==="unsupported-number"?"No matching numeric value in original evidence.":
    status==="context-review"?"Number exists, but appears in a different outcome or measure context.":
    "Number exists in original; verify that it refers to the same result, scope and ownership."
  });
 }
 return {
  checks,
  unsupportedNumbers:unsupportedNumbers(claim,original),
  contextWarnings:checks.filter(c=>c.status==="context-review"),
  matchingCount:checks.filter(c=>c.status==="matching-number-needs-review").length,
  reviewRequired:true,automaticallyVerified:false,
  warning:"Exact numerical matches do not establish the same meaning, attribution, chronology or ownership."
 };
}
module.exports={auditClaimNumbers,metricKey,sentenceAt,categories};
