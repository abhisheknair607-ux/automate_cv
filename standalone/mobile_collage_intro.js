/* Garamaal prototype-only intro trigger.
 * Plays AFTER existing Firebase login, then reveals the SAME live DOM.
 * Never fetches, changes candidate data, submits applications or runs CV generation.
 */
(function(){
 "use strict";
 if(!document.body.classList.contains("gmv3-landing"))return;
 const reduce=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
 const root=document.getElementById("gmv3-launch");
 if(!root)return;
 let intro=null,delay=null,started=false;
 const clean=()=>{
  if(delay)clearTimeout(delay);
  if(!intro)return;
  intro.classList.add("gmv3-out");
  setTimeout(()=>{intro?.remove();intro=null;root.removeAttribute("aria-hidden");},600);
 };
 function play(force=false){
  if(started&&!force)return;
  if(intro)intro.remove();
  if(delay)clearTimeout(delay);
  started=true;
  if(reduce)return;
  intro=document.createElement("div");
  intro.id="gmv3-collage-intro";
  intro.setAttribute("role","presentation");
  intro.innerHTML='<div class="gmv3-paper"><div class="gmv3-doodles"><span>OFFICE ↗<br>INTERVIEW ✶<br>DESK</span><span>✎ CV<br>✦ CAREER<br>☕ WORK</span></div><strong>Garamaal</strong></div>'+
   '<span class="gmv3-star" aria-hidden="true">✦</span><span class="gmv3-star" aria-hidden="true">✳</span><span class="gmv3-star" aria-hidden="true">✦</span><span class="gmv3-star" aria-hidden="true">✧</span>'+
   '<span class="gmv3-intro-label">YOUR NEXT CHAPTER STARTS HERE</span><button type="button" class="gmv3-intro-skip">Skip intro →</button>';
  root.setAttribute("aria-hidden","true");
  document.body.appendChild(intro);
  intro.querySelector("button").addEventListener("click",clean,{once:true});
  delay=setTimeout(clean,3850);
 }
 const replay=document.createElement("button");
 replay.id="gmv3-intro-replay";replay.type="button";replay.textContent="✦ Replay intro";
 replay.style.cssText="position:fixed;right:15px;bottom:14px;z-index:122;border:1px solid #504457;border-radius:30px;color:#eee;background:#252129;padding:7px 12px;font:700 10px system-ui;cursor:pointer";
 replay.addEventListener("click",()=>play(true));
 root.appendChild(replay);
 if(reduce)return;
 // The untouched Firebase bridge owns authentication; do not obscure sign-in.
 // Start only once it has hidden its login overlay.
 const canStart=()=>{const login=document.getElementById("cv-login-overlay");return !!login&&login.style.display==="none"};
 const start=()=>{if(started||!canStart())return;try{if(sessionStorage.getItem("gmv3-intro-seen")==="1"){started=true;return}sessionStorage.setItem("gmv3-intro-seen","1")}catch(_){}play()};
 if(canStart()){start();return}
 const observer=new MutationObserver(()=>{if(canStart()){observer.disconnect();start()}});
 observer.observe(document.body,{childList:true,subtree:false,attributes:true,attributeFilter:["style"]});
 // Login overlay may be created later; observing its style independently is safer.
 const checkLogin=new MutationObserver(()=>{
  const login=document.getElementById("cv-login-overlay");
  if(login){checkLogin.disconnect();observer.disconnect();
   if(canStart()){start();return}
   const watch=new MutationObserver(()=>{if(canStart()){watch.disconnect();start()}});
   watch.observe(login,{attributes:true,attributeFilter:["style"]});
  }
 });
 if(!document.getElementById("cv-login-overlay"))checkLogin.observe(document.body,{childList:true});
})();
