"use strict";
/* Chrome Store entry point. PWA installation remains a separate feature. */
(function(){
  const valid=value=>{try{const u=new URL(String(value||""));return u.protocol==="https:"&&
    ["chromewebstore.google.com","chrome.google.com"].includes(u.hostname)&&
    /^\/(?:webstore\/)?detail\//.test(u.pathname)?u.href:"";}catch{return "";}}
  function mount(){
    if(document.getElementById("gm-extension-install"))return;
    const header=document.querySelector(".top-actions")||document.querySelector("header");
    if(!header)return;
    const b=document.createElement("button");
    b.id="gm-extension-install";b.type="button";b.textContent="Extension soon";
    b.title="Chrome Web Store publication pending";
    b.setAttribute("aria-label","Install Garamaal Chrome extension");
    b.style.cssText="border:1px solid currentColor;color:inherit;background:transparent;border-radius:9px;padding:8px 10px;font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap";
    let listing="",available=false;
    b.addEventListener("click",()=>{
      if(available){window.open(listing,"_blank","noopener,noreferrer");return;}
      b.title="Chrome Web Store listing is not yet approved";
      b.textContent="Extension soon";
    });
    const before=header.querySelector("#candidateToggle");
    if(before)header.insertBefore(b,before);else header.appendChild(b);
    fetch("/config",{credentials:"same-origin",cache:"no-store"})
      .then(r=>r.ok?r.json():{}).then(config=>{
        listing=valid(config.chromeExtensionUrl);
        available=config.chromeExtensionPublic===true&&!!listing;
        b.textContent=available?"Get extension":"Extension soon";
        b.title=available?"Install via the official Chrome Web Store":"Chrome Web Store publication pending";
      }).catch(()=>{});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
})();
