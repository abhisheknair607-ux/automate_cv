/* /prototype only. The approved MP4 clips stop before their old mock-home segment.
 * The outgoing film then reveals the fully authenticated original Jobs/Social app.
 * Absolutely no backend writes or API generation are triggered by this code.
 */
(function(){
 "use strict";
 if(!document.body.classList.contains("gmv3-landing"))return;
 const root=document.getElementById("gmv3-launch");
 if(!root)return;
 const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
 // Choose footage by screen shape, not pixel width: portrait tablets use the portrait clip; landscape phones use widescreen.
 const desktop=()=>window.matchMedia?.("(min-aspect-ratio: 11/10)")?.matches;
 const url=()=>"/prototype/media/intro-"+(desktop()?"desktop":"mobile")+".mp4";
 let film=null,video=null,ambient=null,started=false,timeout=null,closing=false;
 function finish(){
  if(!film||closing)return;
  closing=true;
  document.body.classList.add("gmv3-transfer");
  film.classList.add("gmv3-out");
  if(video){video.pause();}if(ambient){ambient.pause();}
  if(timeout){clearTimeout(timeout);timeout=null;}
  setTimeout(()=>{film?.remove();film=null;video=null;ambient=null;root.removeAttribute("aria-hidden");closing=false},620);
 }
 function begin(force=false){
  if(reduced)return;
  if(started&&!force)return;
  if(film){film.remove();film=null}
  if(timeout)clearTimeout(timeout);
  started=true;closing=false;
  document.body.classList.remove("gmv3-transfer");
  film=document.createElement("div");
  film.id="gmv3-collage-intro";
  const accessibilityLabel="Garamaal scrapbook paper unfolding video";
  film.innerHTML='<video class="gmv3-intro-ambient" playsinline muted aria-hidden="true" tabindex="-1" preload="auto" disablepictureinpicture></video>'+ 
    '<video class="gmv3-intro-video" playsinline autoplay muted preload="auto" disablepictureinpicture aria-label="'+accessibilityLabel+'"></video>'+
    '<div class="gmv3-intro-controls"><button class="gmv3-intro-sound" type="button" aria-label="Enable intro sound">Sound off</button><button class="gmv3-intro-skip" type="button">Skip intro →</button></div>';
  root.setAttribute("aria-hidden","true");
  document.body.appendChild(film);
  video=film.querySelector(".gmv3-intro-video");ambient=film.querySelector(".gmv3-intro-ambient");
  const source=url();video.src=source;video.muted=true;ambient.src=source;ambient.muted=true;ambient.defaultMuted=true;
  video.addEventListener("play",()=>{ambient?.play().catch(()=>{});});
  video.addEventListener("seeked",()=>{if(ambient&&video&&Math.abs(ambient.currentTime-video.currentTime)>.2)ambient.currentTime=video.currentTime});
  video.addEventListener("timeupdate",()=>{if(video&&video.currentTime>=3.77)finish()});
  video.addEventListener("ended",finish,{once:true});
  video.addEventListener("error",()=>{
    // No endless loading screen on unsupported codecs or interrupted connections.
    if(!film||closing)return;
    film.classList.add("gmv3-film-fallback");
    film.innerHTML='<div class="gmv3-paper"><div class="gmv3-doodles"><span>OFFICE ↗<br>INTERVIEW ✶</span><span>✎ CV<br>✦ CAREER</span></div><strong>Garamaal</strong></div><button class="gmv3-intro-skip" type="button">Skip intro →</button>';
    film.querySelector("button")?.addEventListener("click",finish,{once:true});
    timeout=setTimeout(finish,2600);
  },{once:true});
  film.querySelector(".gmv3-intro-skip").addEventListener("click",finish,{once:true});
  film.querySelector(".gmv3-intro-sound").addEventListener("click",e=>{
   if(!video)return;
   video.muted=!video.muted;
   e.currentTarget.textContent=video.muted?"Sound off":"Sound on";
   e.currentTarget.setAttribute("aria-label",video.muted?"Enable intro sound":"Mute intro sound");
  });
  video.play().catch(()=>{if(video)video.muted=true;});
  ambient.play().catch(()=>{});
  // Fail closed: on an unusually slow device, always reveal the application.
  timeout=setTimeout(finish,5000);
 }
 const replay=document.createElement("button");
 replay.id="gmv3-intro-replay";replay.type="button";replay.textContent="✦ Replay intro";
 replay.style.cssText="position:fixed;right:15px;bottom:14px;z-index:122;border:1px solid #504457;border-radius:30px;color:#eee;background:#252129;padding:7px 12px;font:700 10px system-ui;cursor:pointer";
 replay.addEventListener("click",()=>begin(true));
 root.appendChild(replay);
 if(reduced)return;
 function signedIn(){
  const login=document.getElementById("cv-login-overlay");
  return !!login&&login.style.display==="none";
 }
 function startOnce(){
  if(started||!signedIn())return;
  try {
   if(sessionStorage.getItem("gmv3-video-seen")==="1"){started=true;return}
   sessionStorage.setItem("gmv3-video-seen","1");
  } catch(_){}
  begin();
 }
 // Firebase bridge, not this visual layer, owns Google authentication.
 if(signedIn()){startOnce();return}
 const observeLogin=()=>{
   const login=document.getElementById("cv-login-overlay");
   if(!login)return false;
   if(signedIn()){startOnce();return true}
   const watch=new MutationObserver(()=>{if(signedIn()){watch.disconnect();startOnce()}});
   watch.observe(login,{attributes:true,attributeFilter:["style"]});
   return true;
 };
 if(!observeLogin()){
  const observer=new MutationObserver(()=>{if(observeLogin())observer.disconnect()});
  observer.observe(document.body,{childList:true});
 }
})();
