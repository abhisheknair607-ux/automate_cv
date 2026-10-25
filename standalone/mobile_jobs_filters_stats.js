/* Garamaal prototype: narrow toolbar filter drawer, real read-only pipeline totals,
 * local candidate-specific targets and on-site notification preferences.
 * Existing Jobs markup and business logic remain byte-for-byte unchanged.
 */
(function(){
"use strict";
if(typeof document==="undefined"||!document.body.classList.contains("gmv3-jobs-workspace"))return;
const doc=document;
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;":"&quot;","'":"&#39;"}[c]));
const cand=()=>state.candidate==="Pooja"?"Pooja":"Abhishek";
const sect=()=>state.section==="discovery"?"discovery":state.section==="fresh"?"fresh":null;
const baseRun=run,baseRender=render;
const filters=new Map(),facets=new Map(),pipeline=new Map(),inflight=new Set();
const statuses={
 discovery:[["all","All jobs"],["missing","Seems Kacha"],["ready","Seems Taaza"],["favorites","Favourites"],["not-interested","Not interested"]],
 fresh:[["all","All jobs"],["unapplied","CV ready, not applied"],["selected","Shortlisted"],["cv","CV requested"],["applied","Applied"],["unscored","Unscored"],["favorites","Favourites"],["not-interested","Not interested"]]
};
const key=(c,t)=>"gmv3-preview-"+c+"-"+t;
const defaultFilters=()=>({company:"",location:"",designation:"",department:"",status:"all",sort:"newest",category:"all"});
const defaultGoals=()=>({daily:3,weekly:15,apply:true,connect:true,alerts:false});
function load(c,t,d){try{const x=JSON.parse(localStorage.getItem(key(c,t))||"null");return x&&typeof x==="object"&&!Array.isArray(x)?Object.assign({},d,x):{...d}}catch(_){return {...d}}}
function save(c,t,x){try{localStorage.setItem(key(c,t),JSON.stringify(x))}catch(_){}}
function preference(c,s){const k=c+"|"+s;if(!filters.has(k))filters.set(k,load(c,"filter-"+s,defaultFilters()));return filters.get(k)}
function count(v){return ["company","location","designation","department"].filter(k=>v[k]).length+Number(v.status!=="all")+Number(v.sort!=="newest")+Number(v.category!=="all")}
function notSwipe(){return doc.getElementById("gmv3-jobs-swipe")?.hidden!==false}
function activeList(arg){return sect()&&notSwipe()&&((sect()==="discovery"?"taaza":"fresh")===arg.source)&&arg.candidate===cand()}
run=async function(method,arg,opts){
 if(method!=="listJobs"||!arg||!activeList(arg))return baseRun(method,arg,opts);
 const section=sect(),c=cand(),f=preference(c,section);
 const result=await baseRun("gmListJobsFaceted",{...arg,filter:f.status,sort:f.sort,tabId:section==="discovery"?f.category:"all",facets:{
  company:f.company,location:f.location,designation:f.designation,department:f.department
 }},opts);
 if(sect()===section&&cand()===c){facets.set(c+"|"+section,{options:result.facetOptions||{},tabs:result.tabs||[],basis:result.departmentBasis||""});}
 return result;
};
let sheet=null;
function dismiss(){sheet?.remove();sheet=null;}
function selectHtml(name,label,items,value,placeholder){
 const map=new Map();for(const t of items||[]){const v=String(t||"").trim();if(v&&v.length<=160)map.set(v,v)}
 const list=[...map.keys()];
 return '<label class="gmv3-field"><span>'+esc(label)+'</span><input type="search" data-gmf-field="'+name+'" list="gmv3-options-'+name+'" placeholder="'+esc(placeholder)+'" value="'+esc(value)+'" autocomplete="off" maxlength="120" />'+
 '<datalist id="gmv3-options-'+name+'">'+list.slice(0,700).map(x=>'<option value="'+esc(x)+'"></option>').join("")+'</datalist></label>';
}
function openFilter(){
 const s=sect();if(!s)return;
 dismiss();const c=cand(),f=preference(c,s),lookup=facets.get(c+"|"+s)||{},o=lookup.options||{};
 sheet=doc.createElement("div");sheet.id="gmv3-filter-sheet";sheet.className="gmv3-filter-backdrop";
 const statusOpts=(statuses[s]||[]).map(([v,t])=>'<option value="'+v+'"'+(v===f.status?' selected':'')+'>'+esc(t)+'</option>').join("");
 const sorts=[["newest","Newest first"],["oldest","Oldest first"],["company","Company A–Z"],["designation","Designation A–Z"],["location","Location A–Z"],...(s==="fresh"?[["score","Highest fit score"]]:[])];
 const sortOpts=sorts.map(([v,t])=>'<option value="'+v+'"'+(v===f.sort?' selected':'')+'>'+esc(t)+'</option>').join("");
 const tabs=[{id:"all",name:"All departments / sources"},{id:"common",name:"Common jobs"},...(lookup.tabs||[])].filter((x,i)=>s==="discovery"||i===0);
 const tabsHtml=s==="discovery"?'<label class="gmv3-field"><span>Discovery category</span><select data-gmf-field="category">'+tabs.map(t=>'<option value="'+esc(t.id)+'"'+(f.category===t.id?' selected':'')+'>'+esc(t.name)+'</option>').join("")+'</select></label>':"";
 sheet.innerHTML='<section role="dialog" aria-modal="true" aria-label="Filter and sort Jobs" class="gmv3-filter-panel">'+
 '<div class="gmv3-filter-head"><div><small>DISCOVER YOUR WAY</small><h2>Filter & Sort</h2><p>'+esc(s==="fresh"?"Make CV":"Discovery")+' · '+esc(c)+'</p></div><button type="button" data-gmf-act="close" aria-label="Close filter panel">×</button></div>'+
 '<form id="gmv3-filter-form"><div class="gmv3-filter-grid">'+
 selectHtml("company","Company",o.company,f.company,"Search or select a company")+
 selectHtml("location","Location",o.location,f.location,"City, country or region")+
 selectHtml("department","Department / function",o.department,f.department,"Choose a functional area")+
 selectHtml("designation","Designation",o.designation,f.designation,"Job title or role")+
 tabsHtml+
 '<label class="gmv3-field"><span>Existing job status</span><select data-gmf-field="status">'+statusOpts+'</select></label>'+
 '<label class="gmv3-field"><span>Sort jobs</span><select data-gmf-field="sort">'+sortOpts+'</select></label>'+
 '</div><p class="gmv3-filter-hint">Company, location and designation match existing saved listings. Department is inferred from the role title, not verified employer data. All filters are applied across the full list, not just the visible page.</p>'+
 '<div class="gmv3-filter-actions"><button type="button" data-gmf-act="clear">Clear all</button><button type="submit">Apply filters</button></div></form></section>';
 doc.body.append(sheet);
 sheet.querySelector("input,select")?.focus();
}
function applyFilter(reset){
 if(!sheet)return;
 const s=sect(),c=cand();if(!s)return;
 const f=reset?defaultFilters():{...preference(c,s)};
 if(!reset)sheet.querySelectorAll("[data-gmf-field]").forEach(el=>f[el.dataset.gmfField]=el.value.trim().slice(0,120));
 filters.set(c+"|"+s,f);save(c,"filter-"+s,f);
 state.filter=f.status;state.sort=f.sort;state.tabId=s==="discovery"?f.category:"all";
 state.page=1;state.bulk.clear();dismiss();fetchList();
}
function toolbar(){
 const s=sect();if(!s)return;
 const root=doc.querySelector("#content .toolbar-main"),refresh=root?.querySelector('[data-action="refresh"]');
 if(!refresh)return;
 let btn=root.querySelector("#gmv3-filter-button");
 if(!btn){btn=doc.createElement("button");btn.type="button";btn.id="gmv3-filter-button";btn.className="btn gmv3-filter-button";btn.dataset.gmfAct="open";refresh.insertAdjacentElement("afterend",btn)}
 const n=count(preference(cand(),s));btn.textContent="☷ Filters"+(n?" · "+n:"");
 btn.setAttribute("aria-label","Open filter and sort panel for "+s);
}
function removeOldDashboard(){
 if(state.section!=="dashboard")return;
 doc.querySelector('#content [data-action="repair-ranks"]')?.remove();
 for(const title of doc.querySelectorAll("#content .grid2 .subhead")){
  if(title.textContent.trim()==="Next move")title.closest(".panel")?.remove();
 }
}
function metrics(summary){
 if(!summary)return null;
 return [
  ["Jobs in Discovery",summary.discoveryJobs,"Taaza vacancies"],
  ["Jobs in Make CV",summary.makeCvJobs,"Freshmaal vacancies"],
  ["CV prepared",summary.cvPrepared,"Generated CV links"],
  ["Applied",summary.applied,"Includes connected"],
  ["Applied + Connected",summary.appliedConnected,"Completed steps"]
 ];
}
function renderDashboard(){
 if(state.section!=="dashboard")return;
 removeOldDashboard();
 const c=cand(),summary=pipeline.get(c),grid=doc.querySelector("#content .kpis");
 if(!grid)return;
 const b=state.stats||{};
 const m=metrics(summary)||[
  ["Jobs in Discovery",b.discovered??"—","Taaza vacancies"],
  ["Jobs in Make CV",b.applications??"—","Freshmaal vacancies"],
  ["CV prepared","—","Loading"],
  ["Applied",b.applied??"—","Includes connected"],
  ["Applied + Connected","—","Loading"]
 ];
 grid.classList.add("gmv3-five-kpis");
 grid.innerHTML=m.map(([label,value,note])=>'<article class="gmv3-pipeline-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>').join("");
 const existing=doc.getElementById("gmv3-goal-alerts");if(existing)existing.remove();
 const goals=load(c,"goals",defaultGoals());
 const pendingApply=summary?summary.waitingToApply:"—",pendingConnect=summary?summary.waitingToConnect:"—",queued=summary?summary.cvQueued:"—";
 const box=doc.createElement("section");box.id="gmv3-goal-alerts";
 box.innerHTML='<div class="gmv3-goal-heading"><div><small>YOUR MOMENTUM</small><h2>Targets & reminders</h2></div><span>Local settings</span></div>'+
 '<div class="gmv3-goal-grid"><div><label>Daily application target</label><div class="gmv3-goal-step"><button data-gm-goal="daily-down">−</button><output>'+esc(goals.daily)+'</output><button data-gm-goal="daily-up">+</button></div></div>'+
 '<div><label>Weekly application target</label><div class="gmv3-goal-step"><button data-gm-goal="weekly-down">−</button><output>'+esc(goals.weekly)+'</output><button data-gm-goal="weekly-up">+</button></div></div></div>'+
 '<div class="gmv3-followup-stats"><div><strong>'+esc(queued)+'</strong><span>CVs requested, not ready</span></div>'+
 '<div><strong>'+esc(pendingApply)+'</strong><span>CVs ready, yet to apply</span></div>'+
 '<div><strong>'+esc(pendingConnect)+'</strong><span>Applied, yet to connect</span></div></div>'+
 '<div class="gmv3-alert-choices"><label><input type="checkbox" data-gm-flag="apply"'+(goals.apply?' checked':'')+'>Application reminders</label>'+
 '<label><input type="checkbox" data-gm-flag="connect"'+(goals.connect?' checked':'')+'>Connection reminders</label></div>'+
 '<div class="gmv3-alert-line"><p>Counts reflect current saved status. Daily and weekly targets are editable goals; the existing data has no reliable dated activity history to measure completion against them.</p>'+
 '<button data-gm-alert="enable" type="button">'+(goals.alerts?"Browser alerts on":"Enable browser alerts")+'</button></div>'+
 '<p class="gmv3-alert-foot">In-app reminders update when the dashboard loads. Browser notifications require permission and an open app; no background push or scheduled alerts are enabled.</p>';
 grid.insertAdjacentElement("afterend",box);
 if(!summary&&!inflight.has(c)){refreshPipeline(c)}
}
async function refreshPipeline(c,force=false){
 if(inflight.has(c))return;
 if(!force&&pipeline.has(c))return;
 inflight.add(c);
 try{
  const r=await baseRun("gmPipelineStats",c,{quiet:true});
  if(r&&r.candidate===c){pipeline.set(c,r);if(state.section==="dashboard"&&cand()===c){renderDashboard();notifyIfEnabled(c,r)}}
 }catch(err){if(state.section==="dashboard"&&cand()===c){
  const foot=doc.querySelector("#gmv3-goal-alerts .gmv3-alert-foot");if(foot)foot.textContent="Live pipeline summary unavailable: "+String(err.message||"Could not fetch counts").slice(0,140);
 }}finally{inflight.delete(c)}
}
function notifyIfEnabled(c,summary){
 const g=load(c,"goals",defaultGoals());
 if(!g.alerts||typeof Notification==="undefined"||Notification.permission!=="granted")return;
 const messages=[];
 if(g.apply&&summary.waitingToApply>0)messages.push(summary.waitingToApply+" generated CVs still need applications");
 if(g.connect&&summary.waitingToConnect>0)messages.push(summary.waitingToConnect+" applications still need connections");
 if(!messages.length)return;
 const stamp="alert-"+new Date().toISOString().slice(0,10);
 try{if(sessionStorage.getItem(key(c,stamp))==="1")return;sessionStorage.setItem(key(c,stamp),"1");new Notification("Garamaal · "+c,{body:messages.join(" · ")})}catch(_){}
}
function renderEnhancements(){
 if(state.section==="dashboard")renderDashboard();
 else if(sect())toolbar();
}
render=function(){baseRender();renderEnhancements()};
function refreshOnNav(){
 const f=sect()?preference(cand(),sect()):null;
 if(f){state.filter=f.status;state.sort=f.sort;state.tabId=sect()==="discovery"?f.category:"all"}
}
const baseNav=nav;
nav=function(destination,initial){
 // Explicit routing from status shortcuts takes precedence over saved filters.
 if(destination==="discovery"||destination==="fresh"){
  const f=preference(cand(),destination);
  if(!initial||initial==="all"){if(initial==="all")refreshOnNav();}
  else{f.status=initial;filters.set(cand()+"|"+destination,f)}
 }
 baseNav(destination,initial);
 if(destination==="discovery"||destination==="fresh"){
  const f=preference(cand(),destination);
  state.filter=initial&&initial!=="all"?initial:f.status;
  state.sort=f.sort;
  state.tabId=destination==="discovery"?f.category:"all";
 }
};
doc.addEventListener("click",e=>{
 const action=e.target.closest("[data-gmf-act]")?.dataset.gmfAct;
 if(action==="open"){openFilter();return}
 if(action==="close"||action==="clear"){if(action==="close")dismiss();else applyFilter(true);return}
 if(sheet&&e.target===sheet){dismiss();return}
 const step=e.target.closest("[data-gm-goal]")?.dataset.gmGoal;
 if(step){
  const c=cand(),g=load(c,"goals",defaultGoals()),[name,way]=step.split("-");
  g[name]=Math.min(999,Math.max(0,g[name]+(way==="up"?1:-1)));
  save(c,"goals",g);renderDashboard();return;
 }
 if(e.target.closest('[data-gm-alert="enable"]')){
  const c=cand(),g=load(c,"goals",defaultGoals());
  if(g.alerts){g.alerts=false;save(c,"goals",g);renderDashboard();return}
  if(typeof Notification==="undefined"){window.alert("Browser notifications are not supported here. In-app reminders remain available.");return}
  // Browser permission may only be requested from an explicit user tap.
  Notification.requestPermission().then(result=>{
   g.alerts=result==="granted";save(c,"goals",g);
   if(state.section==="dashboard")renderDashboard();
   if(g.alerts&&pipeline.has(c))notifyIfEnabled(c,pipeline.get(c));
  }).catch(()=>{});
 }
});
doc.addEventListener("change",e=>{
 const field=e.target.closest("[data-gm-flag]")?.dataset.gmFlag;
 if(field){const c=cand(),g=load(c,"goals",defaultGoals());g[field]=e.target.checked;save(c,"goals",g)}
});
doc.addEventListener("submit",e=>{
 if(e.target.id!=="gmv3-filter-form")return;
 e.preventDefault();applyFilter(false);
});
doc.addEventListener("keydown",e=>{if(e.key==="Escape"&&sheet)dismiss()});
const site=doc.getElementById("content");
if(site&&typeof MutationObserver!=="undefined"){
 // Covers original render() and newly fetched list rows without changing its source file.
 let pending=false;
 new MutationObserver(()=>{
  if(pending)return;pending=true;queueMicrotask(()=>{pending=false;if(!sheet){renderEnhancements()}})
 }).observe(site,{childList:true,subtree:false});
}
window.GaramaalPreviewFilters=Object.freeze({openFilter,refreshPipeline});
})();