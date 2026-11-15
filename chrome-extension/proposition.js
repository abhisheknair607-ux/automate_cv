"use strict";
// Classification only. Never interpret a missing fact as a negative answer.
(function(root){
  const normal=s=>String(s||"").toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const clean=s=>String(s||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,550);
  const Answers=root.GaramaalApplicationAnswers||(typeof require==="function"?require("./application_answers.js"):null);
  const COUNTRY_RE=[
    ["ireland",/\b(?:ireland|eire)\b/i],
    ["united kingdom",/\b(?:united kingdom|great britain|britain|england|scotland|wales|northern ireland|u\.?k\.?)\b/i],
    ["united states",/\b(?:united states|america|usa)\b/i],
    ["india",/\bindia\b/i],["germany",/\bgermany\b/i],
    ["france",/\bfrance\b/i],["canada",/\bcanada\b/i],
    ["australia",/\baustralia\b/i]
  ];
  function countryOf(text){
    const value=String(text||"");
    if(/\b(?:U\.S\.|U\.S\.A\.|US|USA)\b/.test(value))return "united states";
    if(/\b(?:Northern Ireland)\b/i.test(value))return "united kingdom";
    const hits=COUNTRY_RE.filter(([_,pattern])=>pattern.test(value));
    // Ambiguous territories are left unresolved rather than borrowed from a job location.
    return hits.length===1?hits[0][0]:"";
  }
  function negate(label){return /\b(?:never|not|no|without|neither|havent|hasnt|dont|arent|isnt|didnt|cannot|cant)\b/.test(normal(label));}
  function kindOf(field,job={}){
    const text=normal(clean(field?.label).split("|")[0]);
    if(/\b(?:relatives?|family members?|spouse|partner|siblings?|parents?)\b/.test(text)&&
      /\b(?:employed|work|worked|working|employee)\b/.test(text))return "familyEmployment";
    if(/\b(?:visa sponsorship|sponsor(?:ship|ed)?|require (?:a )?visa|need (?:a )?visa)\b/.test(text))return "sponsorship";
    if(/\b(?:conflict of interest|competing interest|related party)\b/.test(text))return "conflict";
    if(/\b(?:certify|attest|declaration|declare under penalty)\b/.test(text))return "certification";
    return Answers?.category?.(field,job)||"";
  }
  function employerNames(label,job={},kind=""){
    if(kind!=="employerHistory"&&kind!=="familyEmployment")return [];
    const raw=clean(label).split("|")[0];
    const tail=(raw.split(/\b(?:by|for|at|with)\b/i).at(-1)||"")
      .split(/[?*]/)[0].replace(/\b(?:previously|ever|before|in the past|select an option|select one)\b.*$/i,"");
    const implicit=/\b(?:our company|this company|our organization|our organisation|us)\b/i.test(tail);
    if(implicit)return job.companyName?[normal(job.companyName)]:[];
    return tail.split(/\s*\/\s*/).map(normal).filter(name=>name.length>=2&&
      !/^(?:the company|our company|any company|an organization|an organisation)$/.test(name)).sort();
  }
  function timeframe(label,kind){
    const n=normal(label);
    if(/\b(?:currently|at present|right now|today)\b/.test(n))return "current";
    if(/\b(?:within the last|past \d+ years|last \d+ years)\b/.test(n)){
      const years=n.match(/\b(?:past|last) (\d+) years/);return years?"past-"+years[1]+"-years":"recent";
    }
    if(/\b(?:future|would you|will you|planning to)\b/.test(n)&&kind!=="employerHistory")return "future";
    if(kind==="employerHistory"||kind==="familyEmployment")return "any-prior";
    return "unspecified";
  }
  function subject(label,kind){
    if(kind==="familyEmployment")return "relative";
    return /\b(?:manager|reference|referee)\b/.test(normal(label))?"third-party":"applicant";
  }
  function choiceScale(field){
    const options=(field?.options||[]).filter(o=>!o.disabled&&String(o.value||"").trim());
    const labels=options.map(o=>normal(o.label));
    if(labels.length>=2&&labels.includes("yes")&&labels.includes("no"))return "yes-no";
    return labels.length?labels.sort().join("/").slice(0,180):"unspecified";
  }
  function describe(field,job={}){
    const label=clean(field?.label).split("|")[0];
    const kind=kindOf(field,job);
    const ownCountry=countryOf(label),jobCountry=countryOf(job.location||"");
    const country=ownCountry||jobCountry;
    const employers=employerNames(label,job,kind);
    const protectedKind=["workAuthorization","sponsorship","disability","veteran","gender",
      "criminalHistory","accommodation","familyEmployment","conflict","consent","certification"].includes(kind);
    const result={schemaVersion:"garamaal-proposition-v1",kind,subject:subject(label,kind),
      polarity:negate(label)?"negated":"positive",timeframe:timeframe(label,kind),
      jurisdiction:country,employers,responseType:String(field?.type||"unknown"),
      choiceScale:choiceScale(field),recordScope:String(field?.context||field?.section||"")
        .match(/\b(?:work experience|experience|education|employment)\s*\((\d+)\)/i)?.[0]||"",
      protected:protectedKind,required:Boolean(field?.required),maxLength:Number(field?.maxLength)||0};
    return result;
  }
  // Excludes answer values, URLs and candidate information. Used for exact review-memory scope.
  function fingerprint(field,job={}){
    const p=describe(field,job);
    if(!p.kind||p.polarity!=="positive"||["consent","certification","familyEmployment","conflict","sponsorship","workAuthorization"].includes(p.kind))return "";
    if(p.kind==="employerHistory"&&!p.employers.length)return "";
    if(p.kind==="motivationCompany"&&!job.companyName)return "";
    if(p.kind==="motivationRole"&&!job.title)return "";
    const scope=p.kind==="employerHistory"?p.employers.join("|"):
      p.kind==="motivationCompany"?normal(job.companyName):
      p.kind==="motivationRole"?normal(job.title):"";
    if(["disability","veteran","criminalHistory"].includes(p.kind))
      return ["v3",p.kind,normal(field.label.split("|")[0]),p.jurisdiction,p.timeframe,p.choiceScale].join(":");
    if(p.kind==="relocation"){
      const n=normal(field.label);
      const part=/\b(?:assistance|support|need|require)\b/.test(n)?"assistance":
        /\b(?:willing|open to|would you relocate|prepared to relocate)\b/.test(n)?"willing":"";
      return part?["v3",p.kind,part,p.jurisdiction].join(":"):"";
    }
    if(p.kind==="accommodation")return "v3:accommodation:need:"+p.jurisdiction;
    if(p.kind==="compensation")return p.jurisdiction?"v3:compensation:"+p.jurisdiction:"";
    return ["v3",p.kind,scope,p.timeframe,p.jurisdiction,p.choiceScale].join(":");
  }
  const api={describe,fingerprint,countryOf,employerNames,kindOf,negate,normal};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalProposition=api;
})(globalThis);
