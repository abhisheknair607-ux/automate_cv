(function(root){
  "use strict";
  function sectionIndex(text){
    const value=String(text||"");
    for(const [kind,re] of [
      ["work",/\b(?:professional\s+experience|work\s+experience|employment(?:\s+history)?|experience)\s*[#(]?\s*(\d{1,2})\b/i],
      ["education",/\b(?:education|university\s+education|school|qualification)\s*[#(]?\s*(\d{1,2})\b/i]
    ]){
      const match=value.match(re);
      if(match&&Number(match[1])>=1)return {kind,index:Number(match[1])};
    }
    return null;
  }
  function visibleCounts(fields){
    const counts={work:0,education:0};
    for(const field of fields||[]){
      const section=sectionIndex(field.context||field.section||"");
      if(section)counts[section.kind]=Math.max(counts[section.kind],section.index);
    }
    return counts;
  }
  function targets(fields,profileCounts){
    const visible=visibleCounts(fields),out=[];
    for(const kind of ["work","education"]){
      const desired=Math.min(12,Math.max(0,Number(profileCounts?.[kind])||0));
      if(visible[kind]>0&&desired>visible[kind])out.push({kind,from:visible[kind],to:desired});
    }
    return out;
  }
  const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function suggest(field,profile,matcher){
    const section=sectionIndex(field.context||field.section||"");
    if(!section||field.hasValue)return null;
    const record=profile?.[section.kind]?.[section.index-1];
    if(!record||typeof record!=="object")return null;
    const label=matcher.normal(String(field.label||"").split("|")[0]);
    const currentRecord=section.kind==="work"&&section.index===1&&
      matcher.normal(record.current)==="yes";
    const trustedCurrent=currentRecord&&field.type==="text"&&
      (label==="current position"||label==="current employer");
    const trustedCurrentChoice=section.kind==="work"&&
      label==="is current position"&&
      ["select","radio"].includes(field.type)&&
      ["yes","no"].includes(matcher.normal(record.current));
    const knownDate=section.kind==="work"&&/^(?:from|to)$/.test(label)&&
      (["MM/YYYY","YYYY-MM"].includes(field.dateFormat)&&field.type==="text"||field.type==="month");
    if(!matcher?.eligible(field)&&!trustedCurrent&&!trustedCurrentChoice&&!knownDate)return null;
    let value="";
    if(section.kind==="work"){
      if(label==="current position"&&trustedCurrent)value=record.title;
      else if(label==="current employer"&&trustedCurrent)value=record.employer;
      else if(/^(?:employer|company|organisation|organization)(?: name)?$/.test(label))value=record.employer;
      else if(/^(?:job title|position title|title|role)$/.test(label))value=record.title;
      else if(/^(?:city|town)$/.test(label))value=record.city;
      else if(label==="country")value=record.country;
      else if(label==="is current position"&&["yes","no"].includes(matcher.normal(record.current)))
        value=matcher.normal(record.current);
      else if(/^(?:current employer|present employer|i currently work here|this is my current job)$/.test(label)&&
        field.type==="checkbox"&&
        (matcher.normal(record.current)==="yes"||
          (!record.current&&/\b(?:present|current)\b/i.test(record.period||""))))value="true";
    }else{
      if(/^(?:university|college|school|institution)(?: name)?$/.test(label))value=record.institution;
      else if(label==="type of degree"){
        const qualification=matcher.normal(record.qualification||record.degree);
        if(/^(msc|ma|mba|master|mphil)\b/.test(qualification))value="Master's Degree";
        else if(/^(bsc|ba|bcom|bachelor)\b/.test(qualification))value="Bachelor's Degree";
        else if(/^diploma\b/.test(qualification))value="Diploma";
      }
      else if(/^(?:degree|qualification|course|programme|program|field of study)$/.test(label))
        value=record.qualification||record.degree;
      else if(/^(?:grade|result|gpa|cgpa)$/.test(label))value=record.grade;
      else if(label==="country")value=record.country;
    }
    if(!value&&(/\b(?:start|end|graduation|completion)\s+date\b/.test(label)||
      (/^(?:from|to)$/.test(label)&&section.kind==="work"))){
      const isEnd=/\b(?:end|completion|graduation)\s+date\b/.test(label)||label==="to";
      if(isEnd&&matcher.normal(record.current)==="yes")return null;
      const date=String(isEnd?record.endDate||"":record.startDate||"");
      const fromPeriod=String(record.period||"").match(/(\d{4})[-\/](0?[1-9]|1[0-2])(?:\s*(?:to|–|-)\s*(\d{4})[-\/](0?[1-9]|1[0-2]))?/i);
      const parsed=date.match(/^(\d{4})[-\/](0?[1-9]|1[0-2])$/)||
        (fromPeriod&&(isEnd&&fromPeriod[3]?[null,fromPeriod[3],fromPeriod[4]]:
          !isEnd?[null,fromPeriod[1],fromPeriod[2]]:null));
      if(parsed){
        const yyyy=parsed[1],mm=String(Number(parsed[2])).padStart(2,"0");
        if(field.dateFormat==="MM/YYYY"&&field.type==="text")value=mm+"/"+yyyy;
        else if(field.dateFormat==="YYYY-MM"&&field.type==="text")value=yyyy+"-"+mm;
        else if(field.datePart==="year")value=yyyy;
        else if(field.datePart==="month")value=String(Number(parsed[2]));
        else if(field.type==="month")value=yyyy+"-"+mm;
      }
    }
    value=String(value||"").trim();
    if(!value||value.length>500)return null;
    let displayValue=value;
    if(field.type==="checkbox"){
      if(value!=="true")return null;
      displayValue="Checked";
    }else if(["select","radio","customSelect"].includes(field.type)){
      const candidates=field.datePart==="month"&&/^\d{1,2}$/.test(value)?
        [value,value.padStart(2,"0"),months[Number(value)-1],months[Number(value)-1]?.slice(0,3)]:[value];
      const option=matcher.optionFor(field.options,candidates.filter(Boolean));
      if(!option)return null;
      value=option.value;displayValue=option.label;
    }else if(!["text","number","textarea","month"].includes(field.type))return null;
    return {id:field.id,label:field.label,context:field.context||"",
      value,displayValue,fieldType:field.type,key:"profile-record"};
  }
  const api={sectionIndex,visibleCounts,targets,suggest};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.GaramaalRepeat=api;
})(globalThis);
