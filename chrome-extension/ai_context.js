"use strict";
// Pure, browser/Node-compatible context preparation. The candidate's personal
// history stays with the authenticated Garamaal evidence service, not in this object.
(function(root){
  const limit=(value,max=240)=>String(value||"").replace(/[\u0000-\u001f\u007f]/g," ")
    .replace(/\s+/g," ").trim().slice(0,max);
  const normal=value=>limit(value,300).toLowerCase()
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const genericTitle=value=>/^(?:apply|apply now|job application|application|application questions|personal information|candidate profile|my information|resume|questions|careers|submit application)$/i.test(limit(value));
  const comparableTitle=value=>normal(value).split(" ").filter(word=>
    word.length>2&&!/^(?:the|and|for|with|job|position|senior|sr|junior|analyst|associate)$/.test(word));
  const compatible=(a,b,kind)=>{
    if(!a||!b)return true;
    const first=normal(a),second=normal(b);
    if(first===second||first.includes(second)||second.includes(first))return true;
    if(kind==="company")return false;
    const x=comparableTitle(a),y=comparableTitle(b);
    return x.length>0&&y.length>0&&x.some(word=>y.includes(word));
  };
  // Context from Add Job may come from a different tab or domain (e.g. LinkedIn
  // to Workday). Only re-use when the same tab, or when *both* job identifiers
  // have a compatible match; never attach an unrelated job to a sparse form.
  function mergeJob(page={},captured={},options={}){
    const pageTitle=limit(page.title||page.role,160),pageCompany=limit(page.companyName||page.company,160);
    const current={title:genericTitle(pageTitle)?"":pageTitle,companyName:pageCompany,
      location:limit(page.location,120),description:limit(page.description,2500)};
    const candidate=normal(options.candidate),storedCandidate=normal(captured.candidate);
    if(!captured||!captured.saved||!candidate||candidate!==storedCandidate)
      return {...current,contextSource:"application page"};
    const expectedTitle=limit(captured.role||captured.title,160);
    const expectedCompany=limit(captured.company||captured.companyName,160);
    const sameTab=Number.isInteger(options.tabId)&&options.tabId===captured.tabId;
    const matches=compatible(current.companyName,expectedCompany,"company")&&
      compatible(current.title,expectedTitle,"title");
    const independentlyMatched=!!current.companyName&&!!current.title&&matches;
    if(!matches||(!sameTab&&!independentlyMatched))
      return {...current,contextSource:"application page (captured job not matched)"};
    return {companyName:current.companyName||expectedCompany,
      title:current.title||expectedTitle,
      location:current.location||limit(captured.location,120),
      description:current.description||limit(captured.jd,2500),
      contextSource:"saved Garamaal job"};
  }
  const fieldKind=field=>field.controlKind||field.type||"unknown";
  function task(job,fields=[],options={}){
    const Proposition=root.GaramaalProposition||(typeof require==="function"?require("./proposition.js"):null);
    const counts={};
    for(const field of fields){const kind=fieldKind(field);counts[kind]=(counts[kind]||0)+1;}
    let hostname="";
    try{hostname=new URL(options.tabUrl||"https://invalid.example").hostname;}
    catch(_){}
    return {schemaVersion:"garamaal-ai-task-v1",purpose:"Answer fields on this application page only",
      job:{companyName:limit(job?.companyName,160),title:limit(job?.title,160),
        location:limit(job?.location,120),description:limit(job?.description,2500)},
      application:{hostname:limit(hostname,150),numberOfFields:fields.length,
        controlTypes:counts,pass:Math.min(Math.max(Number(options.pass)||1,1),10)},
      questions:fields.slice(0,20).map(field=>({id:limit(field?.id,90),
        label:limit(String(field?.label||"").split("|")[0],400),
        section:limit(field?.context||field?.section,160),
        type:limit(field?.type,24),required:!!field?.required,
        maxLength:Math.min(Math.max(Number(field?.maxLength)||0,0),4000),
        proposition:Proposition?.describe(field,job)||null})),
      policy:{evidencePriority:["confirmed Career Profile","approved reusable answers",
          "Summary Doc","Master Evidence Bank"],
        answerRule:"Only supported facts or a previously confirmed choice; missing data means unknown",
        scopeRule:"Respect candidate, named employer, jurisdiction, timeframe, polarity, record number",
        choiceRule:"Choose only exactly available enabled option values",
        writeRule:"Do not overwrite a filled control; validate limits and retained values",
        protectedRule:"Leave consent, declarations and unconfirmed legal/EEO answers to dedicated review logic",
        interactionRule:"Never click Next, Continue, Submit, sign-in or application navigation"}};
  }
  const api={mergeJob,task,compatible,genericTitle};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalAiContext=api;
})(globalThis);
