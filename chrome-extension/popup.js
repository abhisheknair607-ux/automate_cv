"use strict";
const file=document.querySelector("#file");
const statusEl=document.querySelector("#status");
const review=document.querySelector("#review");
const progressEl=document.querySelector("#progress");
const aiProgressEl=document.querySelector("#ai-progress");
const aiProgress=value=>{if(aiProgressEl)aiProgressEl.textContent=value;};
const testingDetails=value=>{const node=document.querySelector("#testing-details");
  if(node)node.textContent=value;};
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
let suggestionContext={tabId:null,candidate:"",job:{},pending:new Map(),accepted:{}};
let lastFrameFieldIndex=new Map();
const frameTarget=(tabId,frameId)=>globalThis.GaramaalFrames?.target(tabId,frameId)||
  (frameId>0?{tabId,frameIds:[frameId]}:{tabId});
const frameLocalId=field=>globalThis.GaramaalFrames?.originalId(field)||field?.localId||field?.id;
const demoAvailable=sourceSelect.options?
  [...sourceSelect.options].some(option=>option.value==="demo"):true;
const status=s=>{statusEl.textContent=s;};
const logError=(action,stage,error)=>{
  if(!chrome.runtime?.sendMessage)return;
  const message=error?.message||String(error);
  try{Promise.resolve(chrome.runtime.sendMessage({type:"gm-log-error",
    entry:{action,stage,message}})).catch(()=>{});}catch(_){}
};
globalThis.gmLogError=logError;
// Set false for a rollout build; the testing controls stay in the codebase.
const TESTING_CONTROLS_ENABLED=true;
const testingRow=document.querySelector("#testing-toggle-row");
const testingTools=document.querySelector("#testing-tools");
const testingSwitch=document.querySelector("#show-testing-tools");
if(testingRow&&testingTools&&testingSwitch){
  testingRow.hidden=!TESTING_CONTROLS_ENABLED;
  testingTools.hidden=true;
  if(TESTING_CONTROLS_ENABLED){
    chrome.storage.local.get(["showTestingTools"],result=>{
      const shown=result.showTestingTools===true;
      testingSwitch.checked=shown;
      testingTools.hidden=!shown;
    });
    testingSwitch.addEventListener("change",()=>{
      testingTools.hidden=!testingSwitch.checked;
      chrome.storage.local.set({showTestingTools:testingSwitch.checked});
    });
  }
}
document.querySelector("#settings-toggle")?.addEventListener("click",()=>{
  const button=document.querySelector("#settings-toggle");
  const panel=document.querySelector("#settings-panel");
  const opened=panel.hidden;
  panel.hidden=!opened;
  document.body.classList.toggle("gm-settings-open",opened);
  button.setAttribute("aria-expanded",String(opened));
  button.setAttribute("aria-label",opened?"Close settings":"Settings");
  button.title=opened?"Close settings":"Settings";
  if(opened&&!document.querySelector("#testing-tools")?.hidden)
    document.querySelector("#refresh-errors")?.click();
});
document.querySelector("#clear-learned-answers")?.addEventListener("click",async()=>{
  const feedback=document.querySelector("#answer-memory-status");
  const candidate=suggestionContext.candidate;
  if(!candidate){if(feedback)feedback.textContent="Fill an application with your profile first to select whose memory to clear.";return;}
  if(!confirm("Clear this candidate's reviewed application answers on this device?"))return;
  try{
    const stored=await new Promise(resolve=>chrome.storage.local.get(
      ["acceptedApplicationAnswers"],value=>resolve(value||{})));
    const all=stored.acceptedApplicationAnswers||{};
    delete all[candidate];
    await chrome.storage.local.set({acceptedApplicationAnswers:all});
    suggestionContext.accepted={};suggestionContext.pending.clear();
    if(feedback)feedback.textContent="Reviewed answers cleared for this candidate. Other candidates unchanged.";
  }catch(e){if(feedback)feedback.textContent="Could not clear saved answers: "+(e.message||String(e));}
});
document.querySelector("#garamaal-sign-in")?.addEventListener("click",async()=>{
  const button=document.querySelector("#garamaal-sign-in");
  const message=document.querySelector("#auth-status");
  button.disabled=true;
  try{
    const tabs=await chrome.tabs.query({url:"https://garamaal.web.app/*"});
    const existing=tabs.find(tab=>tab.id&&!tab.discarded&&!tab.frozen);
    if(existing)await chrome.tabs.update(existing.id,{active:true});
    else await chrome.tabs.create({url:"https://garamaal.web.app/prototype",active:true});
    message.hidden=false;
    message.textContent="Sign in on the Garamaal tab, then return here to fill the application.";
  }catch(error){
    logError("Sign in","opening Garamaal",error);
    message.hidden=false;
    message.textContent="Could not open Garamaal: "+(error.message||String(error));
  }finally{button.disabled=false;}
});
document.querySelector("#refresh-errors")?.addEventListener("click",async()=>{
  const list=document.querySelector("#error-log");
  if(!list)return;
  try{
    const response=await chrome.runtime.sendMessage({type:"gm-get-errors"});
    list.replaceChildren();
    const errors=response?.errors||[];
    if(!errors.length){list.textContent="No recent errors.";return;}
    for(const entry of [...errors].reverse()){
      const row=document.createElement("li");
      row.textContent=(entry.time||"")+" | "+(entry.action||"Extension")+
        (entry.stage?" / "+entry.stage:"")+": "+(entry.message||"Unknown error");
      list.append(row);
    }
  }catch(_){list.textContent="Could not read recent errors.";}
});

