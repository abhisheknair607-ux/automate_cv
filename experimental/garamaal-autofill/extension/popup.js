"use strict";
const file=document.querySelector("#file"),statusEl=document.querySelector("#status"),review=document.querySelector("#review"),fillBtn=document.querySelector("#fill");
let profile=null,pending=[],tabId=null;
const status=s=>statusEl.textContent=s;
chrome.storage.local.get(["demoProfile"],r=>{if(r.demoProfile){profile=r.demoProfile;document.querySelector("#profileLabel").textContent=profile.basics?.fullName||"Profile loaded";}});
file.addEventListener("change",async()=>{
 try{if(!file.files?.[0]||file.files[0].size>200000)throw Error("Profile JSON missing or too large");
  const p=JSON.parse(await file.files[0].text());if(!p?.basics||Array.isArray(p))throw Error("Not a Garamaal profile");
  profile=p;await chrome.storage.local.set({demoProfile:p});document.querySelector("#profileLabel").textContent=p.basics.fullName||"Profile loaded";status("Profile imported");}
 catch(e){status(e.message);}
});
function scanForm(){
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden";
 function label(el){const t=[];if(el.labels)t.push(...[...el.labels].map(l=>l.innerText));t.push(el.getAttribute("aria-label")||"",el.getAttribute("placeholder")||"",el.name||"",el.id||"");return t.filter(Boolean).join(" | ").slice(0,300);}
 return [...document.querySelectorAll("input,textarea")].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&!["hidden","password","file","checkbox","radio","submit","button","reset"].includes(e.type)).slice(0,160).map((e,i)=>{
  const id="gm-autofill-"+i;e.setAttribute("data-garamaal-autofill-id",id);return {id,label:label(e),type:e.tagName==="TEXTAREA"?"textarea":(e.type||"text"),hasValue:!!String(e.value||"").trim(),disabled:e.disabled,readOnly:e.readOnly};
 });
}
function fillForm(items){
 const out=[];for(const item of items){
  const el=[...document.querySelectorAll("[data-garamaal-autofill-id]")].find(e=>e.getAttribute("data-garamaal-autofill-id")===item.id);
  if(!el||el.disabled||el.readOnly||String(el.value||"").trim()||!["INPUT","TEXTAREA"].includes(el.tagName)){out.push(false);continue;}
  try{const proto=el.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
   const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
   const v=String(item.value).slice(0,500);if(setter)setter.call(el,v);else el.value=v;
   el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));out.push(el.value===v);
  }catch(_){out.push(false);}
 }return out;
}
document.querySelector("#scan").addEventListener("click",async()=>{
 if(!profile){status("Import profile JSON first");return;}
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||""))throw Error("Open an application webpage");
  if(/(^|\.)linkedin\.com$/i.test(new URL(tab.url).hostname))throw Error("LinkedIn is disabled in the MVP");
  tabId=tab.id;const [r]=await chrome.scripting.executeScript({target:{tabId},func:scanForm});
  const fields=r.result||[];pending=fields.map(f=>GaramaalMatcher.suggest(f,profile)).filter(Boolean);
  review.replaceChildren();for(const p of pending){const row=document.createElement("label");row.className="row";
   const box=document.createElement("input");box.type="checkbox";box.checked=true;box.dataset.id=p.id;
   const txt=document.createElement("div"),head=document.createElement("strong"),val=document.createElement("small");
   head.textContent=p.label.split(" | ")[0];val.textContent=p.value;txt.append(head,val);row.append(box,txt);review.append(row);}
  fillBtn.disabled=!pending.length;status(fields.length+" fields scanned, "+pending.length+" suggested");
 }catch(e){status("Scan failed: "+e.message);}
});
fillBtn.addEventListener("click",async()=>{
 const selected=pending.filter(p=>[...review.querySelectorAll('input[type="checkbox"]')].some(x=>x.dataset.id===p.id&&x.checked));
 if(!selected.length){status("Choose at least one field");return;}
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id!==tabId)throw Error("Tab changed: scan again");
 const [r]=await chrome.scripting.executeScript({target:{tabId},func:fillForm,args:[selected.map(({id,value})=>({id,value}))]});
 const ok=(r.result||[]).filter(Boolean).length;status(ok+"/"+selected.length+" entered; review the page before continuing");fillBtn.disabled=true;
 }catch(e){status("Fill failed: "+e.message);}
});
