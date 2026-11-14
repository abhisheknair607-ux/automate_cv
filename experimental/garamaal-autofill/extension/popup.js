"use strict";
const file=document.querySelector("#file");
const statusEl=document.querySelector("#status");
const review=document.querySelector("#review");
const fillBtn=document.querySelector("#fill");
const inspectBtn=document.querySelector("#inspect");
const nextBtn=document.querySelector("#next");
const sourceSelect=document.querySelector("#source");
const demoImport=document.querySelector("#demoImport");
const connectedHint=document.querySelector("#connectedHint");
const updateSource=()=>{
  if(demoImport)demoImport.hidden=sourceSelect.value!=="demo";
  if(connectedHint)connectedHint.hidden=sourceSelect.value!=="garamaal";
};
let profile=null;
const status=s=>{statusEl.textContent=s;};
chrome.storage.local.get(["demoProfile","source"],r=>{
  sourceSelect.value=r.source==="garamaal"?"garamaal":"demo";
  updateSource();
  if(r.demoProfile){profile=r.demoProfile;
    document.querySelector("#profileLabel").textContent=profile.basics?.fullName||"Profile loaded";}
});
sourceSelect.addEventListener("change",()=>{
  updateSource();
  chrome.storage.local.set({source:sourceSelect.value});
});
file.addEventListener("change",async()=>{
  try{
    if(!file.files?.[0]||file.files[0].size>200000)throw Error("Profile JSON missing or too large");
    const p=JSON.parse(await file.files[0].text());
    if(!p?.basics||Array.isArray(p))throw Error("Not a Garamaal profile");
    profile=p;await chrome.storage.local.set({demoProfile:p});
    document.querySelector("#profileLabel").textContent=p.basics.fullName||"Profile loaded";
    status("Sample profile imported");
  }catch(e){status(e.message);}
});
// Executed only in the active tab after the user clicks the side-panel button.
function scanForm(){
  const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden";
  const asText=e=>String(e?.innerText||e?.textContent||"").trim().replace(/\s+/g," ");
  const nearbyLabel=e=>{
    for(let node=e.parentElement,depth=0;node&&depth<4;node=node.parentElement,depth++){
      const controls=node.querySelectorAll?.("input,textarea,select")||[];
      if(controls.length>3)continue;
      const found=[...(node.querySelectorAll?.("label")||[])].filter(label=>
        visible(label)&&!label.contains(e));
      if(found.length!==1)continue;
      const value=asText(found[0]);
      if(value&&value.length<=100)return value;
    }
    return "";
  };
  const rowLabel=e=>{
    const row=e.closest("tr");
    if(!row||row.querySelectorAll("input,textarea,select").length!==1)return "";
    const cells=[...row.querySelectorAll("th,td")].filter(cell=>
      !cell.contains(e)&&visible(cell));
    const value=asText(cells[0]);
    return value&&value.length<=140?value:"";
  };
  const labels=e=>{
    const t=[];
    if(e.labels)t.push(...[...e.labels].map(asText));
    const named=(e.getAttribute("aria-labelledby")||"").split(/\s+/)
      .map(id=>asText(document.getElementById(id))).filter(Boolean);
    t.push(...named);
    const described=(e.getAttribute("aria-describedby")||"").split(/\s+/)
      .map(id=>asText(document.getElementById(id))).filter(Boolean);
    t.push(nearbyLabel(e).replace(/\s*\*\s*$/,"").trim(),
      rowLabel(e).replace(/\s*\*\s*$/,"").trim(),e.getAttribute("aria-label")||"",
      ...described,e.getAttribute("title")||"",e.name||"",e.id||"",
      e.getAttribute("data-automation-id")||"",e.getAttribute("data-testid")||"");
    if(!t.some(Boolean))t.push(asText(e.closest("fieldset")?.querySelector("legend")));
    if(!t.some(Boolean)){
      const hint=e.getAttribute("placeholder")||"";
      if(!/@|https?:|www\.|^\+?\d[\d\s()+.-]{5,}$/i.test(hint))t.push(hint);
    }
    if(!t.some(Boolean))t.push(e.getAttribute("autocomplete")||"");
    return [...new Set(t.filter(Boolean))].join(" | ").slice(0,500);
  };
  const context=e=>asText(e.closest("fieldset,section,[role=group]")?.querySelector("legend,h2,h3,h4,[role=heading]")).slice(0,240);
  const question=e=>asText(e.closest("fieldset")?.querySelector("legend"))||
    e.closest('[role="radiogroup"]')?.getAttribute("aria-label")||
    asText(e.parentElement?.parentElement).slice(0,250);
  const placeholder=o=>!o||!String(o.value||"").trim()||
    /^(select|choose|please select|please choose|pick one|none selected)\b/i.test(asText(o));
  const fields=[],seenRadio=new Set();
  let i=1+Math.max(-1,...[...document.querySelectorAll("[data-garamaal-autofill-id]")]
    .map(x=>Number((x.getAttribute("data-garamaal-autofill-id")||"").match(/^gm-autofill-(\d+)$/)?.[1]))
    .filter(Number.isInteger));
  for(const e of document.querySelectorAll("input,textarea,select")){
    if(fields.length>=160)break;
    if(!visible(e)||e.disabled||e.readOnly)continue;
    const type=e.tagName==="TEXTAREA"?"textarea":e.tagName==="SELECT"?"select":e.type||"text";
    if(["hidden","password","file","checkbox","submit","button","reset"].includes(type))continue;
    const previous=e.getAttribute("data-garamaal-autofill-id")||"";
    const id=/^gm-autofill-\d+$/.test(previous)?previous:"gm-autofill-"+i++;
    if(type==="radio"){
      const fs=e.closest("fieldset"),name=e.name;
      const group=[...document.querySelectorAll('input[type="radio"]')].filter(x=>
        x.form===e.form&&(name?x.name===name:(fs?x.closest("fieldset")===fs:x===e)));
      const key=group[0]||e;if(seenRadio.has(key))continue;seenRadio.add(key);
      const usable=group.filter(x=>visible(x)&&!x.disabled);if(!usable.length)continue;
      for(const x of usable)x.setAttribute("data-garamaal-autofill-id",id);
      fields.push({id,type,label:question(e)+" | "+(name||""),
        hasValue:group.some(x=>x.checked),context:context(e),options:usable.map(x=>({
          label:asText(x.labels?.[0])||x.getAttribute("aria-label")||x.value,value:x.value,disabled:x.disabled}))});
      continue;
    }
    e.setAttribute("data-garamaal-autofill-id",id);
    fields.push({id,type,label:labels(e),context:context(e),
      required:!!e.required||e.getAttribute("aria-required")==="true"||
        /\*/.test(nearbyLabel(e))||/\*/.test(rowLabel(e))||
        [...(e.labels||[])].some(x=>/\*/.test(asText(x))),
      autocomplete:e.getAttribute("autocomplete")||"",hasValue:type==="select"?
      !placeholder(e.selectedOptions?.[0]):!!String(e.value||"").trim(),
      options:type==="select"?[...e.options].map(o=>({label:asText(o),value:o.value,disabled:o.disabled})):[]});
  }
  const companyName=document.querySelector('meta[property="job:company"]')?.content||
    document.querySelector("[data-company-name]")?.getAttribute("data-company-name")||"";
  const title=document.querySelector('meta[property="job:title"]')?.content||
    asText(document.querySelector("h1")).slice(0,160);
  const location=asText(document.querySelector("[data-job-location], [class*=job-location]")).slice(0,120);
  const description=asText(document.querySelector("[data-job-description], [class*=job-description], article")).slice(0,2500);
  const unsupported={
    customDropdowns:document.querySelectorAll("[role=combobox]").length,
    checkboxes:document.querySelectorAll("input[type=checkbox]").length,
    fileInputs:document.querySelectorAll("input[type=file]").length
  };
  return {fields,job:{companyName,title,location,description},unsupported};
}
async function fillSingleRequiredChoices(tabId){
  const filled=[];
  for(let pass=0;pass<12;pass++){
    const [scan]=await chrome.scripting.executeScript({target:{tabId},func:scanForm});
    const candidate=(scan.result?.fields||[]).map(GaramaalMatcher.singleRequiredChoice)
      .find(Boolean);
    if(!candidate)break;
    const [written]=await chrome.scripting.executeScript({target:{tabId},func:fillForm,
      args:[[{id:candidate.id,value:candidate.value,fieldType:candidate.fieldType}]]});
    if(!written.result?.[0])break;
    filled.push(candidate);
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  return filled;
}
// This function only sets supported controls. It never clicks, submits or navigates.
function fillForm(items){
  const placeholder=o=>!o||!String(o.value||"").trim()||
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
        target.dispatchEvent(new Event("change",{bubbles:true}));results.push(target.checked);
      }else if(item.fieldType==="select"){
        const el=group[0];
        if(el.tagName!=="SELECT"||el.disabled||!placeholder(el.selectedOptions?.[0])||
          ![...el.options].some(o=>o.value===item.value&&!o.disabled)){results.push(false);continue;}
        const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;
        if(setter)setter.call(el,item.value);else el.value=item.value;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));results.push(el.value===item.value);
      }else{
        const el=group[0];
        if(!["INPUT","TEXTAREA"].includes(el.tagName)||el.disabled||el.readOnly||
          !["text","email","tel","url","search","textarea","number","date"].includes(item.fieldType)||
          (el.tagName==="INPUT"&&el.type!==item.fieldType)||
          String(el.value||"").trim()){results.push(false);continue;}
        const proto=el.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
        const v=String(item.value).slice(0,500);
        if(setter)setter.call(el,v);else el.value=v;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));results.push(el.value===v);
      }
    }catch(_){results.push(false);}
  }
  return results;
}
function locateField(id){
  if(!/^gm-autofill-\d+$/.test(id))return false;
  const field=[...document.querySelectorAll("[data-garamaal-autofill-id]")]
    .find(e=>e.getAttribute("data-garamaal-autofill-id")===id);
  if(!field)return false;
  field.scrollIntoView({block:"center",behavior:"smooth"});
  const prior=field.style.outline,offset=field.style.outlineOffset;
  field.style.outline="3px solid #176750";
  field.style.outlineOffset="3px";
  setTimeout(()=>{field.style.outline=prior;field.style.outlineOffset=offset;},2500);
  return true;
}
function showResults(pending,results,tabId){
  pending.forEach((p,i)=>{
    if(!results[i])return;
    const row=document.createElement("div");row.className="row";
    const body=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=(p.label||"").split(" | ")[0]||"Application question";
    const value=document.createElement("div");value.className="answer";
    value.textContent=String(p.displayValue||p.value||"");
    const where=document.createElement("div");where.className="where";
    where.textContent=p.context?"Section: "+p.context:"On the current application page";
    body.append(title,value,where);
    const find=document.createElement("button");find.type="button";
    find.textContent="Show";
    find.addEventListener?.("click",async()=>{
      try{
        const [current]=await chrome.tabs.query({active:true,currentWindow:true});
        if(current?.id!==tabId)throw Error("Return to the application tab first");
        const [located]=await chrome.scripting.executeScript({target:{tabId},func:locateField,
          args:[p.id]});
        if(!located.result)throw Error("This field is no longer on the page");
      }catch(e){status(e.message);}
    });
    row.append(body,find);review.append(row);
  });
}
function clickNext(){
  const safe=/^(next|next page|next step|continue|save and continue|save & continue)$/i;
  const visible=e=>e.getClientRects().length>0&&
    getComputedStyle(e).visibility!=="hidden"&&getComputedStyle(e).display!=="none";
  const label=e=>String(e.getAttribute("aria-label")||
    (e.tagName==="INPUT"?e.value:e.innerText||e.textContent)||"")
    .trim().replace(/\s+/g," ");
  const candidates=[...document.querySelectorAll(
    "button,input[type=button],input[type=submit],a,[role=button]")].filter(e=>{
    if(!visible(e)||e.disabled||e.getAttribute("aria-disabled")==="true")return false;
    if(!safe.test(label(e)))return false;
    if(e.tagName==="A"){
      try{if(new URL(e.href,location.href).origin!==location.origin)return false;}
      catch(_){return false;}
    }
    return true;
  });
  if(candidates.length!==1)return {clicked:false,count:candidates.length};
  const target=candidates[0],name=label(target);
  target.click();
  return {clicked:true,label:name};
}
nextBtn?.addEventListener("click",async()=>{
  nextBtn.disabled=true;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https?:\/\//.test(tab.url||""))
      throw Error("Open an accessible application page first");
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:clickNext});
    if(!result.result?.clicked){
      status(result.result?.count>1?
        "More than one Next or Continue control found. Advance on the page manually.":
        "No clear Next or Continue control found. Advance on the page manually.");
      return;
    }
    review.replaceChildren();
    status("Pressed "+result.result.label+". Check the page for validation errors, then use Fill current page again.");
  }catch(e){status("Next unavailable: "+e.message);}
  finally{nextBtn.disabled=false;}
});
inspectBtn.addEventListener("click",async()=>{
  inspectBtn.disabled=true;review.replaceChildren();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw Error("No active application tab found");
    if(!/^https?:\/\//.test(tab.url||""))throw Error("No access to this job page. Click the Garamaal toolbar icon on this tab or allow Site access in extension Details");
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:scanForm});
    const {fields=[],unsupported={}}=result.result||{};
    for(const field of fields.slice(0,35)){
      const row=document.createElement("div");row.className="row";
      const title=document.createElement("strong");title.textContent=field.label.split(" | ")[0]||"(unlabelled)";
      const detail=document.createElement("small");
      detail.textContent=field.type+(field.options?.length?" · "+field.options.length+" choices":"")+
        (field.hasValue?" · already answered":GaramaalMatcher.eligible(field)?" · eligible":" · manual");
      const body=document.createElement("div");body.append(title,detail);row.append(body);review.append(row);
    }
    status(fields.length+" native fields found; "+(unsupported.customDropdowns||0)+
      " custom dropdowns, "+(unsupported.checkboxes||0)+" checkboxes, "+
      (unsupported.fileInputs||0)+" file uploads. Nothing changed.");
  }catch(e){status("Inspection failed: "+e.message+". If this is a new site, click the Garamaal toolbar icon here and try again.");}
  finally{inspectBtn.disabled=false;}
});
async function askGaramaal(payload){
  try{
    const user=globalThis.firebase?.auth?.()?.currentUser;
    if(!user)return {error:"Sign in to Garamaal in this tab first"};
    const token=await user.getIdToken();
    const headers={"Content-Type":"application/json","Authorization":"Bearer "+token};
    const candidateResponse=await fetch("/api/autofill/candidate",{
      method:"POST",cache:"no-store",headers,body:"{}"});
    const candidateData=await candidateResponse.json();
    if(!candidateResponse.ok)return {error:candidateData.error||"Garamaal autofill is unavailable"};
    const name=candidateData.candidate==="pooja"?"Pooja":
      candidateData.candidate==="abhishek"?"Abhishek":"";
    if(!name)return {error:"No candidate profile is assigned to this account"};
    let profile=null;
    try{
      const raw=localStorage.getItem("gmv3-career-profile-local-v1:"+name);
      if(raw&&raw.length<=90000){
        const saved=JSON.parse(raw);
        if(saved&&typeof saved==="object"&&!Array.isArray(saved)){
          const {equalEmployment,...autofillProfile}=saved;
          profile=autofillProfile;
          if(profile.basics&&typeof profile.basics==="object"){
            profile.basics={...profile.basics};
            delete profile.basics.address;
          }
          if(profile.preferences&&typeof profile.preferences==="object"){
            profile.preferences={...profile.preferences};
            delete profile.preferences.visa;
          }
        }
      }
    }catch(_){}
    const response=await fetch("/api/autofill/answer",{
      method:"POST",cache:"no-store",headers,
      body:JSON.stringify({...payload,profile})});
    const data=await response.json();
    if(!response.ok)return {error:data.error||"Garamaal autofill is unavailable"};
    return data;
  }catch(e){return {error:e.message||"Garamaal autofill failed"};}
}
fillBtn.addEventListener("click",async()=>{
  const source=sourceSelect.value;
  if(source==="demo"&&!profile){status("Import the fictional sample profile first");return;}
  fillBtn.disabled=true;review.replaceChildren();
  try{
    if(source==="garamaal"){
      let granted;
      try{granted=await chrome.permissions.request({origins:["https://garamaal.web.app/*"]});}
      catch(_){throw Error("Reload this extension at chrome://extensions, then allow access to garamaal.web.app");}
      if(!granted)throw Error("Allow Garamaal site access in Chrome to use your signed-in profile");
    }
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw Error("No active application tab found");
    if(!/^https?:\/\//.test(tab.url||""))throw Error("No access to this job page. Click the Garamaal toolbar icon on this tab or allow Site access in extension Details");
    let applied;
    try{applied=await fillSingleRequiredChoices(tab.id);}
    catch(_){throw Error("Cannot access this application tab. Click the Garamaal toolbar icon on this site, then try again");}
    showResults(applied,applied.map(()=>true),tab.id);
    const [scan]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:scanForm});
    const {fields=[],job={}}=scan.result||{};
    let pending=[],note="";
    if(source==="garamaal"){
      const [appTab]=await chrome.tabs.query({url:"https://garamaal.web.app/*"});
      if(!appTab?.id)throw Error("Open and sign in to garamaal.web.app in another tab");
      const eligible=fields.filter(f=>GaramaalMatcher.eligible(f)).slice(0,20);
      if(eligible.length){
        const payload={job,fields:eligible.map(({id,type,label,context,options})=>(
          {id,type,label,context,options}))};
        let reply;
        try{[reply]=await chrome.scripting.executeScript({target:{tabId:appTab.id},
          world:"MAIN",func:askGaramaal,args:[payload]});}
        catch(_){throw Error("Cannot access the Garamaal tab. Reload this extension at chrome://extensions and allow garamaal.web.app site access");}
        if(reply.result?.error)throw Error(reply.result.error);
        pending=(reply.result?.answers||[]).map(a=>{
          const field=eligible.find(f=>f.id===a.fieldId);
          return field&&GaramaalReasoner.validateRemote(field,a);
        }).filter(Boolean);
      }
      note=" Career Profile, then Summary Doc, then Master Evidence Bank as needed.";
    }else{
      const direct=fields.map(f=>GaramaalMatcher.suggest(f,profile)).filter(Boolean);
      const directIds=new Set(direct.map(x=>x.id));
      const unknown=fields.filter(f=>!directIds.has(f.id)&&GaramaalMatcher.eligible(f))
        .map(f=>({...f,facts:GaramaalReasoner.facts(profile,f)}))
        .filter(f=>f.facts.length).slice(0,20);
      let ai=[];
      if(unknown.length){
        try{
          const response=await fetch("http://127.0.0.1:8766/answer",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({job,fields:unknown.map(({id,type,label,context,options,facts})=>(
              {id,type,label,context,options,facts}))})});
          if(!response.ok)throw Error("AI service unavailable");
          const data=await response.json();
          ai=(data.answers||[]).map(a=>{
            const field=unknown.find(f=>f.id===a.fieldId);
            return field&&GaramaalReasoner.validate(field,a,field.facts);
          }).filter(Boolean);
        }catch(_){note=" Local AI unavailable; manual questions left blank.";}
      }
      pending=[...direct,...ai];
    }
    const fieldById=new Map(fields.map(f=>[f.id,f]));
    pending=pending.map(p=>({...p,context:fieldById.get(p.id)?.context||""}));
    const fillable=new Set(fields.filter(f=>GaramaalMatcher.eligible(f)).map(f=>f.id));
    for(const item of pending)fillable.add(item.id);
    if(!pending.length){status(applied.length+"/"+(applied.length+fillable.size)+" eligible fields filled; review the answers and remaining fields."+note);return;}
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});
    if(current?.id!==tab.id)throw Error("Active tab changed; try again");
    const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:fillForm,
      args:[pending.map(({id,value,fieldType})=>({id,value,fieldType}))]});
    const results=r.result||[];showResults(pending,results,tab.id);
    status((applied.length+results.filter(Boolean).length)+"/"+(applied.length+fillable.size)+
      " eligible fields filled. Review the answers, then use Next page."+note);
  }catch(e){status("Autofill failed: "+e.message);}
  finally{fillBtn.disabled=false;}
});
