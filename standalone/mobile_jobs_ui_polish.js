/* /prototype-only UI polish: compact live status and visible Discovery batch controls.
 * The underlying batch API remains the original candidate-scoped
 * bulkSetJobPreferences implementation. Never add new write endpoints.
 */
(function(){
 "use strict";
 const doc=document;
 if(!doc.body.classList.contains("gmv3-jobs-workspace"))return;
 const badge=doc.getElementById("modeBadge");
 function syncBadge(){
  if(!badge)return;
  const current=String(badge.textContent||"").trim();
  if(current==="GOOGLE SHEETS LIVE"||current==="LIVE"){
   badge.classList.add("gmv3-live-badge");
   badge.setAttribute("aria-label","Live Google Sheets connection");
   badge.title="Live Google Sheets connection";
   if(current!=="LIVE")badge.textContent="LIVE";
  }else{
   badge.classList.remove("gmv3-live-badge");
   badge.removeAttribute("aria-label");
  }
 }
 syncBadge();
 if(badge&&typeof MutationObserver!=="undefined")
  new MutationObserver(syncBadge).observe(badge,{childList:true,subtree:true,characterData:true});
 
 const BATCH_LIMIT=20;
 const nativeRender=render,nativeSyncSelectionBar=syncSelectionBar;
 const isDiscovery=()=>state.section==="discovery";
 function selection(){
  return state.bulk instanceof Map?state.bulk:null;
 }
 function loaded(){
  return isDiscovery()?Array.from(doc.querySelectorAll('#content .jobs .job[data-job-row] input[data-action="bulk-select"]')):[];
 }
 function ui(){
  const host=doc.querySelector("#content .toolbar-main");
  if(!host||!isDiscovery())return;
  let tools=host.querySelector("#gmv3-bulk-tools");
  if(!tools){
   tools=doc.createElement("div");
   tools.id="gmv3-bulk-tools";
   tools.className="gmv3-bulk-tools";
   const button=doc.createElement("button");
   button.type="button";
   button.className="btn gmv3-select-visible";
   button.dataset.gmv3Bulk="select-visible";
   button.title="Select up to 20 loaded Discovery vacancies";
   tools.append(button);
   host.append(tools);
  }
  const btn=tools.querySelector('[data-gmv3-bulk="select-visible"]');
  const chosen=selection()?.size||0;
  const available=loaded().filter(cb=>!cb.checked).length;
  btn.disabled=!available||chosen>=BATCH_LIMIT;
  btn.textContent=chosen?"Select more · "+chosen+"/"+BATCH_LIMIT:"Select visible";
  btn.setAttribute("aria-label","Select visible Discovery jobs, up to 20 total");
 }
 function enhanceBar(){
  if(!isDiscovery())return;
  const bar=doc.querySelector("#selectionBarMount .selectionbar");
  if(!bar)return;
  const actions=bar.querySelector(".bulk-preference-actions");
  if(actions&&!actions.querySelector('[data-gmv3-bulk="clear"]')){
   const button=doc.createElement("button");
   button.type="button";
   button.className="btn gmv3-clear-selected";
   button.dataset.gmv3Bulk="clear";
   button.textContent="Clear selection";
   button.setAttribute("aria-label","Deselect all selected Discovery jobs without changing preferences");
   actions.append(button);
  }
  const note=bar.querySelector(".gmv3-bulk-limit");
  if(!note){
   const limit=doc.createElement("span");
   limit.className="gmv3-bulk-limit";
   limit.textContent="Up to 20 jobs · "+state.candidate;
   bar.append(limit);
  }else note.textContent="Up to 20 jobs · "+state.candidate;
 }
 function refresh(){
  ui();enhanceBar();
 }
 render=function(){nativeRender();refresh()};
 syncSelectionBar=function(){nativeSyncSelectionBar();refresh()};
 function clear(){
  if(!isDiscovery()||!selection())return;
  selection().clear();
  loaded().forEach(cb=>{cb.checked=false});
  syncSelectionBar();
 }
 function selectVisible(){
  if(!isDiscovery()||!selection()||!state.data?.rows)return;
  const store=selection();
  let added=0;
  for(const cb of loaded()){
   const row=Number(cb.dataset.row);
   const item=state.data.rows.find(j=>j.row===row);
   if(!item||store.has(row))continue;
   if(store.size>=BATCH_LIMIT)break;
   store.set(row,item);
   cb.checked=true;
   added++;
  }
  syncSelectionBar();
  if(!added&&store.size>=BATCH_LIMIT&&typeof toast==="function")
   toast("Up to 20 jobs can be selected for a single batch.",true);
 }
 doc.addEventListener("click",e=>{
  const action=e.target.closest?.("[data-gmv3-bulk]")?.dataset.gmv3Bulk;
  if(action==="select-visible"){e.preventDefault();selectVisible()}
  if(action==="clear"){e.preventDefault();clear()}
 });
 // Native delegated checkbox events update state.bulk and invoke
 // syncSelectionBar(), which is wrapped above. No duplicate writes.
 refresh();
 window.GaramaalPreviewBulk=Object.freeze({selectVisible,clear,refresh,maxBatch:BATCH_LIMIT});
})();