"use strict";
(function(root){
  const clean=value=>String(value??"").trim();
  const normal=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const keys={basics:["fullName","firstName","lastName","email","phone","city","country","linkedin","headline","summary"],
    work:["employer","title","city","country","current","startDate","endDate","achievements"],
    education:["institution","qualification","country","startDate","endDate","grade"]};
  function facts(profile){
    if(!profile||typeof profile!=="object"||Array.isArray(profile))return [];
    const out=[];
    const add=(path,value)=>{if(typeof value==="string"&&value.trim())
      out.push({path,value:value.trim().slice(0,180)});};
    const basics=profile.basics||{};
    for(const key of keys.basics)add("basics."+key,basics[key]);
    if(!basics.firstName||!basics.lastName){
      const parts=clean(basics.fullName).split(/\s+/).filter(Boolean);
      if(!basics.firstName&&parts.length)add("basics.firstName",parts[0]);
      if(!basics.lastName&&parts.length>1)add("basics.lastName",parts.slice(1).join(" "));
    }
    for(const kind of ["work","education"]){
      for(const [index,item] of (Array.isArray(profile[kind])?profile[kind]:[]).slice(0,12).entries()){
        if(!item||typeof item!=="object")continue;
        for(const key of keys[kind])add(kind+"."+index+"."+key,item[key]);
      }
    }
    return out.slice(0,120);
  }
  function section(field){
    const text=clean(field.context||field.section||"");
    for(const [kind,re] of [
      ["work",/\b(?:professional\s+experience|work\s+experience|employment(?:\s+history)?|experience)\s*[#(]?\s*(\d{1,2})\b/i],
      ["education",/\b(?:education|university\s+education|school|qualification)\s*[#(]?\s*(\d{1,2})\b/i]]){
      const match=text.match(re);if(match)return {kind,index:Number(match[1])-1};
    }
    return null;
  }
  function matchesSource(field,kind,key){
    const label=normal(clean(field.label).split("|")[0]);
    const patterns={
      basics:{
        fullName:/^(?:full|legal) name$/,firstName:/^(?:first|given) name$/,
        lastName:/^(?:last|family|sur) name$/,email:/\be ?mail\b/,
        phone:/\b(?:phone|mobile|telephone)\b/,city:/\b(?:city|town)\b/,
        country:/\b(?:country|nation)\b/,linkedin:/\blinkedin\b/,
        headline:/\bheadline\b/,summary:/\bsummary\b|^about me$/
      },
      work:{
        employer:/\b(?:employer|company|organisation|organization)\b/,
        title:/\b(?:job title|position title|designation|role)\b/,
        city:/\b(?:city|town)\b/,country:/\b(?:country|nation)\b/,
        current:/\bcurrent\b/,
        startDate:/\b(?:start|join|joining)\b/,
        endDate:/\b(?:end|leave|leaving|finish)\b/
      },
      education:{
        institution:/\b(?:university|college|school|institution)\b/,
        qualification:/\b(?:degree|qualification|course|programme|program)\b/,
        country:/\b(?:country|nation)\b/,grade:/\b(?:grade|result|gpa|cgpa)\b/,
        startDate:/\b(?:start|join|joining)\b/,
        endDate:/\b(?:end|graduation|completion|finish)\b/
      }
    };
    return !!patterns[kind]?.[key]?.test(label);
  }
  const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
  function validate(field,proposal,available){
    if(!field||field.hasValue||!proposal||proposal.fieldId!==field.id)return null;
    const path=clean(proposal.profilePath),source=available.find(x=>x.path===path);
    if(!source||!/^basics\.[a-zA-Z]+$|^(?:work|education)\.\d{1,2}\.[a-zA-Z]+$/.test(path))return null;
    const parts=path.split("."),group=section(field);
    if(group){if(parts[0]!==group.kind||Number(parts[1])!==group.index)return null;}
    else if(parts[0]!=="basics")return null;
    if(!keys[parts[0]].includes(parts.at(-1))||!matchesSource(field,parts[0],parts.at(-1)))return null;
    let value=source.value;
    const key=parts.at(-1);
    if(["startDate","endDate"].includes(key)){
      if(!["month","year"].includes(field.datePart))return null;
      const date=value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
      if(!date)return null;
      value=field.datePart==="year"?date[1]:String(Number(date[2]));
    }else if(field.datePart)return null;
    if(field.type==="checkbox"){
      if(key!=="current"||normal(value)!=="yes")return null;
      value="true";
    }else if(["select","radio","customSelect"].includes(field.type)){
      const candidates=field.datePart==="month"&&/^\d{1,2}$/.test(value)?
        [value,value.padStart(2,"0"),months[Number(value)-1],months[Number(value)-1]?.slice(0,3)]:[value];
      const wanted=new Set(candidates.map(normal).filter(Boolean));
      const option=(field.options||[]).find(o=>!o.disabled&&clean(o.value)&&
        (wanted.has(normal(o.label))||wanted.has(normal(o.value))));
      if(!option)return null;
      value=option.value;
    }else if(["text","search","textarea","number","email","tel","url"].includes(field.type)){
      if(field.type==="email"&&key!=="email")return null;
      if(field.type==="tel"&&key!=="phone")return null;
      if(field.type==="url"&&key!=="linkedin")return null;
      if(field.type==="number"&&!/^-?\d+(?:\.\d+)?$/.test(value))return null;
      if(field.datePart==="month")value=String(Number(value)).padStart(2,"0");
    }else return null;
    if(!value||value.length>500)return null;
    return {fieldId:field.id,answer:value,evidenceIds:["profile:"+path],profilePath:path};
  }
  function validateAll(fields,available,result){
    const byId=new Map(fields.map(f=>[f.id,f])),seen=new Set(),out=[];
    for(const proposal of Array.isArray(result?.mappings)?result.mappings:[]){
      const field=byId.get(proposal?.fieldId);
      if(!field||seen.has(field.id))continue;
      const answer=validate(field,proposal,available);
      if(answer){out.push(answer);seen.add(field.id);}
    }
    return out;
  }
  function relevantFacts(fields,available){
    const prefixes=new Set();
    for(const field of fields||[]){
      const group=section(field);
      prefixes.add(group?group.kind+"."+group.index+".":"basics.");
    }
    return (available||[]).filter(x=>[...prefixes].some(prefix=>x.path.startsWith(prefix)))
      .slice(0,60);
  }
  const api={facts,section,relevantFacts,validate,validateAll};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.GaramaalMapping=api;
})(globalThis);
