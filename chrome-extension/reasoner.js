"use strict";
(function(root){
  const Matcher=root.GaramaalMatcher||(typeof require==="function"?require("./matcher.js"):null);
  const Guard=root.GaramaalEvidenceGuard||(typeof require==="function"?require("./evidence_guard.js"):null);
  const Proposition=root.GaramaalProposition||(typeof require==="function"?require("./proposition.js"):null);
  const words=s=>new Set(Matcher.normal(s).split(" ").filter(w=>w.length>3));
  function facts(profile,field){
    const out=[];
    const add=(section,value)=>{
      if(typeof value==="string"&&value.trim())out.push({id:"f"+out.length,section,text:value.trim().slice(0,400)});
    };
    for(const x of profile?.skills||[])add("skill",typeof x==="string"?x:x?.name);
    for(const x of profile?.certifications||[])add("certification",typeof x==="string"?x:x?.name);
    for(const x of profile?.education||[])add("education",[x?.degree,x?.field,x?.institution].filter(Boolean).join(", "));
    for(const x of profile?.work||[]){
      add("work",[x?.title,x?.employer,x?.summary].filter(Boolean).join(" — "));
      for(const a of x?.achievements||[])add("achievement",a);
    }
    for(const x of profile?.projects||[])add("project",[x?.name,x?.description].filter(Boolean).join(" — "));
    const query=words(field.label+" "+(field.options||[]).map(o=>o.label).join(" "));
    const score=f=>[...query].filter(w=>words(f.text).has(w)).length;
    return out.sort((a,b)=>score(b)-score(a)).slice(0,12);
  }
  function validate(field,result,providedFacts){
    if(!Matcher.eligible(field)||!result||result.fieldId!==field.id)return null;
    const evidence=Array.isArray(result.evidenceIds)?result.evidenceIds:[];
    const known=new Set(providedFacts.map(f=>f.id));
    if(!evidence.length||evidence.some(id=>!known.has(id)))return null;
    if(result.propositionKey&&Proposition?.fingerprint(field,result.job||{})!==result.propositionKey)return null;
    const evidenceText=providedFacts.filter(f=>evidence.includes(f.id)).map(f=>f.text).join(". ");
    const answer=String(result.answer||"").trim();
    if(!answer||answer.length>500)return null;
    if(field.type==="checkbox"){
      if(answer!=="true")return null;
      const text=providedFacts.filter(f=>evidence.includes(f.id)).map(f=>f.text).join(" ");
      const meaningful=Matcher.normal(field.label).split(" ").filter(w=>w.length>3&&!/^(have|with|your|some|experience|skills|using|used|this|that)$/.test(w));
      if(!meaningful.some(w=>Matcher.normal(text).split(" ").includes(w))||
        Guard&&!Guard.supportsChoice(field.label,"Yes",text))return null;
      return {id:field.id,label:field.label,value:"true",displayValue:"Checked",fieldType:"checkbox",key:"ai"};
    }
    if(field.type==="select"||field.type==="radio"||field.type==="customSelect"){
      const option=(field.options||[]).find(o=>o.value===answer);
      if(!option||!option.value)return null;
      if(Guard&&!Guard.supportsChoice(field.label,option.label,evidenceText))return null;
      return {id:field.id,label:field.label,value:option.value,
        displayValue:option.label,fieldType:field.type,key:"ai"};
    }
    if(!["text","email","tel","url","search","textarea"].includes(field.type))return null;
    if(field.type==="email"||field.type==="tel"||field.type==="url")return null;
    const verbatim=providedFacts.filter(f=>evidence.includes(f.id)).some(f=>
      Matcher.normal(f.text).includes(Matcher.normal(answer)));
    if(!verbatim&&!(field.type==="textarea"&&Guard?.supportsDraft(
      field.label,answer,evidenceText,Number(field.maxLength)||0)))return null;
    if(field.maxLength>0&&answer.length>field.maxLength)return null;
    return {id:field.id,label:field.label,value:answer,
      displayValue:answer,fieldType:field.type,key:"ai",
      source:verbatim?"Verified candidate evidence":"Evidence-grounded AI draft — review before using",
      review:!verbatim,evidenceIds:evidence};
  }
  function remoteEligible(field){
    // Unstructured document snippets cannot safely identify one repeated record or
    // one choice inside a multi-select. Use only an exact saved profile record there.
    return Matcher.eligible(field)&&field.type!=="customSelect"&&field.type!=="multiSelect"&&
      !/\b(?:work experience|professional experience|employment history|experience|education history|education)\b/i
        .test(String(field.context||field.section||""));
  }
  function validateRemote(field,result){
    if(!remoteEligible(field)||!result||result.fieldId!==field.id)return null;
    if(result.propositionKey&&Proposition?.fingerprint(field,result.job||{})!==result.propositionKey)return null;
    const answer=String(result.answer||"").trim();
    if(!answer||answer.length>Math.min(4000,Number(field.maxLength)>0?field.maxLength:4000)||
      !Array.isArray(result.evidenceIds)||!result.evidenceIds.length)return null;
    if(field.type==="checkbox"){
      if(answer!=="true")return null;
      return {id:field.id,label:field.label,value:"true",displayValue:"Checked",fieldType:"checkbox",key:"garamaal"};
    }
    if(field.type==="select"||field.type==="radio"||field.type==="customSelect"){
      const option=(field.options||[]).find(o=>o.value===answer&&!o.disabled&&o.value);
      if(!option)return null;
      return {id:field.id,label:field.label,value:option.value,
        displayValue:option.label,fieldType:field.type,key:"garamaal"};
    }
    if(!["text","email","tel","url","search","textarea","number","date"].includes(field.type))return null;
    return {id:field.id,label:field.label,value:answer,
      displayValue:answer,fieldType:field.type,key:"garamaal"};
  }
  const api={facts,validate,validateRemote,remoteEligible};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalReasoner=api;
})(globalThis);
