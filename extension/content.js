"use strict";
/* Runs only after the user clicks the extension on the current tab.
   No automatic submission, background monitoring or outgoing network calls. */
(function (root) {
  const MAX_JOB_TEXT = 9000;
  const MAX_LABEL = 260;
  const SENSITIVE = /\b(date of birth|birth ?date|dob|gender|pronouns|sex|ethnic|race|disabil|veteran|religion|passport|ssn|social security|national insurance|tax id|bank|salary|compensation|pay expectation|sponsor|visa|right to work|work authori|citizenship|nationality|password|captcha|consent|agree|signature|referral|reference|security clearance|start date|graduation year|gpa|grade|notice period|linkedin|portfolio|website)\b/i;
  const RESTRICTED_INPUT = new Set(["hidden","password","file","checkbox","radio","number","date","datetime-local","month","week","time","color","range","submit","button","reset","image"]);
  const clean = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const tidy = value => clean(value).replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_\-./]+/g," ").toLowerCase();
  const clip = (value, max=MAX_JOB_TEXT) => clean(value).slice(0, max);
  function platform(hostname) {
    const host=String(hostname||"").toLowerCase();
    return /myworkdayjobs\.com|workday\.com/.test(host)?"Workday":
      /greenhouse\.io|greenhouse\.com/.test(host)?"Greenhouse":
      /lever\.co/.test(host)?"Lever":"Other";
  }
  function jobPosting(doc) {
    const scripts=Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0,16);
    const inspect=(entry,depth=0)=>{
      if(!entry||depth>5)return null;
      if(Array.isArray(entry)){for(const item of entry){const result=inspect(item,depth+1);if(result)return result;}return null;}
      if(typeof entry!=="object")return null;
      const kind=Array.isArray(entry["@type"])?entry["@type"].join(" "):String(entry["@type"]||"");
      if(/\bJobPosting\b/i.test(kind))return entry;
      return inspect(entry["@graph"],depth+1);
    };
    for(const script of scripts){
      if((script.textContent||"").length>250000)continue;
      try{const item=inspect(JSON.parse(script.textContent||"{}"));if(item)return item;}catch(_){}
    }
    return null;
  }
  function orgName(value){
    if(typeof value==="string")return value;
    if(Array.isArray(value))return orgName(value[0]);
    return value&&typeof value==="object"?value.name||"":"";
  }
  function locationName(value){
    if(Array.isArray(value))return value.map(locationName).filter(Boolean).join("; ");
    if(typeof value==="string")return value;
    if(!value||typeof value!=="object")return "";
    const a=value.address||value;
    if(typeof a==="string")return a;
    return [a.addressLocality,a.addressRegion,a.addressCountry].map(v=>typeof v==="object"?(v.name||""):v).filter(Boolean).join(", ");
  }
  function textFromHtml(value,doc){
    if(!value)return "";
    const node=doc.createElement("div");
    node.innerHTML=String(value).slice(0,40000);
    node.querySelectorAll("script,style,iframe,form").forEach(n=>n.remove());
    return clip(node.textContent);
  }
  function nodeText(doc,selectors){
    for(const selector of selectors){
      const el=doc.querySelector(selector);
      const text=clip(el?.innerText||el?.textContent||"",MAX_JOB_TEXT);
      if(text)return text;
    }
    return "";
  }
  function metaContent(doc,name){
    return clip(doc.querySelector('meta[property="'+name+'"], meta[name="'+name+'"]')?.getAttribute("content")||"",700);
  }
  function detectJob(doc,loc){
    const schema=jobPosting(doc),host=loc?.hostname||"";
    const title=clip(schema?.title||nodeText(doc,[
      '[data-automation-id="jobPostingHeader"] h2',
      '[data-automation-id="jobPostingHeader"] h1',
      '.posting-headline h2','.job-post h1','.job-title','h1'
    ])||metaContent(doc,"og:title"),180);
    const company=clip(orgName(schema?.hiringOrganization)||nodeText(doc,[
      '[data-automation-id="company"]','.company-name','.posting-categories .company','.company'
    ])||metaContent(doc,"og:site_name"),180);
    const location=clip(locationName(schema?.jobLocation)||nodeText(doc,[
      '[data-automation-id="locations"]','.posting-categories .location','.job-location',
      '[data-ui="job-location"]','.location'
    ]),200);
    const description=clip(textFromHtml(schema?.description,doc)||nodeText(doc,[
      '[data-automation-id="jobPostingDescription"]','#job-description',
      '.job-description','.posting-description','[data-ui="job-description"]',
      '[data-qa="job-description"]'
    ]));
    return {title,company,location,description,platform:platform(host),
      url:/^https?:$/.test(loc?.protocol||"")?String(loc.href).slice(0,1500):""};
  }
  function fieldHint(el) {
    const sources=[
      el.getAttribute?.("autocomplete"),el.getAttribute?.("aria-label"),
      el.getAttribute?.("placeholder"),el.getAttribute?.("name"),el.id,
      ...(el.labels?Array.from(el.labels).map(x=>x.textContent):[])
    ];
    const enclosing=el.closest?.("label");
    if(enclosing)sources.push(enclosing.textContent);
    const fieldset=el.closest?.("fieldset");
    if(fieldset)sources.push(fieldset.querySelector("legend")?.textContent);
    return tidy(sources.filter(Boolean).join(" ").slice(0,MAX_LABEL));
  }
  function classify(hint) {
    const h=tidy(hint);
    if(!h||SENSITIVE.test(h))return "";
    if(/\b(first name|given name|givenname|fname)\b/.test(h))return "firstName";
    if(/\b(last name|family name|surname|lname)\b/.test(h))return "lastName";
    if(/\b(full name|legal name|applicant name|your name)\b/.test(h)||h==="name")return "fullName";
    if(/\b(e mail|email)\b/.test(h))return "email";
    if(/\b(phone|mobile|telephone|contact number)\b/.test(h))return "phone";
    if(/\b(city|town|locality)\b/.test(h))return "city";
    if(/\b(country|residence country)\b/.test(h))return "country";
    if(/\b(university|college|institution|school name)\b/.test(h))return "institution";
    if(/\b(degree|qualification|education level)\b/.test(h))return "qualification";
    if(/\b(current employer|previous employer|employer name|company worked|workplace)\b/.test(h))return "employer";
    if(/\b(current job title|previous job title|employment title|position held)\b/.test(h))return "jobTitle";
    if(/\b(skills|technical skills|key competencies)\b/.test(h))return "skills";
    return "";
  }
  function valueFor(kind,profile,contact={}){
    if(!profile||typeof profile!=="object")return "";
    const basics=profile.basics||{},full=clean(basics.fullName),parts=full.split(/\s+/).filter(Boolean);
    const work=(Array.isArray(profile.work)?profile.work:[]).find(x=>x&&clean(x.employer||x.title))||{};
    const education=(Array.isArray(profile.education)?profile.education:[]).find(x=>x&&clean(x.institution||x.qualification))||{};
    const values={
      fullName:full,firstName:parts.length>1?parts.slice(0,-1).join(" "):"",
      lastName:parts.length>1?parts[parts.length-1]:"",
      email:clean(contact.email),phone:clean(contact.phone),
      city:clean(basics.city),country:clean(basics.country),
      institution:clean(education.institution),qualification:clean(education.qualification),
      employer:clean(work.employer),jobTitle:clean(work.title),skills:clean(profile.skills)
    };
    return clip(values[kind]||"",kind==="skills"?1000:240);
  }
  function eligible(el){
    const tag=String(el.tagName||"").toUpperCase();
    if(!["INPUT","TEXTAREA","SELECT"].includes(tag)||el.disabled||el.readOnly)return false;
    const type=String(el.type||"text").toLowerCase();
    if(tag==="INPUT"&&RESTRICTED_INPUT.has(type))return false;
    if(el.getAttribute?.("aria-hidden")==="true"||el.closest?.('[hidden],[aria-hidden="true"]'))return false;
    if(typeof el.getClientRects==="function"&&el.getClientRects().length===0)return false;
    return true;
  }
  function hasValue(el){
    const v=clean(el.value);
    return !!v&&!/^(select|choose|please select|select an option|--|none)$/i.test(v);
  }
  function selectValue(el,answer){
    const expected=tidy(answer);
    const option=Array.from(el.options||[]).find(o=>tidy(o.textContent)===expected||tidy(o.value)===expected);
    return option?option.value:null;
  }
  function setField(el,value){
    const tag=String(el.tagName||"").toUpperCase();
    const proto=tag==="SELECT"?root.HTMLSelectElement?.prototype:
      tag==="TEXTAREA"?root.HTMLTextAreaElement?.prototype:root.HTMLInputElement?.prototype;
    const setter=proto&&Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if(setter)setter.call(el,value);else el.value=value;
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function inspectFields(doc,profile,contact,fill){
    const inputs=Array.from(doc.querySelectorAll("input, textarea, select")).slice(0,250);
    const result={total:inputs.length,fillable:0,filled:[],unknown:[],skipped:0};
    for(const el of inputs){
      if(!eligible(el)||hasValue(el)){result.skipped++;continue;}
      const hint=fieldHint(el),kind=classify(hint),answer=valueFor(kind,profile,contact);
      if(!kind||!answer){if(hint&&result.unknown.length<12)result.unknown.push(hint.slice(0,85));continue;}
      const target=String(el.tagName).toUpperCase()==="SELECT"?selectValue(el,answer):answer;
      if(target===null){result.skipped++;continue;}
      result.fillable++;
      if(fill){
        // All actions originate from an explicit user click. Never submit or tick boxes.
        try{setField(el,target);result.filled.push({kind,label:hint.slice(0,60)});}
        catch(_){result.skipped++;}
      }
    }
    return result;
  }
  if(root.chrome?.runtime?.onMessage){
    if(!root.__garamaalAutofillListenerInstalled){
      root.__garamaalAutofillListenerInstalled=true;
      root.chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
        if(!message||!["SCAN_JOB","FILL_FIELDS"].includes(message.type))return;
        try{
          const job=detectJob(root.document,root.location);
          const fields=inspectFields(root.document,message.profile||{},message.contact||{},message.type==="FILL_FIELDS");
          sendResponse({ok:true,job,fields});
        }catch(error){sendResponse({ok:false,error:String(error.message||"Cannot inspect this page").slice(0,180)});}
      });
    }
  }
  if(typeof module!=="undefined"&&module.exports)module.exports={
    platform,locationName,classify,valueFor,eligible,hasValue,selectValue,detectJob,inspectFields
  };
})(typeof globalThis!=="undefined"?globalThis:this);
