"use strict";
/*
 * User-driven installed PWA → native Garamaal Browser handoff.
 * Only runs on Android when the Garamaal website is installed as a PWA.
 * Standard website / desktop / iOS navigation remains unchanged.
 */
(function(){
  const PACKAGE="app.garamaal.browser";
  const SCHEME="garamaal-browser";
  const HELP="/prototype/android-browser-help";
  const agent=String(navigator.userAgent||"");
  const android=/Android/i.test(agent);
  const installed=()=>!!(window.matchMedia?.("(display-mode: standalone)")?.matches ||
    navigator.standalone===true);
  const eligible=()=>android&&installed();
  function safeJob(raw){
    try{
      const url=new URL(String(raw||""));
      if(url.protocol!=="https:"||url.href.length>2500)return "";
      const host=url.hostname.toLowerCase();
      if(!host||host==="garamaal.web.app"||host.endsWith(".garamaal.web.app")||
        host==="linkedin.com"||host.endsWith(".linkedin.com")||
        host==="accounts.google.com"||
        host==="docs.google.com"||host==="drive.google.com"||
        host==="github.com"||host.endsWith(".github.com"))return "";
      return url.href;
    }catch{return "";}
  }
  function intentLink(jobUrl,fallback){
    // Android Chrome recognises user-initiated intent: URLs, launches the
    // explicit package when installed and uses browser_fallback_url otherwise.
    const query=jobUrl?"?url="+encodeURIComponent(jobUrl):"";
    return "intent://open"+query+"#Intent;scheme="+SCHEME+
      ";package="+PACKAGE+";S.browser_fallback_url="+
      encodeURIComponent(fallback)+";end";
  }
  function openHome(){
    if(!eligible())return false;
    window.location.assign(intentLink("",new URL(HELP,location.origin).href));
    return true;
  }
  function openJob(raw){
    if(!eligible())return false;
    const url=safeJob(raw);
    if(!url)return false;
    // Always fall back to the original employer link when native APK absent.
    window.location.assign(intentLink(url,url));
    return true;
  }
  // Existing job cards, Swipe deck and "Open employer vacancy" drawer
  // buttons all use these selectors. Do not intercept CV/CL Drive links,
  // LinkedIn, non-job links or modified/middle clicks.
  const SELECTOR=[
    "a.joblink",
    "a.gmv3-swipe-title-link",
    "a.gmv3-swipe-company-link",
    "button[data-action='open-link'][data-url]"
  ].join(",");
  document.addEventListener("click",event=>{
    if(!eligible()||event.defaultPrevented||event.button!==0||
      event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    const item=event.target?.closest?.(SELECTOR);
    if(!item)return;
    const url=item.tagName==="A"?item.getAttribute("href"):item.dataset.url;
    if(!safeJob(url))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openJob(url);
  },true);
  window.GaramaalAndroidBrowser=Object.freeze({
    isInstalledAndroid:eligible,
    openHome,
    openJob
  });
})();