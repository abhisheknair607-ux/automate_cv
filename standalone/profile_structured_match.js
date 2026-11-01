"use strict";
/* Deterministic, read-only matching: not an ATS score or a claim verifier. */
const IGNORED=new Set("the and for with from into your our their this that these those role roles job jobs work working experience responsible responsibilities required requirements essential desirable proven ability strong excellent including include related skills skill professional candidate success successful support supporting used using use team teams project projects result results various within through across ideally".split(" "));
const GROUPS=[
 ["financial modelling",["model","forecast","forecasting","budget","scenario analysis"]],
 ["valuation",["discounted cash flow","dcf","valuation","comparable companies"]],
 ["transfer pricing",["intercompany","oecd","benchmarking","arms length"]],
 ["m&a",["mergers acquisitions","transaction advisory","deal execution","corporate finance"]],
 ["financial due diligence",["quality of earnings","fdd","financial diligence"]],
 ["wealth management",["financial planning","investment advice","pension advice"]],
 ["credit analysis",["lending","debt capacity","loan analysis","credit risk"]],
 ["stakeholder management",["client liaison","client management","relationship management"]],
 ["process improvement",["automation","operational efficiency","workflow optimisation"]],
 ["data analysis",["analytics","excel","data modelling","business intelligence"]]
];
const str=(...x)=>x.filter(Boolean).join("\n");
const tokens=s=>new Set(String(s||"").toLowerCase().replace(/[^a-z0-9€£$%+# -]/g," ").split(/\s+/)
 .map(x=>x.trim()).filter(x=>x.length>2&&!IGNORED.has(x)).map(x=>x.endsWith("ies")?x.slice(0,-3)+"y":x.endsWith("ing")&&x.length>7?x.slice(0,-3):x.endsWith("s")&&x.length>5?x.slice(0,-1):x));
function extract(profile){
 if(!profile||!["abhishek","pooja"].includes(profile.candidate)||!profile.lists)throw Error("Invalid candidate-owned structured Profile");
 const out=[];
 function add(type,row,achievement,label,body,meta={}){
  if(!String(body||"").trim())return;
  out.push({id:type+":"+row.id+(achievement?":"+achievement.id:""),type,entryId:row.id,achievementId:achievement?.id||null,
   title:String(label||"").slice(0,220),body:String(body),parentTitle:meta.parentTitle||"",
   employer:meta.employer||"",dates:meta.dates||"",reviewStatus:achievement?.reviewStatus||"needs-review",
   sourceReference:achievement?.evidenceNote||"",metrics:meta.metrics||[],candidate:profile.candidate});
 }
 for(const j of profile.lists.experience||[]){
  const base=str(j.employer,j.title,j.summary,j.location);
  const dates=[j.startDate,j.endDate].filter(Boolean).join(" - ");
  for(const a of j.achievements||[]){
   const metrics=[{value:a.metricValue,context:a.metricContext,evidence:a.evidenceNote},...(a.additionalMetrics||[])].filter(m=>String(m.value||"").trim());
   add("experience",j,a,a.title||j.title,str(base,a.title,a.situation,a.task,a.action,a.result,
    ...metrics.map(m=>str(m.value,m.context))),{parentTitle:j.title,employer:j.employer,dates,metrics});
  }
  add("role-context",j,null,j.title||j.employer,base,{parentTitle:j.title,employer:j.employer,dates});
 }
 for(const p of profile.lists.projects||[]){
  const base=str(p.name,p.role,p.description);
  for(const a of p.achievements||[]){
   const metrics=[{value:a.metricValue,context:a.metricContext,evidence:a.evidenceNote},...(a.additionalMetrics||[])].filter(m=>String(m.value||"").trim());
   add("project",p,a,a.title||p.name,str(base,a.title,a.situation,a.task,a.action,a.result,
    ...metrics.map(m=>str(m.value,m.context))),{parentTitle:p.name,metrics});
  }
  add("project-context",p,null,p.name,base,{parentTitle:p.name});
 }
 for(const kind of ["skills","education","certifications","awards","volunteering"]){
  for(const r of profile.lists[kind]||[]){
   const v=Object.entries(r).filter(([k])=>k!=="id").map(([,value])=>value);
   add(kind,r,null,r.name||r.title||r.institution||r.organisation,str(...v));
  }
 }
 return out;
}
function metricsReady(item){
 return Boolean(item.achievementId&&item.reviewStatus==="confirmed"&&item.metrics.every(m=>String(m.value||"").trim()
  &&String(m.context||"").trim()&&String(m.evidence||"").trim()));
}
function findMatches(profile,jd,options={}){
 if(typeof jd!=="string"||jd.trim().length<15||jd.length>30000)
  throw Object.assign(Error("Paste a job description of 15–30000 characters"),{httpCode:400});
 const items=extract(profile),jobTokens=tokens(jd);
 if(!jobTokens.size)throw Object.assign(Error("JD has no usable terms"),{httpCode:400});
 const lower=jd.toLowerCase(),domains=GROUPS.filter(([name,alts])=>[name,...alts].some(x=>lower.includes(x)));
 const scored=items.map(item=>{
  const body=tokens(item.body),title=tokens(str(item.title,item.parentTitle));
  const matched=[...jobTokens].filter(t=>body.has(t)),boost=matched.filter(t=>title.has(t));
  const related=domains.filter(([name,alts])=>[name,...alts].some(p=>item.body.toLowerCase().includes(p))).map(d=>d[0]);
  let rank=matched.length+1.5*boost.length+3*related.length;
  if(["experience","project"].includes(item.type))rank*=1.22;
  if(["role-context","project-context"].includes(item.type))rank*=0.67;
  const needsMetrics=item.metrics.some(m=>!String(m.context||"").trim()||!String(m.evidence||"").trim());
  return {...item,rankScore:Math.round(rank*100)/100,matchedTerms:matched.slice(0,24),matchedConcepts:related,
   eligibleForCv:metricsReady(item),reviewRequired:item.reviewStatus!=="confirmed"||needsMetrics,
   warnings:[...(item.achievementId&&item.reviewStatus!=="confirmed"?["Achievement not yet candidate-confirmed"]:[]),
    ...(needsMetrics?["Numerical claim lacks context or evidence"]:[]),
    ...(!item.achievementId?["Context only — not an approved CV claim"]:[])]};
 }).filter(x=>x.rankScore>0).sort((a,b)=>b.rankScore-a.rankScore||a.id.localeCompare(b.id));
 const selected=[],seen=new Set();
 for(const item of scored){
  const sig=[...tokens(str(item.title,item.body))].sort().join("|");
  if(item.achievementId&&seen.has(sig))continue;
  if(item.achievementId)seen.add(sig);
  selected.push(item);
  if(selected.length>=Math.max(1,Math.min(30,Number(options.max)||14)))break;
 }
 const covered=new Set(selected.flatMap(x=>x.matchedTerms));
 return {schema:"garamaal-evidence-match-v1",candidate:profile.candidate,revision:profile.revision,
  algorithm:"deterministic-keyword-and-domain-matching",notAnAtsScore:true,draftOnly:true,
  selected,totals:{evaluated:items.length,matched:scored.length,returned:selected.length,
   candidateConfirmed:selected.filter(x=>x.eligibleForCv).length},
  jdCoverage:{matchedTerms:[...covered].slice(0,60),unmatchedTerms:[...jobTokens].filter(t=>!covered.has(t)).slice(0,60)},
  notes:["These are relevance suggestions, not verification of the underlying claims.",
   "Only candidate-confirmed achievements with supported numerical context may enter the CV evidence handoff.",
   "Production CV generation still reads the original Drive files until explicitly migrated."]};
}
function evidencePackage(profile,jd,options={}){
 const match=findMatches(profile,jd,options),selected=match.selected.filter(x=>x.eligibleForCv);
 const lines=["# GARAMAAL STRUCTURED PROFILE — STAGING EVIDENCE PACKAGE","",
  "Candidate: "+match.candidate,"Structured revision: "+match.revision,
  "Not an approval to publish or invent facts.","",
  "## Career overview",String(profile.overview?.headline||""),String(profile.overview?.summary||""),""];
 for(const x of selected){
  lines.push("## "+x.id,"Employer: "+(x.employer||"project"),
   "Role/project: "+x.parentTitle,"Dates: "+x.dates,
   "Candidate-confirmed information:",x.body,"");
  for(const m of x.metrics)lines.push("Outcome: "+m.value,"Meaning: "+m.context,"Evidence: "+m.evidence,"");
 }
 lines.push("## Writing safeguards","Never invent or alter employers, dates, numerical outcomes, ownership, credentials or skills.",
 "Use original Drive context and claim guardrails for independent cross-checking. No automatic release of a CV.");
 return {match,selectedIds:selected.map(x=>x.id),markdown:lines.join("\n")+"\n"};
}
module.exports={extract,findMatches,evidencePackage,metricsReady,tokens};
