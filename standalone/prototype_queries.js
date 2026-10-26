"use strict";
/* Read-only VM extensions for the ISOLATED /prototype service.
 * No schema changes, no writes, no unrelated production endpoints.
 * All inputs are validated using the legacy candidate and category rules.
 */
const SOURCE=String.raw`
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
function gmProgressCells_(){
 // Read the existing Freshmaal application-progress columns BE/BF.  This is
 // a bounded, read-only 30-second projection shared across the candidate views.
 return dashboardReadCache_('gm-application-progress-v1',()=>{
  const sh=sheet_('fresh');
  const count=Math.max(0,Math.min(sh.getMaxRows(),SETTINGS.maxFreshRow)-2);
  return count?sh.getRange(3,57,count,2).getValues():[];
 },30);
}
function gmProgressValue_(row,candidate,fallbackStatus,cells){
 const column=candidate==='Pooja'?1:0;
 const raw=String((cells[row-3]||[])[column]||'').trim();
 if(['Unapplied','Applied','Applied + Connected'].includes(raw))return raw;
 return String(fallbackStatus||'').trim().toLowerCase()==='applied'?'Applied':'Unapplied';
}
function gmCandidateRows_(source,candidate){
 const jobs=source==="fresh"?freshRows_():taazaRows_();
 if(source==="fresh"){
  const progressCells=gmProgressCells_();
  const prefs=new Map(taazaRows_().filter(x=>x.url).map(x=>[canonical_(x.url),x.preferences[candidate]]));
  return jobs.map(x=>{
   const item=x.person[candidate];
   const preference=effectivePreference_(item.preference,prefs.get(canonical_(x.url)));
   return {...x,...item,preference,favorite:preference==="Favorite",
     notInterested:preference==="Not Interested",department:gmFacetFunction_(x.role),
     progress:gmProgressValue_(x.row,candidate,item.status,progressCells)};
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
 const taaza=taazaRows_(), fresh=freshRows_(), cells=gmProgressCells_(),
       own=fresh.map(x=>({...x.person[candidate],
         progress:gmProgressValue_(x.row,candidate,x.person[candidate].status,cells)}));
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
function gmDuplicateStatuses_(){
 // Candidate-neutral global duplicate metadata; never replace N/O preferences.
 const sh=sheet_("taaza");
 const cap=Math.min(sh.getLastRow(),sh.getMaxRows());
 if(cap<1)return {ready:false,values:[]};
 const header=String(sh.getRange(1,17).getValue()||"");
 if(header!=="Duplicate Status")return {ready:false,values:[]};
 return {ready:true,values:cap>=2?sh.getRange(2,17,cap-1,1).getValues()
   .map(row=>String(row[0]||"").trim()):[]};
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
 if(source==="taaza"){
  const dup=gmDuplicateStatuses_();
  rows=rows.map(j=>({...j,duplicateStatus:dup.ready?(dup.values[j.row-2]||""):"",
    duplicateSchemaReady:dup.ready}));
 }
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
 // Existing listings are not deleted: confirmed duplicates are hidden by default,
 // and only displayed when the user deliberately chooses a duplicates filter.
 if(source==="taaza"){
  if(status==="duplicates")rows=rows.filter(j=>["Dup","Possible"].includes(j.duplicateStatus));
  else if(status==="confirmed-duplicates")rows=rows.filter(j=>j.duplicateStatus==="Dup");
  else if(status==="possible-duplicates")rows=rows.filter(j=>j.duplicateStatus==="Possible");
  else if(status!=="all-including-duplicates")rows=rows.filter(j=>j.duplicateStatus!=="Dup");
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
 if(status==="prepared"&&source==="fresh")rows=rows.filter(x=>!!String(x.cvLink||"").trim());
 if(status==="connected"&&source==="fresh")rows=rows.filter(x=>x.progress==="Applied + Connected");
 if(status==="unscored"&&source==="fresh")rows=rows.filter(x=>x.score===""||x.score==null);
 if(query)rows=rows.filter(x=>[x.company,x.role,x.location,x.url,x.department].some(z=>text(z).includes(query)));
 // Supply all options from candidate-scoped source; avoid a misleading "current page only" dropdown.
 const values=k=>[...new Set(rows.map(x=>short(x[k])).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const choices={company:values("company"),location:values("location"),
   designation:values("role"),department:values("department")};
 // Excel-style location selection. Client sends exact displayed values from
 // candidate-scoped source options, NOT a raw text expression or a Sheet write.
 // Exclusions accumulate over multiple text searches on the client.
 const loc=options.locationSelection&&typeof options.locationSelection==="object"
   ?options.locationSelection:{};
 const locMode=String(loc.mode||"all");
 if(!["all","only","except"].includes(locMode))throw new Error("Invalid location selection mode");
 const entries=loc.values==null?[]:loc.values;
 if(!Array.isArray(entries)||entries.length>750)throw new Error("Too many selected location variants");
 const picked=new Set(entries.map(v=>short(v)).filter(Boolean));
 if(locMode!=="all"){
  rows=rows.filter(x=>locMode==="except"?!picked.has(short(x.location)):picked.has(short(x.location)));
 }
 // Excel-style multi-value search selections for company, role and
 // inferred department. Values are exact labels from the existing sheets;
 // candidate and status scoping are applied before these filters.
 const multi=options.facetSelections&&typeof options.facetSelections==="object"
   ?options.facetSelections:{};
 for(const [field,key] of [["company","company"],["designation","role"],["department","department"]]){
  const r=multi[field]&&typeof multi[field]==="object"?multi[field]:{};
  const mode=String(r.mode||"all");
  if(!["all","only","except"].includes(mode))throw new Error("Invalid "+field+" selection mode");
  const values=r.values==null?[]:r.values;
  if(!Array.isArray(values)||values.length>750)throw new Error("Too many "+field+" selections");
  const choices=new Set(values.map(v=>short(v)).filter(Boolean));
  if(mode!=="all")rows=rows.filter(x=>mode==="except"
    ?!choices.has(short(x[key])):choices.has(short(x[key])));
  const old=text(short(facet[field]));
  if(old)rows=rows.filter(x=>text(x[key]).includes(old));
 }
 if(sort==="duplicate-group"&&source==="taaza")rows.sort((a,b)=>
   String(a.company||"").localeCompare(String(b.company||""))||
   String(a.role||"").localeCompare(String(b.role||""))||a.row-b.row);
 else if(sort==="oldest")rows.sort((a,b)=>a.row-b.row);
 else if(sort==="company")rows.sort((a,b)=>a.company.localeCompare(b.company));
 else if(sort==="designation")rows.sort((a,b)=>a.role.localeCompare(b.role));
 else if(sort==="location")rows.sort((a,b)=>a.location.localeCompare(b.location));
 else if(sort==="department")rows.sort((a,b)=>a.department.localeCompare(b.department));
 else if(sort==="score"&&source==="fresh")rows.sort((a,b)=>(Number(b.score)||-1)-(Number(a.score)||-1));
 else rows.sort((a,b)=>b.row-a.row);
 const pageSize=Math.min(50,Math.max(1,Math.floor(Number(options.pageSize)||25)));
 const page=Math.max(1,Math.floor(Number(options.page)||1));
 const total=rows.length,pages=Math.max(1,Math.ceil(total/pageSize));
 const offset=Math.min(total,Math.max(0,Math.floor(options.offset!=null?options.offset:(Math.min(page,pages)-1)*pageSize)||0));
 const visible=rows.slice(offset,offset+pageSize);
 if(source==="fresh"&&visible.length){
  // Keep the ORIGINAL Freshmaal status-cell validation choices, not a new status taxonomy.
  const conf=person_(candidate),sh=sheet_("fresh");
  const start=Math.min(...visible.map(x=>x.row)),end=Math.max(...visible.map(x=>x.row));
  const statusRange=sh.getRange(start,conf.status,end-start+1,1);
  const validations=typeof statusRange.getDataValidations==="function"
    ?statusRange.getDataValidations():Array.from({length:end-start+1},()=>[null]);
  visible.forEach(x=>x.statusOptions=statusOptions_((validations[x.row-start]||[])[0],x.status));
 }
 return {source,candidate,total,page:Math.min(page,pages),pageSize,pages,rows:visible,
   counts:{total},tabId,tabs:source==="taaza"?taazaCategoryTabs_():[],
   facetOptions:choices,departmentBasis:"Derived from designation; no verified department field exists in Make CV."};
}
`;
module.exports={SOURCE};
