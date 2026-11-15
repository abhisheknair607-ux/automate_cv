"use strict";
(function(root){
  const Matcher=root.GaramaalMatcher||(typeof require==="function"?require("./matcher.js"):null);
  const clean=value=>String(value??"").trim();
  const normal=Matcher.normal;
  const OpenText=root.GaramaalOpenText||(typeof require==="function"?require("./open_text.js"):null);
  const choices=new Set(["select","radio","customSelect"]);
  function category(field,job={}){
    const label=normal(clean(field?.label).split("|")[0]);
    if(/\b(?:relatives?|family members?|spouse|partner|siblings?|parents?)\b/.test(label)&&
      /\b(?:employed|work|worked|working|employee)\b/.test(label))return "familyEmployment";
    if(/\b(?:visa sponsorship|sponsor(?:ship|ed)?|require (?:a )?visa|need (?:a )?visa)\b/.test(label))return "sponsorship";
    if(/\b(?:non compete|non solicitation|restrictive covenant|restrict your ability|agreement that would restrict)\b/.test(label))return "restrictiveAgreement";
    if(/\b(?:proficiency|fluent|fluency|competency|level)\b.*\b(?:english|language)\b|\benglish\b.*\b(?:proficiency|fluency|level)\b/.test(label))return "languageProficiency";
    if(/\b(?:conflict of interest|competing interest|related party)\b/.test(label))return "conflict";
    if(/\b(?:certify|attest|declaration|declare under penalty)\b/.test(label))return "certification";
    if(/\b(?:consent|agree|acknowledg|terms|privacy|automated scheduling)\b/.test(label))return "consent";
    if(/\bwhy\b.*\b(?:this|the)\s+(?:role|position|job)\b|\b(?:what|which)\b.*\b(?:interests?|attracts?|motivates?)\b.*\b(?:role|position|job)\b|\b(?:good|strong|ideal)\s+(?:fit|match)\b.*\b(?:role|position|job)\b|\bwhy should we hire you\b/.test(label))return "motivationRole";
    if(/\bwhy\b.*\b(?:company|organisation|organization|work (?:here|at)|join)\b|\b(?:what|which)\b.*\b(?:interests?|attracts?|motivates?)\b.*\b(?:company|organisation|organization|working here)\b/.test(label))return "motivationCompany";
    const company=normal(job.companyName);
    if(company&&/\b(?:why|interested|attracted)\b/.test(label)&&
      label.includes(company))return "motivationCompany";
    if(/\b(?:accommodation|accommodations|reasonable adjustments?|special consideration)\b/.test(label))return "accommodation";
    if(/\b(?:disability|disabled)\b/.test(label))return "disability";
    if(/\b(?:veteran|military service)\b/.test(label))return "veteran";
    if(/\b(?:criminal|conviction|convicted|arrested)\b/.test(label))return "criminalHistory";
    if(/\b(?:gender|transgender|sex assigned)\b/.test(label))return "gender";
    if(/\b(?:salary|compensation|pay expectation|expected pay)\b/.test(label))return "compensation";
    if(/\b(?:legally authorized|legally authorised|authorization to work|authorisation to work|work authorization|work authorisation)\b/.test(label))return "workAuthorization";
    if(/\brelocat(?:e|ion)\b/.test(label))return "relocation";
    if(/\b(?:employed|work(?:ed)?)\b.*\b(?:by|for|at|with)\b/.test(label))return "employerHistory";
    return "";
  }
  function fitDraft(value,maxLength){
    const limit=Math.min(4000,Number(maxLength)>0?Number(maxLength):1200);
    if(limit<35)return "";
    const text=clean(value).replace(/\s+/g," ");
    if(text.length<=limit)return text;
    const cut=text.slice(0,limit-1);
    const boundary=cut.lastIndexOf(" ");
    const short=(boundary>limit/2?cut.slice(0,boundary):cut).replace(/[ ,;:.]+$/,"");
    return short+".";
  }
  function motivation(kind,profile,job,limit){
    const enhanced=OpenText?.draft(kind,profile,job,fitDraft,limit);
    if(enhanced)return enhanced;
    const role=clean(job.title),company=clean(job.companyName);
    const background=clean(profile?.basics?.headline)||
      clean(profile?.work?.[0]?.title)||"";
    if(!background||!role||kind==="motivationCompany"&&!company)return "";
    const draft=kind==="motivationCompany"?
      "I am interested in "+company+" because the "+role+
        " role matches my background in "+background+". I would welcome the opportunity to contribute that experience.":
      "The "+role+" role matches my background in "+background+
        ". I am interested in applying that experience to the responsibilities of this position.";
    return fitDraft(draft,limit);
  }
  function answerFor(field,profile,job={}){
    if(!field||field.hasValue)return null;
    const kind=category(field,job),saved=profile?.applicationAnswers||{};
    const proposition=normal(clean(field.label).split("|")[0]);
    // An affirmative saved fact cannot be applied to a negated legal question.
    if(["workAuthorization","employerHistory","relocation","accommodation","disability",
      "criminalHistory","veteran"].includes(kind)&&
      /\b(?:never|not|no|without|neither|haven t|hasn t|don t)\b/.test(proposition))
      return null;
    let value="",source="";
    if(kind==="consent"){
      if(!choices.has(field.type))return null;
      const company=normal(job.companyName);
      if(!company)return null;
      const entries=clean(saved.consentByEmployer).split(/\r?\n/).map(line=>{
        const match=line.match(/^([^:]+):\s*(yes|no)\s*$/i);
        return match?{company:normal(match[1]),answer:match[2]}:null;
      }).filter(Boolean);
      const matching=entries.filter(entry=>entry.company===company);
      if(matching.length!==1)return null;
      value=matching[0].answer;
      source="Saved consent preference for "+job.companyName+" - read the current terms";
    }else if(kind==="compensation"){
      if(!["text","textarea"].includes(field.type))return null;
      value=clean(saved.compensation);source="Saved compensation response";
    }else if(kind==="relocation"){
      value=clean(saved.relocation);source="Saved relocation preference";
      if(choices.has(field.type)&&![/^yes$/i,/^no$/i].some(re=>re.test(value)))return null;
    }else if(kind==="sponsorship"){
      if(!choices.has(field.type))return null;
      const context=normal(clean(job.location)+" "+clean(field.label));
      const entries=clean(saved.sponsorship).split(/\r?\n/).map(line=>{
        const match=line.match(/^([^:]+):\s*(yes|no)\s*$/i);
        return match?{country:normal(match[1]),answer:match[2]}:null;
      }).filter(Boolean);
      const matching=entries.filter(entry=>entry.country.length>3&&context.includes(entry.country));
      if(matching.length!==1)return null;
      value=matching[0].answer;source="Explicit sponsorship answer for "+matching[0].country;
    }else if(kind==="restrictiveAgreement"){
      if(!choices.has(field.type))return null;
      value=clean(saved.restrictiveAgreement);
      source="Applicant-confirmed restrictive-agreement answer";
    }else if(kind==="languageProficiency"){
      if(!choices.has(field.type))return null;
      const entries=(Array.isArray(profile?.languages)?profile.languages:[]).filter(entry=>
        entry&&typeof entry==="object"&&
        /^(?:english|english language)$/i.test(clean(entry.name||entry.language))&&
        clean(entry.proficiency||entry.level));
      value=clean(saved.englishProficiency)||(entries.length===1?
        clean(entries[0].proficiency||entries[0].level):"");
      source="Applicant-confirmed English proficiency";
    }else if(kind==="workAuthorization"){
      if(!choices.has(field.type))return null;
      const context=normal(clean(job.location)+" "+clean(field.label));
      const entries=clean(saved.workAuthorization).split(/\r?\n/).map(line=>{
        const match=line.match(/^([^:]+):\s*(yes|no)\s*$/i);
        return match?{country:normal(match[1]),answer:match[2]}:null;
      }).filter(Boolean);
      const matching=entries.filter(entry=>entry.country.length>3&&context.includes(entry.country));
      if(matching.length!==1)return null;
      value=matching[0].answer;source="Confirmed work authorization for "+matching[0].country;
    }else if(["disability","accommodation","criminalHistory","gender","veteran"].includes(kind)){
      if(!choices.has(field.type))return null;
      value=clean(saved[kind]);source="Confirmed profile answer - review this question";
    }else if(kind==="motivationCompany"||kind==="motivationRole"){
      if(!["text","textarea"].includes(field.type))return null;
      const savedText=clean(saved[kind==="motivationCompany"?"whyCompany":"whyRole"]);
      value=savedText?fitDraft(savedText,field.maxLength):
        motivation(kind,profile,job,field.maxLength);
      source=savedText?"Saved motivation answer - edit before applying":
        "Draft from saved profile and job details - edit before applying";
    }else if(kind==="employerHistory"){
      if(/\b(?:never|not|no|without|haven.t|hasn.t)\b/i.test(clean(field.label)))return null;
      const match=Matcher.employerHistorySuggestion(field,profile);
      if(match)return {...match,source:"Confirmed employer history",review:true};
      const names=(clean(field.label).split(/\b(?:by|for|at|with)\b/i).at(-1)||"")
        .split(/[?*]/)[0].replace(/\bselect an option\b.*$/i,"")
        .split(/\s*\/\s*/).map(normal).filter(Boolean);
      const employers=(profile?.work||[]).map(row=>normal(row?.employer)).filter(Boolean);
      if(!names.length||!employers.length||employers.some(name=>names.includes(name)))return null;
      value="No";source="Inferred from saved work history - verify before continuing";
    }else return null;
    if(!value||value.length>4000)return null;
    if(choices.has(field.type)){
      const option=Matcher.optionFor(field.options,[value])||
        (["workdaySelect","ariaCombobox","ariaMenu"].includes(field.controlKind)&&value.length<=120?
          {value,label:value}:null);
      if(!option)return null;
      return {id:field.id,label:field.label,value:option.value,displayValue:option.label,
        fieldType:field.type,source,review:true,inferred:kind==="employerHistory"};
    }
    if(!["text","textarea"].includes(field.type))return null;
    return {id:field.id,label:field.label,value,displayValue:value,
      fieldType:field.type,source,review:true,inferred:kind==="employerHistory"};
  }
  const api={category,answerFor,fitDraft,motivation};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalApplicationAnswers=api;
})(globalThis);
