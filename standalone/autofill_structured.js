"use strict";
const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const clean=s=>String(s||"").replace(/\s+/g," ").trim();
function dates(text){
  const matches=[...clean(text).matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(20\d{2}|19\d{2})\b/gi)];
  const iso=m=>m?m[2]+"-"+String(months[m[1].slice(0,3).toLowerCase()]).padStart(2,"0"):"";
  return {startDate:iso(matches[0]),endDate:iso(matches[1])};
}
function between(lines,start,end){
  const from=lines.findIndex(x=>x.toUpperCase()===start);
  if(from<0)return [];
  const to=lines.findIndex((x,i)=>i>from&&x.toUpperCase()===end);
  return lines.slice(from+1,to<0?lines.length:to);
}
function extractStructuredProfile(text){
  const lines=String(text||"").split(/\r?\n/).map(clean).filter(Boolean);
  const chronology=between(lines,"EVIDENCE CORE-CHRONOLOGY","END EVIDENCE CORE-CHRONOLOGY");
  const identity=chronology[0]?.split("|").map(clean)||[];
  const location=identity[1]?.split(",").map(clean)||[];
  const basics={fullName:identity[0]||"",city:location[0]||"",
    country:location[location.length-1]||""};
  const work=[];
  for(const line of chronology.slice(1)){
    const parts=line.split("|").map(clean);
    if(parts.length<3||!parts[0]||!parts[1])continue;
    const period=parts.slice(parts.length>3?3:2).join(" | ");
    const date=dates(period);
    if(!date.startDate)continue;
    const place=parts.length>3?parts[2].split(",").map(clean):[];
    work.push({title:parts[0],employer:parts[1],city:place.length>1?place[0]:"",
      country:place[place.length-1]||"",current:/\bcurrent\b/i.test(period)?"yes":"no",
      ...date,period});
  }
  const education=[];
  const from=lines.findIndex(x=>x.toUpperCase()==="EVIDENCE CORE-CREDENTIALS");
  const to=lines.findIndex((x,i)=>i>from&&x.toUpperCase()==="PROFESSIONAL QUALIFICATIONS & CERTIFICATIONS");
  if(from>=0&&to>from){
    const section=lines.slice(from+1,to);
    for(let i=0;i<section.length;i++){
      const line=section[i];
      const split=line.indexOf(" - ");
      if(split<=0||line.includes("|")||line.startsWith("?")||line.startsWith("?"))continue;
      const qualification=clean(line.slice(0,split)),institution=clean(line.slice(split+3));
      if(!qualification||!institution)continue;
      const next=section[i+1]||"";
      const pieces=next.split("|").map(clean);
      const period=pieces.length>1?pieces.slice(1).join(" | "):"";
      const place=pieces[0]?.split(",").map(clean)||[];
      education.push({qualification,institution,country:place[place.length-1]||"",
        ...dates(period),period});
    }
  }
  return {basics,work:work.slice(0,12),education:education.slice(0,12)};
}
module.exports={dates,extractStructuredProfile};
