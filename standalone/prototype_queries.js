"use strict";
/* Read-only VM extensions for the ISOLATED /prototype service.
 * No schema changes, no writes, no unrelated production endpoints.
 * All inputs are validated using the legacy candidate and category rules.
 */
const SOURCE=String.raw\`
function gmFacetFunction_(role){
 const r=String(role||"").toLowerCase();
 if(/transfer pricing|intercompany/.test(r))return "Transfer Pricing";
 if(/corporate finance|transaction|valuation|m&a|mergers|acquisition/.test(r))return "Corporate Finance & Deals";
 if(/wealth|financial advis|private bank|paraplann|mortgage|financial plan/.test(r))return "Wealth & Financial Planning";
 if(/fp&a|commercial finance|finance business|financial analy|finance analy|management account/.test(r))return "FP&A / Commercial Finance";
 if(/investment|asset manage|portfolio|private equity|fund account/.test(r))return "Investments & Funds";
 if(/audit|assurance/.test(r))return "Audit & Assurance";
 if(/tax|vat|corporate tax/.test(r))return "Tax";
 if(/risk|compliance|aml|kyc/.test(r))return "Risk & Compliance";
 if(/software|engineer|data scien|data analy|technology|developer|product manage/.test(r))return "Technology & Data";
 if(/business consult|management consult|strategy/.test(r))return "Consulting";
 if(/account|bookkeep|financial control/.test(r))return "Accounting & Control";
 return "Other / Unclassified";
}
function gmCandidateRows_(source,candidate){
 const jobs=source==="fresh"?freshRows_():taazaRows_();
 if(source==="fresh"){
  const prefs=new Map(taazaRows_().filter(x=>x.url).map(x=>[canonical_(x.url),x.preferences[candidate]]));
  return jobs.map(x=>{
   const item=x.person[candidate];
   const preference=effectivePreference_(item.preference,prefs.get(canonical_(x.url)));
   return {...x,...item,preference,favorite:preference==="Favorite",
     notInterested:preference==="Not Interested",department:gmFacetFunction_(x.role)};
  }).map(x=>{delete x.person;return x});
 }
 const other=freshRows_();
 const transferred=new Set(other.map(x=>canonical_(x.url)).filter(Boolean));
 const prefs=new Map(other.filter(x=>x.url).map(x=>[canonical_(x.url),x.person[candidate].preference]));
 return jobs.map(x=>{
  const preference=effectivePreference_(x.preferences[candidate],prefs.get(canonical_(x.url)));
  return {...x,transferred:transferred.has(canonical_(x.url)),preference,
   favorite:preference==="Favorite",notInterested:preference==="Not Interested",
   department:gmFacetFunction_(x.role)};
 }).filter(x=>!x.transferred).map(x=>{delete x.preferences;return x;});
}
function gmPipelineStats(candidate){
 authorise_();candidate=String(candidate||"");person_(candidate);
 const taaza=taazaRows_(), fresh=freshRows_(),own=fresh.map(x=>x.person[candidate]);
 const prepared=own.filter(x=>!!String(x.cvLink||"").trim());
 const applied=own.filter(x=>["Applied","Applied + Connected"].includes(x.progress));
 return {
  candidate,discoveryJobs:taaza.length,makeCvJobs:fresh.length,
  cvPrepared:prepared.length,applied:applied.length,
  appliedConnected:own.filter(x=>x.progress==="Applied + Connected").length,
  waitingToApply:prepared.filter(x=>x.progress==="Unapplied").length,
  waitingToConnect:own.filter(x=>x.progress==="Applied").length,
  cvQueued:own.filter(x=>x.cv&&!String(x.cvLink||"").trim()&&x.progress==="Unapplied").length,
  basis:"Current candidate-specific Freshmaal status and generated-CV links; not dated daily or weekly activity."
 };
}
function gmListJobsFaceted(options){
 authorise_();options=options||{};
 const source=options.source==="fresh"?"fresh":"taaza";
 const candidate=String(options.candidate||"");person_(candidate);
 const text=v=>String(v||"").trim().toLowerCase();
 const short=v=>String(v||"").trim().slice(0,120);
 const facet=options.facets&&typeof options.facets==="object"?options.facets:{};
 const query=text(short(options.query));
 const status=short(options.filter||"all");
 const tabId=short(options.tabId||"all");
 const sort=short(options.sort||"newest");
 let rows=gmCandidateRows_(source,candidate);
 if(source==="taaza"&&tabId!=="all"){
  const allTabs=taazaCategoryTabs_();
  const selected=allTabs.find(x=>String(x.id)===tabId);
  if(selected||tabId==="common"){
   rows=rows.filter(x=>{
    const categories=String(x.categories||"").split(" | ").filter(Boolean);
    return tabId==="common"?!categories.length||categories.includes("Common"):categories.includes(selected.name);
   });
  }
 }
 if(status==="not-interested")rows=rows.filter(x=>x.notInterested);
 else if(status==="favorites")rows=rows.filter(x=>x.favorite);
 else rows=rows.filter(x=>!x.notInterested);
 if(status==="missing"&&source==="taaza")rows=rows.filter(x=>!x.jdReady);
 if(status==="ready"&&source==="taaza")rows=rows.filter(x=>x.jdReady);
 if(status==="selected"&&source==="fresh")rows=rows.filter(x=>x.selected);
 if(status==="cv"&&source==="fresh")rows=rows.filter(x=>x.cv);
 if(status==="applied"&&source==="fresh")rows=rows.filter(x=>["Applied","Applied + Connected"].includes(x.progress));
 if(status==="unapplied"&&source==="fresh")rows=rows.filter(x=>x.cvLink&&x.progress==="Unapplied");
 if(status==="unscored"&&source==="fresh")rows=rows.filter(x=>x.score===""||x.score==null);
 if(query)rows=rows.filter(x=>[x.company,x.role,x.location,x.url,x.department].some(z=>text(z).includes(query)));
 // Supply all options from candidate-scoped source; avoid a misleading "current page only" dropdown.
 const values=k=>[...new Set(rows.map(x=>short(x[k])).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const choices={company:values("company"),location:values("location"),
   designation:values("role"),department:values("department")};
 for(const [field,key] of [["company","company"],["location","location"],["designation","role"],["department","department"]]){
  const value=text(short(facet[field]));
  if(value)rows=rows.filter(x=>text(x[key]).includes(value));
 }
 if(sort==="oldest")rows.sort((a,b)=>a.row-b.row);
 else if(sort==="company")rows.sort((a,b)=>a.company.localeCompare(b.company));
 else if(sort==="designation")rows.sort((a,b)=>a.role.localeCompare(b.role));
 else if(sort==="location")rows.sort((a,b)=>a.location.localeCompare(b.location));
 else if(sort==="score"&&source==="fresh")rows.sort((a,b)=>(Number(b.score)||-1)-(Number(a.score)||-1));
 else rows.sort((a,b)=>b.row-a.row);
 const pageSize=Math.min(50,Math.max(1,Math.floor(Number(options.pageSize)||25)));
 const page=Math.max(1,Math.floor(Number(options.page)||1));
 const total=rows.length,pages=Math.max(1,Math.ceil(total/pageSize));
 const offset=Math.min(total,Math.max(0,Math.floor(Number(options.offset)!=null?options.offset:(Math.min(page,pages)-1)*pageSize)||0));
 const visible=rows.slice(offset,offset+pageSize);
 if(source==="fresh")visible.forEach(x=>x.statusOptions=APPLICATION_PROGRESS.slice());
 return {source,candidate,total,page:Math.min(page,pages),pageSize,pages,rows:visible,
   counts:{total},tabId,tabs:source==="taaza"?taazaCategoryTabs_():[],
   facetOptions:choices,departmentBasis:"Derived from designation; no verified department field exists in Make CV."};
}
\`;
module.exports={SOURCE};
