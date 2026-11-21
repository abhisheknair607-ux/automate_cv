"use strict";
/*
 * Receives limited metadata from Garamaal Android's explicit user handoff.
 * No background imports, credentials, or automatic save. The user must review
 * the existing Add Job form and submit it through the authenticated API.
 */
(function(){
  const raw=location.hash||"";
  if(!raw.startsWith("#gm-capture=")&&!raw.startsWith("#gm-view="))return;
  // Remove metadata from address/history immediately; URL fragments are not
  // transmitted to the Garamaal server, but should not remain shareable.
  try {history.replaceState(null,"",location.pathname+location.search);}catch(_){}
  function safeUrl(rawUrl){
    try{
      const u=new URL(String(rawUrl||""));
      return u.protocol==="https:"&&
        !/^(?:www\.)?linkedin\.com$/i.test(u.hostname)&&
        u.href.length<=2000?u.href:"";
    }catch{return "";}
  }
  function showTab(target){
    window.GaramaalPrototypeHome?.enterJobs();
    if(typeof nav==="function")nav(target);
  }
  if(raw.startsWith("#gm-view=")){
    const view=raw.slice("#gm-view=".length);
    if(["dashboard","discovery","fresh"].includes(view))showTab(view);
    return;
  }
  let job;
  try{
    if(raw.length>4800)return;
    job=JSON.parse(decodeURIComponent(raw.slice("#gm-capture=".length)));
  }catch{return;}
  if(!job||typeof job!=="object"||!safeUrl(job.url))return;
  const value=(key,max)=>String(job[key]||"").slice(0,max).trim();
  showTab("add");
  const fields={
    "add-company":value("company",250),
    "add-role":value("role",250),
    "add-location":value("location",300),
    "add-url":safeUrl(job.url)
  };
  for(const [id,data] of Object.entries(fields)){
    const input=document.getElementById(id);
    if(input)input.value=data;
  }
  const form=document.getElementById("addForm");
  if(!form)return;
  const existing=document.getElementById("gm-capture-handoff");
  if(existing)existing.remove();
  const notice=document.createElement("div");
  notice.id="gm-capture-handoff";
  notice.setAttribute("role","status");
  notice.style.cssText="padding:12px;border:1px solid #b7cbe4;border-radius:12px;background:#eef5ff;color:#173e76;margin:10px 0;line-height:1.5";
  const title=document.createElement("strong");
  title.textContent="Captured from Garamaal Browser — review before saving";
  const message=document.createElement("p");
  message.textContent="The employer, title, location and URL were filled. The JD was copied to your device clipboard, if detected. Paste it below, review, then use the normal Save or Make CV flow.";
  const paste=document.createElement("button");
  paste.type="button";paste.className="btn";
  paste.textContent="Paste captured JD";
  paste.addEventListener("click",async()=>{
    try{
      const jd=await navigator.clipboard.readText();
      if(!jd.trim())throw Error("Clipboard empty");
      const target=document.getElementById("add-jd");
      if(!target)return;
      if(target.value && !window.confirm("Replace the current JD field with clipboard content?"))return;
      target.value=jd.slice(0,49000);
      message.textContent="JD pasted for your review. Confirm the vacancy information before saving.";
    }catch(_){
      message.textContent="Automatic clipboard access is unavailable. Long-press the JD field and choose Paste.";
      document.getElementById("add-jd")?.focus();
    }
  });
  notice.append(title,message,paste);
  form.prepend(notice);
})();