chrome.storage.local.get(["demoProfile","source"],r=>{
  sourceSelect.value=!demoAvailable||r.source==="garamaal"?"garamaal":"demo";
  updateSource();
  if(demoAvailable&&r.demoProfile){profile=r.demoProfile;
    const label=document.querySelector("#profileLabel");
    if(label)label.textContent=profile.basics?.fullName||"Profile loaded";}
});
sourceSelect.addEventListener("change",()=>{
  updateSource();
  chrome.storage.local.set({source:sourceSelect.value});
});
file?.addEventListener("change",async()=>{
  try{
    if(!file.files?.[0]||file.files[0].size>200000)throw Error("Profile JSON missing or too large");
    const p=JSON.parse(await file.files[0].text());
    if(!p?.basics||Array.isArray(p))throw Error("Not a Garamaal profile");
    profile=p;await chrome.storage.local.set({demoProfile:p});
    document.querySelector("#profileLabel").textContent=p.basics.fullName||"Profile loaded";
    status("Sample profile imported");
  }catch(e){logError("Import profile","reading sample",e);status(e.message);}
});
// Executed only in the active tab after the user clicks the side-panel button.
function scanForm(){
  const roots=[document];
  // Read every accessible open shadow tree, including nested ones.
  for(let i=0;i<roots.length;i++){
    for(const node of roots[i].querySelectorAll?.("*")||[])
      if(node.shadowRoot)roots.push(node.shadowRoot);
  }
  const all=selector=>roots.flatMap(root=>[...(root.querySelectorAll?.(selector)||[])]);
  const first=selector=>roots.map(root=>root.querySelector?.(selector)).find(Boolean)||null;
  const byId=id=>roots.map(root=>root.getElementById?.(id)).find(Boolean)||null;
  const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden";
  const asText=e=>String(e?.innerText||e?.textContent||"").trim().replace(/\s+/g," ");
  const labelText=e=>{
    if(!e?.cloneNode)return asText(e);
    const copy=e.cloneNode(true);
    copy.querySelectorAll?.("input,select,textarea,[role=combobox]").forEach(x=>x.remove());
    return asText(copy);
  };
  const nearbyLabel=e=>{
    for(let node=e.parentElement,depth=0;node&&depth<4;node=node.parentElement,depth++){
      const controls=node.querySelectorAll?.("input,textarea,select")||[];
      if(controls.length>3)continue;
      const found=[...(node.querySelectorAll?.("label")||[])].filter(label=>
        visible(label)&&!label.contains(e));
      if(found.length!==1)continue;
      const value=labelText(found[0]);
      if(value&&value.length<=100)return value;
    }
    return "";
  };
  const dateGroupLabel=e=>{
    for(let node=e.parentElement,depth=0;node&&depth<4;node=node.parentElement,depth++){
      const controls=[...(node.querySelectorAll?.("input,select")||[])];
      if(controls.length!==3||!controls.includes(e))continue;
      const heading=node.matches?.("label,legend")?node:node.querySelector?.("label,legend");
      const value=labelText(heading);
      if(/(?:start|end|graduation|completion)\s+date/i.test(value)&&
        /month\s*[/,]\s*day\s*[/,]\s*year/i.test(value))return value;
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
    const jobAdderName=String(e.name||"");
    if(/^CandidatePhone\.FormattedNumber$/i.test(jobAdderName))return "Phone";
    if(/^CandidateMobile\.FormattedNumber$/i.test(jobAdderName))return "Mobile";
    const formField=e.closest?.('[data-automation-id^="formField-"]');
    const workdayLabel=formField?.querySelector?.('[id^="rich-label"],[id^="label-"],[data-automation-id="formLabel"],label');
    const t=[dateGroupLabel(e),labelText(workdayLabel)];
    if(e.getAttribute("role")==="combobox"||e.getAttribute("aria-haspopup")==="listbox")
      t.push(labelText(e.closest?.("fieldset")?.querySelector?.("legend")));
    if(e.labels)t.push(...[...e.labels].map(labelText));
    const named=(e.getAttribute("aria-labelledby")||"").split(/\s+/)
      .map(id=>asText(byId(id))).filter(Boolean);
    t.push(...named);
    const described=(e.getAttribute("aria-describedby")||"").split(/\s+/)
      .map(id=>asText(byId(id))).filter(Boolean);
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
  const context=e=>{
    const direct=asText(e.closest("fieldset,section,[role=group]")?.querySelector("legend,h2,h3,h4,[role=heading]"));
    if(direct)return direct.slice(0,240);
    const group=e.closest("[class*=experience],[class*=education],[class*=section],[class*=panel]");
    return asText(group?.querySelector("h2,h3,h4,legend,[role=heading]")).slice(0,240);
  };
  const section=e=>{
    const direct=context(e);if(direct)return direct;
    const container=e.closest("[class*=section],[class*=experience],[class*=education],[role=form]");
    return asText(container?.querySelector("h2,h3,h4,legend,[role=heading]")).slice(0,120)||"Application details";
  };
  const question=e=>{
    const group=e.closest?.('[role="radiogroup"],fieldset')||e;
    const heading=asText(group.querySelector?.('legend,[data-testid*="question"],[class*="question-label"],h3,h4'));
    const named=(group.getAttribute?.("aria-labelledby")||"").split(/\s+/)
      .map(id=>asText(byId(id))).filter(Boolean).join(" ");
    if(heading||named||group.getAttribute?.("aria-label"))
      return (heading||named||group.getAttribute("aria-label")).slice(0,250);
    for(let node=e.parentElement,depth=0;node&&depth<4;node=node.parentElement,depth++){
      const siblings=[...(node.querySelectorAll?.('input[type="radio"],[role="radio"]')||[])];
      if(siblings.length<2||siblings.length>12)continue;
      const labels=[...(node.querySelectorAll?.('label,[data-testid*="question"],[class*="question-label"],h3,h4')||[])]
        .filter(x=>visible(x)&&!x.querySelector?.('input[type="radio"],[role="radio"]'));
      const result=asText(labels[0]);if(result&&result.length<250)return result;
    }
    return "";
  };
  const placeholder=o=>!o||!String(o.value||"").trim()||
    /^(select|choose|please select|please choose|pick one|none selected)\b/i.test(asText(o));
  const datePart=e=>{
    const identity=[e.name,e.id,e.getAttribute("aria-label")].filter(Boolean).join(" ");
    const named=identity.match(/(?:^|[^a-z])(month|day|year)(?:$|[^a-z])/i);
    if(named)return named[1].toLowerCase();
    const suffix=identity.match(/(month|day|year)$/i);
    if(suffix)return suffix[1].toLowerCase();
    for(let node=e.parentElement,depth=0;node&&depth<4;node=node.parentElement,depth++){
      const controls=[...(node.querySelectorAll?.("input,select")||[])];
      if(controls.length!==3||!controls.includes(e))continue;
      const heading=asText(node.querySelector?.("label,legend"));
      if(/(?:start|end|graduation|completion)\s+date/i.test(heading)&&
        /month\s*[/,]\s*day\s*[/,]\s*year/i.test(heading)){
        return ["month","day","year"][controls.indexOf(e)];
      }
    }
    return "";
  };
  const dateFormat=e=>{
    const hint=[e.getAttribute("placeholder"),e.getAttribute("aria-placeholder"),
      e.getAttribute("data-date-format")].filter(Boolean).join(" ").toUpperCase();
    if(/DD\s*\/\s*MM\s*\/\s*YYYY/.test(hint))return "DD/MM/YYYY";
    if(/MM\s*[\/\-]\s*YYYY/.test(hint))return "MM/YYYY";
    if(/YYYY\s*[\/\-]\s*MM/.test(hint))return "YYYY-MM";
    return "";
  };
  const fields=[],seenRadio=new Set(),usedIds=new Set();
  let i=1+Math.max(-1,...[...all("[data-garamaal-autofill-id]")]
    .map(x=>Number((x.getAttribute("data-garamaal-autofill-id")||"").match(/^gm-autofill-(\d+)$/)?.[1]))
    .filter(Number.isInteger));
  const uniqueId=e=>{
    const previous=e.getAttribute("data-garamaal-autofill-id")||"";
    const id=/^gm-autofill-\d+$/.test(previous)&&!usedIds.has(previous)?
      previous:"gm-autofill-"+i++;
    usedIds.add(id);e.setAttribute("data-garamaal-autofill-id",id);
    return id;
  };
  for(const e of all("input,textarea,select")){
    if(fields.length>=500)break;
    if(!visible(e)||e.disabled||e.readOnly)continue;
    if(e.closest?.('button[aria-haspopup="listbox"]')||e.getAttribute("role")==="combobox")continue;
    if(typeof location!=="undefined"&&location.hostname==="apply.jobadder.com"&&
      /^s2id_autogen\d+$/i.test(e.id||""))continue;
    const type=e.tagName==="TEXTAREA"?"textarea":e.tagName==="SELECT"?"select":e.type||"text";
    if(["hidden","password","file","submit","button","reset"].includes(type))continue;
    if(type==="radio"){
      const fs=e.closest("fieldset"),name=e.name;
      const group=[...all('input[type="radio"]')].filter(x=>
        x.form===e.form&&(name?x.name===name:(fs?x.closest("fieldset")===fs:x===e)));
      const key=group[0]||e;if(seenRadio.has(key))continue;seenRadio.add(key);
      const usable=group.filter(x=>!x.disabled&&
        (visible(x)||[...(x.labels||[])].some(label=>visible(label))));
      if(!usable.length)continue;
      const id=uniqueId(e);
      for(const x of usable)x.setAttribute("data-garamaal-autofill-id",id);
      fields.push({id,type,label:(question(e)||labels(e)||name||"Radio question")+
        (name?" | "+name:""),
        required:usable.some(x=>x.required||x.getAttribute("aria-required")==="true")||
          /\*/.test(question(e)),
        hasValue:group.some(x=>x.checked),context:context(e),section:section(e),options:usable.map(x=>({
          label:labelText(x.labels?.[0])||x.getAttribute("aria-label")||x.value,
          value:x.value,disabled:x.disabled}))});
      continue;
    }
    const id=uniqueId(e);
    const smartCity=typeof location!=="undefined"&&
      /(?:^|\.)smartrecruiters\.com$/i.test(location.hostname)&&
      ["text","search"].includes(type)&&/^(?:city|place of residence|residence city)$/i.test(
        (labels(e).split("|")[0]||"").replace(/\*/g,"").trim())&&
      !!e.closest('form,[role="form"]')&&
      (e.getAttribute("role")==="combobox"||
        !!e.closest('div')?.querySelector('button[aria-label*="search" i],button[title*="search" i],button svg'));
    const fieldType=smartCity?"customSelect":type==="select"&&e.multiple?"multiSelect":type;
    const limit=Number(e.getAttribute("maxlength"));
    fields.push({id,type:fieldType,controlKind:smartCity?"smartCity":
      fieldType==="multiSelect"?"nativeMulti":"",
      label:labels(e),context:context(e),section:section(e),
      maxLength:Number.isInteger(limit)&&limit>0?limit:0,datePart:datePart(e),
      dateFormat:dateFormat(e),inputHint:String(e.getAttribute("placeholder")||"").slice(0,80),
      required:!!e.required||e.getAttribute("aria-required")==="true"||
        /\*/.test(nearbyLabel(e))||/\*/.test(rowLabel(e))||
        [...(e.labels||[])].some(x=>/\*/.test(asText(x))),
      autocomplete:e.getAttribute("autocomplete")||"",
      invalid:e.getAttribute("aria-invalid")==="true"||e.validity?.valid===false,
      hasValue:fieldType==="multiSelect"?
      [...(e.selectedOptions||[])].some(o=>!placeholder(o)):type==="select"?
      !placeholder(e.selectedOptions?.[0]):type==="checkbox"?!!e.checked:
      dateFormat(e)==="MM/YYYY"?!/^(0[1-9]|1[0-2])\/\d{4}$/.test(e.value||"")?false:
        e.getAttribute("aria-invalid")!=="true"&&e.validity?.valid!==false:
      dateFormat(e)==="YYYY-MM"?!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.value||"")?false:
        e.getAttribute("aria-invalid")!=="true"&&e.validity?.valid!==false:
      !!String(e.value||"").trim()&&e.getAttribute("aria-invalid")!=="true"&&
        e.validity?.valid!==false,
      options:type==="select"?[...e.options].map(o=>({label:asText(o),value:o.value,disabled:o.disabled})):
        type==="checkbox"?[{label:"Checked",value:"true",disabled:false}]:[]});
  }
  // Custom accessibility radio/checkbox controls are common in employer forms.
  // Treat the whole radiogroup as one question, not one field per option.
  for(const group of all('[role="radiogroup"]')){
    if(fields.length>=500)break;
    if(!visible(group)||group.getAttribute("aria-disabled")==="true"||
      group.querySelector?.('input[type="radio"]'))continue;
    const options=[...(group.querySelectorAll?.('[role="radio"]')||[])].filter(x=>
      visible(x)&&x.getAttribute("aria-disabled")!=="true");
    if(!options.length)continue;
    const label=labels(group)||question(group)||"Radio question";
    const id=uniqueId(group);
    for(const e of options)e.setAttribute("data-garamaal-autofill-id",id);
    fields.push({id,type:"radio",controlKind:"ariaRadio",label,
      section:section(group),context:context(group),
      required:group.getAttribute("aria-required")==="true"||/\*/.test(label),
      hasValue:options.some(e=>e.getAttribute("aria-checked")==="true"),
      options:options.map(e=>{
        const value=String(e.getAttribute("aria-label")||asText(e)||"").trim();
        return {label:value,value,disabled:false};
      }).filter(e=>e.value)});
  }
  for(const e of all('[role="checkbox"]')){
    if(fields.length>=500)break;
    if(!visible(e)||e.getAttribute("aria-disabled")==="true"||
      e.tagName==="INPUT"||e.querySelector?.('input[type="checkbox"]'))continue;
    const id=uniqueId(e),label=labels(e)||question(e)||"Checkbox";
    fields.push({id,type:"checkbox",controlKind:"ariaCheckbox",label,
      section:section(e),context:context(e),
      required:e.getAttribute("aria-required")==="true"||/\*/.test(label),
      hasValue:e.getAttribute("aria-checked")==="true",
      options:[{label:"Checked",value:"true",disabled:false}]});
  }
  for(const e of all("[contenteditable=true]")){
    if(fields.length>=500)break;
    if(!visible(e)||e.getAttribute("role")==="combobox")continue;
    const id=uniqueId(e);
    const limit=Number(e.getAttribute("aria-maxlength")||e.getAttribute("maxlength"));
    fields.push({id,type:"textarea",label:labels(e),context:context(e),
      maxLength:Number.isInteger(limit)&&limit>0?limit:0,
      section:section(e),required:e.getAttribute("aria-required")==="true",
      hasValue:!!asText(e),options:[]});
  }
  for(const e of all("[role=combobox]")){
    if(fields.length>=500)break;
    if(!visible(e)||e.disabled||e.getAttribute("aria-disabled")==="true")continue;
    const list=byId(e.getAttribute("aria-controls")||e.getAttribute("aria-owns")||"");
    const multi=e.getAttribute("aria-multiselectable")==="true"||
      list?.getAttribute("aria-multiselectable")==="true";
    const options=list?.getAttribute("role")==="listbox"?
      [...list.querySelectorAll('[role="option"]')].slice(0,100)
      .map(o=>({label:asText(o),value:asText(o),disabled:o.getAttribute("aria-disabled")==="true"}))
      .filter(o=>o.value):[];
    const id=uniqueId(e);
    const shown=String(e.getAttribute("aria-valuetext")||e.value||asText(e)||"").trim();
    const smartLocation=typeof location!=="undefined"&&
      /(?:^|\.)smartrecruiters\.com$/i.test(location.hostname)&&
      e.tagName==="INPUT"&&/^(?:city|place of residence|residence city)$/i.test(
        String(labels(e).split("|")[0]).replace(/\*/g,"").trim());
    fields.push({id,type:multi?"multiSelect":"customSelect",
      controlKind:multi?"ariaMulti":smartLocation?"smartCity":"ariaCombobox",
      label:labels(e),context:context(e),section:section(e),
      required:e.getAttribute("aria-required")==="true"||/\*/.test(labels(e)),
      hasValue:multi?!!list?.querySelector?.('[role="option"][aria-selected="true"],[role="option"][aria-checked="true"]'):
        !!shown&&!/^(select(?: one| an? option| a value)?|choose(?: one| an? option)?|please select(?: one| an? option)?|please choose(?: one)?|pick one|none selected)$/i.test(shown),
      options});
  }
  // A standalone accessible multi-select listbox is a single logical question.
  for(const list of all('[role="listbox"][aria-multiselectable="true"]')){
    if(fields.length>=500)break;
    if(!visible(list)||list.getAttribute("aria-disabled")==="true")continue;
    if(all('[role="combobox"]').some(c=>
      [c.getAttribute("aria-controls"),c.getAttribute("aria-owns")].includes(list.id)&&list.id))continue;
    const options=[...(list.querySelectorAll?.('[role="option"]')||[])].slice(0,100)
      .filter(x=>x.getAttribute("aria-disabled")!=="true").map(x=>({
        label:asText(x),value:asText(x),disabled:false})).filter(x=>x.value);
    if(!options.length)continue;
    const id=uniqueId(list);
    fields.push({id,type:"multiSelect",controlKind:"ariaMulti",label:labels(list)||question(list),
      context:context(list),section:section(list),required:list.getAttribute("aria-required")==="true",
      hasValue:!!list.querySelector?.('[role="option"][aria-selected="true"],[role="option"][aria-checked="true"]'),options});
  }
  // Workday renders application choices as listbox buttons inside formField blocks.
  for(const e of all('button[aria-haspopup="listbox"]')){
    if(fields.length>=500)break;
    if(!visible(e)||e.disabled||
      fields.some(f=>f.id===e.getAttribute("data-garamaal-autofill-id")))continue;
    const formField=e.closest?.('[data-automation-id^="formField-"]');
    const fieldset=e.closest?.("fieldset");
    const generic=e.closest?.('form,[role="form"]');
    if(!formField&&!fieldset&&!generic)continue;
    const labelNode=formField?.querySelector?.('[id^="rich-label"],[id^="label-"],[data-automation-id="formLabel"]')||
      fieldset?.querySelector?.("legend");
    const questionLabel=labelText(labelNode)||labelText(fieldset?.querySelector?.("legend"))||
      nearbyLabel(e)||labels(e).split(" | ")[0];
    if(!questionLabel||/^(select one|select an option)$/i.test(questionLabel))continue;
    const shown=asText(e);
    const id=uniqueId(e);
    fields.push({id,type:"customSelect",controlKind:formField?"workdaySelect":"ariaMenu",
      label:questionLabel,context:context(e),section:section(e),
      required:/\*/.test(questionLabel)||e.getAttribute("aria-required")==="true",
      hasValue:!!shown&&!/^(select one|select an option|choose one|please select)$/i.test(shown),
      options:[]});
  }
  let companyName=first('meta[property="job:company"]')?.content||
    first("[data-company-name]")?.getAttribute("data-company-name")||"";
  let title=first('meta[property="job:title"]')?.content||
    asText(first("h1")).slice(0,160);
  if(typeof location!=="undefined"&&/\.myworkdayjobs\.com$/i.test(location.hostname)){
    const path=decodeURIComponent(location.pathname);
    if(!companyName){const match=path.match(/^\/[^/]+\/([^/]+)\/job\//i);
      if(match)companyName=match[1].replace(/[-_]+/g," ").slice(0,160);}
    if(!title||/^(?:application questions|apply|job application)$/i.test(title)){
      const match=path.match(/\/job\/[^/]+\/([^/]+)\/apply\//i);
      if(match)title=match[1].replace(/_\d+$/," ").replace(/[-_]+/g," ").trim().slice(0,160);
    }
  }
  let jobLocation=asText(first("[data-job-location], [class*=job-location]")).slice(0,120);
  if(!jobLocation&&typeof location!=="undefined"&&/\.myworkdayjobs\.com$/i.test(location.hostname)){
    const match=decodeURIComponent(location.pathname).match(/\/job\/([^/]+)\//i);
    if(match)jobLocation=match[1].replace(/[-_]+/g," ").slice(0,120);
  }
  const description=asText(first("[data-job-description], [class*=job-description], article")).slice(0,2500);
  const extras=[];
  for(const e of all("input[type=file],[role=combobox]")){
    if(!visible(e)||e.disabled)continue;
    const type=e.getAttribute("role")==="combobox"?"customDropdown":e.type;
    if(type==="customDropdown"&&(["INPUT","SELECT"].includes(e.tagName)||
      e.getAttribute("data-garamaal-autofill-id")))continue;
    const label=labels(e)||question(e)||type;
    const chosen=type==="file"?!!e.files?.length:
      !!String(e.getAttribute("aria-valuetext")||"").trim();
    extras.push({type,label,section:section(e),required:!!e.required||
      e.getAttribute("aria-required")==="true"||/\*/.test(label),
      hasValue:chosen,reason:type==="file"?"Upload manually":"Custom menu needs review"});
  }
  const sfPrivacy=typeof location!=="undefined"&&/successfactors\.(?:eu|com)$/i.test(location.hostname)&&
    all("a,button,[role=link]").some(e=>visible(e)&&
      /read and accept the data privacy statement/i.test(asText(e)));
  const unsupported={
    privacyConsentDialog:sfPrivacy,
    customDropdowns:extras.filter(x=>x.type==="customDropdown").length,
    checkboxes:all("input[type=checkbox]").length,
    fileInputs:all("input[type=file]").length
  };
  // SmartRecruiters initially renders empty Experience/Education sections with
  // only a "+ Add" control. Tag each *visible* record after expansion, without
  // reassigning a different record to the same saved employer or school.
  let repeatAvailable={work:false,education:false};
  if(typeof location!=="undefined"&&/(?:^|\.)smartrecruiters\.com$/i.test(location.hostname)){
    const headings=all('h2,h3,h4,[role="heading"]');
    const regions=[
      {kind:"work",re:/^(?:experience|work experience|employment history)$/i},
      {kind:"education",re:/^(?:education|education history)$/i}];
    for(const region of regions){
      const heading=headings.find(h=>region.re.test(asText(h)));if(!heading)continue;
      let root=heading.closest?.('section,article')||heading.parentElement?.parentElement;
      // Never use a whole form as the section boundary: it contains unrelated
      // fields and the other Add button.
      if(!root||root.tagName==="FORM"||
        headings.some(h=>h!==heading&&root.contains(h)&&
          /^(?:experience|work experience|employment history|education|education history)$/i.test(asText(h))))
        continue;
      const inRegion=fields.filter(f=>{
        const e=all('[data-garamaal-autofill-id]').find(x=>
          x.getAttribute('data-garamaal-autofill-id')===f.id);
        return !!e&&root.contains(e);
      });
      const buttons=[...(root.querySelectorAll?.('button,input[type="button"]')||[])]
        .filter(x=>/^(?:\+\s*)?add$/i.test(asText(x)||x.value||"")&&!x.disabled&&
          x.getAttribute("aria-disabled")!=="true");
      repeatAvailable[region.kind]=buttons.length===1&&
        !(buttons[0].tagName==="BUTTON"&&buttons[0].type==="submit");
      const records=[],recordKeys=new Map();let index=0,previousFirst=false;
      for(const f of inRegion){
        const el=all('[data-garamaal-autofill-id]').find(x=>
          x.getAttribute('data-garamaal-autofill-id')===f.id);
        if(!el)continue;
        const record=el.closest?.('[data-record-index],[data-testid*="experience-entry"],'+
          '[data-testid*="education-entry"],[class*="experience-entry"],'+
          '[class*="education-entry"],[class*="experience-item"],'+
          '[class*="education-item"],fieldset');
        if(record&&record!==root&&!record.contains(heading)){
          if(!recordKeys.has(record))recordKeys.set(record,recordKeys.size+1);
          index=recordKeys.get(record);
        }else{
          const name=String(f.label||"").split('|')[0].toLowerCase().trim();
          const first=region.kind==="work"?/^(job title|job position|position|employer|company)\b/.test(name):
            /^(school|university|institution|college)\b/.test(name);
          if(index===0)index=1;
          else if(first&&previousFirst)index++;
          previousFirst=previousFirst||first;
        }
        f.context=(region.kind==="work"?"Work Experience (":"Education (")+index+")";
        f.section=f.context;
        records.push(index);
      }
    }
  }
  // Avature repeats unnumbered Work Experience and Education History blocks.
  // Number them from DOM order so every block maps to its own saved profile record.
  if(typeof location!=="undefined"&&/\.avature\.net$/i.test(location.hostname)){
    const nodes=new Map([...all("[data-garamaal-autofill-id]")]
      .map(e=>[e.getAttribute("data-garamaal-autofill-id"),e]));
    fields.sort((a,b)=>{
      const x=nodes.get(a.id),y=nodes.get(b.id);
      if(!x||!y||x===y)return 0;
      return x.compareDocumentPosition(y)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1;
    });
    let phase="",work=0,education=0,companies=0,universities=0;
    for(const field of fields){
      const label=String(field.label||"").split("|")[0].toLowerCase()
        .replace(/[^a-z0-9]+/g," ").trim();
      if(label==="current position"){phase="work";work++;}
      else if(label==="type of degree"){phase="education";education++;}
      else if(label==="language"){phase="";continue;}
      if(phase==="work"){
        if(label==="company"){if(companies>=work)work++;companies++;}
        if(work>0){field.context="Work Experience ("+work+")";field.section=field.context;}
      }else if(phase==="education"){
        if(label==="university"){if(universities>=education)education++;universities++;}
        if(education>0){field.context="Education ("+education+")";field.section=field.context;}
      }
    }
  }
  const totalAccessibleControls=all("input,textarea,select,[contenteditable=true],[role=combobox],button[aria-haspopup=listbox]").length;
  const frames=all("iframe,frame").filter(visible);
  const embeddedFrames=frames.length;
  // Only sanitized origins; never return frame URLs or query parameters.
  const frameOrigins=[...new Set(frames.map(e=>{
    try{const src=e.getAttribute("src");
      if(!src)return "";
      const url=new URL(src,typeof location!=="undefined"?location.href:undefined);
      return url.protocol==="https:"?url.origin:"";
    }catch(_){return "";}
  }).filter(Boolean))];
  const truncated=fields.length>=500;
  return {fields,extras,job:{companyName,title,location:jobLocation,description},unsupported,
    scanLimit:500,truncated,embeddedFrames,frameOrigins,openShadowRoots:roots.length-1,
    repeatAvailable,totalAccessibleControls};
}
// Scan all accessible permitted frames. Keep frame-local DOM locators separate from
// globally unique IDs used by answer planning, memory, and the connected AI.
async function scanTabForms(tabId){
  let responses;
  try{responses=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:scanForm});}
  catch(_){responses=await chrome.scripting.executeScript({target:{tabId},func:scanForm});}
  const data=globalThis.GaramaalFrames?.merge(responses)||responses[0]?.result||{};
  lastFrameFieldIndex=new Map((data.fields||[]).map(f=>[f.id,f]));
  return data;
}
async function requestEmbeddedFrameAccess(tabId){
  if(!chrome.permissions?.request)return;
  try{
    const [top]=await chrome.scripting.executeScript({target:{tabId},func:scanForm});
    const origins=(top?.result?.frameOrigins||[]).filter(x=>x!=="https://garamaal.web.app");
    if(!origins.length)return;
    const required=[];
    for(const origin of origins){
      const url=origin+"/*";
      if(!chrome.permissions.contains||!(await chrome.permissions.contains({origins:[url]})))required.push(url);
    }
    if(required.length)await chrome.permissions.request({origins:required});
  }catch(_){/* Refused or unsupported frame permission remains visible in coverage. */}
}
// Clicks only one explicit, in-page Add Work/Education control per call.
function clickAddMore(kind){
  if(!["work","education"].includes(kind))return {clicked:false,reason:"kind"};
  const visible=e=>e.getClientRects().length>0&&
    getComputedStyle(e).visibility!=="hidden"&&getComputedStyle(e).display!=="none";
  const label=e=>String(e.getAttribute("aria-label")||
    (e.tagName==="INPUT"?e.value:e.innerText||e.textContent)||"")
    .trim().replace(/[()]/g," ").replace(/\s+/g," ").trim();
  const re=kind==="work"?
    /^add\s+(?:(?:more|another|new)\s+)?(?:(?:work|professional|employment|job)\s*)?(?:experience|history|entry|record)$/i:
    /^add\s+(?:(?:more|another|new)\s+)?(?:education|university|school|qualification)\s*(?:entry|record)?$/i;
  const candidates=[...document.querySelectorAll(
    'button,input[type="button"],a,[role="button"]')].filter(e=>{
    if(!visible(e)||e.disabled||e.getAttribute("aria-disabled")==="true")return false;
    if(e.tagName==="BUTTON"&&e.type==="submit")return false;
    if(!re.test(label(e)))return false;
    if(e.tagName==="A"){
      const href=e.getAttribute("href")||"";
      if(href&&!href.startsWith("#"))return false;
    }
    return true;
  });
  if(!candidates.length&&typeof location!=="undefined"&&
    /\.avature\.net$/i.test(location.hostname)){
    const headings=[...document.querySelectorAll("h1,h2,h3,h4,legend,[role=heading]")]
      .filter(visible);
    const headingText=e=>String(e.innerText||e.textContent||"").trim().replace(/\s+/g," ").toLowerCase();
    const start=headings.find(e=>headingText(e)===(kind==="work"?"work experience":"education history"));
    const end=headings.find(e=>start&&
      headingText(e)===(kind==="work"?"education history":"languages")&&
      (start.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING));
    if(start&&end){
      candidates.push(...[...document.querySelectorAll('button,input[type="button"],a,[role="button"]')]
        .filter(e=>visible(e)&&!e.disabled&&e.getAttribute("aria-disabled")!=="true"&&
          !(e.tagName==="BUTTON"&&e.type==="submit")&&
          /^add another$/i.test(label(e))&&
          (start.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)&&
          (e.compareDocumentPosition(end)&Node.DOCUMENT_POSITION_FOLLOWING)));
    }
  }
  if(!candidates.length&&typeof location!=="undefined"&&
    /(?:^|\.)smartrecruiters\.com$/i.test(location.hostname)){
    const headingRe=kind==="work"?/^(?:experience|work experience|employment history)$/i:
      /^(?:education|education history)$/i;
    const headings=[...document.querySelectorAll('h2,h3,h4,[role="heading"]')]
      .filter(e=>visible(e)&&headingRe.test(label(e)));
    for(const heading of headings){
      // Choose the smallest ancestor containing exactly one safe Add control.
      // Do not click Add from another section or any submit button.
      for(let parent=heading.parentElement,depth=0;parent&&depth<5;parent=parent.parentElement,depth++){
        if(parent.tagName==="FORM"||parent.tagName==="BODY")break;
        const buttons=[...(parent.querySelectorAll?.('button,input[type="button"]')||[])]
          .filter(e=>visible(e)&&!e.disabled&&e.getAttribute("aria-disabled")!=="true"&&
            !(e.tagName==="BUTTON"&&e.type==="submit")&&
            /^(?:\+\s*)?add$/i.test(label(e)));
        if(buttons.length===1){candidates.push(buttons[0]);break;}
      }
    }
  }
  if(candidates.length!==1)return {clicked:false,reason:candidates.length?"ambiguous":"missing"};
  candidates[0].click();
  return {clicked:true,label:label(candidates[0])};
}
async function expandRepeatedSections(tabId,profileCounts){
  if(!globalThis.GaramaalRepeat||!profileCounts)return [];
  const [first]=await chrome.scripting.executeScript({target:{tabId},func:scanForm});
  const plans=GaramaalRepeat.targets(first.result?.fields||[],profileCounts);
  if(first.result?.repeatAvailable){
    const visible=GaramaalRepeat.visibleCounts(first.result.fields||[]);
    for(const kind of ["work","education"]){
      const desired=Math.min(12,Math.max(0,Number(profileCounts?.[kind])||0));
      if(first.result.repeatAvailable[kind]&&desired>visible[kind]&&
        !plans.some(plan=>plan.kind===kind))
        plans.push({kind,from:visible[kind],to:desired});
    }
  }
  const expanded=[];
  expanded.issues=[];
  for(const plan of plans){
    let count=plan.from;
    while(count<plan.to){
      const [current]=await chrome.tabs.query({active:true,currentWindow:true});
      if(current?.id!==tabId)throw Error("Active tab changed; try again");
      const [result]=await chrome.scripting.executeScript({target:{tabId},func:clickAddMore,
        args:[plan.kind]});
      if(!result.result?.clicked){
        expanded.issues.push("Could not find one Add another control for "+
          (plan.kind==="work"?"Work Experience":"Education History")+
          " ("+(result.result?.reason||"unknown")+").");
        break;
      }
      let next=count;
      for(let attempt=0;attempt<4&&next<=count;attempt++){
        await new Promise(resolve=>setTimeout(resolve,200));
        const [scan]=await chrome.scripting.executeScript({target:{tabId},func:scanForm});
        next=GaramaalRepeat.visibleCounts(scan.result?.fields||[])[plan.kind];
      }
      if(next<=count){
        expanded.issues.push("Add another was clicked for "+
          (plan.kind==="work"?"Work Experience":"Education History")+
          ", but a new record did not appear.");
        break;
      }
      expanded.push({kind:plan.kind,index:next});
      count=next;
    }
  }
  return expanded;
}
// This function only sets supported controls. It never clicks, submits or navigates.
function fillForm(items){
  const all=selector=>{
    const roots=[document],items=[];
    for(let i=0;i<roots.length;i++){
      items.push(...(roots[i].querySelectorAll?.(selector)||[]));
      for(const node of roots[i].querySelectorAll?.("*")||[])
        if(node.shadowRoot)roots.push(node.shadowRoot);
    }
    return items;
  };
  const placeholder=o=>!o||!String(o.value||"").trim()||
    /^(select|choose|please select|please choose|pick one|none selected)\b/i.test(String(o.textContent||"").trim());
  const results=[];
  for(const item of items){
    if(!/^gm-autofill-\d+$/.test(item.id)){results.push(false);continue;}
    const group=[...all("[data-garamaal-autofill-id]")].filter(e=>
      e.getAttribute("data-garamaal-autofill-id")===item.id);
    if(!group.length){results.push(false);continue;}
    try{
      if(item.fieldType==="checkbox"){
        const aria=group.find(e=>e.getAttribute("role")==="checkbox");
        if(aria){
          if(item.value!=="true"||aria.getAttribute("aria-disabled")==="true"||
            aria.getAttribute("aria-checked")==="true"){
            results.push(false);continue;
          }
          aria.click();
          results.push(aria.getAttribute("aria-checked")==="true");continue;
        }
        const target=group[0];
        if(target.type!=="checkbox"||target.disabled||target.checked||item.value!=="true"){results.push(false);continue;}
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"checked")?.set;
        if(setter)setter.call(target,true);else target.checked=true;
        target.dispatchEvent(new Event("input",{bubbles:true}));
        target.dispatchEvent(new Event("change",{bubbles:true}));results.push(target.checked);
      }else if(item.fieldType==="radio"){
        const aria=group.filter(x=>x.getAttribute("role")==="radio");
        if(aria.length){
          if(aria.some(x=>x.getAttribute("aria-checked")==="true"&&
            String(x.getAttribute("aria-label")||x.innerText||x.textContent||"").trim()!==
              String(item.previousValue||""))){results.push(false);continue;}
          const target=aria.find(x=>String(x.getAttribute("aria-label")||x.innerText||
            x.textContent||"").trim()===String(item.value)&&
            x.getAttribute("aria-disabled")!=="true");
          if(!target){results.push(false);continue;}
          target.click();
          results.push(target.getAttribute("aria-checked")==="true");continue;
        }
        if(group.some(x=>x.checked&&x.value!==item.previousValue)){
          results.push(false);continue;
        }
        const target=group.find(x=>x.type==="radio"&&x.value===item.value&&!x.disabled);
        if(!target){results.push(false);continue;}
        // React/Angular often ignore a synthetic checked assignment. Use the
        // native user-like interaction, then read the actual checked state.
        const visibleLabel=[...(target.labels||[])].find(x=>x.getClientRects?.().length);
        if(typeof target.click==="function"&&target.getClientRects?.().length){
          target.click();
        }else if(visibleLabel?.click){
          visibleLabel.click();
        }else{
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"checked")?.set;
          if(setter)setter.call(target,true);else target.checked=true;
          target.dispatchEvent(new Event("input",{bubbles:true}));
          target.dispatchEvent(new Event("change",{bubbles:true}));
        }
        results.push(target.checked);
      }else if(item.fieldType==="multiSelect"){
        const el=group[0],values=Array.isArray(item.values)?item.values:[];
        if(el.tagName!=="SELECT"||!el.multiple||el.disabled||!values.length||
          [...el.selectedOptions].some(o=>!placeholder(o))||
          !values.every(v=>[...el.options].some(o=>o.value===v&&!o.disabled))){
          results.push(false);continue;
        }
        const selected=new Set(values);
        for(const option of el.options)option.selected=selected.has(option.value);
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
        results.push(values.every(v=>[...el.selectedOptions].some(o=>o.value===v)));
      }else if(item.fieldType==="select"){
        const el=group[0];
        if(el.tagName!=="SELECT"||el.disabled||
          !(placeholder(el.selectedOptions?.[0])||item.previousValue&&el.value===item.previousValue)||
          ![...el.options].some(o=>o.value===item.value&&!o.disabled)){results.push(false);continue;}
        const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;
        if(setter)setter.call(el,item.value);else el.value=item.value;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));results.push(el.value===item.value);
      }else{
        const el=group[0];
        if(item.fieldType==="textarea"&&el.isContentEditable){
          if(String(el.textContent||"").trim()&&
            String(el.textContent||"").trim()!==String(item.previousValue||"").trim()){
            results.push(false);continue;
          }
          const value=String(item.value).slice(0,4000);
          el.textContent=value;
          el.dispatchEvent(new Event("input",{bubbles:true}));
          el.dispatchEvent(new Event("change",{bubbles:true}));
          results.push(el.textContent===value);continue;
        }
        if(!["INPUT","TEXTAREA"].includes(el.tagName)||el.disabled||el.readOnly||
          !["text","email","tel","url","search","textarea","number","date","month"].includes(item.fieldType)||
          (el.tagName==="INPUT"&&el.type!==item.fieldType)||
          (String(el.value||"").trim()&&
            String(el.value||"").trim()!==String(item.previousValue||"").trim())){
          results.push(false);continue;
        }
        const proto=el.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
        const v=String(item.value).slice(0,4000);
        if(setter)setter.call(el,v);else el.value=v;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
        if(item.dateFormat&&typeof el.blur==="function")el.blur();
        results.push(el.value===v&&el.validity?.valid!==false);
      }
    }catch(_){results.push(false);}
  }
  return results;
}
async function fillCustomMenu(item){
  const all=selector=>{
    const roots=[document],items=[];
    for(let i=0;i<roots.length;i++){
      items.push(...(roots[i].querySelectorAll?.(selector)||[]));
      for(const node of roots[i].querySelectorAll?.("*")||[])
        if(node.shadowRoot)roots.push(node.shadowRoot);
    }
    return items;
  };
  const clean=x=>String(x||"").trim().replace(/\s+/g," ");
  const visible=e=>!!e&&(!e.getClientRects||e.getClientRects().length>0)&&
    e.getAttribute?.("aria-disabled")!=="true"&&!e.disabled&&!e.hidden;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const optionsOf=container=>[...(container?.querySelectorAll?.('[role="option"],[role="menuitemradio"],[data-automation-id="promptOption"]')||[])]
    .filter(visible);
  if(!/^gm-autofill-\d+$/.test(item.id))return false;
  const workday=all('button[aria-haspopup="listbox"][data-garamaal-autofill-id]')
    .find(e=>e.getAttribute("data-garamaal-autofill-id")===item.id);
  const combo=workday||all('input[data-garamaal-autofill-id]')
    .find(e=>e.getAttribute("data-garamaal-autofill-id")===item.id&&
      ["text","search"].includes(e.type))||
    all('[role="combobox"][data-garamaal-autofill-id]')
    .find(e=>e.getAttribute("data-garamaal-autofill-id")===item.id)||
    all('[role="listbox"][data-garamaal-autofill-id]')
      .find(e=>e.getAttribute("data-garamaal-autofill-id")===item.id);
  if(!combo||combo.disabled||combo.getAttribute("aria-disabled")==="true")return false;
  const multi=item.fieldType==="multiSelect";
  const wanted=multi?(Array.isArray(item.values)?item.values:[]):[item.value];
  if(!wanted.length||wanted.some(x=>!clean(x)))return false;
  const display=clean(combo.getAttribute("aria-valuetext")||combo.value||combo.innerText||combo.textContent);
  const placeholder=/^(select|select one|select an option|choose|choose one|please select|pick one|none selected)$/i;
  if(!multi&&display&&!placeholder.test(display)&&display!==clean(item.previousDisplayValue))return false;
  if(multi&&combo.getAttribute("role")==="listbox"&&
    optionsOf(combo).some(o=>o.getAttribute("aria-selected")==="true"||o.getAttribute("aria-checked")==="true"))return false;
  if(combo.getAttribute("role")!=="listbox")combo.click();
  const controlled=()=>{
    const id=combo.getAttribute("aria-controls")||combo.getAttribute("aria-owns")||"";
    if(!id)return null;
    return all('[role="listbox"],[role="menu"]').find(x=>x.id===id)||
      document.getElementById?.(id)||null;
  };
  const popup=()=>{
    const own=controlled();if(own&&visible(own))return own;
    if(combo.getAttribute("role")==="listbox")return combo;
    const lists=all('[role="listbox"]').filter(visible);
    return lists.length===1?lists[0]:null;
  };
  let list=popup();
  for(let attempt=0;attempt<4&&!list;attempt++){
    await wait(100);list=popup();
  }
  // Editable combobox: search for the exact requested value only, and only when
  // no candidate value was already entered. Never commit free text as a choice.
  const findOption=(root,value)=>optionsOf(root).filter(o=>{
    const text=clean(o.innerText||o.textContent);
    const desired=clean(value);
    const country=clean(item.country).toLowerCase();
    return text===desired||item.smartCity&&!!country&&
      text.toLowerCase().startsWith(desired.toLowerCase()+",")&&
      text.toLowerCase().endsWith(", "+country);
  });
  if(!multi&&!workday&&(!list||!findOption(list,wanted[0]).length)&&
      combo.tagName==="INPUT"&&(!combo.value||placeholder.test(clean(combo.value)))){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if(setter)setter.call(combo,wanted[0]);else combo.value=wanted[0];
    combo.dispatchEvent(new Event("input",{bubbles:true}));
    for(let attempt=0;attempt<5;attempt++){
      await wait(120);list=popup();
      if(list&&findOption(list,wanted[0]).length)break;
    }
  }
  if(workday&&!list){
    // Workday may expose portal options with no listbox wrapper. A globally
    // unique visible exact match is required to prevent selecting another menu.
    const loose=all('[data-automation-id="promptOption"]').filter(visible)
      .filter(o=>clean(o.innerText||o.textContent)===clean(wanted[0]));
    if(loose.length!==1)return false;
    loose[0].click();await wait(130);
    return clean(workday.innerText||workday.textContent)===clean(wanted[0]);
  }
  if(!list)return false;
  const listIsMulti=list.getAttribute?.("aria-multiselectable")==="true";
  if(multi&&!listIsMulti)return false;
  if(!multi&&listIsMulti)return false;
  const selected=optionsOf(list).filter(o=>o.getAttribute("aria-selected")==="true"||
    o.getAttribute("aria-checked")==="true");
  if(multi&&selected.length)return false;
  for(const value of wanted){
    let matches=[];
    for(let attempt=0;attempt<5;attempt++){
      const current=popup()||list;
      matches=findOption(current,value);
      if(matches.length)break;
      await wait(100);
    }
    if(matches.length!==1)return false;
    matches[0].click();
    await wait(100);
  }
  if(multi){
    const finalList=popup()||list;
    const choices=optionsOf(finalList).filter(o=>o.getAttribute("aria-selected")==="true"||
      o.getAttribute("aria-checked")==="true").map(o=>clean(o.innerText||o.textContent));
    return wanted.every(w=>choices.includes(clean(w)))&&choices.length===wanted.length;
  }
  const selectedValue=clean(combo.getAttribute("aria-valuetext")||combo.value||combo.innerText||combo.textContent);
  const checked=optionsOf(popup()||list).filter(o=>o.getAttribute("aria-selected")==="true"||
    o.getAttribute("aria-checked")==="true").some(o=>clean(o.innerText||o.textContent)===clean(wanted[0]));
  return checked||selectedValue===clean(wanted[0])||item.smartCity&&
    !!clean(item.country)&&selectedValue.toLowerCase().startsWith(clean(wanted[0]).toLowerCase()+",")&&
    selectedValue.toLowerCase().endsWith(", "+clean(item.country).toLowerCase());
}
function scrollToField(id){
  const all=selector=>{
    const roots=[document],items=[];
    for(let i=0;i<roots.length;i++){
      items.push(...(roots[i].querySelectorAll?.(selector)||[]));
      for(const node of roots[i].querySelectorAll?.("*")||[])
        if(node.shadowRoot)roots.push(node.shadowRoot);
    }
    return items;
  };
  if(!/^gm-autofill-\d+$/.test(id))return false;
  const field=[...all("[data-garamaal-autofill-id]")]
    .find(e=>e.getAttribute("data-garamaal-autofill-id")===id);
  if(!field||!field.getClientRects().length)return false;
  field.scrollIntoView({block:"center",behavior:"auto"});
  const prior=field.style?.outline||"";
  if(field.style)field.style.outline="3px solid #17a978";
  setTimeout(()=>{if(field.style)field.style.outline=prior;},900);
  return true;
}
function verifyField(item){
  const all=selector=>{
    const roots=[document],items=[];
    for(let i=0;i<roots.length;i++){
      items.push(...(roots[i].querySelectorAll?.(selector)||[]));
      for(const node of roots[i].querySelectorAll?.("*")||[])
        if(node.shadowRoot)roots.push(node.shadowRoot);
    }
    return items;
  };
  if(!/^gm-autofill-\d+$/.test(item.id))return false;
  const group=[...all("[data-garamaal-autofill-id]")].filter(e=>
    e.getAttribute("data-garamaal-autofill-id")===item.id);
  if(!group.length)return false;
  if(item.fieldType==="checkbox")return item.value==="true"&&group.some(e=>
    (e.type==="checkbox"&&e.checked)||(e.getAttribute("role")==="checkbox"&&
    e.getAttribute("aria-checked")==="true"));
  if(item.fieldType==="radio")return group.some(e=>
    (e.type==="radio"&&e.checked&&e.value===item.value)||
    (e.getAttribute("role")==="radio"&&e.getAttribute("aria-checked")==="true"&&
      String(e.getAttribute("aria-label")||e.innerText||e.textContent||"").trim()===String(item.value)));
  if(item.fieldType==="multiSelect"){
    const expected=Array.isArray(item.values)?item.values:[];
    if(!expected.length)return false;
    const native=group.find(e=>e.tagName==="SELECT"&&e.multiple);
    if(native){
      if(native.validity?.valid===false)return false;
      const actual=[...(native.selectedOptions||[])].map(o=>o.value);
      return actual.length===expected.length&&expected.every(x=>actual.includes(x));
    }
    const list=group.find(e=>e.getAttribute("role")==="listbox")||
      [...all('[role="listbox"]')].find(e=>e.id&&group.some(g=>
        [g.getAttribute("aria-controls"),g.getAttribute("aria-owns")].includes(e.id)));
    if(!list)return false;
    const actual=[...(list.querySelectorAll?.('[role="option"]')||[])]
      .filter(e=>e.getAttribute("aria-selected")==="true"||e.getAttribute("aria-checked")==="true")
      .map(e=>String(e.innerText||e.textContent||"").trim().replace(/\s+/g," "));
    return actual.length===expected.length&&expected.every(x=>actual.includes(String(x)));
  }
  if(item.fieldType==="customSelect"){
    const combo=group.find(e=>e.getAttribute("role")==="combobox")||
      group.find(e=>e.getAttribute("aria-haspopup")==="listbox")||
      (item.smartCity?group.find(e=>e.tagName==="INPUT"):null);
    const shown=String(combo?.getAttribute("aria-valuetext")||combo?.value||combo?.innerText||
      combo?.textContent||"").trim().replace(/\s+/g," ");
    const expected=String(item.displayValue||item.value).trim();
    return !!shown&&(shown===expected||item.smartCity&&!!item.country&&
      shown.toLowerCase().startsWith(expected.toLowerCase()+",")&&
      shown.toLowerCase().endsWith(", "+String(item.country).toLowerCase()));
  }
  const field=group[0];
  if(field.validity?.valid===false)return false;
  if(item.fieldType==="textarea"&&field.isContentEditable)
    return String(field.textContent||"").trim()===String(item.value).trim();
  return String(field.value||"").trim()===String(item.value).trim();
}
async function writeAnswers(tabId,items){
  const results=[];
  for(const [index,item] of items.entries()){
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});
    if(current?.id!==tabId)throw Error("Active tab changed; try again");
    const fresh=await scanTabForms(tabId);
    const field=fresh.fields?.find(f=>f.id===item.id);
    const target=frameTarget(tabId,field?.frameId||0);
    const localId=frameLocalId(field);
    if(!field||field.hasValue&&!item.previousValue||field.type!==item.fieldType||
      (field.dateFormat&&field.type==="text"&&
        !({"MM/YYYY":/^(0[1-9]|1[0-2])\/\d{4}$/,
           "YYYY-MM":/^\d{4}-(0[1-9]|1[0-2])$/,
           "DD/MM/YYYY":/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/}[field.dateFormat]?.test(String(item.value))))||
      (field.maxLength>0&&String(item.value).length>field.maxLength)){
      results.push(false);continue;
    }
    aiProgress("Field "+(index+1)+" of "+items.length+": "+
      String(item.label||"Application field").split(" | ")[0]);
    const [scrolled]=await chrome.scripting.executeScript({target,
      func:scrollToField,args:[localId]});
    if(!scrolled?.result){results.push(false);continue;}
    let wrote=false;
    if(item.fieldType==="customSelect"||item.fieldType==="multiSelect"&&field.controlKind!=="nativeMulti"){
      const [response]=await chrome.scripting.executeScript({target,
        func:fillCustomMenu,args:[{id:localId,value:item.value,values:item.values,
          fieldType:item.fieldType,smartCity:field.controlKind==="smartCity",
          country:item.country,previousDisplayValue:item.previousDisplayValue}]});
      wrote=!!response?.result;
    }else{
      const [response]=await chrome.scripting.executeScript({target,
        func:fillForm,args:[[{id:localId,value:item.value,fieldType:item.fieldType,
          previousValue:item.previousValue,values:item.values,dateFormat:field.dateFormat}]]});
      wrote=!!response?.result?.[0];
    }
    if(!wrote){results.push(false);continue;}
    await new Promise(resolve=>setTimeout(resolve,120));
    const [checked]=await chrome.scripting.executeScript({target,
      func:verifyField,args:[{id:localId,value:item.value,
        displayValue:item.displayValue,fieldType:item.fieldType,values:item.values,
        smartCity:field.controlKind==="smartCity",country:item.country}]});
    let verified=checked?.result===true;
    if(!verified&&item.fieldType!=="customSelect"&&item.fieldType!=="multiSelect"){
      const again=await scanTabForms(tabId);
      const remaining=again.fields?.find(f=>f.id===item.id);
      if(remaining&&!remaining.hasValue&&remaining.type===item.fieldType){
        const [retry]=await chrome.scripting.executeScript({target,
          func:fillForm,args:[[{id:localId,value:item.value,fieldType:item.fieldType,
          previousValue:item.previousValue,values:item.values,dateFormat:field.dateFormat}]]});
        if(retry?.result?.[0]){
          await new Promise(resolve=>setTimeout(resolve,120));
          const [rechecked]=await chrome.scripting.executeScript({target,
            func:verifyField,args:[{id:localId,value:item.value,
              displayValue:item.displayValue,fieldType:item.fieldType,values:item.values}]});
          verified=rechecked?.result===true;
        }
      }
    }
    if(!verified)logError("Verify field",String(item.label||"field").split(" | ")[0],
      Error("The page did not retain the selected answer"));
    results.push(verified);
  }
  return results;
}
function locateField(id){
  const all=selector=>{
    const roots=[document],items=[];
    for(let i=0;i<roots.length;i++){
      items.push(...(roots[i].querySelectorAll?.(selector)||[]));
      for(const node of roots[i].querySelectorAll?.("*")||[])
        if(node.shadowRoot)roots.push(node.shadowRoot);
    }
    return items;
  };
  if(!/^gm-autofill-\d+$/.test(id))return false;
  const field=[...all("[data-garamaal-autofill-id]")]
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
    if(p.provisional||p.agreement)row.classList?.add("gm-provisional");
    const body=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=(p.label||"").split(" | ")[0]||"Application question";
    const value=document.createElement("div");value.className="answer";
    value.textContent=String(p.displayValue||p.value||"");
    const where=document.createElement("div");where.className="where";
    where.textContent=p.provisional?"Suggested - review in the amber card":
      p.inferred?"Inferred from saved work history - verify before continuing":
      p.source||(p.context?"Section: "+p.context:"On the current application page");
    body.append(title,value,where);
    const find=document.createElement("button");find.type="button";
    find.textContent="Show";
    find.addEventListener?.("click",async()=>{
      try{
        const [current]=await chrome.tabs.query({active:true,currentWindow:true});
        if(current?.id!==tabId)throw Error("Return to the application tab first");
        const currentField=lastFrameFieldIndex.get(p.id);
        const [located]=await chrome.scripting.executeScript({target:frameTarget(tabId,currentField?.frameId||p.frameId||0),func:locateField,
          args:[frameLocalId(currentField)||p.localId||p.id]});
        if(!located.result)throw Error("This field is no longer on the page");
      }catch(e){status(e.message);}
    });
    row.append(body,find);
    if(p.agreement){
      const undo=document.createElement("button");undo.type="button";
      undo.textContent="Untick";undo.setAttribute?.("aria-label","Untick "+title.textContent);
      undo.addEventListener?.("click",async()=>{
        try{
          const [current]=await chrome.tabs.query({active:true,currentWindow:true});
          if(current?.id!==tabId)throw Error("Return to the application tab first");
          const currentField=lastFrameFieldIndex.get(p.id);
          const [result]=await chrome.scripting.executeScript({target:frameTarget(tabId,currentField?.frameId||p.frameId||0),
            func:untickAgreement,args:[frameLocalId(currentField)||p.localId||p.id]});
          if(!result?.result)throw Error("Could not untick; review on the website");
          value.textContent="Unchecked";where.textContent="You changed this agreement";
          undo.disabled=true;await refreshProgress(tabId,true);
        }catch(error){status(error.message||String(error));}
      });
      row.append(undo);
    }
    review.append(row);
  });
}
// User-requested, reversible checkbox action; no navigation or submit controls.
function untickAgreement(id){
  if(!/^gm-autofill-\d+$/.test(id))return false;
  const roots=[document];
  for(let i=0;i<roots.length;i++)for(const e of roots[i].querySelectorAll?.("*")||[])
    if(e.shadowRoot)roots.push(e.shadowRoot);
  const elements=roots.flatMap(r=>[...(r.querySelectorAll?.("[data-garamaal-autofill-id]")||[])]);
  const group=elements.filter(e=>e.getAttribute("data-garamaal-autofill-id")===id);
  const e=group.find(x=>x.type==="checkbox"||x.getAttribute("role")==="checkbox");
  if(!e||e.disabled||e.getAttribute("aria-disabled")==="true")return false;
  if(e.getAttribute("role")==="checkbox"){
    if(e.getAttribute("aria-checked")!=="true")return false;
    e.click();return e.getAttribute("aria-checked")==="false";
  }
  if(!e.checked)return false;
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"checked")?.set;
  if(setter)setter.call(e,false);else e.checked=false;
  e.dispatchEvent(new Event("input",{bubbles:true}));
  e.dispatchEvent(new Event("change",{bubbles:true}));
  return !e.checked;
}
async function autoTickAgreements(tabId,fields){
  if(!document.querySelector("#auto-agree")?.checked||!globalThis.GaramaalConsent)return 0;
  const agreements=(fields||[]).map(f=>GaramaalConsent.suggest(f)).filter(Boolean);
  if(!agreements.length)return 0;
  const results=await writeAnswers(tabId,agreements);
  showResults(agreements,results,tabId);
  return results.filter(Boolean).length;
}
async function refreshProgress(tabId,answersChecked=false){
  if(!globalThis.GaramaalProgress||!progressEl?.replaceChildren)return;
  let results;
  try{results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:scanForm});}
  catch(_){results=await chrome.scripting.executeScript({target:{tabId},func:scanForm});}
  const merged=globalThis.GaramaalFrames?.merge(results);
  const main=results.find(item=>item.frameId===0)||results[0]||{};
  const {fields=[],extras=[],embeddedFrames=0,truncated=false}=merged||main.result||{};
  const secondary=results.filter(item=>item!==main&&item.result);
  const allExtras=merged?extras:[...extras,...secondary.flatMap(item=>(item.result.fields||[]).map(field=>({
    ...field,section:"Embedded form: "+(field.section||"Application details"),
    reason:"Embedded field; review on the website"}))),...secondary.flatMap(item=>item.result.extras||[])];
  const totalEmbeddedFrames=merged?embeddedFrames:embeddedFrames+secondary.reduce((sum,item)=>
    sum+(item.result?.embeddedFrames||0),0);
  const unknownFrames=merged?merged.blockedFrames:Math.max(0,totalEmbeddedFrames-secondary.length);
  const anyTruncated=truncated||secondary.some(item=>item.result?.truncated);
  const coverageUnknown=anyTruncated||unknownFrames>0;
  if(merged)lastFrameFieldIndex=new Map(fields.map(field=>[field.id,field]));
  const summary=GaramaalProgress.summarize(fields.map(f=>({...f,reason:f.hasValue?"":
    GaramaalMatcher.eligible(f)?(answersChecked?"No answer from selected source":"Not checked yet"):"Review manually"})),allExtras);
  progressEl.replaceChildren();
  const head=document.createElement("div");head.className="progress-head";
  const title=document.createElement("strong");title.textContent="Detected field coverage";
  const percent=document.createElement("b");percent.textContent=
    coverageUnknown&&summary.percent===100?"100% of scanned fields*":summary.percent+"%";
  head.append(title,percent);progressEl.append(head);
  const meter=document.createElement("progress");meter.max=100;meter.value=summary.percent;
  meter.setAttribute("aria-label","Visible fields completed");progressEl.append(meter);
  const caption=document.createElement("p");caption.className="note";
  caption.textContent=summary.filled+" of "+summary.total+" detected fields have values"+
    (summary.required?"; "+summary.requiredFilled+" of "+summary.required+" required":"")+"."+
    (unknownFrames?" "+unknownFrames+" embedded frame(s) not scanned.":"")+
    (anyTruncated?" At least one document reached its 500-field scan limit.":"")+
    " This is not confirmation that the application is valid.";
  progressEl.append(caption);
  for(const section of summary.sections){
    const details=document.createElement("details");details.className="progress-section";
    if(section.filled<section.total)details.open=true;
    const heading=document.createElement("summary");
    const sectionPercent=section.total?Math.round(100*section.filled/section.total):0;
    heading.textContent=section.name+" ? "+sectionPercent+"% ("+section.filled+"/"+section.total+")";
    details.append(heading);
    for(const item of section.pending.slice(0,40)){
      const row=document.createElement("div");row.className="pending-field";
      const name=document.createElement("span");name.textContent=item.label;
      const why=document.createElement("small");why.textContent=item.reason||"Needs an answer";
      row.append(name,why);details.append(row);
    }
    progressEl.append(details);
  }
}
nextBtn?.addEventListener("click",async()=>{
  nextBtn.disabled=true;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||suggestionContext.tabId!==tab.id||!suggestionContext.candidate)
      throw Error("Return to the application tab and fill the page first");
    const verified=[];
    for(const item of suggestionContext.pending.values()){
      const itemField=typeof lastFrameFieldIndex!=="undefined"?
        lastFrameFieldIndex.get(item.id):null;
      const itemTarget=typeof frameTarget==="function"?frameTarget(tab.id,itemField?.frameId||0):{tabId:tab.id};
      const localItemId=typeof frameLocalId==="function"?frameLocalId(itemField)||item.id:item.id;
      const [result]=await chrome.scripting.executeScript({target:itemTarget,
        func:verifyField,args:[{id:localItemId,value:item.value,
          displayValue:item.displayValue,fieldType:item.fieldType,values:item.values}]});
      if(result?.result===true)verified.push(item);
    }
    if(!verified.length){status("No displayed suggestions could be verified. Review the fields on the website.");return;}
    const stored=await new Promise(resolve=>chrome.storage.local.get(
      ["acceptedApplicationAnswers"],value=>resolve(value||{})));
    const all=stored.acceptedApplicationAnswers||{};
    all[suggestionContext.candidate]=GaramaalAnswerMemory.acceptedAfterNext(
      all[suggestionContext.candidate],verified.map(item=>({...item,job:suggestionContext.job})));
    await chrome.storage.local.set({acceptedApplicationAnswers:all});
    suggestionContext.accepted=all[suggestionContext.candidate];
    for(const item of verified)suggestionContext.pending.delete(item.id);
    status("Remembered "+verified.length+" verified answer(s). Advance manually on the application website.");
  }catch(e){logError("Remember answers","verifying suggestions",e);status("Could not remember answers: "+e.message);}
  finally{nextBtn.disabled=false;}
});
async function requestApplicationAccess(tab){
  if(!tab?.id)throw Error("No active application tab found");
  if((tab.url||"").startsWith("file:"))
    throw Error("Open the local test through http://127.0.0.1:8765 instead of a file");
  if(!/^https?:\/\//.test(tab.url||""))
    throw Error("No access to this job page. Click the Garamaal toolbar icon on this tab or allow Site access in extension Details");
  const origin=new URL(tab.url).origin+"/*";
  if(origin==="http://127.0.0.1:8765/*")return;
  if(!origin.startsWith("https://"))
    throw Error("This site needs HTTPS before Garamaal can request access");
  try{
    const granted=await chrome.permissions.request({origins:[origin]});
    if(!granted)throw Error("Access was not granted");
  }catch(_){
    throw Error("Allow Garamaal access to this application site in Chrome, then try again");
  }
}
inspectBtn.addEventListener("click",async()=>{
  const inspectResults=document.querySelector("#inspection-results")||review;
  const inspectStatus=message=>{const node=document.querySelector("#inspection-status");
    if(node)node.textContent=message;else status(message);};
  inspectBtn.disabled=true;inspectResults.replaceChildren();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    await requestApplicationAccess(tab);
    const result=await scanTabForms(tab.id);
    showSitePrivacyNotice(result);
    const {fields=[],unsupported={}}=result;
    await refreshProgress(tab.id);
    for(const field of fields.slice(0,35)){
      const row=document.createElement("div");row.className="row";
      const title=document.createElement("strong");title.textContent=field.label.split(" | ")[0]||"(unlabelled)";
      const detail=document.createElement("small");
      detail.textContent=field.type+(field.options?.length?" · "+field.options.length+" choices":"")+
        (field.hasValue?" · already answered":GaramaalMatcher.eligible(field)?" · eligible":" · manual");
      const body=document.createElement("div");body.append(title,detail);row.append(body);inspectResults.append(row);
    }
    inspectStatus(fields.length+" accessible fields in "+(result.accessibleFrames||1)+
      " frame(s); "+(result.blockedFrames||0)+" embedded frame(s) may be inaccessible; "+
      (unsupported.customDropdowns||0)+" custom dropdowns, "+(unsupported.checkboxes||0)+
      " checkboxes, "+(unsupported.fileInputs||0)+" file uploads. "+
      (result.truncated?"The inventory is incomplete. ":"")+"Nothing changed.");
  }catch(e){logError("Inspect page","scanning page",e);inspectStatus("Inspection failed: "+e.message+". If this is a new site, click the Garamaal toolbar icon here and try again.");}
  finally{inspectBtn.disabled=false;}
});
function showSitePrivacyNotice(scan){
  const panel=document.querySelector("#site-privacy-notice");
  if(!panel)return;
  panel.hidden=!scan?.unsupported?.privacyConsentDialog;
  if(!panel.hidden)panel.textContent="SuccessFactors requires a separate Data Privacy Statement dialog. Open the employer's link, read it and accept there. If that link shows 'Cannot set property request', it may be an employer website error; try a fresh browser session with other extensions disabled, or ask the employer's recruiting support. Garamaal cannot repair the employer's server.";
}
async function selectGaramaalTab(){
  const pattern="https://garamaal.web.app/*";
  let opened=false;
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){
    const tabs=await chrome.tabs.query({url:pattern});
    const usable=tabs.filter(tab=>tab.id&&!tab.discarded&&!tab.frozen&&
      tab.status!=="loading");
    usable.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));
    if(usable.length)return usable[0];
    if(!opened&&(!tabs.length||tabs.every(tab=>tab.discarded||tab.frozen))){
      if(!chrome.tabs.create)break;
      await chrome.tabs.create({url:"https://garamaal.web.app/prototype",active:false});
      opened=true;
    }
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error("Garamaal did not finish loading. Open a Garamaal tab, sign in, and try Fill current page again");
}
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
          const irelandAnswer=String(equalEmployment?.irelandWorkAuthorised||"").trim();
          profile.applicationAnswers={...(profile.applicationAnswers||{})};
          if(/^(yes|no)$/i.test(irelandAnswer)&&
            !String(profile.applicationAnswers.workAuthorization||"").trim())
            profile.applicationAnswers.workAuthorization="Ireland: "+irelandAnswer;
          for(const key of ["disability","gender","veteran"]){
            if(!String(profile.applicationAnswers[key]||"").trim()&&
              String(equalEmployment?.[key]||"").trim())
              profile.applicationAnswers[key]=String(equalEmployment[key]).trim();
          }
          if(profile.basics&&typeof profile.basics==="object"){
            profile.basics={...profile.basics};
            const address=String(profile.basics.address||"");
            const ireland=/^ireland$/i.test(String(profile.basics.country||"").trim())||
              /\bireland\b/i.test(address);
            if(ireland&&!profile.basics.postalCode){
              const eircode=address.match(/\b(?:D6W|[A-Z]\d{2})\s?[A-Z0-9]{4}\b/i);
              if(eircode)profile.basics.postalCode=eircode[0].toUpperCase();
            }
            if(ireland&&!profile.basics.state){
              const county=address.match(/\b(?:County|Co\.?)\s+([A-Za-z][A-Za-z -]{1,30})(?=,|$)/i);
              if(county)profile.basics.state=county[1].trim();
            }
            delete profile.basics.address;
          }
          if(profile.preferences&&typeof profile.preferences==="object"){
            profile.preferences={...profile.preferences};
            delete profile.preferences.visa;
          }
        }
      }
    }catch(_){}
    if(payload?.metaOnly){
      let structured=null,structuredError="";
      try{
        const result=await fetch("/api/autofill/structured-profile",{
          method:"POST",cache:"no-store",headers,body:"{}"});
        const data=await result.json();
        if(result.ok&&data.candidate===candidateData.candidate)
          structured=data.profile;
        else structuredError=data.error||"Structured evidence is unavailable";
      }catch(e){structuredError=e.message||"Structured evidence is unavailable";}
      const useful=rows=>Array.isArray(rows)?rows.filter(row=>row&&typeof row==="object"&&
        Object.values(row).some(value=>typeof value==="string"&&value.trim())):[];
      const localWork=useful(profile?.work),localEducation=useful(profile?.education);
      const mergedBasics={...(structured?.basics||{})};
      for(const [key,value] of Object.entries(profile?.basics||{}))
        if(typeof value==="string"&&value.trim())mergedBasics[key]=value;
      const choices=key=>Array.isArray(profile?.[key])&&profile[key].length?
        profile[key]:(Array.isArray(structured?.[key])?structured[key]:[]);
      const merged={basics:mergedBasics,
        employerDeclarations:profile?.employerDeclarations||"",
        applicationAnswers:profile?.applicationAnswers||{},
        work:localWork.length?localWork:useful(structured?.work),
        education:localEducation.length?localEducation:useful(structured?.education),
        skills:choices("skills"),certifications:choices("certifications"),
        languages:choices("languages")};
      return {candidate:candidateData.candidate,
        profileCounts:{work:merged.work.length,education:merged.education.length},
        profile:merged,recordSource:{
          work:localWork.length?"Saved Career Profile":structured?"Master Evidence Bank":"None",
          education:localEducation.length?"Saved Career Profile":structured?"Master Evidence Bank":"None"
        },structuredError};
    }
    if(profile?.applicationAnswers)delete profile.applicationAnswers;
    const response=await fetch("/api/autofill/answer",{
      method:"POST",cache:"no-store",headers,
      body:JSON.stringify({...payload,profile})});
    const data=await response.json();
    if(!response.ok)return {error:data.error||"Garamaal autofill is unavailable"};
    return data;
  }catch(e){return {error:e.message||"Garamaal autofill failed"};}
}
async function readAcceptedAnswers(candidate){
  if(!candidate)return {};
  const stored=await new Promise(resolve=>chrome.storage.local.get(
    ["acceptedApplicationAnswers"],value=>resolve(value||{})));
  const all=stored.acceptedApplicationAnswers||{};
  return all[candidate]&&typeof all[candidate]==="object"?all[candidate]:{};
}
async function applyProvisionalAnswers(tabId,fields,profile,job,context){
  if(!globalThis.GaramaalAnswerMemory)return 0;
  let count=0;
  for(const field of fields){
    if(field.hasValue||context.pending.has(field.id))continue;
    const answer=GaramaalAnswerMemory.fallbackFor(field,profile,job,context.accepted);
    if(!answer)continue;
    const results=await writeAnswers(tabId,[answer]);
    if(!results[0])continue;
    context.pending.set(field.id,{...answer,field});
    showResults([answer],results,tabId);
    count++;
  }
  return count;
}
function renderProvisionalCards(tabId,context){
  const section=document.querySelector("#application-questions");
  const list=document.querySelector("#application-review");
  if(!section||!list||!context.pending.size)return;
  section.hidden=false;
  for(const item of context.pending.values()){
    const card=document.createElement("div");card.className="gm-question gm-provisional";
    const title=document.createElement("strong");
    title.textContent=String(item.label||"Application question").split(" | ")[0];
    const note=document.createElement("small");
    note.textContent=item.remembered?"Used your previously accepted answer. Change it below if needed.":
      "Suggested answer. Edit it, then use Remember reviewed answers to save it.";
    card.append(title,note);
    let control;
    if(["select","radio","customSelect"].includes(item.fieldType)){
      control=document.createElement("select");
      const options=item.field.options?.length?item.field.options.filter(x=>!x.disabled&&x.value):
        [{label:"Yes",value:"Yes"},{label:"No",value:"No"}];
      for(const option of options){
        const el=document.createElement("option");el.value=option.value;el.textContent=option.label;
        control.append(el);
      }
      control.value=item.value;
    }else{
      control=document.createElement("textarea");control.value=item.value;
      control.maxLength=item.field.maxLength>0?Math.min(item.field.maxLength,4000):1200;
      control.rows=2;
    }
    control.setAttribute("aria-label","Change suggested answer");
    const feedback=document.createElement("small");
    feedback.textContent="Shown on the application page.";
    const apply=async()=>{
      const latest=context.pending.get(item.id);
      if(!latest||context.tabId!==tabId)return;
      const value=String(control.value||"").trim();
      if(!value||value===latest.value)return;
      const selected=control.tagName==="SELECT"?
        [...control.options].find(option=>option.value===value):null;
      const changed={...latest,value,displayValue:selected?.textContent||value,
        previousValue:latest.value,previousDisplayValue:latest.displayValue};
      control.disabled=true;
      try{
        const result=await writeAnswers(tabId,[changed]);
        if(!result[0])throw Error("The page did not keep that answer");
        context.pending.set(item.id,{...latest,value,displayValue:changed.displayValue});
        feedback.textContent="Updated on the application page.";
      }catch(error){control.value=latest.value;
        feedback.textContent="Could not change this field: "+(error.message||String(error));
      }finally{control.disabled=false;}
    };
    if(control.tagName==="SELECT")control.addEventListener("change",apply);
    else{
      const button=document.createElement("button");button.type="button";
      button.textContent="Update answer";button.addEventListener("click",apply);
      card.append(control,button,feedback);list.append(card);continue;
    }
    card.append(control,feedback);list.append(card);
  }
}
function renderApplicationQuestions(tabId,fields,profile,job){
  const section=document.querySelector("#application-questions");
  const list=document.querySelector("#application-review");
  const cards=new Map();
  if(!section||!list||!globalThis.GaramaalApplicationAnswers)return cards;
  list.replaceChildren();
  const questions=(fields||[]).filter(field=>
    !field.hasValue&&GaramaalApplicationAnswers.category(field,job));
  section.hidden=!questions.length;
  const missing={compensation:"Add your approved compensation response in Career Profile.",
    workAuthorization:"Confirm work authorization for the job country in Career Profile.",
    relocation:"Set your relocation preference in Career Profile.",
    employerHistory:"Confirm this employer answer in Career Profile.",
    familyEmployment:"Confirm relatives employed by this organisation; your work history is not evidence.",
    sponsorship:"Confirm sponsorship for the job country in Career Profile. Work authorisation does not prove sponsorship status.",
    restrictiveAgreement:"Confirm any non-compete or non-solicitation restriction before answering.",
    languageProficiency:"Save your actual English proficiency level in Career Profile; no level is assumed.",
    conflict:"Review this employer-specific conflict declaration.",
    certification:"Read and verify the statement before certifying it.",
    consent:"Read the current terms and choose on the application website.",
    disability:"Confirm your disability answer in Career Profile.",
    accommodation:"Confirm your accommodation preference in Career Profile.",
    veteran:"Confirm your veteran-status answer in Career Profile.",
    criminalHistory:"Confirm your criminal-history answer in Career Profile.",
    gender:"Confirm your gender answer in Career Profile.",
    motivationCompany:"Add a career headline and job details to draft this answer.",
    motivationRole:"Add a career headline and job details to draft this answer."};
  for(const field of questions){
    const kind=GaramaalApplicationAnswers.category(field,job);
    const answer=GaramaalApplicationAnswers.answerFor(field,profile,job);
    const card=document.createElement("div");card.className="gm-question";
    const title=document.createElement("strong");
    title.textContent=String(field.label||"Application question").split(" | ")[0];
    const detail=document.createElement("p");detail.className="note";
    const editable=answer&&["compensation","motivationCompany","motivationRole"].includes(kind);
    detail.textContent=answer?(editable?answer.source:
      "Suggested: "+answer.displayValue+" ("+answer.source+")"):missing[kind];
    card.append(title,detail);
    let draft=null;
    if(editable){
      draft=document.createElement("textarea");draft.value=answer.value;
      draft.maxLength=field.maxLength>0?Math.min(field.maxLength,4000):1200;
      draft.setAttribute("aria-label","Edit answer before applying");
      card.append(draft);
    }
    if(answer){
      const button=document.createElement("button");button.type="button";
      button.textContent="Use this answer";
      button.addEventListener("click",async()=>{
        button.disabled=true;
        try{
          const value=draft?String(draft.value||"").trim():answer.value;
          if(!value||draft&&value.length>draft.maxLength)
            throw Error("Answer is empty or exceeds the character limit.");
          const selected={...answer,value,displayValue:draft?value:answer.displayValue};
          const results=await writeAnswers(tabId,[selected]);
          if(!results[0])throw Error("The page did not accept this answer.");
          detail.textContent="Applied: "+selected.displayValue+
            (answer.inferred?" - inferred from saved work history. Verify this answer.":"");
          if(draft)draft.disabled=true;
          button.remove();
          showResults([selected],results,tabId);
          await refreshProgress(tabId,true);
        }catch(error){logError("Application answer","applying reviewed answer",error);
          detail.textContent="Could not apply: "+(error.message||String(error));
          button.disabled=false;}
      });
      card.append(button);
    }
    if(!answer&&kind!=="consent"&&kind!=="certification"&&
      ["select","radio","customSelect"].includes(field.type)){
      // The candidate can resolve a missing factual answer here without
      // modifying their long-lived career profile or guessing a default.
      const available=(field.options||[]).filter(x=>!x.disabled&&String(x.value||"").trim()&&
        !/^(?:select|choose|please select|none selected)/i.test(String(x.label||"")));
      if(available.length){
        const selector=document.createElement("select");
        selector.setAttribute("aria-label","Choose a verified answer for this question");
        const empty=document.createElement("option");empty.value="";
        empty.textContent="Choose after reviewing";selector.append(empty);
        for(const option of available){
          const el=document.createElement("option");el.value=option.value;
          el.textContent=option.label;selector.append(el);
        }
        const use=document.createElement("button");use.type="button";
        use.textContent="Use selected answer";use.disabled=true;
        selector.addEventListener("change",()=>use.disabled=!selector.value);
        use.addEventListener("click",async()=>{
          use.disabled=true;
          try{
            const choice=available.find(x=>x.value===selector.value);
            if(!choice)throw Error("Choose an answer first.");
            const selected={id:field.id,label:field.label,fieldType:field.type,
              value:choice.value,displayValue:choice.label,field,source:"Candidate confirmed on this application",
              key:globalThis.GaramaalAnswerMemory?.keyFor(field,job)||""};
            const results=await writeAnswers(tabId,[selected]);
            if(!results[0])throw Error("The employer page did not retain this answer.");
            if(suggestionContext.tabId===tabId&&selected.key)
              suggestionContext.pending.set(field.id,selected);
            detail.textContent="Applied your selected answer: "+choice.label+
              ". Verify it on the website.";
            selector.disabled=true;use.remove();
            showResults([selected],results,tabId);
            await refreshProgress(tabId,true);
          }catch(error){detail.textContent="Could not use this answer: "+
            (error.message||String(error));use.disabled=false;}
        });
        card.append(selector,use);
      }else{
        const go=document.createElement("button");go.type="button";
        go.textContent="Find this question on page";
        go.addEventListener("click",async()=>{
          try{
            const from=lastFrameFieldIndex.get(field.id)||field;
            const [result]=await chrome.scripting.executeScript({
              target:frameTarget(tabId,from.frameId||0),func:scrollToField,
              args:[frameLocalId(from)]});
            if(!result?.result)throw Error("The question moved. Scan this page again.");
          }catch(error){detail.textContent="Locate failed: "+(error.message||String(error));}
        });
        card.append(go);
      }
    }
    cards.set(field.id,{detail,button:card.querySelector?.("button")});
    list.append(card);
  }
  return cards;
}
async function autoFillApplicationQuestions(tabId,fields,profile,job,reviewCards){
  if(!globalThis.GaramaalApplicationAnswers)return {count:0,ids:[]};
  let count=0;const ids=[];
  for(const field of fields){
    const answer=GaramaalApplicationAnswers.answerFor(field,profile,job);
    if(!answer||answer.inferred||
      GaramaalApplicationAnswers.category(field,job)==="consent")continue;
    const result=await writeAnswers(tabId,[answer]);
    if(!result[0])continue;
    count++;ids.push(answer.id);
    showResults([answer],result,tabId);
    const card=reviewCards.get(answer.id);
    if(card){
      card.detail.textContent="Filled "+answer.displayValue+" - "+answer.source+
        ". Verify this answer before continuing.";
      card.button?.remove();
    }
  }
  return {count,ids};
}
fillBtn.addEventListener("click",async()=>{
  const source=sourceSelect.value;
  if(source==="demo"&&!profile){status("Import the fictional sample profile first");return;}
  fillBtn.disabled=true;review.replaceChildren();progressEl?.replaceChildren?.();
  suggestionContext={tabId:null,candidate:"",job:{},pending:new Map(),accepted:{}};
  if(aiProgressEl?.dataset)aiProgressEl.dataset.working="true";
  let stage="checking application access";
  let reportedAiCalls=0,aiReported=false,rounds=0;
  aiProgress("Preparing to fill this page...");
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    await requestApplicationAccess(tab);
    await requestEmbeddedFrameAccess(tab.id);
    if(source==="garamaal"){
      stage="requesting Garamaal tab access";
      let granted;
      try{granted=await chrome.permissions.request({origins:["https://garamaal.web.app/*"]});}
      catch(_){throw Error("Reload this extension at chrome://extensions, then allow access to garamaal.web.app");}
      if(!granted)throw Error("Allow Garamaal site access in Chrome to use your signed-in profile");
    }
    stage="scanning application page";
    await refreshProgress(tab.id);
    let profileCounts=null;
    let connectedProfile=null;
    let recordSource=null;
    let structuredError="";
    let appTab=null;
    if(source==="demo")profileCounts={
      work:(profile.work||[]).reduce((n,x,i)=>x?.employer||x?.title?i+1:n,0),
      education:(profile.education||[]).reduce((n,x,i)=>x?.institution||x?.qualification?i+1:n,0)
    };
    else{
      stage="finding a ready Garamaal tab";
      appTab=await selectGaramaalTab();
      stage="reading Garamaal profile counts";
      const [meta]=await chrome.scripting.executeScript({target:{tabId:appTab.id},
        world:"MAIN",func:askGaramaal,args:[{metaOnly:true}]});
      if(meta.result?.error)throw Error(meta.result.error);
      profileCounts=meta.result?.profileCounts||null;
      connectedProfile=meta.result?.profile||null;
      suggestionContext.candidate=String(meta.result?.candidate||
        connectedProfile?.basics?.email||connectedProfile?.basics?.fullName||"").toLowerCase().trim();
      recordSource=meta.result?.recordSource||null;
      structuredError=meta.result?.structuredError||"";
    }
    suggestionContext.tabId=tab.id;
    if(source==="demo")suggestionContext.candidate=String(profile?.basics?.email||
      profile?.basics?.fullName||"").toLowerCase().trim();
    if(globalThis.GaramaalAnswerMemory&&suggestionContext.candidate)
      suggestionContext.accepted=await readAcceptedAnswers(suggestionContext.candidate);
    aiProgress("Checking your saved information...");
    stage="adding saved work and education records";
    const expanded=await expandRepeatedSections(tab.id,profileCounts);
    const expansionIssues=expanded.issues||[];
    for(const entry of expanded){
      const row=document.createElement("div");row.className="row";
      const title=document.createElement("strong");
      title.textContent="Added "+(entry.kind==="work"?"Work Experience":"Education")+
        " ("+entry.index+")";
      row.append(title);review.append(row);
    }
    status((expanded.length?"Added "+expanded.length+" record(s). ":"")+
      (expansionIssues.length?expansionIssues.join(" "):"Scanning this application page..."));
    const applied=[];
    // A required menu's sole visible option is not evidence that it is true for this candidate.
    stage="reading application fields";
    const scan=await scanTabForms(tab.id);
    let {fields=[],job={}}=scan;
    showSitePrivacyNotice(scan);
    if(globalThis.GaramaalAiContext){
      let rememberedJob=globalThis.gmActiveJobContext;
      if(!rememberedJob&&chrome.storage?.session?.get){
        try{
          const stored=await chrome.storage.session.get("gmActiveJobContext");
          rememberedJob=stored?.gmActiveJobContext;
        }catch(_){}
      }
      // A stale capture is not valid evidence for a different application.
      if(rememberedJob&&(!Number.isFinite(rememberedJob.savedAt)||
          Date.now()-rememberedJob.savedAt>6*60*60*1000))rememberedJob=null;
      let linked=globalThis.gmLinkedApplication||null;
      if(chrome.storage?.session?.get){
        try{linked=(await chrome.storage.session.get("gmLinkedApplication"))?.gmLinkedApplication||linked;}
        catch(_){}
      }
      const linkedValid=linked?.candidate===suggestionContext.candidate&&
        linked?.tabId===tab.id&&linked?.origin===new URL(tab.url).origin&&
        Date.now()-Number(linked.savedAt||0)<2*60*60*1000&&
        rememberedJob&&linked.company===rememberedJob.company&&
        linked.role===rememberedJob.role;
      if(linkedValid){
        // The candidate explicitly approved this tab + saved job pair. Never
        // bind that consent to a different tab, origin or candidate.
        job={companyName:job.companyName||rememberedJob.company,
          title:job.title||rememberedJob.role,
          location:job.location||rememberedJob.location,
          description:job.description||rememberedJob.jd,
          contextSource:"user-linked saved Garamaal job"};
      }else job=GaramaalAiContext.mergeJob(job,rememberedJob||{},
        {candidate:suggestionContext.candidate,tabId:tab.id});
      const debug=document.querySelector("#ai-context-diagnostics");
      if(debug)debug.textContent="Context: "+job.contextSource+
        "; role "+(job.title?"identified":"unknown")+
        "; company "+(job.companyName?"identified":"unknown")+
        "; JD "+(job.description?"available":"unavailable")+
        "; "+fields.length+" accessible fields in the active document.";
    }
    suggestionContext.job=job;
    const reviewCards=renderApplicationQuestions(tab.id,fields,connectedProfile||profile,job);
    let pending=[],note="",connectedFilled=0;
    const processedIds=new Set();
    stage="filling supported application questions";
    const inferred=await autoFillApplicationQuestions(tab.id,fields,
      connectedProfile||profile,job,reviewCards);
    connectedFilled+=inferred.count;
    inferred.ids.forEach(id=>processedIds.add(id));
    const firstProvisional=await applyProvisionalAnswers(tab.id,fields,
      connectedProfile||profile,job,suggestionContext);
    connectedFilled+=firstProvisional;
    for(const id of suggestionContext.pending.keys())processedIds.add(id);
    if(inferred.count||firstProvisional){
      const afterQuestions=await scanTabForms(tab.id);
      fields=afterQuestions.fields||fields;
    }
    if(source==="garamaal"){
      for(let pass=1;pass<=8;pass++){
      rounds=pass;
      const passCards=renderApplicationQuestions(tab.id,fields,connectedProfile,job);
      const passQuestions=await autoFillApplicationQuestions(tab.id,fields,
        connectedProfile,job,passCards);
      connectedFilled+=passQuestions.count;
      passQuestions.ids.forEach(id=>processedIds.add(id));
      const moreProvisional=await applyProvisionalAnswers(tab.id,fields,
        connectedProfile,job,suggestionContext);
      connectedFilled+=moreProvisional;
      for(const id of suggestionContext.pending.keys())processedIds.add(id);
      if(passQuestions.count||moreProvisional){
        const afterQuestions=await scanTabForms(tab.id);
        fields=afterQuestions.fields||fields;
      }
      const direct=connectedProfile?fields.filter(f=>!processedIds.has(f.id)&&
        !globalThis.GaramaalApplicationAnswers?.category(f,job)).map(f=>
        GaramaalRepeat.sectionIndex(f.context||f.section)?
          GaramaalRepeat.suggest(f,connectedProfile,GaramaalMatcher):
          GaramaalMatcher.suggest(f,connectedProfile)).filter(Boolean):[];
      const filledDirectIds=new Set();
      if(direct.length){
        stage="writing saved profile answers";
        aiProgress("Filling answers from your profile...");
        const results=await writeAnswers(tab.id,direct);
        direct.forEach((item,index)=>{
          processedIds.add(item.id);
          if(results[index])filledDirectIds.add(item.id);
        });
        connectedFilled+=results.filter(Boolean).length;
        showResults(direct,results,tab.id);
      }
      const eligible=fields.filter(f=>!globalThis.GaramaalApplicationAnswers?.category(f,job)&&
        GaramaalReasoner.remoteEligible(f)&&
        !processedIds.has(f.id)&&!filledDirectIds.has(f.id));
      const groups=[];
      for(let start=0;start<eligible.length;start+=20)groups.push(eligible.slice(start,start+20));
      if(!groups.length&&!direct.length){
        // Some ATS platforms reveal dependent questions after an asynchronous
        // rerender. Look once more after the page settles before ending a pass.
        await new Promise(resolve=>setTimeout(resolve,180));
        const settled=await scanTabForms(tab.id);
        const newFields=(settled.fields||[]).some(f=>!f.hasValue&&!processedIds.has(f.id)&&
          (GaramaalMatcher.eligible(f)||globalThis.GaramaalApplicationAnswers?.category(f,job)));
        if(newFields||passQuestions.count||moreProvisional){fields=settled.fields||fields;continue;}
        break;
      }
      for(let index=0;index<groups.length;index++){
        const group=groups[index];
        group.forEach(f=>processedIds.add(f.id));
        stage="checking candidate evidence group "+(index+1)+" of "+groups.length+
          " (pass "+pass+")";
        aiProgress("Checking answers " +(index+1)+" of "+groups.length+"...");
        status("Checking your information...");
        const payload={job,fields:group.map(({id,type,label,context,section,options,datePart})=>(
          {id,type,label,context:context||section,options,datePart,
            maxLength:Math.min(Number(group.find(f=>f.id===id)?.maxLength)||0,4000),
            required:!!group.find(f=>f.id===id)?.required}))};
        if(globalThis.GaramaalAiContext)
          payload.applicationContext=GaramaalAiContext.task(job,group,
            {tabUrl:tab.url,pass});
        let reply;
        try{[reply]=await chrome.scripting.executeScript({target:{tabId:appTab.id},
          world:"MAIN",func:askGaramaal,args:[payload]});}
        catch(_){throw Error("Cannot access the Garamaal tab. Reload this extension at chrome://extensions and allow garamaal.web.app site access");}
        if(reply.result?.error)throw Error(reply.result.error);
        if(Number.isInteger(reply.result?.modelCalls)){
          aiReported=true;reportedAiCalls+=reply.result.modelCalls;
        }
        const answers=(reply.result?.answers||[]).map(a=>{
          const field=group.find(f=>f.id===a.fieldId);
          return field&&GaramaalReasoner.validateRemote(field,a);
        }).filter(Boolean);
        if(answers.length){
          const [current]=await chrome.tabs.query({active:true,currentWindow:true});
          if(current?.id!==tab.id)throw Error("Active tab changed; try again");
          stage="writing verified answers in group "+(index+1);
          const results=await writeAnswers(tab.id,answers);
          connectedFilled+=results.filter(Boolean).length;
          showResults(answers,results,tab.id);
        }
        stage="updating progress after group "+(index+1);
        await refreshProgress(tab.id);
        aiProgress("Checking remaining fields...");
      }
      stage="checking newly revealed fields";
      const nextScan=await scanTabForms(tab.id);
      fields=nextScan.fields||[];
      if(!fields.some(f=>globalThis.GaramaalAnswerMemory?.fallbackFor(f,
          connectedProfile,job,suggestionContext.accepted)&&!processedIds.has(f.id))&&
        !fields.some(f=>globalThis.GaramaalApplicationAnswers?.answerFor(f,connectedProfile,job)&&
          globalThis.GaramaalApplicationAnswers?.category(f,job)!=="consent"&&
          !processedIds.has(f.id))&&
        !fields.some(f=>GaramaalReasoner.remoteEligible(f)&&!processedIds.has(f.id))&&
        !(connectedProfile&&fields.some(f=>GaramaalMatcher.eligible(f)&&
          !processedIds.has(f.id)&&
          (GaramaalRepeat.sectionIndex(f.context||f.section)?
            GaramaalRepeat.suggest(f,connectedProfile,GaramaalMatcher):
            GaramaalMatcher.suggest(f,connectedProfile)))))break;
      }
      aiProgress("Autofill finished. Review your answers.");
      testingDetails("Evidence check finished after "+rounds+
        (rounds===1?" pass. ":" passes. ")+
        (aiReported?("AI calls: "+reportedAiCalls+"."):"AI usage was not reported."));
      note=" "+expansionIssues.join(" ")+" Records found: "+
        (profileCounts?.work??0)+" work ("+(recordSource?.work||"unknown")+") and "+
        (profileCounts?.education??0)+" education ("+
        (recordSource?.education||"unknown")+")."+
        (structuredError?" Structured Drive evidence unavailable: "+structuredError+".":"")+
        " Other fields use Career Profile, then Summary Doc, then Master Evidence Bank.";
    }else{
      const direct=fields.map(f=>GaramaalRepeat.sectionIndex(f.context||f.section)?
        GaramaalRepeat.suggest(f,profile,GaramaalMatcher):GaramaalMatcher.suggest(f,profile)).filter(Boolean);
      const directIds=new Set(direct.map(x=>x.id));
      const mappingFacts=GaramaalMapping.facts(profile);
      const unknown=fields.filter(f=>!directIds.has(f.id)&&GaramaalMatcher.eligible(f))
        .map(f=>({...f,facts:GaramaalRepeat.sectionIndex(f.context||f.section)?[]:
          GaramaalReasoner.facts(profile,f)}))
        .filter(f=>f.facts.length||mappingFacts.length).slice(0,20);
      const selectedMappingFacts=GaramaalMapping.relevantFacts(unknown,mappingFacts);
      let ai=[];
      if(unknown.length){
        aiProgress("Checking "+unknown.length+" unfamiliar field(s) with local AI...");
        try{
          const response=await fetch("http://127.0.0.1:8766/answer",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({job,mappingFacts:selectedMappingFacts,
              applicationContext:globalThis.GaramaalAiContext?.task(job,unknown,
                {tabUrl:tab.url,pass:1}),
              fields:unknown.map(({id,type,label,context,options,datePart,facts})=>(
              {id,type,label,context,options,datePart,facts,
                maxLength:unknown.find(f=>f.id===id)?.maxLength||0,
                required:!!unknown.find(f=>f.id===id)?.required}))})});
          if(!response.ok)throw Error("AI service unavailable");
          const data=await response.json();
          const mapped=GaramaalMapping.validateAll(unknown,selectedMappingFacts,data);
          const mappedIds=new Set(mapped.map(x=>x.fieldId));
          const mappedItems=mapped.map(a=>{
            const field=unknown.find(f=>f.id===a.fieldId);
            return field&&GaramaalReasoner.validateRemote(field,a);
          }).filter(Boolean);
          const answered=(data.answers||[]).map(a=>{
            const field=unknown.find(f=>f.id===a.fieldId);
            return field&&!mappedIds.has(field.id)&&
              GaramaalReasoner.validate(field,a,field.facts);
          }).filter(Boolean);
          ai=[...mappedItems,...answered];
          aiProgress("Local AI check completed for "+unknown.length+" field(s).");
        }catch(_){note=" Local AI unavailable; manual questions left blank.";
          aiProgress("Local AI unavailable; remaining fields need review.");}
      }else aiProgress("No local AI check was needed.");
      pending=[...direct,...ai];
    }
    const fieldById=new Map(fields.map(f=>[f.id,f]));
    pending=pending.map(p=>({...p,context:fieldById.get(p.id)?.context||""}));
    const fillable=new Set(fields.filter(f=>GaramaalMatcher.eligible(f)).map(f=>f.id));
    for(const item of pending)fillable.add(item.id);
    const diag=document.querySelector("#phase3-diagnostics");
    if(diag){
      const categories={};
      for(const field of fields){const kind=globalThis.GaramaalProposition?.describe(field,job).kind||"routine";
        categories[kind]=(categories[kind]||0)+1;}
      diag.textContent="Scanned "+fields.length+" fields; " +
        Object.entries(categories).map(([kind,count])=>kind+": "+count).join(", ")+
        ". AI requests: "+(reportedAiCalls||0)+". Corrections retained only after explicit review.";
    }
    const finalQuestionScan=await scanTabForms(tab.id);
    fields=finalQuestionScan.fields||fields;
    // Final acknowledgements are filled after evidence-based answers so that
    // conditional agreements shown later on the page are also discovered.
    stage="checking standard application acknowledgements";
    const agreementsChecked=await autoTickAgreements(tab.id,fields);
    connectedFilled+=agreementsChecked;
    renderApplicationQuestions(tab.id,fields,connectedProfile||profile,job);
    renderProvisionalCards(tab.id,suggestionContext);
    if(source==="garamaal"){
      await refreshProgress(tab.id,true);
      testingDetails((document.querySelector("#testing-details")?.textContent||"")+note);
      status("Filled "+connectedFilled+" "+
        (connectedFilled===1?"answer":"answers")+". Review the remaining fields.");
      return;
    }
    if(!pending.length){await refreshProgress(tab.id,true);status(applied.length+"/"+(applied.length+fillable.size)+" eligible fields filled; review the answers and remaining fields."+note);return;}
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});
    if(current?.id!==tab.id)throw Error("Active tab changed; try again");
    const results=await writeAnswers(tab.id,pending);showResults(pending,results,tab.id);
    await refreshProgress(tab.id,true);
    status((applied.length+results.filter(Boolean).length)+"/"+(applied.length+fillable.size)+
      " eligible fields filled. Review answers and advance on the application website."+note);
  }catch(e){logError("Autofill",stage,e);status("Autofill failed while "+stage+": "+e.message);
    aiProgress("Evidence check stopped while "+stage+".");}
  finally{fillBtn.disabled=false;if(aiProgressEl?.dataset)aiProgressEl.dataset.working="false";}
});
