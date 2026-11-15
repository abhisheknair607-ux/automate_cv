"use strict";
(function(root){
  const clean=v=>String(v??"").trim();
  const normal=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const manualReview=/\bcurrent position\b|professional certifications?|certifications? or licen[cs](?:e|ure)|licen[cs](?:e|ure)|\blanguages?\b|areas? of interest/;
  const protectedField=/password|passcode|verification|captcha|security|national id|passport|birth|\bage\b|gender|\brace\b|ethnic|disab|veteran|(?:medical|health)\s+(?:conditions?|history|status|information|records?|issues?|disabilit\w*|accommodat\w*|restrictions?|questionnaire|leave)|(?:your|personal|physical|mental|any)\s+(?:medical|health)\b|criminal|salary|compensation|sponsorship|visa|work authori|signature|consent|declaration|terms|certify|acknowledg|agree|accept|confirm|authorize|authorise|\breferences?\b|\breferees?\b|emergency|ssn|tax id|social security|conflict of interest|relatives?|family members?/;
  const textTypes=new Set(["text","email","tel","url","search","textarea"]);
  const valueTypes=new Set([...textTypes,"number","date","month","checkbox"]);
  const choiceTypes=new Set(["select","radio","customSelect","multiSelect"]);
  function profile(p){
    const b=p?.basics||{},name=clean(b.fullName);
    const city=clean(b.city),country=clean(b.country);
    const sameNamedIrishCounty=/^ireland$/i.test(country)&&
      ["Dublin","Cork","Galway","Limerick","Waterford"].some(value=>
        normal(city)===normal(value));
    return {
      firstName:clean(b.firstName)||name.split(/\s+/)[0]||"",
      lastName:clean(b.lastName)||name.split(/\s+/).slice(1).join(" "),
      fullName:name,email:clean(b.email),phone:clean(b.phone),
      city,state:clean(b.state)||(sameNamedIrishCounty?city:""),
      postalCode:clean(b.postalCode),country,
      linkedin:clean(b.linkedin||b.linkedinUrl),
      university:clean(p?.education?.[0]?.institution),
      employer:clean(p?.work?.[0]?.employer),
      title:clean(p?.work?.[0]?.title)
    };
  }
  const rules=[
    ["email",/(?:^| )e ?mail(?: address)?(?:$| )/],
    ["phone",/(?:^| )(?:phone|mobile|telephone)(?: number)?(?:$| )/],
    ["linkedin",/(?:^| )linkedin(?: profile| url| link)?(?:$| )/],
    ["firstName",/(?:^| )(?:first|given) name(?:$| )/],
    ["lastName",/(?:^| )(?:last|family|sur) name(?:$| )/],
    ["fullName",/(?:^| )(?:full|legal) name(?:$| )/],
    ["city",/(?:^| )(?:city|town)(?:$| )/],
    ["state",/(?:^| )(?:state|county|province|region)(?:$| )/],
    ["postalCode",/(?:^| )(?:postal|post|zip|eircode)(?: code)?(?:$| )/],
    ["country",/(?:^| )country(?: of residence)?(?:$| )/],
    ["university",/(?:^| )(?:university|college|school name)(?:$| )/],
    ["employer",/(?:^| )(?:current|most recent) (?:company|employer)(?:$| )/],
    ["title",/(?:^| )(?:current|most recent) (?:job title|position title)(?:$| )/]
  ];
  function eligible(field){
    if(!field||field.hasValue||field.disabled||field.readOnly)return false;
    if(![...valueTypes,...choiceTypes].includes(field.type))return false;
    return !!normal(field.label)&&!protectedField.test(normal(field.label))&&
      !manualReview.test(normal(field.label));
  }
  function optionFor(options,candidates){
    const wanted=candidates.map(normal).filter(Boolean);
    return (options||[]).find(o=>!o.disabled&&clean(o.value)&&
      wanted.some(x=>normal(o.label)===x||normal(o.value)===x))||null;
  }
  function isoBirthDate(p){
    const s=clean(p?.basics?.dateOfBirth);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
    const [year,month,day]=s.split("-").map(Number);
    const d=new Date(Date.UTC(year,month-1,day));
    return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&
      d.getUTCDate()===day?{iso:s,year,month,day}:null;
  }
  function birthPart(label){
    const s=normal(label);
    if(/(?:^| )(?:date of birth|birth date|dob|birth (?:day|month|year)|(?:day|month|year) of birth)(?:$| )/.test(s)){
      const m=s.match(/(?:birth|dob) (day|month|year)\b/)||
        s.match(/\b(day|month|year) (?:of )?birth\b/);
      return m?m[1]:"date";
    }
    return null;
  }
  function birthSuggestion(field,p){
    const part=birthPart(field.label),date=isoBirthDate(p);
    if(!part||!date||field.hasValue||field.disabled||field.readOnly)return null;
    let value,displayValue;
    if(part==="date"){
      if(field.type!=="date")return null;
      value=date.iso;displayValue=date.iso;
    }else{
      const n=date[part],padded=String(n).padStart(2,"0");
      const monthNames=["January","February","March","April","May","June",
        "July","August","September","October","November","December"];
      const candidates=part==="month"?
        [String(n),padded,monthNames[n-1],monthNames[n-1].slice(0,3)]:
        [String(n),padded];
      if(choiceTypes.has(field.type)){
        const option=optionFor(field.options,candidates);
        if(!option)return null;
        value=option.value;displayValue=option.label;
      }else if(field.type==="number"||field.type==="text"){
        value=String(n);displayValue=value;
      }else return null;
    }
    return {id:field.id,label:field.label,key:"dateOfBirth",value,displayValue,
      fieldType:field.type};
  }
  function employerHistorySuggestion(field,p){
    const label=clean(field?.label);
    // A relative's relationship to an employer is not the applicant's work history.
    if(/\b(?:relatives?|family members?|spouse|partner|siblings?|parents?)\b/i.test(label))return null;
    if(/\b(?:never|not|no|without|haven.t|hasn.t)\b/i.test(label))return null;
    if(!/\b(?:employed|work(?:ed)?)\b.*\b(?:by|for|at|with)\b/i.test(label)||
      !choiceTypes.has(field.type))return null;
    const names=(label.split(/\b(?:by|for|at|with)\b/i).at(-1)||"")
      .split(/[?*]/)[0].replace(/\bselect an option\b.*$/i,"")
      .split(/\s*\/\s*/).map(normal).filter(Boolean);
    if(!names.length)return null;
    let answer="";
    for(const line of clean(p?.employerDeclarations).split(/\r?\n/)){
      const match=line.match(/^(.+?):\s*(yes|no)\b/i);
      const declared=match?match[1].split(/\s*\/\s*/).map(normal):[];
      if(match&&names.every(name=>declared.includes(name))){answer=match[2];break;}
    }
    if(!answer&&(p?.work||[]).some(row=>names.some(name=>
      normal(row?.employer)===name)))answer="Yes";
    if(!answer)return null;
    const option=optionFor(field.options,[answer])||
      (["workdaySelect","ariaCombobox"].includes(field.controlKind)?{value:answer,label:answer}:null);
    if(!option)return null;
    return {id:field.id,label:field.label,key:"employerDeclarations",
      value:option.value,displayValue:option.label,fieldType:field.type};
  }
  function multiSuggestion(field,p){
    if(field.type!=="multiSelect"||field.hasValue||field.disabled||field.readOnly)return null;
    const label=normal(field.label);
    if(protectedField.test(label))return null;
    let values=[];
    if(/\bskills?\b|\btechnolog(?:y|ies)\b|\btools?\b/.test(label))values=p?.skills||[];
    else if(/\blanguages?\b/.test(label))values=p?.languages||[];
    else if(/\bcertifications?\b|\blicen[cs]es?\b/.test(label))values=p?.certifications||[];
    else return null;
    const accepted=new Set(values.map(x=>normal(typeof x==="string"?x:x?.name||x?.title)).filter(Boolean));
    const matches=(field.options||[]).filter(x=>!x.disabled&&clean(x.value)&&
      (accepted.has(normal(x.label))||accepted.has(normal(x.value))));
    if(!matches.length)return null;
    return {id:field.id,label:field.label,key:"exactSavedChoices",fieldType:"multiSelect",
      values:matches.map(x=>x.value),value:matches.map(x=>x.value).join(", "),
      displayValue:matches.map(x=>x.label).join(", ")};
  }
  function suggest(field,p){
    if(!field)return null;
    const multi=multiSuggestion(field,p);
    if(multi)return multi;
    const birth=birthSuggestion(field,p);
    if(birth)return birth;
    if(!eligible(field))return null;
    const employerAnswer=employerHistorySuggestion(field,p);
    if(employerAnswer)return employerAnswer;
    const hit=rules.find(([,re])=>re.test(normal(field.label)));
    const auto={"given-name":"firstName","family-name":"lastName",name:"fullName",
      email:"email",tel:"phone","country-name":"country",
      "address-level1":"state","postal-code":"postalCode"}[field.autocomplete];
    if(hit&&auto&&hit[0]!==auto)return null;
    const key=hit?.[0]||auto;
    if(!key)return null;
    const value=profile(p)[key];if(!value)return null;
    if(choiceTypes.has(field.type)){
      const option=optionFor(field.options,[value])||
        (field.type==="customSelect"&&field.controlKind==="smartCity"&&key==="city"?
          {value,label:value}:null);
      if(!option)return null;
      return {id:field.id,label:field.label,key,value:option.value,
        displayValue:option.label,fieldType:field.type,
        ...(field.controlKind==="smartCity"&&key==="city"?{country:profile(p).country}:{})};
    }
    if(!textTypes.has(field.type))return null;
    if(field.type==="email"&&key!=="email")return null;
    if(field.type==="tel"&&key!=="phone")return null;
    if(field.type==="url"&&key!=="linkedin")return null;
    return {id:field.id,label:field.label,key,value,
      displayValue:value,fieldType:field.type};
  }
  const api={profile,suggest,eligible,optionFor,isoBirthDate,birthPart,normal,
    employerHistorySuggestion,multiSuggestion};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalMatcher=api;
})(globalThis);
