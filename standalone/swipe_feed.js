"use strict";
/* Read-only Swipe projection over existing Taaza and Freshmaal, without
   duplicating the expensive listJobs tab discovery and per-row validation.
   This source is injected only into the authenticated Swipe VM.
   It does not write to Sheets or call the paid CV worker. */
const SOURCE=String.raw`
function gmSwipeFeed(options){
  authorise_();options=options||{};
  const candidate=String(options.candidate||"");
  person_(candidate);
  const size=Math.min(30,Math.max(1,Math.floor(Number(options.pageSize)||15)));
  const page=Math.max(1,Math.floor(Number(options.page)||1));
  const fresh=freshRows_();
  const taaza=taazaRows_();
  const freshByUrl=new Map(),taazaByUrl=new Map();
  for(const job of fresh){
    const key=canonical_(job.url);
    if(key)freshByUrl.set(key,job);
  }
  for(const job of taaza){
    const key=canonical_(job.url);
    if(key)taazaByUrl.set(key,job);
  }
  const freshJobs=[];
  for(const job of fresh){
    const key=canonical_(job.url);
    const other=taazaByUrl.get(key);
    const prefs=job.person[candidate]||{};
    const preference=effectivePreference_(prefs.preference,other?.preferences?.[candidate]);
    if(preference==="Not Interested")continue;
    freshJobs.push({...job,...prefs,source:"fresh",preference,
      favorite:preference==="Favorite",notInterested:false});
  }
  const discoveryJobs=[];
  for(const job of taaza){
    const key=canonical_(job.url);
    if(key&&freshByUrl.has(key))continue;
    const preference=effectivePreference_(job.preferences[candidate],null);
    if(preference==="Not Interested")continue;
    const {preferences,notInterested,categories,...view}=job;
    discoveryJobs.push({...view,source:"taaza",preference,
      favorite:preference==="Favorite",notInterested:false,transferred:false});
  }
  freshJobs.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
  discoveryJobs.sort((a,b)=>b.row-a.row);
  const all=freshJobs.concat(discoveryJobs);
  const total=all.length;
  const pages=Math.max(1,Math.ceil(total/size));
  const rows=all.slice((page-1)*size,page*size);
  return {candidate,rows,total,page,pages,pageSize:size,hasMore:page<pages};
}
`;
module.exports={SOURCE};
