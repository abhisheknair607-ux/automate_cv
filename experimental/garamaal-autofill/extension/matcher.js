"use strict";
(function(root){
  const clean=v=>String(v??"").trim();
  const normal=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const protectedField=/password|passcode|verification|captcha|security|national id|passport|birth|\bage\b|gender|\brace\b|ethnic|disab|veteran|medical|health|criminal|salary|compensation|sponsorship|visa|work authori|signature|consent|declaration|terms|\breferences?\b|\breferees?\b|emergency|ssn|tax id|social security|conflict of interest|relatives?|family members?/;
  const textTypes=new Set(["text","email","tel","url","search","textarea"]);
  const valueTypes=new Set([...textTypes,"number","date"]);
  const choiceTypes=new Set(["select","radio"]);
  function profile(p){
    const b=p?.basics||{},name=clean(b.fullName);
    return {
      firstName:clean(b.firstName)||name.split(/\s+/)[0]||"",
      lastName:clean(b.lastName)||name.split(/\s+/).slice(1).join(" "),
      fullName:name,email:clean(b.email),phone:clean(b.phone),
      city:clean(b.city),country:clean(b.country),
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
    ["country",/(?:^| )country(?: of residence)?(?:$| )/],
    ["university",/(?:^| )(?:university|college|school name)(?:$| )/],
    ["employer",/(?:^| )(?:current|most recent) (?:company|employer)(?:$| )/],
    ["title",/(?:^| )(?:current|most recent) (?:job title|position title)(?:$| )/]
  ];
  function eligible(field){
    if(!field||field.hasValue||field.disabled||field.readOnly)return false;
    if(![...valueTypes,...choiceTypes].includes(field.type))return false;
    return !!normal(field.label)&&!protectedField.test(normal(field.label));
  }
  function optionFor(options,candidates){
    const wanted=candidates.map(normal).filter(Boolean);
    return (options||[]).find(o=>!o.disabled&&clean(o.value)&&
      wanted.some(x=>normal(o.label)===x||normal(o.value)===x))||null;
  }
  function singleRequiredChoice(field){
    if(!field?.required||field.type!=="select"||!eligible(field))return null;
    const choices=(field.options||[]).filter(o=>!o.disabled&&clean(o.value)&&
      !/^(select|choose|please select|please choose|pick one|none selected)$/i.test(clean(o.label)));
    if(choices.length!==1)return null;
    const option=choices[0];
    return {id:field.id,label:field.label,key:"singleChoice",value:option.value,
      displayValue:option.label,fieldType:field.type};
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
  function suggest(field,p){
    if(!field)return null;
    const birth=birthSuggestion(field,p);
    if(birth)return birth;
    if(!eligible(field))return null;
    const hit=rules.find(([,re])=>re.test(normal(field.label)));
    const auto={"given-name":"firstName","family-name":"lastName",name:"fullName",
      email:"email",tel:"phone","address-level2":"city","country-name":"country"}[field.autocomplete];
    if(hit&&auto&&hit[0]!==auto)return null;
    const key=hit?.[0]||auto;
    if(!key)return null;
    const value=profile(p)[key];if(!value)return null;
    if(choiceTypes.has(field.type)){
      const option=optionFor(field.options,[value]);
      if(!option)return null;
      return {id:field.id,label:field.label,key,value:option.value,
        displayValue:option.label,fieldType:field.type};
    }
    if(!textTypes.has(field.type))return null;
    if(field.type==="email"&&key!=="email")return null;
    if(field.type==="tel"&&key!=="phone")return null;
    if(field.type==="url"&&key!=="linkedin")return null;
    return {id:field.id,label:field.label,key,value,
      displayValue:value,fieldType:field.type};
  }
  const api={profile,suggest,eligible,optionFor,singleRequiredChoice,isoBirthDate,birthPart,normal};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalMatcher=api;
})(globalThis);
