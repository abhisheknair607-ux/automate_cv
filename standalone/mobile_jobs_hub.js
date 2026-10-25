/* Stage 2 only: feature-preserving navigation for /prototype Jobs.
 * Does not override nav/render/fetchList, patch handlers, call CV APIs or save preferences.
 */
(function(){
 "use strict";
 const items=[
  ["dashboard","Dashboard","▦"],
  ["discovery","Discovery","⌕"],
  ["swipe","Swipe","⇄"],
  ["fresh","Make CV","▤"],
  ["more","More","⋯"]
 ];
 const doc=document;
 if(!doc.body.classList.contains("gmv3-landing")&&!doc.body.classList.contains("gmv3-workspace"))return;
 doc.body.classList.add("gmv3-jobs-workspace");
 const bar=doc.createElement("nav");
 bar.className="gmv3-tabbar";
 bar.id="gmv3-jobs-tabbar";
 bar.setAttribute("aria-label","Jobs navigation");
 const overlay=doc.createElement("div");
 overlay.id="gmv3-jobs-more";overlay.className="gmv3-panelmask";overlay.hidden=true;
 const swipe=doc.createElement("section");
 swipe.className="gmv3-swipe-surface";
 swipe.id="gmv3-jobs-swipe";
 swipe.hidden=true;swipe.setAttribute("aria-label","Jobs swipe preview");
 doc.body.append(bar,overlay,swipe);
 let mode="dashboard";
 const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 function hideOverlay(){overlay.hidden=true}
 function sync(){
  if(mode!=="swipe" && typeof state!=="undefined"&&["dashboard","discovery","fresh","add"].includes(state.section)){
   mode=state.section==="add"?"more":state.section;
  }
  bar.innerHTML=items.map(([id,label,icon])=>'<button type="button" data-g3-jobs="'+id+'" '+(mode===id?'aria-current="page"':'')+' class="'+(id==="swipe"?'gmv3-swipe-tab':'')+'"><span class="gmv3-tabicon" aria-hidden="true">'+icon+'</span>'+label+'</button>').join("");
  bar.hidden=doc.body.classList.contains("gmv3-landing");
 }
 function openMore(){
  mode="more";sync();swipe.hidden=true;window.GaramaalSwipeDeck?.close();
  overlay.hidden=false;
  overlay.innerHTML='<div class="gmv3-panel" role="dialog" aria-modal="true" aria-label="More Jobs tools">'+
  '<div class="gmv3-panel-top"><h2>More Jobs tools</h2><button class="gmv3-close" data-g3-more="close" aria-label="Close">×</button></div>'+
  '<div class="gmv3-options"><button data-g3-more="add">＋ Add Job</button>'+
  '<button data-g3-more="stats">▥ Job statistics</button>'+
  '<button data-g3-more="discovery">⌕ Discovery filters</button>'+
  '<button data-g3-more="ranking">▤ Ranking prompt</button>'+
  '<button data-g3-more="social">⇄ Networking Hub</button>'+
  '<button data-g3-more="home">⌂ Home</button></div>'+
  '<p class="gmv3-subtle">All original Add Job, Discovery, ranking and Make CV functionality remains available. Nothing here runs CV generation automatically.</p></div>';
  overlay.querySelector("[data-g3-more=close]")?.focus();
 }
 function openSwipe(){
  hideOverlay();mode="swipe";sync();
  swipe.hidden=false;swipe.scrollTop=0;
  // Real candidate-aware gesture feed. Browser-only QA never writes to Sheets.
  window.GaramaalSwipeDeck?.open(swipe);
 }
 function selectPage(id){
  if(id==="more"){openMore();return}
  if(id==="swipe"){openSwipe();return}
  if(!["dashboard","discovery","fresh","add"].includes(id))return;
  hideOverlay();swipe.hidden=true;window.GaramaalSwipeDeck?.close();mode=id==="add"?"more":id;
  // Calls the original full application navigation and fetches from the same APIs.
  nav(id);
  sync();
 }
 bar.addEventListener("click",e=>{
  const button=e.target.closest("[data-g3-jobs]");
  if(button)selectPage(button.dataset.g3Jobs);
 });
 overlay.addEventListener("click",e=>{
  if(e.target===overlay){hideOverlay();return}
  const button=e.target.closest("[data-g3-more]");
  if(!button)return;
  const action=button.dataset.g3More;
  if(action==="close"){hideOverlay();return}
  if(action==="home"){hideOverlay();swipe.hidden=true;window.GaramaalSwipeDeck?.close();window.GaramaalPrototypeHome?.showHome();return}
  if(action==="social"){window.location.assign("/social?gmv3=1");return}
  if(action==="stats"){selectPage("dashboard");return}
  if(action==="ranking"){selectPage("dashboard");doc.querySelector('[data-action="copy-ranking"]')?.focus();return}
  if(action==="discovery"){selectPage("discovery");return}
  if(action==="add"){selectPage("add");return}
 });
 doc.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden){hideOverlay();bar.querySelector('[data-g3-jobs="more"]')?.focus()}});
 const crumb=doc.getElementById("crumbTitle");
 if(crumb&&typeof MutationObserver!=="undefined"){
  new MutationObserver(()=>{if(mode!=="swipe")sync()}).observe(crumb,{childList:true,characterData:true,subtree:true});
 }
 // Launch is controlled by the existing Stage 1 shell.
 const originalShowHome=window.GaramaalPrototypeHome?.showHome;
 const root=doc.getElementById("gmv3-launch");
 root?.addEventListener("click",event=>{
  if(event.target.closest('[data-gmv3="jobs"]')){
   mode="dashboard";swipe.hidden=true;window.GaramaalSwipeDeck?.close();hideOverlay();sync();
  }
 });
 window.addEventListener("pageshow",sync);
 sync();
 window.GaramaalJobsHub=Object.freeze({selectPage,openSwipe,closeMore:hideOverlay});
})();
