/* /prototype-only appearance changes. Keep existing candidate-scoped
 * bulk preference actions and checkbox selection; never add an API write.
 */
(function(){
 "use strict";
 const doc=document;
 if(!doc.body.classList.contains("gmv3-jobs-workspace"))return;

 // Preserve existing live/offline badge semantics and accessible text.
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

 const nativeRender=render,nativeSyncSelectionBar=syncSelectionBar;
 const isDiscovery=()=>state.section==="discovery";
 const selection=()=>state.bulk instanceof Map?state.bulk:null;
 const loaded=()=>isDiscovery()
  ?Array.from(doc.querySelectorAll('#content .jobs .job[data-job-row] input[data-action="bulk-select"]')):[];

 function enhanceBar(){
  if(!isDiscovery())return;
  const bar=doc.querySelector("#selectionBarMount .selectionbar");
  if(!bar)return;
  const actions=bar.querySelector(".bulk-preference-actions");
  if(!actions)return;

  // Strip text nodes only, preserving the existing illustrated SVG icons and
  // the original data-action/data-value click handlers for both preferences.
  for(const button of actions.querySelectorAll('[data-action="bulk-preference"]')){
   for(const node of Array.from(button.childNodes)){
    if(node.nodeType===3)node.remove();
   }
   const preference=button.dataset.value;
   const label=preference==="Favorite"?"Favourite":"Not interested";
   button.classList.add("gmv3-bulk-icon");
   button.setAttribute("aria-label","Mark selected jobs as "+label);
   button.title=label;
   button.querySelector("svg")?.setAttribute("aria-hidden","true");
  }
  if(!actions.querySelector('[data-gmv3-bulk="clear"]')){
   const button=doc.createElement("button");
   button.type="button";
   button.className="btn gmv3-bulk-icon gmv3-clear-selected";
   button.dataset.gmv3Bulk="clear";
   button.title="Clear selection";
   button.setAttribute("aria-label","Clear selected jobs without changing preferences");
   button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
   actions.append(button);
  }
 }
 function refresh(){enhanceBar()}
 render=function(){nativeRender();refresh()};
 syncSelectionBar=function(){nativeSyncSelectionBar();refresh()};

 function clear(){
  if(!isDiscovery()||!selection())return;
  selection().clear();
  loaded().forEach(cb=>{cb.checked=false});
  syncSelectionBar();
 }
 doc.addEventListener("click",e=>{
  const action=e.target.closest?.("[data-gmv3-bulk]")?.dataset.gmv3Bulk;
  if(action==="clear"){e.preventDefault();clear()}
 });
 // Native delegated checkbox changes still maintain the selection Map;
 // existing backend bulkSetJobPreferences retains its candidate-scoped logic.
 refresh();
 window.GaramaalPreviewBulk=Object.freeze({clear,refresh});
})();