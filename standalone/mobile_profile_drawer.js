/* Garamaal prototype navigation drawer. All original A/P, cost, auth and Jobs actions
 remain mounted; this UI delegates to their original handlers rather than duplicating logic. */
(function(){
 "use strict";
 if(typeof document==="undefined"||!document.body.classList.contains("gmv3-jobs-workspace"))return;
 const doc=document,header=doc.querySelector(".garamaal-header-controls");if(!header)return;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const name=()=>typeof state!=="undefined"&&state.candidate==="Pooja"?"Pooja":"Abhishek";
 const button=doc.createElement("button");
 button.type="button";button.id="gmv3-account-drawer-button";button.className="gmv3-account-trigger";
 button.setAttribute("aria-label","Open account, profile and more");button.setAttribute("aria-haspopup","dialog");
 button.setAttribute("aria-expanded","false");
 header.append(button);
 let veil=null,previous=null;
 function sync(){button.innerHTML='<span aria-hidden="true">'+esc(name().slice(0,1))+'</span><span class="gmv3-account-menu-bars" aria-hidden="true">☰</span>';}
 function close(){
  if(!veil)return;veil.remove();veil=null;
  button.setAttribute("aria-expanded","false");
  (previous&&previous.isConnected?previous:button).focus?.();
 }
 function actionMarkup(id,symbol,label,sub){return '<button type="button" class="gmv3-account-action" data-gm-account="'+id+'"><span class="gmv3-account-ico" aria-hidden="true">'+symbol+'</span><span><strong>'+label+'</strong><small>'+sub+'</small></span><span aria-hidden="true">›</span></button>'}
 function open(){
  close();previous=doc.activeElement;sync();
  veil=doc.createElement("div");veil.className="gmv3-account-veil";veil.id="gmv3-account-veil";
  veil.innerHTML='<aside class="gmv3-account-drawer" role="dialog" aria-modal="true" aria-label="Account and more menu">'+
   '<div class="gmv3-account-top"><div><small>YOUR CORNER</small><h2>More & Me<span>.</span></h2></div><button type="button" data-gm-account="close" aria-label="Close menu">×</button></div>'+
   '<div class="gmv3-account-person"><div class="gmv3-account-avatar" aria-hidden="true">'+esc(name().slice(0,1))+'</div><div><strong>'+esc(name())+'</strong><small>Jobs · Networking · Career</small></div></div>'+
   '<fieldset class="gmv3-account-switch"><legend>Choose workspace</legend><div>'+
   ['Abhishek','Pooja'].map(n=>'<button type="button" data-gm-candidate="'+n+'" aria-pressed="'+String(name()===n)+'" class="'+(name()===n?'active':'')+'">'+esc(n)+'</button>').join("")+'</div></fieldset>'+
   '<nav class="gmv3-account-options" aria-label="Profile and more tools">'+
   actionMarkup("profile","✎","Edit career profile","Experience, education and career goals")+
   actionMarkup("stats","▥","Statistics & targets","Applications, CVs and daily goals")+
   actionMarkup("expenses","$","Recorded CV spending","Open the existing cost report")+
   actionMarkup("alerts","◷","Notifications","Pending applications and connections")+
   actionMarkup("add","＋","Add a job","Use the existing Jobs form")+
   actionMarkup("ranking","✦","Ranking prompt","ChatGPT-assisted job scoring")+
   actionMarkup("social","⇄","Networking Hub","Research, connect and follow up")+
   actionMarkup("google","◉","Switch Google account","Sign in with an approved account")+
   actionMarkup("home","⌂","Home","Return to the start screen")+
   '</nav><div class="gmv3-account-footer"><strong>Made by one of you, for all of you.</strong></div></aside>';
  doc.body.append(veil);
  button.setAttribute("aria-expanded","true");
  veil.querySelector('[data-gm-account="close"]')?.focus();
 }
 function pick(candidate){
  const source=doc.querySelectorAll("#candidateToggle button");
  const selected=[...source].find(el=>el.getAttribute("data-value")===candidate||el.getAttribute("aria-label")==="Switch to "+candidate);
  close();
  if(selected&&name()!==candidate){selected.click();setTimeout(sync,0)}
 }
 function route(kind){
  close();
  if(kind==="profile"){window.GaramaalProfile?.open();return}
  if(kind==="expenses"){doc.getElementById("expenseToggle")?.click();return}
  if(kind==="google"){doc.getElementById("cv-account-switch")?.click();return}
  if(kind==="social"){window.location.assign("/social?gmv3=1");return}
  if(kind==="home"){window.GaramaalPrototypeHome?.showHome();return}
  if(kind==="add"){window.GaramaalJobsHub?.selectPage("add");return}
  if(kind==="ranking"){window.GaramaalJobsHub?.selectPage("dashboard");doc.querySelector('[data-action="copy-ranking"]')?.focus();return}
  if(kind==="stats"||kind==="alerts"){
   window.GaramaalJobsHub?.selectPage("dashboard");
   if(kind==="alerts")doc.getElementById("gmv3-goal-alerts")?.scrollIntoView?.({behavior:"smooth",block:"start"});
  }
 }
 button.addEventListener("click",open);
 doc.addEventListener("click",e=>{
  if(!veil)return;
  if(e.target===veil){close();return}
  const target=e.target.closest?.("[data-gm-account],[data-gm-candidate]");
  if(!target||!veil.contains(target))return;
  if(target.hasAttribute("data-gm-candidate")){pick(target.dataset.gmCandidate);return}
  if(target.dataset.gmAccount==="close"){close();return}
  route(target.dataset.gmAccount);
 });
 doc.addEventListener("keydown",e=>{
  if(!veil)return;
  if(e.key==="Escape"){e.preventDefault();close();return}
  if(e.key==="Tab"){
   const focusables=[...veil.querySelectorAll("button:not([disabled])")];
   if(!focusables.length)return;
   const first=focusables[0],last=focusables.at(-1);
   if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 const toggle=doc.getElementById("candidateToggle");
 if(toggle&&typeof MutationObserver!=="undefined"){new MutationObserver(sync).observe(toggle,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]})}
 sync();
 window.GaramaalDrawer=Object.freeze({open,close});
})();