"use strict";
const file=document.querySelector("#file");
const statusEl=document.querySelector("#status");
const review=document.querySelector("#review");
const fillBtn=document.querySelector("#fill");
let profile=null;
const status=s=>{statusEl.textContent=s;};

chrome.storage.local.get(["demoProfile"],r=>{
  if(r.demoProfile){
    profile=r.demoProfile;
    document.querySelector("#profileLabel").textContent=profile.basics?.fullName||"Profile loaded";
  }
});
file.addEventListener("change",async()=>{
  try{
    if(!file.files?.[0]||file.files[0].size>200000)throw Error("Profile JSON missing or too large");
    const p=JSON.parse(await file.files[0].text());
    if(!p?.basics||Array.isArray(p))throw Error("Not a Garamaal profile");
    profile=p;
    await chrome.storage.local.set({demoProfile:p});
    document.querySelector("#profileLabel").textContent=p.basics.fullName||"Profile loaded";
    status("Sample profile imported");
  }catch(e){status(e.message);}
});

// This function is executed only in the currently active tab, on user request.
function scanForm(){
  const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden";
  const asText=e=>String(e?.innerText||e?.textContent||"").trim();
  const labels=e=>{
    const t=[];
    if(e.labels)t.push(...[...e.labels].map(asText));
    t.push(e.getAttribute("aria-label")||"",e.getAttribute("placeholder")||"",e.name||"",e.id||"");
    return t.filter(Boolean).join(" | ").slice(0,350);
  };
  const parentQuestion=e=>{
    const fs=e.closest("fieldset");
    const group=e.closest('[role="radiogroup"]');
    const legend=fs?.querySelector("legend");
    return asText(legend)||group?.getAttribute("aria-label")||
      asText(group?.querySelector("legend"))||asText(e.parentElement?.parentElement).slice(0,260);
  };
  const isPlaceholder=o=>!o||!String(o.value||"").trim()||
    /^(select|choose|please select|please choose|pick one|none selected)\b/i.test(asText(o));
  const fields=[],seenRadio=new Set();
  let i=0;
  for(const e of [...document.querySelectorAll("input,textarea,select")]){
    if(fields.length>=160)break;
    if(!visible(e)||e.disabled||e.readOnly)continue;
    let type=e.tagName==="TEXTAREA"?"textarea":e.tagName==="SELECT"?"select":e.type||"text";
    if(["hidden","password","file","checkbox","submit","button","reset"].includes(type))continue;
    const id="gm-autofill-"+i++;
    if(type==="radio"){
      const fs=e.closest("fieldset"),name=e.name;
      const group=[...document.querySelectorAll('input[type="radio"]')].filter(x=>
        x.form===e.form && (name?x.name===name:(fs?x.closest("fieldset")===fs:x===e)));
      const key=group[0]||e;
      if(seenRadio.has(key))continue;
      seenRadio.add(key);
      const usable=group.filter(x=>visible(x)&&!x.disabled);
      if(!usable.length)continue;
      for(const x of usable)x.setAttribute("data-garamaal-autofill-id",id);
      fields.push({id,type,label:parentQuestion(e)+" | "+(name||""),
        hasValue:group.some(x=>x.checked),disabled:false,readOnly:false,
        options:usable.map(x=>({label:asText(x.labels?.[0])||x.getAttribute("aria-label")||x.value,
          value:x.value}))});
      continue;
    }
    if(type==="select"){
      e.setAttribute("data-garamaal-autofill-id",id);
      fields.push({id,type,label:labels(e),hasValue:!isPlaceholder(e.selectedOptions?.[0]),
        disabled:false,readOnly:false,options:[...e.options].map(o=>({label:asText(o),value:o.value}))});
      continue;
    }
    e.setAttribute("data-garamaal-autofill-id",id);
    fields.push({id,type,label:labels(e),hasValue:!!String(e.value||"").trim(),
      disabled:false,readOnly:false});
  }
  const companyName=document.querySelector('meta[property="job:company"]')?.content||
    document.querySelector('[data-company-name]')?.getAttribute("data-company-name")||"";
  return {fields,companyName};
}

// Only sets values on an existing application page. NEVER navigates or submits.
function fillForm(items){
  const isPlaceholder=o=>!o||!String(o.value||"").trim()||
    /^(select|choose|please select|please choose|pick one|none selected)\b/i.test(String(o.textContent||"").trim());
  const results=[];
  for(const item of items){
    if(!/^gm-autofill-\d+$/.test(item.id)){results.push(false);continue;}
    const group=[...document.querySelectorAll("[data-garamaal-autofill-id]")].filter(e=>
      e.getAttribute("data-garamaal-autofill-id")===item.id);
    if(!group.length){results.push(false);continue;}
    try{
      if(item.fieldType==="radio"){
        if(group.some(x=>x.checked)){results.push(false);continue;}
        const target=group.find(x=>x.type==="radio"&&x.value===item.value&&!x.disabled);
        if(!target){results.push(false);continue;}
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"checked")?.set;
        if(setter)setter.call(target,true);else target.checked=true;
        target.dispatchEvent(new Event("input",{bubbles:true}));
        target.dispatchEvent(new Event("change",{bubbles:true}));
        results.push(target.checked);
      }else if(item.fieldType==="select"){
        const el=group[0];
        if(el.tagName!=="SELECT"||el.disabled||!isPlaceholder(el.selectedOptions?.[0])||
          ![...el.options].some(o=>o.value===item.value)){results.push(false);continue;}
        const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;
        if(setter)setter.call(el,item.value);else el.value=item.value;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
        results.push(el.value===item.value);
      }else{
        const el=group[0];
        if(!["INPUT","TEXTAREA"].includes(el.tagName)||el.disabled||el.readOnly||
          String(el.value||"").trim()){results.push(false);continue;}
        const proto=el.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
        const v=String(item.value).slice(0,500);
        if(setter)setter.call(el,v);else el.value=v;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
        results.push(el.value===v);
      }
    }catch(_){results.push(false);}
  }
  return results;
}

fillBtn.addEventListener("click",async()=>{
  if(!profile){status("Import the fictional sample profile first");return;}
  fillBtn.disabled=true;review.replaceChildren();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https?:\/\//.test(tab.url||""))throw Error("Open an application webpage");
    if(/(^|\.)linkedin\.com$/i.test(new URL(tab.url).hostname))
      throw Error("LinkedIn is disabled in this prototype");
    const [scan]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:scanForm});
    const {fields=[],companyName=""}=scan.result||{};
    const pending=fields.map(f=>GaramaalMatcher.suggest(f,profile,{companyName})).filter(Boolean);
    if(!pending.length){
      status(fields.length+" fields scanned; no supported empty fields found. Nothing changed.");
      return;
    }
    // Do not fill an entirely different tab after the user changes tabs.
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});
    if(current?.id!==tab.id)throw Error("Active tab changed; try again");
    const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:fillForm,
      args:[pending.map(({id,value,fieldType})=>({id,value,fieldType}))]});
    const results=r.result||[],ok=results.filter(Boolean).length;
    pending.forEach((p,i)=>{
      if(!results[i])return;
      const row=document.createElement("div");row.className="row";
      const title=document.createElement("strong");title.textContent=p.label.split(" | ")[0];
      const value=document.createElement("small");value.textContent=p.displayValue;
      const detail=document.createElement("div");detail.append(title,value);row.append(detail);
      review.append(row);
    });
    status(ok+"/"+pending.length+" filled. Review this page, then manually click Next or Submit.");
  }catch(e){status("Autofill failed: "+e.message);}
  finally{fillBtn.disabled=false;}
});
