/* Stage 2 Social shell injected ONLY when /social?gmv3=1 is requested.
 * The Social app itself, its OAuth bridge, filters, swipe and research handlers
 * are unmodified. Do not change candidate identity or write social records here.
 */
(function(){
 "use strict";
 const doc=document;
 if(!doc.body||!doc.getElementById("app")||!doc.getElementById("bottomNav"))return;
 doc.body.classList.add("gmv3-social-workspace");
 const items=[
  ["dashboard","Targets","◎"],
  ["inbox","Research","▣"],
  ["swipe","Swipe","⇄"],
  ["followups","Follow-ups","↗"],
  ["stats","Stats","▥"]
 ];
 const bar=doc.createElement("nav");
 bar.id="gmv3-social-tabs";bar.className="gmv3-tabbar";
 bar.setAttribute("aria-label","Social navigation");
 const surface=doc.createElement("section");
 surface.className="gmv3-swipe-surface";surface.id="gmv3-social-stats";
 surface.setAttribute("aria-label","Social statistics");surface.hidden=true;
 doc.body.append(bar,surface);
 let chosen="dashboard";
 function renderBar(){
  bar.innerHTML=items.map(([id,label,ic])=>
    '<button type="button" data-g3-social="'+id+'" '+(chosen===id?'aria-current="page"':'')+
    ' class="'+(id==="swipe"?'gmv3-swipe-tab':'')+'" aria-label="'+label+'" title="'+label+'">'+
    '<span class="gmv3-tabicon" aria-hidden="true">'+ic+'</span></button>').join("");
 }
 function showStats(){
  chosen="stats";renderBar();
  // Existing statistics helper and already-authorized items; no new queries.
  const m=typeof stats==="function"?stats():{total:0,sent:0,accepted:0,due:0};
  const row=(label,value)=>'<div class="gmv3-stat"><strong>'+Number(value||0)+'</strong><span>'+label+'</span></div>';
  surface.innerHTML='<div class="gmv3-swipe-body"><h2>Social statistics</h2>'+
    '<div class="gmv3-statrow">'+row("Contacts",m.total)+row("Requests sent",m.sent)+
    row("Accepted",m.accepted)+row("Follow-ups due",m.due)+'</div>'+
    '<div class="gmv3-noactions">These numbers summarize the Social records already available in your current session. No new contact updates, scraping or automated messages are performed.</div>'+
    '<button type="button" class="gmv3-return-targets" data-g3-social-back="dashboard">Back to targets</button></div>';
  surface.hidden=false;surface.scrollTop=0;
 }
 function selectPage(view){
  if(view==="stats"){showStats();return}
  if(!["dashboard","inbox","swipe","followups"].includes(view))return;
  chosen=view;surface.hidden=true;
  // Click the ORIGINAL Social nav control; it invokes the real handler including
  // loadResearch/loadInbox and leaves all selection/filter logic untouched.
  const original=doc.getElementById("bottomNav")?.querySelector('button[data-view="'+view+'"]');
  if(original){original.click();renderBar()}
  else { // On a just-loaded page, original nav is drawn after async refresh.
    state.view=view;state.selected="";render();renderBar();
    if(view==="inbox"){loadResearch();if(state.researchMode!=="followups")loadInbox()}
  }
  window.scrollTo?.(0,0);
 }
 bar.addEventListener("click",event=>{
  const tab=event.target.closest("[data-g3-social]");
  if(tab)selectPage(tab.dataset.g3Social);
 });
 surface.addEventListener("click",event=>{
  if(event.target.closest('[data-g3-social-back="dashboard"]'))selectPage("dashboard");
 });
 const header=doc.querySelector("body > header");
 if(header&&!doc.getElementById("gmv3-social-back")){
  const back=doc.createElement("button");
  back.id="gmv3-social-back";back.type="button";back.textContent="‹";
  back.setAttribute("aria-label","Back to Garamaal home");
  back.title="Return to the app start screen";
  back.addEventListener("click",()=>window.location.assign("/prototype"));
  header.insertBefore(back,header.firstChild);
 }
 const origNav=doc.getElementById("bottomNav");
 if(origNav&&typeof MutationObserver!=="undefined"){
  new MutationObserver(()=>{
   if(chosen==="stats")return;
   const nativeActive=origNav.querySelector('button.active[data-view]')?.dataset.view;
   if(nativeActive&&nativeActive!==chosen){chosen=nativeActive;renderBar()}
  }).observe(origNav,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
 }
 window.GaramaalSocialHub=Object.freeze({selectPage,showStats});
 renderBar();
})();
