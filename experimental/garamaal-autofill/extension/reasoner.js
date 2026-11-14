"use strict";
(function(root){
  const Matcher=root.GaramaalMatcher||(typeof require==="function"?require("./matcher.js"):null);
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
    const answer=String(result.answer||"").trim();
    if(!answer||answer.length>500)return null;
    if(field.type==="select"||field.type==="radio"){
      const option=(field.options||[]).find(o=>o.value===answer);
      if(!option||!option.value)return null;
      if(Matcher.normal(option.label)==="no"&&!evidence.some(id=>
        /\b(no|not|never|none|without|only)\b/i.test(providedFacts.find(f=>f.id===id)?.text||"")))return null;
      return {id:field.id,label:field.label,value:option.value,
        displayValue:option.label,fieldType:field.type,key:"ai"};
    }
    if(!["text","email","tel","url","search","textarea"].includes(field.type))return null;
    if(field.type==="email"||field.type==="tel"||field.type==="url")return null;
    return {id:field.id,label:field.label,value:answer,
      displayValue:answer,fieldType:field.type,key:"ai"};
  }
  const api={facts,validate};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalReasoner=api;
})(globalThis);
