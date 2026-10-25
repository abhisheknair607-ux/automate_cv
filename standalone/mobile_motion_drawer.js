/* Motion QA drawer: no original Jobs or Social feature handlers replaced. */
(function(){
 "use strict";
 const doc=document;
 const isSocial=!!doc.getElementById("bottomNav")&&!doc.getElementById("gmv3-launch");
 const isJobs=!!doc.getElementById("gmv3-launch");
 if(!isSocial&&!isJobs)return;
 let opener=null,opened=false,costGeneration=0;
 const host=doc.createElement("div");host.id="gmv3-account-drawer";host.className="gmv3-drawer-host";host.hidden=true;host.setAttribute("aria-hidden","true");
 host.innerHTML='<button type="button" class="gmv3-drawer-shade" data-gm3-drawer="close" aria-label="Close account menu"></button>'+
 '<aside class="gmv3-drawer" role="dialog" aria-modal="true" aria-labelledby="gmv3-drawer-title" tabindex="-1">'+
 '<div class="gmv3-drawer-header"><span class="gmv3-drawer-mark">Garamaal<i>.</i></span><button type="button" class="gmv3-drawer-close" data-gm3-drawer="close" aria-label="Close account drawer">×</button></div>'+
 '<div class="gmv3-drawer-person"><div class="gmv3-drawer-photo" id="gmv3-drawer-initial">A</div><h2 id="gmv3-drawer-title">My workspace</h2><p>Career control centre · Personal overview</p></div>'+
 '<section class="gmv3-drawer-cost"><p>Total recorded CV cost</p><strong id="gmv3-drawer-cost">—</strong>'+
 '<small id="gmv3-drawer-cost-detail">Expense records are requested only when this drawer opens.</small>'+
 '<button type="button" data-gm3-drawer="expenses">See expense details ↗</button></section>'+
 '<nav class="gmv3-drawer-links" aria-label="Profile tools">'+
 '<button type="button" data-gm3-drawer="profile"><b>◉</b> My profile <span class="gmv3-chevron">›</span></button>'+
 '<button type="button" data-gm3-drawer="statistics"><b>▥</b> Statistics <span class="gmv3-chevron">›</span></button>'+
 '<button type="button" data-gm3-drawer="reminders"><b>◷</b> Reminders & targets <span class="gmv3-chevron">›</span></button>'+
 '<button type="button" data-gm3-drawer="credits"><b>◈</b> Usage & credits <span class="gmv3-chevron">›</span></button>'+
 '<button type="button" data-gm3-drawer="home"><b>⌂</b> Home <span class="gmv3-chevron">›</span></button></nav>'+
 '<footer class="gmv3-drawer-signoff"><span>Made with care,<br>for you. <i>♡</i></span>'+
 '<small>GARAMAAL · MOTION QA CONCEPT</small></footer></aside>';
 doc.body.appendChild(host);
 const panel=host.querySelector(".gmv3-drawer");
 const first=host.querySelector(".gmv3-drawer-close");
 function label(id,value){const el=doc.getElementById(id);if(el)el.textContent=value}
 function candidate(){
  try{return typeof state!=="undefined"&&state&&state.candidate==="Pooja"?"Pooja":"Abhishek"}
  catch(_){return "Current member"}
 }
 function readCost(){
  const epoch=++costGeneration;
  if(isSocial){label("gmv3-drawer-cost","View in Jobs");label("gmv3-drawer-cost-detail","Recorded expenses are available in the Jobs workspace. No total is guessed here.");return;}
  label("gmv3-drawer-cost","—");label("gmv3-drawer-cost-detail","Checking existing recorded CV expenses…");
  if(typeof run!=="function"){label("gmv3-drawer-cost-detail","Recorded expenses are unavailable in this session.");return;}
  try{
   Promise.resolve(run("getExpenses",null,{quiet:true})).then(data=>{
    if(epoch!==costGeneration||!opened)return;
    const item=data&&data.candidates?data.candidates[candidate()]:null;
    const value=item&&item.recordedUsd;
    if(typeof value==="number"&&Number.isFinite(value)&&value>=0){
     label("gmv3-drawer-cost",new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value));
     label("gmv3-drawer-cost-detail",String(Number(item.recordedJobs||0))+" costed jobs · Recorded estimates only, not a complete bill.");
    }else{label("gmv3-drawer-cost","Not available");label("gmv3-drawer-cost-detail","No verified recorded total for this workspace.");}
   }).catch(()=>{if(epoch!==costGeneration||!opened)return;label("gmv3-drawer-cost","Not available");label("gmv3-drawer-cost-detail","Unable to read expense records.");});
  }catch(_){label("gmv3-drawer-cost","Not available");label("gmv3-drawer-cost-detail","Unable to read expense records.");}
 }
 function open(button){
  if(opened)return;
  opener=button||doc.activeElement;opened=true;host.hidden=false;host.setAttribute("aria-hidden","false");
  label("gmv3-drawer-title",candidate()+" · Workspace");label("gmv3-drawer-initial",candidate().slice(0,1));
  doc.body.classList.add("gmv3-drawer-open");readCost();first.focus();
 }
 function close(){
  if(!opened)return;
  opened=false;costGeneration++;host.hidden=true;host.setAttribute("aria-hidden","true");
  doc.body.classList.remove("gmv3-drawer-open");
  if(opener&&typeof opener.focus==="function")opener.focus();
 }
 function go(action){
  close();
  if(isSocial){
   const params={profile:"/prototype?open=profile",statistics:"/prototype?open=statistics",reminders:"/prototype?open=reminders",expenses:"/prototype?account=1",credits:"/prototype?account=1",home:"/prototype"};
   window.location.assign(params[action]||"/prototype");return;
  }
  if(action==="expenses"||action==="credits"){
   const original=doc.getElementById("expenseToggle");
   if(original)original.click();
   else if(typeof showExpenses==="function")showExpenses();
   return;
  }
  window.GaramaalPrototypeHome&&window.GaramaalPrototypeHome.showHome();
  if(action==="home")return;
  const card=doc.querySelector('#gmv3-launch [data-gmv3="'+action+'"]');
  if(card)card.click();
 }
 host.addEventListener("click",event=>{
  const el=event.target.closest("[data-gm3-drawer]");if(!el)return;
  const action=el.dataset.gm3Drawer;if(action==="close")close();else go(action);
 });
 doc.addEventListener("keydown",event=>{
  if(!opened)return;
  if(event.key==="Escape"){event.preventDefault();close();return}
  if(event.key!=="Tab")return;
  const all=[...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!all.length)return;const firstItem=all[0],lastItem=all[all.length-1];
  if(event.shiftKey&&doc.activeElement===firstItem){event.preventDefault();lastItem.focus()}
  else if(!event.shiftKey&&doc.activeElement===lastItem){event.preventDefault();firstItem.focus()}
 });
 const homeAvatar=doc.querySelector("#gmv3-launch .gmv3-avatar");
 if(homeAvatar){
  homeAvatar.setAttribute("aria-label","Open account menu");homeAvatar.setAttribute("aria-haspopup","dialog");
  homeAvatar.addEventListener("click",event=>open(event.currentTarget));
 }
 const jobsAvatar=doc.getElementById("avatar");
 if(isJobs&&jobsAvatar){
  jobsAvatar.setAttribute("role","button");jobsAvatar.setAttribute("tabindex","0");
  jobsAvatar.setAttribute("aria-label","Open account menu");jobsAvatar.setAttribute("aria-haspopup","dialog");
  jobsAvatar.addEventListener("click",event=>open(event.currentTarget));
  jobsAvatar.addEventListener("keydown",event=>{
   if(event.key==="Enter"||event.key===" "){event.preventDefault();open(event.currentTarget)}
  });
 }
 if(isSocial){
  const controls=doc.querySelector("body > header .garamaal-header-controls");
  if(controls){
   const avatar=doc.createElement("button");
   avatar.type="button";avatar.className="gmv3-social-avatar";avatar.id="gmv3-social-avatar";
   avatar.textContent=candidate()[0];avatar.setAttribute("aria-label","Open account menu");avatar.setAttribute("aria-haspopup","dialog");
   avatar.addEventListener("click",event=>open(event.currentTarget));controls.appendChild(avatar);
  }
 }
 doc.querySelector("#gmv3-launch")?.addEventListener("pointerdown",event=>{
  const card=event.target.closest(".gmv3-action");if(!card)return;
  card.classList.remove("gmv3-motion-tap");void card.offsetWidth;card.classList.add("gmv3-motion-tap");
 },{passive:true});
 window.GaramaalMotionQA=Object.freeze({open,close});
})();
