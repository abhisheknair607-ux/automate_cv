/* Garamaal V9 launcher bridge and shared appearance. Presentation-only integration. */
(function(){
"use strict";
const root=document.getElementById("gmv3-launch"),frame=document.getElementById("gm9-career-iframe");
if(!root||!frame)return;
const KEY="garamaal-demo-theme";
const safe=theme=>theme==="dark"?"dark":"light";
function current(){try{return safe(localStorage.getItem(KEY))}catch(_){return "light"}}
function broadcast(theme){
 document.documentElement.setAttribute("data-garamaal-theme",theme);
 document.body.setAttribute("data-garamaal-theme",theme);
 document.querySelectorAll("[data-gm-theme]").forEach(button=>{
  button.setAttribute("aria-pressed",String(button.dataset.gmTheme===theme));
 });
 if(frame.contentWindow)frame.contentWindow.postMessage({type:"garamaal-theme-set",theme},location.origin);
}
function set(theme){
 theme=safe(theme);
 try{localStorage.setItem(KEY,theme)}catch(_){}
 broadcast(theme);
 window.dispatchEvent(new CustomEvent("garamaal-appearance-change",{detail:{theme}}));
 return theme;
}
window.GaramaalTheme=Object.freeze({set,get:current,toggle:()=>set(current()==="light"?"dark":"light")});
set(current());
frame.addEventListener("load",()=>broadcast(current()));
const subview=document.getElementById("gmv3-subview");
function syncSubview(){
 frame.hidden=!!(subview&&!subview.hidden);
}
if(subview&&typeof MutationObserver!=="undefined")new MutationObserver(syncSubview).observe(subview,{attributes:true,attributeFilter:["hidden"]});
let wasLanding=document.body.classList.contains("gmv3-landing");
if(typeof MutationObserver!=="undefined"){
 new MutationObserver(()=>{
  const isLanding=document.body.classList.contains("gmv3-landing");
  if(isLanding&&!wasLanding)frame.contentWindow?.postMessage({type:"garamaal-return-home"},location.origin);
  wasLanding=isLanding;
 }).observe(document.body,{attributes:true,attributeFilter:["class"]});
}
syncSubview();
function enterJobs(){window.GaramaalPrototypeHome?.enterJobs()}
function handle(action){
 switch(action){
 case "jobs":enterJobs();break;
 case "profile":enterJobs();window.GaramaalProfile?.open();break;
 case "network":window.location.assign("/social?gmv3=1");break;
 case "stats":enterJobs();window.GaramaalJobsHub?.selectPage("dashboard");break;
 case "targets":enterJobs();window.GaramaalJobsHub?.selectPage("dashboard");document.getElementById("gmv3-goal-alerts")?.scrollIntoView?.({behavior:"smooth",block:"start"});break;
 case "reminders":root.querySelector('[data-gmv3="reminders"]')?.click();break;
 case "install":
  if(typeof window.__cvInstall==="function")window.__cvInstall();
  else window.alert("Use your browser menu to install Garamaal or add it to your home screen.");
  break;
 case "account":enterJobs();window.GaramaalDrawer?.open();break;
 }
}
window.addEventListener("message",event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 const msg=event.data;
 if(msg?.type==="garamaal-career-action"&&["jobs","profile","network","stats","targets","reminders","install","account"].includes(msg.action))handle(msg.action);
 if(msg?.type==="garamaal-career-theme"&&(msg.theme==="light"||msg.theme==="dark"))set(msg.theme);
});
document.getElementById("gmv3-home-button")?.addEventListener("click",()=>{
 frame.contentWindow?.postMessage({type:"garamaal-return-home"},location.origin);
});
})();
