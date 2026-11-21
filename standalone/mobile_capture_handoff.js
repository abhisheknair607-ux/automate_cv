"use strict";
/*
 * Android -> authenticated Garamaal job handoff.
 * Uses the same addDiscovery / saveDiscovery / transferJob / getJob /
 * updateFreshControl / runCvApiNow operations as the existing Garamaal UI.
 *
 * Never reads browser secrets, imports silently, creates duplicate CVs,
 * triggers paid work automatically, or overwrites an existing complete JD.
 */
(function(){
  const raw=location.hash||"";
  if(!raw.startsWith("#gm-capture=")&&!raw.startsWith("#gm-view="))return;
  try{history.replaceState(null,"",location.pathname+location.search);}catch(_){}
  function safeUrl(rawUrl){
    try{
      const u=new URL(String(rawUrl||""));
      return u.protocol==="https:"&&
        !/^(?:www\.)?linkedin\.com$/i.test(u.hostname)&&
        u.href.length<=2000?u.href:"";
    }catch{return "";}
  }
  function showTab(tab){
    window.GaramaalPrototypeHome?.enterJobs();
    if(typeof nav==="function")nav(tab);
  }
  if(raw.startsWith("#gm-view=")){
    const view=raw.slice("#gm-view=".length);
    if(["dashboard","discovery","fresh"].includes(view))showTab(view);
    return;
  }
  if(raw.length>4800)return;
  let job;
  try{job=JSON.parse(decodeURIComponent(raw.slice("#gm-capture=".length)));}
  catch{return;}
  if(!job||typeof job!=="object"||!safeUrl(job.url))return;
  const clean=(x,max)=>String(x||"").trim().slice(0,max);
  showTab("add");
  const fields={
    "add-company":clean(job.company,300),
    "add-role":clean(job.role,400),
    "add-location":clean(job.location,500),
    "add-url":safeUrl(job.url)
  };
  for(const [id,value] of Object.entries(fields)){
    const input=document.getElementById(id);
    if(input)input.value=value;
  }
  const form=document.getElementById("addForm");
  if(!form)return;
  document.getElementById("gm-capture-handoff")?.remove();

  const notice=document.createElement("section");
  notice.id="gm-capture-handoff";
  notice.setAttribute("role","region");
  notice.setAttribute("aria-label","Garamaal mobile captured job");
  notice.style.cssText="padding:14px;border:1px solid #b7cbe4;border-radius:12px;background:#eef5ff;color:#173e76;margin:10px 0;line-height:1.5";
  const title=document.createElement("strong");
  title.textContent="Captured from Garamaal Browser";
  const message=document.createElement("p");
  message.setAttribute("role","status");
  message.setAttribute("aria-live","polite");
  const wantsCv=job.mode==="cv";
  message.textContent=wantsCv
    ?"Make CV requested. Import the complete JD, review the job, then tap Save & Prepare CV. Paid generation requires a separate confirmation."
    :"Review this job, import its description if available, then tap Save Job. The external application remains open in the Android browser.";
  const actions=document.createElement("div");
  actions.style.cssText="display:flex;flex-wrap:wrap;gap:8px;align-items:center";
  const paste=makeButton("Import captured JD");
  const save=makeButton("Save Job");
  const prepare=makeButton("Save & Prepare CV");
  const start=makeButton("Generate CV (paid)");
  const view=makeButton("Open Make CV");
  start.hidden=true;view.hidden=true;
  actions.append(paste,save,prepare,start,view);
  notice.append(title,message,actions);
  form.prepend(notice);

  let busy=false, saved=null, prepared=null, candidateSaved=null;
  const actionButtons=[paste,save,prepare,start,view];
  function makeButton(label){
    const button=document.createElement("button");
    button.type="button";button.className="btn";button.textContent=label;
    return button;
  }
  function status(value,error=false){
    message.textContent=value;
    message.style.color=error?"#991b1b":"#173e76";
  }
  function setBusy(value){
    busy=value;
    for(const button of actionButtons)button.disabled=value;
  }
  function candidate(){
    try{
      const name=state?.candidate;
      if(name==="Pooja"||name==="Abhishek")return name;
    }catch(_){}
    return "";
  }
  function values(){
    const get=id=>String(document.getElementById(id)?.value||"").trim();
    const payload={
      company:get("add-company"),role:get("add-role"),
      location:get("add-location"),url:safeUrl(get("add-url")),
      deadline:get("add-deadline"),salary:get("add-salary"),
      jd:get("add-jd")
    };
    if(!payload.company||!payload.role||!payload.url)
      throw Error("Review the company, job title and HTTPS employer URL.");
    if(payload.jd.length>49000)throw Error("The description exceeds Garamaal's 49,000-character limit.");
    return payload;
  }
  function verified(job){
    return {company:job.company,role:job.role,url:job.url};
  }
  const invoke=(method,payload)=>run(method,payload,{quiet:true});

  paste.addEventListener("click",async()=>{
    if(busy)return;
    const target=document.getElementById("add-jd");
    if(!target)return;
    try{
      const jd=await navigator.clipboard.readText();
      if(jd.trim().length<80)
        throw Error("No complete job description found in the clipboard.");
      if(target.value.trim()&&target.value.trim()!==jd.trim()&&
         !window.confirm("Replace the description in this unsaved form?"))return;
      target.value=jd.slice(0,49000);
      status("Description imported. Review it before saving.");
    }catch(_){
      target.focus();
      status("Clipboard access was blocked. Long-press the JD field and choose Paste, then review it.",true);
    }
  });

  async function saveJob(prepareCv){
    if(busy)return;
    const selected=candidate();
    if(!selected){status("Choose a candidate using Garamaal's profile selector first.",true);return;}
    let payload;
    try{payload=values();}
    catch(error){status(error.message,true);return;}
    if(prepareCv&&payload.jd.length<80){
      status("A complete JD is required before Make CV. Import or paste it first.",true);
      return;
    }
    // Saving is always an explicit action; never triggered by page-load/URL.
    setBusy(true);
    try{
      const result=await invoke("addDiscovery",payload);
      if(!result||!Number.isInteger(Number(result.row)))throw Error("Garamaal did not confirm a saved vacancy.");
      saved={row:Number(result.row),company:payload.company,role:payload.role,url:payload.url};
      let freshRow=Number(result.freshRow)||null;
      if(!result.created){
        // Existing Taaza row is authoritative; the captured metadata may differ.
        const current=await invoke("getJob",{source:"taaza",row:saved.row,candidate:selected});
        if(!current||!current.url)throw Error("Could not verify the existing job.");
        saved={row:current.row,...verified(current)};
        if(!current.jdReady&&payload.jd.length>=80){
          const update=await invoke("saveDiscovery",{
            row:current.row,expected:verified(current),expectedJD:current.jd||"",
            updates:{jd:payload.jd}
          });
          if(update.transferError)throw Error("Job saved but Freshmaal transfer failed: "+update.transferError);
          freshRow=Number(update.freshRow)||freshRow;
        }else if(current.jdReady&&payload.jd.length>=80&&current.jd.trim()!==payload.jd.trim()){
          status("Existing complete JD preserved. No existing job description was overwritten.");
        }
      }else if(result.transferError){
        // A job may be safely saved even when transfer failed.
        status("Saved in Discovery, but automatic Freshmaal transfer failed: "+result.transferError,true);
      }
      if(prepareCv){
        if(!freshRow){
          const transferred=await invoke("transferJob",{row:saved.row,expected:verified(saved)});
          freshRow=Number(transferred?.freshRow)||null;
        }
        if(!freshRow)throw Error("Saved to Discovery, but the job is not yet available in Make CV.");
        const fresh=await invoke("getJob",{source:"fresh",row:freshRow,candidate:selected});
        if(!fresh||!fresh.url)throw Error("Cannot verify the Make CV job.");
        if(fresh.notInterested)throw Error("Restore this vacancy from Not Interested before preparing a CV.");
        if(!fresh.cv&&!fresh.cvLink){
          await invoke("updateFreshControl",{
            row:fresh.row,candidate:selected,field:"cv",value:true,
            expected:verified(fresh)
          });
        }
        prepared={row:fresh.row,candidate:selected,job:verified(fresh)};
        candidateSaved=selected;
        if(fresh.cvLink){
          start.hidden=true;
          status("Already saved with a completed CV for "+selected+". Existing output preserved.");
        }else{
          start.hidden=false;
          status("Saved and Make CV enabled for "+selected+" (Freshmaal row "+fresh.row+"). Generation is optional and requires a separate paid confirmation.");
        }
      }else{
        status(result.created?"Job saved in Garamaal Discovery.":"Duplicate recognised; existing Garamaal job preserved.");
      }
      view.hidden=!prepared;
      // The existing Add Job form is retained for review; do not reset it or redirect.
    }catch(error){
      status("Could not complete "+(prepareCv?"Save & Prepare CV":"Save Job")+": "+String(error.message||error),true);
    }finally{setBusy(false);}
  }
  save.addEventListener("click",()=>saveJob(false));
  prepare.addEventListener("click",()=>saveJob(true));

  start.addEventListener("click",async()=>{
    if(busy||!prepared)return;
    if(candidate()!==candidateSaved){
      status("Selected candidate changed. Reopen Make CV to verify the correct profile.",true);
      return;
    }
    const {row,candidate:selected,job:expected}=prepared;
    let fresh;
    try{fresh=await invoke("getJob",{source:"fresh",row,candidate:selected});}
    catch(error){status(String(error.message||error),true);return;}
    if(fresh.cvLink||String(fresh.workflow||"").toUpperCase()==="COMPLETE"){
      start.hidden=true;status("This job already has a generated CV. No duplicate run started.");return;
    }
    if(!fresh.cv||fresh.notInterested||String(fresh.status||"").toLowerCase()==="applied"){
      status("This job is not eligible for a new CV run. Review its Make CV status.",true);return;
    }
    const cvTier=fresh.tier||"Premium",clTier=fresh.cl?(fresh.clTier||cvTier):"off";
    if(!window.confirm("Start a PAID OpenAI CV run for "+selected+" at "+fresh.company+" — "+fresh.role+
      " (Freshmaal row "+row+", CV: "+cvTier+", CL: "+clTier+")?"))return;
    setBusy(true);
    try{
      const queued=await invoke("runCvApiNow",{candidate:selected,row,expected:verified(fresh),confirm:true});
      start.hidden=true;
      status(queued?.message||"CV generation was queued. Check Make CV for progress.");
    }catch(error){
      status("CV run was not started: "+String(error.message||error),true);
    }finally{setBusy(false);}
  });
  view.addEventListener("click",()=>showTab("fresh"));
})();