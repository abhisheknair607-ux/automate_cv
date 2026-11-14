"use strict";
(function(root){
  const clean=v=>String(v??"").trim();
  const normal=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

  function profile(p){
    const b=p?.basics||{}, name=clean(b.fullName);
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
  const protectedField=/password|passcode|verification|captcha|security|national id|passport|birth|age|gender|race|ethnic|disab|veteran|medical|health|criminal|salary|compensation|sponsorship|visa|work authori|signature|consent|reference|referee|emergency|ssn|tax id|social security/;

  // Relatives-at-employer question is a deliberately narrow default-answer rule.
  // It MUST NOT apply to other unknown eligibility, compliance or legal questions.
  function isEmployerFamilyQuestion(label){
    const s=normal(label);
    return /\b(relatives?|family members?|family relationships?|familial|related to|spouse|siblings?|parents?|blood relations?)\b/.test(s) &&
      /\b(employ(?:ed|ment|ee|er)?|working?|works|work|company|organisation|organization|firm|business|directors?|board|executives?|officers?|here)\b/.test(s);
  }
  function relativesAnswer(p, context){
    const company=normal(context?.companyName);
    const byCompany=p?.declarations?.relativesByCompany;
    // Only an exact employer-specific positive assertion can produce Yes.
    if(company&&byCompany&&typeof byCompany==="object"&&!Array.isArray(byCompany)){
      for(const [employer,answer] of Object.entries(byCompany)){
        if(normal(employer)===company&&(answer===true||normal(answer)==="yes"))return "Yes";
      }
    }
    return "No";
  }
  function choiceForAnswer(options, answer){
    const wanted=answer.toLowerCase();
    return (options||[]).find(o=>{
      const label=normal(o.label),value=normal(o.value);
      return label===wanted||label.startsWith(wanted+" ")||value===wanted;
    })||null;
  }
  function suggest(field,p,context={}){
    if(!field||field.hasValue||field.disabled||field.readOnly)return null;
    const label=normal(field.label);
    if(!label)return null;
    if(field.type==="select"||field.type==="radio"){
      if(!isEmployerFamilyQuestion(label))return null;
      const answer=relativesAnswer(p,context),choice=choiceForAnswer(field.options,answer);
      if(!choice)return null;
      return {id:field.id,label:field.label,key:"relativesAtEmployer",
        value:choice.value,displayValue:choice.label||answer,fieldType:field.type};
    }
    if(!["text","email","tel","url","search","textarea"].includes(field.type))return null;
    if(protectedField.test(label))return null;
    const hit=rules.find(([,re])=>re.test(label));
    if(!hit)return null;
    const value=profile(p)[hit[0]];if(!value)return null;
    if(field.type==="email"&&hit[0]!=="email")return null;
    if(field.type==="tel"&&hit[0]!=="phone")return null;
    return {id:field.id,label:field.label,key:hit[0],value,
      displayValue:value,fieldType:field.type};
  }
  const api={profile,suggest,isEmployerFamilyQuestion,relativesAnswer};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalMatcher=api;
})(globalThis);
