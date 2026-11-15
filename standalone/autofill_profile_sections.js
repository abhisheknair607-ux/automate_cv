"use strict";
const clean=s=>String(s||"").trim();
const normal=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function numberedSection(field){
  const text=clean(field.context||"")+" "+clean(field.label||"");
  for(const [kind,re] of [
    ["work",/\b(?:professional\s+experience|work\s+experience|employment(?:\s+history)?|experience)\s*[#(]?\s*(\d{1,2})\b/i],
    ["education",/\b(?:education|university\s+education|school|qualification)\s*[#(]?\s*(\d{1,2})\b/i]
  ]){
    const match=text.match(re);
    if(match&&Number(match[1])>=1)return {kind,index:Number(match[1])-1};
  }
  return null;
}
function periodDates(period){
  const matches=[...clean(period).matchAll(/\b(\d{4})[-/](0?[1-9]|1[0-2])\b/g)];
  return {start:matches[0]?{year:matches[0][1],month:Number(matches[0][2])}:null,
    end:matches[1]?{year:matches[1][1],month:Number(matches[1][2])}:null};
}
const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
function exactOption(options,candidates){
  const wanted=new Set(candidates.map(normal).filter(Boolean));
  return (options||[]).find(o=>!o.disabled&&clean(o.value)&&
    (wanted.has(normal(o.label))||wanted.has(normal(o.value))))||null;
}
function directProfileAnswers(fields,profile){
  if(!profile||typeof profile!=="object"||Array.isArray(profile))return [];
  const out=[];
  for(const field of fields){
    const section=numberedSection(field);
    if(!section)continue;
    const record=profile[section.kind]?.[section.index];
    if(!record||typeof record!=="object")continue;
    const label=normal(clean(field.label).split("|")[0]);
    let value="",source="";
    if(section.kind==="work"){
      if(/^(?:employer|company|organisation|organization)(?: name)?$/.test(label)){
        value=clean(record.employer);source="employer";
      }else if(/^(?:job title|position title|title|role)$/.test(label)){
        value=clean(record.title);source="title";
      }else if(/^(?:city|town)$/.test(label)){
        value=clean(record.city);source="city";
      }else if(label==="country"){
        value=clean(record.country);source="country";
      }else if(/^(?:current employer|present employer|i currently work here|this is my current job)$/.test(label)&&
        field.type==="checkbox"&&(normal(record.current)==="yes"||
        (!clean(record.current)&&/\b(?:present|current)\b/i.test(clean(record.period))))){
        value="true";source="current";
      }
    }else{
      if(/^(?:university|college|school|institution)(?: name)?$/.test(label)){
        value=clean(record.institution);source="institution";
      }else if(/^(?:degree|qualification|course|programme|program|field of study)$/.test(label)){
        value=clean(record.qualification);source="qualification";
      }else if(/^(?:grade|result|gpa|cgpa)$/.test(label)){
        value=clean(record.grade);source="grade";
      }else if(label==="country"){
        value=clean(record.country);source="country";
      }
    }
    if(!value&&/\b(?:start|end|graduation|completion)\s+date\b/.test(label)){
      const isStart=/\bstart\s+date\b/.test(label);
      const structured=clean(isStart?record.startDate:record.endDate);
      const parsed=periodDates(structured);
      const date=parsed.start||
        (isStart?periodDates(record.period).start:periodDates(record.period).end);
      if(date&&["month","year"].includes(field.datePart)){
        source="period";
        if(field.datePart==="year")value=date.year;
        else value=String(date.month);
      }
    }
    if(!value||value.length>500)continue;
    if(field.type==="checkbox"){
      if(value!=="true")continue;
    }else if(field.type==="select"||field.type==="radio"||field.type==="customSelect"){
      const candidates=source==="period"&&field.datePart==="month"?
        [value,String(value).padStart(2,"0"),months[Number(value)-1],months[Number(value)-1]?.slice(0,3)]:[value];
      const option=exactOption(field.options,candidates);
      if(!option)continue;
      value=option.value;
    }else if(["text","number","textarea"].includes(field.type)){
      if(source==="period"&&field.datePart==="month")value=String(Number(value)).padStart(2,"0");
    }else continue;
    out.push({fieldId:field.id,answer:value,
      evidenceIds:["profile:"+section.kind+":"+(section.index+1)+":"+source]});
  }
  return out;
}
module.exports={numberedSection,periodDates,directProfileAnswers};
