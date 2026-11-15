"use strict";
(function(root){
  const Answers=root.GaramaalApplicationAnswers||(typeof require==="function"?require("./application_answers.js"):null);
  const Matcher=root.GaramaalMatcher||(typeof require==="function"?require("./matcher.js"):null);
  const normal=Matcher.normal;
  const choiceTypes=new Set(["select","radio","customSelect"]);
  // Reuse only propositions with the same meaning, orientation and scope.
  // A question asking whether a fact is absent is NOT interchangeable with one
  // asking whether it is present (especially for legal and EEO declarations).
  const isNegated=label=>/\b(?:never|not|no|without|neither|haven.t|hasn.t|aren.t|isn.t|don.t|haven t|hasn t|aren t|isn t|don t)\b/i.test(label);
  const cleanLabel=field=>normal(String(field?.label||"").split("|")[0]);
  const Proposition=root.GaramaalProposition||(typeof require==="function"?require("./proposition.js"):null);
  function keyFor(field,job={}){
    if(Proposition)return Proposition.fingerprint(field,job);
    // An absent normalizer must never cause unscoped answer reuse.
    return "";
  }
  function legacyKeyFor(field,job={}){
    const p=Proposition?.describe(field,job);
    if(!p||p.polarity!=="positive")return "";
    if(p.kind==="employerHistory"&&p.employers.length&&p.timeframe==="any-prior"&&
      !p.jurisdiction)return "employerHistory:"+p.employers.join("|");
    if(p.kind==="compensation"&&p.jurisdiction)return "compensation:"+p.jurisdiction;
    if(p.kind==="accommodation"&&!p.jurisdiction)return "accommodation:need";
    if(p.kind==="relocation"&&!p.jurisdiction){
      const n=normal(field.label);
      return /\b(?:assistance|support|need|require)\b/.test(n)?"relocation:assistance":
        /\b(?:willing|open to|would you relocate|prepared to relocate)\b/.test(n)?
          "relocation:willing":"";
    }
    return "";
  }
  function readReviewed(entry,key){
    if(typeof entry==="string")return entry.trim(); // pre-v3 explicit reviewed answers
    if(!entry||typeof entry!=="object"||entry.schemaVersion!==3||
      entry.scope!==key||entry.status!=="reviewed")return "";
    return String(entry.value||"").trim();
  }
  function fallbackFor(field,profile,job={},accepted={}){
    if(!field||field.hasValue)return null;
    const direct=Answers.answerFor(field,profile,job);
    if(direct&&!direct.inferred)return null;
    const key=keyFor(field,job);
    if(!key)return null;
    const kind=Answers.category(field,job);
    const saved=profile?.applicationAnswers||{};
    const savedKey={compensation:"compensation",relocation:"relocation",
      disability:"disability",accommodation:"accommodation",
      criminalHistory:"criminalHistory",veteran:"veteran",
      motivationCompany:"whyCompany",motivationRole:"whyRole"}[kind];
    if(savedKey&&String(saved[savedKey]||profile?.equalEmployment?.[savedKey]||"").trim())return null;
    if(kind==="employerHistory"){
      const names=key.slice("employerHistory:".length).split("|");
      if(names.some(name=>normal(profile?.employerDeclarations).includes(name))||
        (profile?.work||[]).some(row=>names.includes(normal(row?.employer))))return null;
    }
    const oldKey=legacyKeyFor(field,job);
    const remembered=readReviewed(accepted[key],key)||
      (oldKey&&typeof accepted[oldKey]==="string"?accepted[oldKey].trim():"");
    let value=remembered,source=remembered?"Accepted on an earlier application":"Suggested answer - check and change if needed";
    if(!value){
      if(kind==="employerHistory"){
        // Inference needs a populated employment history, not missing data.
        const names=key.slice("employerHistory:".length).split("|");
        const employers=(profile?.work||[]).map(row=>normal(row?.employer)).filter(Boolean);
        if(!employers.length||employers.some(name=>names.includes(name)))return null;
        value="No";
        source="Inferred from recorded employment history (not an established fact)";
      }
      // Other factual, EEO, eligibility and compensation questions have no
      // evidence-based default. Use a reviewed candidate preference instead.
    }
    if(!value)return null;
    if(choiceTypes.has(field.type)){
      const option=Matcher.optionFor(field.options,[value])||
        (["workdaySelect","ariaCombobox"].includes(field.controlKind)&&/^(yes|no)$/i.test(value)?{label:value,value}:null);
      if(!option)return null;
      return {id:field.id,label:field.label,value:option.value,displayValue:option.label,
        fieldType:field.type,key,source,provisional:!remembered,remembered:!!remembered};
    }
    if(!["text","textarea"].includes(field.type))return null;
    value=Answers.fitDraft(value,field.maxLength);
    if(!value)return null;
    return {id:field.id,label:field.label,value,displayValue:value,
      fieldType:field.type,key,source,provisional:!remembered,remembered:!!remembered};
  }
  function acceptedAfterNext(previous,pending){
    const result={...(previous&&typeof previous==="object"&&!Array.isArray(previous)?previous:{})};
    for(const item of pending||[]){
      if(!item?.key||!String(item.displayValue||"").trim())continue;
      const value=String(item.displayValue).trim().slice(0,4000);
      // Preserve compatibility with verified pre-v3 records. New records carry
      // their complete reviewed scope and a bounded correction history.
      if(!item.field){result[item.key]=value;continue;}
      const previous=result[item.key];
      const history=previous?.schemaVersion===3&&Array.isArray(previous.history)?
        previous.history.slice(-4):[];
      if(previous?.schemaVersion===3&&previous.status==="reviewed"&&previous.value!==value)
        history.push({value:previous.value,at:previous.reviewedAt});
      result[item.key]={schemaVersion:3,status:"reviewed",scope:item.key,value,
        reviewedAt:new Date().toISOString(),history,source:item.source||"Manual review",
        question:String(item.field.label||item.label||"").split("|")[0].slice(0,240)};
    }
    return result;
  }
  const api={keyFor,fallbackFor,acceptedAfterNext,readReviewed};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalAnswerMemory=api;
})(globalThis);
