"use strict";
// Grounded drafting uses only applicant-approved profile facts and the vacancy
// title/description. The JD is for selecting evidence, never for inventing it.
(function(root){
  const clean=s=>String(s||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
  const tokens=s=>new Set(clean(s).toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(x=>x.length>4));
  function evidence(profile,job={}){
    const items=[];
    for(const work of profile?.work||[]){
      for(const achievement of work?.achievements||[]){
        const text=clean(typeof achievement==="string"?achievement:achievement?.description);
        if(text.length>=18&&text.length<=280)items.push({text,employer:clean(work.employer),kind:"achievement"});
      }
    }
    for(const project of profile?.projects||[]){
      const text=clean(project?.description);
      if(text.length>=20&&text.length<=200)items.push({text,kind:"project"});
    }
    if(!items.length)return null;
    const query=tokens([job.title,job.description].filter(Boolean).join(" "));
    const ranks=items.map((item,index)=>({item,index,rank:[...tokens(item.text)].filter(x=>query.has(x)).length}));
    ranks.sort((a,b)=>b.rank-a.rank||a.index-b.index);
    return ranks[0].rank>0?ranks[0].item:null;
  }
  function draft(kind,profile,job={},fit=txt=>txt,limit=1200){
    const title=clean(job.title),company=clean(job.companyName);
    const headline=clean(profile?.basics?.headline)||clean(profile?.work?.[0]?.title);
    if(!title||!headline||kind==="motivationCompany"&&!company)return "";
    const base=kind==="motivationCompany"?
      "I am interested in "+company+" and the "+title+" opportunity because it aligns with my background in "+headline+".":
      "The "+title+" role aligns with my background in "+headline+".";
    const entry=evidence(profile,job);
    let value=base;
    if(entry&&limit>=180){
      const phrase=entry.text.replace(/[.]+$/,"");
      // The evidence is quoted in its existing factual wording, with no invented numbers.
      value+=" One relevant achievement from my experience is: "+phrase+".";
    }else value+=" I would welcome the opportunity to apply that experience to this position.";
    return fit(value,limit);
  }
  const api={draft,evidence};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalOpenText=api;
})(globalThis);
