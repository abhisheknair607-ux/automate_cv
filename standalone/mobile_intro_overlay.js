/* Garamaal video intro QA, original two 5s MP4 assets. Does not change feature controls.
 * Runs only on opt-in /prototype or /social?gmv3=1 routes.
 */
(function(){
 "use strict";
 const panel=document.getElementById("gmv3-intro"),film=document.getElementById("gmv3-intro-film");
 if(!panel||!film)return;
 const skip=document.getElementById("gmv3-intro-skip");
 const status=document.getElementById("gmv3-intro-status");
 const fill=document.getElementById("gmv3-intro-progress-fill");
 const social=!document.getElementById("gmv3-launch");
 const prefix=social?"/social/intro/":"/prototype/intro/";
 const clips=Object.freeze({mobile:prefix+"mobile.mp4",desktop:prefix+"desktop.mp4"});
 const motion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)");
 let done=false,epoch=0,timeout=null,exitTimer=null,afterExitHome=false;
 const unlock=[];
 function shield(){
  // No keyboard or screen-reader access to the underlying UI while the film plays.
  for(const el of document.body.children){
   if(el===panel||el.tagName==="SCRIPT"||el.tagName==="STYLE")continue;
   unlock.push([el,el.inert]);
   el.inert=true;
  }
 }
 function unshield(){
  for(const [el,oldValue] of unlock)el.inert=oldValue;
  unlock.length=0;
 }
 function finish(){
  if(done)return;
  done=true;epoch++;
  clearTimeout(timeout);clearTimeout(exitTimer);
  film.pause();
  panel.classList.add("gmv3-intro-out");
  document.body.classList.remove("gmv3-intro-active");
  unshield();
  // If a logo was clicked inside Jobs, transfer to the already approved Home screen.
  if(afterExitHome && !social && window.GaramaalPrototypeHome?.showHome){
   window.GaramaalPrototypeHome.showHome();
  }
  exitTimer=setTimeout(()=>{
   panel.hidden=true;panel.setAttribute("aria-hidden","true");
   if(document.activeElement===skip) {
    const focusTarget=document.querySelector(social?".garamaal-unified-header .logo":"#gmv3-launch .gmv3-action");
    focusTarget?.focus?.({preventScroll:true});
   }
  },motion?.matches?0:570);
 }
 function fail(reason){
  if(done)return;
  panel.dataset.phase="error";
  status.textContent=reason||"Opening your workspace…";
  timeout=setTimeout(finish,500);
 }
 function updateProgress(){
  if(done||!film.duration||!Number.isFinite(film.duration))return;
  fill.style.width=Math.max(0,Math.min(100,film.currentTime/film.duration*100))+"%";
 }
 function playIntro(mode){
  clearTimeout(timeout);clearTimeout(exitTimer);
  film.pause();
  epoch++;const thisEpoch=epoch;
  done=false;
  panel.hidden=false;panel.setAttribute("aria-hidden","false");
  panel.classList.remove("gmv3-intro-out");panel.dataset.phase="loading";
  document.body.classList.add("gmv3-intro-active");
  fill.style.width="0%";
  status.textContent="A fresh start unfolds.";
  afterExitHome=mode==="home";
  if(afterExitHome && !social && window.GaramaalPrototypeHome?.showHome){
    window.GaramaalPrototypeHome.showHome();
  }
  shield();
  if(motion?.matches){finish();return;}
  const portrait=window.matchMedia("(max-width: 820px), (orientation: portrait)").matches;
  const src=portrait?clips.mobile:clips.desktop;
  film.muted=true;film.defaultMuted=true;film.playsInline=true;film.autoplay=true;
  if(film.getAttribute("src")!==src)film.setAttribute("src",src);
  film.currentTime=0;
  film.load();
  // Ensure a missing/corrupt clip cannot trap someone in a loading screen.
  timeout=setTimeout(()=>{if(epoch===thisEpoch)fail("Opening your workspace…")},8500);
  const promise=film.play();
  if(promise&&typeof promise.catch==="function")promise.catch(()=>{
   if(epoch!==thisEpoch||done)return;
   status.textContent="Tap the video to play, or skip.";
  });
 }
 film.addEventListener("playing",()=>{panel.dataset.phase="playing"});
 film.addEventListener("timeupdate",updateProgress);
 film.addEventListener("ended",finish);
 film.addEventListener("error",()=>fail("Opening your workspace…"));
 film.addEventListener("click",()=>{
  if(done)return;
  film.play().catch(()=>{});
 });
 skip?.addEventListener("click",finish);
 document.addEventListener("keydown",ev=>{
  if(panel.hidden||done)return;
  if(ev.key==="Escape"){ev.preventDefault();finish();}
 });
 function bindLogo(node){
  if(!node||node.dataset.gmv3IntroBound)return;
  node.dataset.gmv3IntroBound="1";
  if(!["A","BUTTON"].includes(node.tagName)){
   node.setAttribute("role","button");
   node.setAttribute("tabindex","0");
  }
  node.setAttribute("aria-label","Replay Garamaal intro");
  const handler=ev=>{
   ev.preventDefault();ev.stopPropagation();
   playIntro(social?"replay":"home");
  };
  node.addEventListener("click",handler);
  node.addEventListener("keydown",ev=>{
   if(ev.key==="Enter"||ev.key===" "){handler(ev)}
  });
 }
 bindLogo(document.querySelector("#gmv3-launch .gmv3-wordmark"));
 bindLogo(document.querySelector(".sidebar .brand"));
 bindLogo(document.querySelector("body > header .logo"));
 window.GaramaalIntro=Object.freeze({replay:()=>playIntro("home"),skip:finish,clips});
 playIntro("entry");
})();
