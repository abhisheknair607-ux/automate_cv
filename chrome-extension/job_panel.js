"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const paneIds={add:"jobPanel",cv:"cvPanel",fill:"autofillPanel"};
  const jobFields=["company","role","url","location","deadline","salary","jd"];
  let capturedUrl="",freshRow=null,taazaRow=null,savedJob=null;
  let cvReady=false,cvPoll=null,cvChecks=0;
  let cvBinding=null,cvPayload=null,cvPublishedLink="",approvedSite=null,cvStatus="not-requested";
  let lastRunId=null,cvSourceSha="";
  const cvVariants=new Map();
  function diag(stage,detail){const node=$("phase4-diagnostics");
    if(node)node.textContent=stage+(detail?" · "+String(detail).slice(0,110):"")+
      " · no file contents logged";}
  function switchVariant(format){
    const variant=cvVariants.get(format);if(!variant)return false;
    cvBinding=variant.binding;cvPayload=variant.payload;cvReady=true;
    $("cv-format").value=format;reflectCvReady();showDocInfo();return true;
  }
  const Contract=globalThis.GaramaalCvHandoff;
  const DOCX=Contract?.DOCX||"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PDF=Contract?.PDF||"application/pdf";
  function jobKey(){return Contract?.identity({candidate:currentCandidate(),row:freshRow,job:savedJob});}
  function clearPrepared(){cvReady=false;cvBinding=null;cvPayload=null;cvPublishedLink="";
    approvedSite=null;cvStatus="not-requested";cvSourceSha="";cvVariants.clear();
    reflectCvReady();showDocInfo();diag("Not verified");}
  function showDocInfo(){
    const detail=$("cv-document-info");if(detail){
      detail.textContent=cvBinding?"Verified "+cvBinding.filename+" · "+Math.ceil(cvBinding.size/1024)+
        " KB · version "+cvBinding.version.slice(7,19)+" · "+cvBinding.candidate+
        " · job #"+cvBinding.row:"No verified document yet.";
    }
    const format=$("cv-format");if(format){
      const pdfOption=[...format.options||[]].find(x=>x.value==="pdf");
      // PDF is never promised unless a real server-converted file has been verified.
      if(pdfOption)pdfOption.disabled=!cvVariants.has("pdf");
      if(format.value==="pdf"&&pdfOption?.disabled)format.value="docx";
    }
    for(const id of ["cv-download","cv-preview"])if($(id))$(id).disabled=!cvBinding;
    if($("cv-make-pdf"))$("cv-make-pdf").disabled=!cvVariants.has("docx");
  }
  async function persistJob(){
    const key=jobKey();
    if(key&&chrome.storage?.session?.set)
      await chrome.storage.session.set({gmCvJobSession:{...key,taazaRow,
        location:String(savedJob?.location||"").slice(0,120),
        jd:String(savedJob?.jd||"").slice(0,2500),savedAt:Date.now()}});
  }
  async function restoreJob(){
    if(!chrome.storage?.session?.get)return;
    try{
      const saved=(await chrome.storage.session.get("gmCvJobSession"))?.gmCvJobSession;
      if(!saved||!Contract?.equal(saved,Contract.identity({candidate:saved.candidate,row:saved.row,
          job:{company:saved.company,role:saved.role,url:saved.url}}))||
          Date.now()-Number(saved.savedAt||0)>4*60*60*1000)return;
      freshRow=saved.row;taazaRow=saved.taazaRow||null;
      savedJob={company:saved.company,role:saved.role,url:saved.url};
      $("job-candidate").value=saved.candidate;
      $("job-company").value=saved.company;$("job-role").value=saved.role;
      $("job-url").value=saved.url;
      note("cv-status","Restored job #"+freshRow+". Review CV options or check readiness.");
      uploadMessage("Job restored. Verify the CV before attaching it to any page.");
      globalThis.gmActiveJobContext={company:saved.company,role:saved.role,
        location:saved.location||"",jd:saved.jd||"",tabId:saved.tabId||null,
        candidate:saved.candidate,saved:true,savedAt:Date.now()};
      if(chrome.storage?.session?.set)await chrome.storage.session.set({gmActiveJobContext:globalThis.gmActiveJobContext});
      show("cv");
      try{await syncWebsiteCvOptions()}catch(error){
        log("Restore Garamaal CV settings",error);
        note("cv-status","Job restored. Open and sign in to Garamaal, then save or check CV options.");
      }
    }catch(error){log("Restore saved job",error);}
  }
  showDocInfo();
  const note=(id,value)=>{$(id).textContent=value};
  const log=(action,error)=>globalThis.gmLogError?.(action,"job sidebar",error);
  function reflectCvReady(){
    for(const id of ["cv-attach","cv-attach-from-fill"]){
      const node=$(id);if(node)node.disabled=!cvReady;
    }
  }
  function uploadMessage(value){
    for(const id of ["cv-upload-status","cv-attach-status"]){
      const node=$(id);if(node)node.textContent=value;
    }
  }
  function stopCvPoll(){if(cvPoll){clearInterval(cvPoll);cvPoll=null;}}
  let appliedConfirmed=false;
  function renderFlow(which){
    const label=$("gm-active-job-text"),stage=$("gm-active-job-stage");
    if(label)label.textContent=savedJob?currentCandidate()+" · "+savedJob.company+" — "+savedJob.role:
      "New application — capture a job to begin";
    if(stage)stage.textContent=appliedConfirmed?"Application marked Applied after your confirmation.":
      !savedJob?"Capture and save the vacancy to keep its CV and answers together.":
      !freshRow?"Discovery saved; Make CV transfer is not yet confirmed. Retry Save Job.":
      cvReady?"CV verified. Autofill and attach it when requested.":
      cvStatus==="queued"||cvStatus==="running"?"CV "+cvStatus+". Continue filling this application.":
      "Saved job #"+freshRow+". Generate a CV or continue autofilling.";
    document.querySelectorAll?.("[data-flow-step]")?.forEach?.(node=>{
      node.dataset.current=String(node.dataset.flowStep===(appliedConfirmed?"done":which));
    });
    const link=$("gm-link-application"),finish=$("gm-mark-applied");
    if(link)link.hidden=!freshRow;
    if(finish)finish.disabled=!freshRow||appliedConfirmed;
  }
  function show(which){
    renderFlow(which);
    for(const [key,id] of Object.entries(paneIds))$(id).hidden=key!==which;
    document.querySelectorAll("[data-panel]").forEach(button=>{
      button.setAttribute("aria-selected",String(button.dataset.panel===which));
    });
  }
  document.querySelectorAll("[data-panel]").forEach(button=>button.addEventListener("click",()=>show(button.dataset.panel)));
  function currentJob(){return Object.fromEntries(jobFields.map(key=>[key,$("job-"+key).value.trim()]))}
  function currentCandidate(){return $("job-candidate").value}
  async function activeTab(){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https?:\/\//.test(tab.url||""))
      throw Error("Open a job webpage, then click the Garamaal toolbar icon on that tab.");
    return tab;
  }
  async function allowJobTab(tab){
    const origin=new URL(tab.url).origin+"/*";
    if(await chrome.permissions.contains({origins:[origin]}))return;
    const granted=await chrome.permissions.request({origins:[origin]});
    if(!granted)throw Error("Allow Garamaal access to this job site in Chrome, then capture again.");
  }
  async function appCall(method,payload){
    const origin="https://garamaal.web.app/*";
    const granted=await chrome.permissions.contains({origins:[origin]})||
      await chrome.permissions.request({origins:[origin]});
    if(!granted)throw Error("Allow Garamaal site access in Chrome.");
    const [app]=await chrome.tabs.query({url:"https://garamaal.web.app/*"});
    if(!app?.id)throw Error("Open garamaal.web.app and sign in first.");
    const [result]=await chrome.scripting.executeScript({target:{tabId:app.id},world:"MAIN",
      func:(method,arg)=>new Promise((resolve,reject)=>{
        try{
          if(!window.google?.script?.run)throw Error("Garamaal is still loading. Retry after it opens.");
          window.google.script.run.withSuccessHandler(resolve)
            .withFailureHandler(error=>reject(Error(error?.message||"Garamaal request failed")))[method](arg);
        }catch(error){reject(error)}
      }),args:[method,payload]});
    if(!result||result.result===undefined)throw Error("Garamaal did not return a result.");
    return result.result;
  }
  $("job-capture").addEventListener("click",async()=>{
    globalThis.gmActiveJobContext=null; // discard stale evidence before a new capture
    if(chrome.storage?.session?.remove){
      await chrome.storage.session.remove("gmActiveJobContext");
      await chrome.storage.session.remove("gmLinkedApplication");
    }
    globalThis.gmLinkedApplication=null;
    try{
      const tab=await activeTab();
      await allowJobTab(tab);
      const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureJobPage});
      const job=result?.result;
      if(!job)throw Error("Could not read the current job page.");
      stopCvPoll();capturedUrl=job.pageUrl;freshRow=null;taazaRow=null;savedJob=null;
      appliedConfirmed=false;
      clearPrepared();
      if(chrome.storage?.session?.remove)await chrome.storage.session.remove("gmCvJobSession");uploadMessage("A completed CV will become available here.");
      for(const key of jobFields)$( "job-"+key).value=job[key]||"";
      note("job-status","Captured from "+job.source+". Review every field before saving."+
        (job.truncated?" The job description was truncated.":"")+
        (!job.url?" Add the official HTTPS vacancy link.":""));
    }catch(error){log("Capture job",error);note("job-status",error.message||String(error))}
  });
  // One explicit Save Job action: capture is expected to contain the actual JD,
  // then register the same vacancy in Discovery and Make CV in one user flow.
  // No existing CV, application or candidate status is reset.
  $("job-save").addEventListener("click",async()=>{
    const button=$("job-save");button.disabled=true;
    let discoverySaved=false;
    try{
      const job=currentJob();
      if(!job.company||!job.role||!/^https:\/\//i.test(job.url))
        throw Error("Company, designation, and an HTTPS vacancy link are required.");
      if(job.jd.length<80||/^(open original job description|click here|view job description|see original job description|job description missing)$/i.test(job.jd))
        throw Error("Capture the complete job description before saving. Garamaal saves this job to Discovery and Make CV together.");
      const tab=await activeTab();
      if(capturedUrl&&tab.url!==capturedUrl)throw Error("This tab changed since capture. Capture the page again.");
      note("job-status","Saving this vacancy to Discovery and Make CV...");
      const result=await appCall("addDiscovery",job);
      if(!Number.isInteger(Number(result?.row))||Number(result.row)<2)
        throw Error("Discovery did not return a verified job row.");
      discoverySaved=true;taazaRow=Number(result.row);
      // Read the authoritative stored identity. A duplicate URL may already
      // have an existing title/company that differs from the page metadata.
      const taaza=await appCall("getJob",{source:"taaza",candidate:currentCandidate(),row:taazaRow});
      if(!taaza||!taaza.company||!taaza.role||!taaza.url)
        throw Error("Could not verify the saved Discovery record.");
      const expected={company:taaza.company,role:taaza.role,url:taaza.url};
      // Backfill only a truly EMPTY JD on an existing Discovery record.
      // Never replace a non-empty description, and never edit application state.
      if(!result.created&&!String(taaza.jd||"").trim()){
        await appCall("saveDiscovery",{row:taazaRow,expected,expectedJD:"",updates:{jd:job.jd}});
      }
      // Always transfer, including on duplicate captures. transferJob is
      // idempotent: when already present in Freshmaal it returns that row.
      const transfer=await appCall("transferJob",{row:taazaRow,expected});
      if(!Number.isInteger(Number(transfer?.freshRow))||Number(transfer.freshRow)<3)
        throw Error("Make CV did not return a verified row. Retry Save Job.");
      const storedFreshRow=Number(transfer.freshRow);
      const fresh=await appCall("getJob",{source:"fresh",candidate:currentCandidate(),row:storedFreshRow});
      if(!fresh||!fresh.url||!fresh.company||!fresh.role)
        throw Error("Could not verify the Make CV record. Retry Save Job.");
      // Canonical matching may differ only in standard tracking query params.
      // Never associate this capture with an unrelated Freshmaal vacancy.
      const matchLink=(a,b)=>{
        try{
          const simplify=v=>{const u=new URL(v);u.hash="";
            for(const key of [...u.searchParams.keys()])if(/^(utm_.+|fbclid|gclid|msclkid|igshid|ref_src|source|trk|tracking|tm_event|tm_company)$/i.test(key))u.searchParams.delete(key);
            return (u.hostname.replace(/^www\./,"").toLowerCase()+u.pathname.replace(/\/$/,"")+"?"+[...u.searchParams].sort().map(x=>x.join("=")).join("&"));};
          return simplify(a)===simplify(b);
        }catch(_){return String(a)===String(b);}
      };
      if(!matchLink(fresh.url,taaza.url))
        throw Error("Discovery and Make CV point to different vacancy URLs. No CV was started.");
      const sameJob=!!(savedJob&&freshRow===storedFreshRow&&
        savedJob.url===fresh.url&&savedJob.company===fresh.company&&savedJob.role===fresh.role);
      freshRow=storedFreshRow;
      savedJob={...job,company:fresh.company,role:fresh.role,url:fresh.url,
        location:fresh.location||job.location,jd:job.jd};
      if(!sameJob){clearPrepared();}
      appliedConfirmed=false;
      globalThis.gmActiveJobContext={company:savedJob.company,role:savedJob.role,
        location:savedJob.location,jd:savedJob.jd,tabId:tab.id,
        candidate:currentCandidate(),saved:true,savedAt:Date.now()};
      if(chrome.storage?.session?.set)
        await chrome.storage.session.set({gmActiveJobContext:globalThis.gmActiveJobContext});
      await persistJob();
      note("job-status",result.created?
        "Saved and verified in Discovery #"+taazaRow+" and Make CV #"+freshRow+".":
        "Existing job reused. Verified Discovery #"+taazaRow+" and Make CV #"+freshRow+"; no duplicate created.");
      if(transfer.created===false)await syncWebsiteCvOptions(fresh);
      else note("cv-status","Ready to make a CV for "+currentCandidate()+". Choose your CV options.");
      show("cv");
    }catch(error){
      log("Save job to both sheets",error);
      note("job-status",discoverySaved?
        "Discovery job #"+taazaRow+" is saved, but Make CV is not verified. Retry Save Job; existing rows will be reused. "+(error.message||String(error)):
        error.message||String(error));
      if(discoverySaved&&!freshRow)renderFlow("add");
    }finally{button.disabled=false;}
  });
  // CV settings are read from the SAME candidate-specific Freshmaal row as the website.
  // Verify job identity before trusting saved options across sidebar sessions.
  async function syncWebsiteCvOptions(existing){
    const candidate=currentCandidate(),row=freshRow,key=jobKey();
    if(!key)throw Error("Save and verify a Make CV job first.");
    const fresh=existing||await appCall("getJob",{source:"fresh",candidate,row});
    const liveKey=Contract.identity({candidate,row,job:fresh});
    if(!Contract.equal(key,liveKey)||!Contract.equal(key,jobKey()))
      throw Error("The selected job changed. Capture it again before using its CV settings.");
    if(["Economy","Balanced","Premium"].includes(fresh.tier))$("cv-tier").value=fresh.tier;
    $("cv-make").checked=fresh.cv===true;
    $("cv-letter").checked=fresh.cl===true;
    $("cv-web").checked=fresh.web===true;
    note("cv-status",fresh.cvLink?
      "A CV already exists in Garamaal for this job. Check CV readiness to use it.":
      "CV settings loaded from Garamaal Make CV. Review before starting a paid run.");
    return fresh;
  }
  // Single Generate action persists options and verifies the authoritative row.
  async function saveCvOptionsForRun(candidate,row,expected,options){
    for(const [field,value] of Object.entries(options))
      await appCall("updateFreshControl",{row,candidate,field,value,expected});
    const verified=await appCall("getJob",{source:"fresh",candidate,row});
    if(!Contract.equal(Contract.identity({candidate,row,job:verified}),jobKey())||
       verified.tier!==options.tier||verified.cv!==options.cv||
       verified.cl!==options.cl||verified.web!==options.web)
      throw Error("CV settings were not fully verified in Garamaal. No paid run was requested.");
    return verified;
  }
  function showCvQueue(queue,error){
    const summary=$("cv-queue-summary"),current=$("cv-queue-job"),notice=$("cv-queue-note");
    if(!summary||!current||!notice)return;
    if(!queue){
      summary.textContent="Queue unavailable";
      current.textContent="No verified queue position";
      notice.textContent=error?.message||"Could not read the Garamaal CV queue.";
      return;
    }
    const count=n=>Number.isInteger(Number(n))&&Number(n)>=0?Number(n):"?";
    summary.textContent=count(queue.running)+" running · "+count(queue.queued)+" queued";
    const key=jobKey(),active=key&&queue.byJob?.[key.candidate.toLowerCase()+":"+key.row];
    current.textContent=active?
      ("This job: "+(active.state==="running"?"Running":"Queued")+
       (active.queueNumber?" · position #"+active.queueNumber:"")+
       (active.runId?" · run #"+active.runId:"")):
      (key?"This job: not in the visible active queue":"Save a job to see its queue position");
    notice.textContent=queue.readOnly?
      "Read-only queue: GitHub credential needs attention. CV dispatch may be unavailable. "+(queue.queueNote||""):
      queue.stale?"Queue status is stale. Retry before requesting a paid run.":
      (queue.queueNote||"Queue status from Garamaal.");
  }
  async function refreshCvQueue(){
    try{
      const result=await appCall("getCvQueue",null);
      showCvQueue(result);
      return result;
    }catch(error){showCvQueue(null,error);throw error;}
  }
  async function checkCvReady({quiet=false}={}){
    const key=jobKey();if(!key)throw Error("Capture and save the job with a full description first.");
    const candidate=currentCandidate();
    const result=await appCall("getJob",{source:"fresh",candidate,row:freshRow});
    const fromBackend=Contract.identity({candidate,row:freshRow,job:result});
    if(!Contract.equal(fromBackend,key)){
      clearPrepared();throw Error("Job or candidate mismatch. Reopen and verify the saved vacancy before accessing its CV.");
    }
    let queue=null;
    try{queue=await appCall("getCvQueue",null)}catch(error){log("Read CV queue",error)}
    const active=queue?.byJob?.[candidate.toLowerCase()+":"+freshRow];
    lastRunId=active?.runId||lastRunId;
    if(!result.cvLink){
      clearPrepared();cvStatus=active?.state||"not-ready";
      uploadMessage(cvStatus==="running"?"CV generation is running. Continue filling this page.":
        cvStatus==="queued"?"CV queued; continue filling the application.":
        "CV not ready. Start generation or check the job in Garamaal.");
      if(active?.state==="running"||active?.state==="queued")note("cv-status","CV "+active.state+
        (active.runId?" · run #"+active.runId:"")+". Next check will not start another paid run.");
      return false;
    }
    if(cvBinding&&cvPublishedLink===result.cvLink){
      cvReady=true;reflectCvReady();showDocInfo();
      if(!quiet)uploadMessage("Verified "+cvBinding.filename+". Ready to attach on an approved application page.");
      return true;
    }
    // A sheet link alone is not enough: fetch authenticated bytes, validate signature and hash.
    const fetched=await fetchPreparedCv({candidate,row:freshRow,format:"docx"});
    const binding=Contract.bindDocument(key,{...fetched,runId:lastRunId});
    if(!binding)throw Error("The CV document was not valid or could not be verified.");
    cvPayload=fetched;cvBinding=binding;cvPublishedLink=result.cvLink;
    cvSourceSha=fetched.sha256;cvVariants.clear();cvVariants.set("docx",{binding,payload:fetched});
    cvStatus="ready";cvReady=true;stopCvPoll();reflectCvReady();showDocInfo();renderFlow("cv");
    diag("Verified DOCX",key.candidate+" job #"+key.row);
    uploadMessage("Verified "+binding.filename+" ("+Math.ceil(binding.size/1024)+
      " KB). Attach after checking the application and job match.");
    note("cv-status","CV verified for "+candidate+" — "+key.company+". No application was submitted.");
    return true;
  }
  function beginCvPoll(){
    stopCvPoll();cvChecks=0;
    // Only poll after an explicit, confirmed request. Keep requests bounded and stop once ready.
    cvPoll=setInterval(async()=>{
      if(++cvChecks>40){stopCvPoll();return;}
      try{await checkCvReady({quiet:true})}catch(error){
        log("Check CV readiness",error);stopCvPoll();
        uploadMessage("Could not check the CV. Use Check CV readiness to retry.");
      }
    },30000);
  }
  $("cv-run").addEventListener("click",async()=>{
    const button=$("cv-run");button.disabled=true;
    try{
      if(!freshRow||!savedJob)throw Error("Save this job to Make CV first.");
      if(!cvOptionsSaved||!$("cv-make").checked)
        throw Error("Tick Make CV and save the CV options first.");
      // Reuse an already published CV instead of triggering another paid run.
      const existing=await appCall("getJob",{source:"fresh",candidate:currentCandidate(),row:freshRow});
      if(existing?.cvLink){await checkCvReady();show("cv");return;}
      // Queue check prevents a duplicate paid generation request when the same job is already active.
      const queue=await appCall("getCvQueue",null).catch(()=>null);
      const active=queue?.byJob?.[currentCandidate().toLowerCase()+":"+freshRow];
      if(active?.state==="running"||active?.state==="queued"){
        cvStatus=active.state;lastRunId=active.runId||null;
        uploadMessage("CV already "+cvStatus+" in Garamaal. No duplicate generation requested.");
        show("cv");beginCvPoll();return;
      }
      if(!queue)throw Error("CV queue status unavailable. Retry before starting a paid run.");
      if(!confirm("Start a paid AI CV generation for "+currentCandidate()+" — "+savedJob.role+" at "+savedJob.company+"?"))return;
      const result=await appCall("runCvApiNow",{candidate:currentCandidate(),row:freshRow,
        expected:{company:savedJob.company,role:savedJob.role,url:savedJob.url},confirm:true});
      clearPrepared();cvStatus="queued";
      uploadMessage("CV generation requested. Keep filling this application; check readiness here.");
      note("cv-status",result.message||"Garamaal CV generation queued.");
      beginCvPoll();
      // Keep the Make CV panel visible while monitoring the website workflow.
      // Users can explicitly select Continue to Autofill at any time.
      show("cv");
    }catch(error){log("Start CV generation",error);note("cv-status",error.message||String(error))}
    finally{button.disabled=false;}
  });
  $("job-candidate").addEventListener("change",()=>{
    stopCvPoll();cvOptionsSaved=false;clearPrepared();
    globalThis.gmActiveJobContext=null;
    if(chrome.storage?.session?.remove){
      void chrome.storage.session.remove("gmActiveJobContext");
      void chrome.storage.session.remove("gmLinkedApplication");
    }
    appliedConfirmed=false;
    uploadMessage("Candidate changed. Check readiness for the selected person's CV.");
    void persistJob();
  });
  for(const id of ["cv-tier","cv-make","cv-letter","cv-web"]){
    $(id).addEventListener("change",()=>{cvOptionsSaved=false;
      note("cv-status","CV options changed. Generate CV will save and verify these choices before requesting a paid run.");});
  }
  $("cv-refresh").addEventListener("click",async()=>{
    const button=$("cv-refresh");button.disabled=true;
    try{await checkCvReady()}catch(error){log("Check CV readiness",error);
      note("cv-status",error.message||String(error))}
    finally{button.disabled=false;}
  });
  async function fetchPreparedCv({candidate=currentCandidate(),row=freshRow,format="docx"}={}){
    // Existing production endpoint supports DOCX only. PDF is enabled only after
    // a verified conversion endpoint is deployed, never by changing an extension.
    if(!["docx","pdf"].includes(format))throw Error("Unknown document format.");
    const granted=await chrome.permissions.request({origins:["https://garamaal.web.app/*"]});
    if(!granted)throw Error("Allow Garamaal access to retrieve your finished CV.");
    const [app]=await chrome.tabs.query({url:"https://garamaal.web.app/*"});
    if(!app?.id)throw Error("Open Garamaal and sign in to download the prepared CV.");
    const [result]=await chrome.scripting.executeScript({target:{tabId:app.id},world:"MAIN",
      func:async(person,jobRow,requestedFormat)=>{
        const user=window.firebase?.auth?.()?.currentUser;
        if(!user)throw Error("Sign in to Garamaal first.");
        async function request(force=false){
          return fetch(requestedFormat==="pdf"?"/api/autofill/cv-pdf":"/api/download",
            {method:"POST",credentials:"same-origin",cache:"no-store",
            headers:{"Content-Type":"application/json","Authorization":"Bearer "+
              await user.getIdToken(force)},
            body:JSON.stringify({candidate:person,row:jobRow,kind:"cv"})});
        }
        let response=await request();if(response.status===401)response=await request(true);
        if(!response.ok){const detail=await response.json().catch(()=>({}));
          throw Error(detail.error||(requestedFormat==="pdf"?
            "Verified PDF conversion is not available on this server yet.":"CV download unavailable"));}
        const mime=requestedFormat==="pdf"?"application/pdf":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const contentType=(response.headers.get("Content-Type")||"").toLowerCase();
        if(!contentType.includes(mime))throw Error("Incorrect document content type.");
        const bytes=await response.arrayBuffer();
        if(bytes.byteLength<8||bytes.byteLength>5_000_000)throw Error("CV must be between 8 bytes and 5 MB.");
        const data=new Uint8Array(bytes),isDocx=requestedFormat==="docx";
        if(isDocx?!(data[0]===80&&data[1]===75&&data[2]===3&&data[3]===4):
          String.fromCharCode(...data.slice(0,5))!=="%PDF-")throw Error("Document signature is invalid.");
        const disposition=response.headers.get("Content-Disposition")||"";
        const name=disposition.match(/filename="([^"\r\n]+)"/i)?.[1]||
          ("Garamaal-CV."+requestedFormat);
        const filename=name.split(/[\\/]/).pop().replace(/[^\w.() -]/g,"_").slice(0,180);
        if(!filename.toLowerCase().endsWith("."+requestedFormat))
          throw Error("File extension does not match the returned document.");
        const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
        const sha256=Array.from(hash,b=>b.toString(16).padStart(2,"0")).join("");
        let raw="";
        for(let i=0;i<data.length;i+=8192)raw+=String.fromCharCode(...data.subarray(i,i+8192));
        return {filename,base64:btoa(raw),kind:"cv",mime,size:data.length,sha256};
      },args:[candidate,row,format]});
    if(!result?.result?.base64)throw Error("The CV download did not return a document.");
    return result.result;
  }
  function verifiedPreviewUrl(){
    try{const u=new URL(cvPublishedLink);return u.protocol==="https:"&&
      ["drive.google.com","docs.google.com"].includes(u.hostname)?u.href:"";
    }catch{return "";}
  }
  async function checkDocumentUnchanged(){
    const key=jobKey();if(!key||!cvBinding||!Contract.equal(key,cvBinding))
      throw Error("The document does not match the selected candidate and job.");
    const backend=await appCall("getJob",{source:"fresh",candidate:key.candidate,row:key.row});
    const identity=Contract.identity({candidate:key.candidate,row:key.row,job:backend});
    if(!Contract.equal(identity,key)||backend.cvLink!==cvPublishedLink){
      clearPrepared();throw Error("The saved job or CV link has changed. Recheck the new CV before attaching.");
    }
    // Always recheck the authoritative DOCX. PDF conversion may include varying
    // creation metadata, so its already-verified bytes remain locked to DOCX SHA.
    const fresh=await fetchPreparedCv({candidate:key.candidate,row:key.row,format:"docx"});
    const expected=cvSourceSha;
    if(!expected||fresh.sha256!==expected||
       fresh.filename!==cvVariants.get("docx")?.binding?.filename){
      clearPrepared();throw Error("The CV was regenerated or replaced. Preview and approve its new version first.");
    }
    if(cvBinding.mime===PDF){
      if(!cvPayload||cvPayload.mime!==PDF||cvPayload.sha256!==cvBinding.version.slice(7))
        throw Error("Verified PDF bytes are no longer available. Regenerate the PDF.");
      return cvPayload;
    }
    const newest=Contract.bindDocument(key,{...fresh,runId:lastRunId});
    if(!newest||newest.version!==cvBinding.version){clearPrepared();throw Error("CV hash mismatch.");}
    cvPayload=fresh;cvVariants.set("docx",{binding:cvBinding,payload:fresh});return fresh;
  }
  async function uploadProbe(tab,filename){
    let results;
    try{results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},
      func:GaramaalFileUpload.probeUploadTargets});}
    catch(error){
      log("Inspect application file fields",error);
      results=await chrome.scripting.executeScript({target:{tabId:tab.id},
        func:GaramaalFileUpload.probeUploadTargets});
    }
    return GaramaalFileUpload.chooseFrameTarget(results,"cv",filename);
  }
  async function attachPreparedCv(){
    if(!cvReady)await checkCvReady();
    if(!cvReady||!cvBinding)throw Error("The tailored CV is still being prepared or verified.");
    const tab=await activeTab();await allowJobTab(tab);
    const key=jobKey();
    let target=Contract.attachmentGuard({jobKey:key,document:cvBinding,
      tabUrl:tab.url,tabId:tab.id,siteApproval:approvedSite});
    if(!target.ok&&target.reason==="review-target"){
      const host=new URL(tab.url).hostname;
      if(!confirm("Job-site check: the saved vacancy URL differs from the current tab on "+host+
        ". Confirm this application is for "+key.company+" — "+key.role+
        " (candidate "+key.candidate+") before allowing this exact tab to receive the CV."))
        return {status:"cancelled"};
      approvedSite={tabId:tab.id,url:Contract.canonical(tab.url),key:key.candidate+":"+key.row};
      target=Contract.attachmentGuard({jobKey:key,document:cvBinding,
        tabUrl:tab.url,tabId:tab.id,siteApproval:approvedSite});
    }
    if(!target.ok)throw Error("CV attachment blocked: "+target.reason+". Verify candidate, job and page.");
    const filename=cvBinding.filename;
    const probe=await uploadProbe(tab,filename);
    if(probe.status!=="ready"){
      uploadMessage("Automatic attachment unavailable ("+probe.status+"). Download your CV and choose it manually.");
      return probe;
    }
    if(!confirm("Attach "+filename+" (version "+cvBinding.version.slice(7,19)+") for "+
       key.candidate+" — "+key.company+" / "+key.role+" to "+new URL(tab.url).hostname+
       "? The extension will not submit or advance the application."))return {status:"cancelled"};
    const payload=await checkDocumentUnchanged();
    const frameTarget=probe.frameId>0?{tabId:tab.id,frameIds:[probe.frameId]}:{tabId:tab.id};
    const [out]=await chrome.scripting.executeScript({target:frameTarget,
      func:GaramaalFileUpload.attachOnCurrentPage,args:[{...payload,
        targetIndex:probe.index,targetLabel:probe.label,targetAccept:probe.accept}]});
    const result=out?.result||{status:"blocked"};
    if(result.status!=="selected"){
      diag("Attachment",result.status);
      uploadMessage("Automatic attachment failed ("+result.status+"). Download your CV and upload it manually.");
      return result;
    }
    // Site may asynchronously reject/replace the file. Check without clicking or posting.
    let confirmed={status:"selected-locally"};
    for(let i=0;i<3;i++){
      await new Promise(resolve=>setTimeout(resolve,i===0?500:800));
      const [response]=await chrome.scripting.executeScript({target:frameTarget,
        func:GaramaalFileUpload.verifyAttachment,
        args:[{targetIndex:probe.index,filename:result.filename,size:result.size}]});
      confirmed=response?.result||{status:"unknown"};
      if(confirmed.status==="site-indicates-success"||confirmed.status==="not-retained"||
        confirmed.status==="lost-field")break;
    }
    diag("Attachment readback",confirmed.status+" · frame "+probe.frameId);
    uploadMessage(confirmed.status==="site-indicates-success"?
      "The employer page displays an upload-success message for "+filename+
      ". Review the attachment before moving on.":
      confirmed.status==="site-shows-filename"?
      "Employer page shows "+filename+"; server acceptance is not confirmed. Check before moving on.":
      confirmed.status==="selected-locally"?
      "File selected locally: "+filename+". Wait for the employer website to confirm its upload.":
      "File may not have been retained ("+confirmed.status+"). Download and upload manually if needed.");
    return {...confirmed,localSelection:result.status,frameId:probe.frameId};
  }
  $("cv-format")?.addEventListener("change",()=>{
    if(!switchVariant($("cv-format").value)){
      $("cv-format").value=cvBinding?.mime===PDF?"pdf":"docx";
      note("cv-status","Verify or generate this format before selecting it.");
    }
  });
  $("cv-make-pdf")?.addEventListener("click",async()=>{
    const button=$("cv-make-pdf");button.disabled=true;
    try{
      if(!cvVariants.has("docx"))throw Error("Verify the Word CV first.");
      switchVariant("docx");await checkDocumentUnchanged();
      const key=jobKey();
      const pdf=await fetchPreparedCv({candidate:key.candidate,row:key.row,format:"pdf"});
      const binding=Contract.bindDocument(key,{...pdf,runId:lastRunId});
      if(!binding||binding.mime!==PDF)throw Error("The server did not return a verified PDF.");
      cvVariants.set("pdf",{binding,payload:pdf});switchVariant("pdf");
      uploadMessage("Verified PDF prepared. Review the PDF before uploading it to the employer.");
      diag("Verified PDF",key.candidate+" job #"+key.row);
    }catch(error){log("Prepare PDF CV",error);
      switchVariant("docx");
      uploadMessage("PDF unavailable; Word CV is still available. "+String(error.message||error));
      diag("PDF unavailable","backend conversion required");
    }finally{button.disabled=!cvVariants.has("docx");}
  });
  $("cv-preview")?.addEventListener("click",async()=>{
    try{
      await checkDocumentUnchanged();
      if(cvBinding.mime===PDF){
        const bytes=Uint8Array.from(atob(cvPayload.base64),c=>c.charCodeAt(0));
        const uri=URL.createObjectURL(new Blob([bytes],{type:PDF}));
        await chrome.tabs.create({url:uri});
        setTimeout(()=>URL.revokeObjectURL(uri),120000);
      }else{
        const url=verifiedPreviewUrl();if(!url)throw Error("No verified Drive preview link.");
        await chrome.tabs.create({url});
      }
    }catch(error){log("Preview CV",error);note("cv-status",error.message||String(error));}
  });
  $("cv-download")?.addEventListener("click",async()=>{
    try{
      const key=jobKey();if(!key)throw Error("Select a saved candidate and job first.");
      await checkDocumentUnchanged();
      const [app]=await chrome.tabs.query({url:"https://garamaal.web.app/*"});
      if(!app?.id)throw Error("Open Garamaal and sign in to download the CV.");
      const format=cvBinding.mime===PDF?"pdf":"docx";
      await chrome.scripting.executeScript({target:{tabId:app.id},world:"MAIN",
        func:async(candidate,row,format)=>{
          if(format==="docx"){
            if(!window.__cvStandalone?.downloadDocument)
              throw Error("Garamaal download control is unavailable.");
            await window.__cvStandalone.downloadDocument(candidate,row,"cv");return;
          }
          const user=window.firebase?.auth?.()?.currentUser;
          if(!user)throw Error("Sign in to Garamaal first.");
          const req=await fetch("/api/autofill/cv-pdf",{method:"POST",cache:"no-store",
            credentials:"same-origin",headers:{"Content-Type":"application/json",
            "Authorization":"Bearer "+await user.getIdToken()},
            body:JSON.stringify({candidate,row,kind:"cv"})});
          if(!req.ok)throw Error("PDF download unavailable.");
          const bytes=await req.blob();if(bytes.type!=="application/pdf")throw Error("Not a PDF.");
          const url=URL.createObjectURL(bytes),link=document.createElement("a");
          link.href=url;link.download="Garamaal-CV.pdf";link.style.display="none";
          document.body.appendChild(link);link.click();link.remove();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
        },args:[key.candidate,key.row,format]});
      note("cv-status","CV downloaded. Choose it manually if the employer upload widget is unsupported.");
    }catch(error){log("Download verified CV",error);note("cv-status",error.message||String(error));}
  });
  for(const id of ["cv-attach","cv-attach-from-fill"]){
    $(id).addEventListener("click",async()=>{
      const button=$(id);button.disabled=true;
      try{await attachPreparedCv()}catch(error){log("Attach prepared CV",error);
        uploadMessage(error.message||String(error))}
      finally{reflectCvReady();}
    });
  }
  $("cv-continue-fill")?.addEventListener("click",()=>show("fill"));
  $("gm-link-application")?.addEventListener("click",async()=>{
    const feedback=$("gm-link-application-status");
    try{
      if(!freshRow||!savedJob)throw Error("First capture and save a vacancy with a job description.");
      const tab=await activeTab();
      if(!confirm("Use the saved vacancy "+savedJob.company+" — "+savedJob.role+
        " for the application currently open at "+new URL(tab.url).hostname+
        "? Choose OK only if they are the same job. No application will be submitted."))return;
      const key=jobKey();
      const linked={candidate:key.candidate,row:key.row,company:key.company,
        role:key.role,tabId:tab.id,origin:new URL(tab.url).origin,savedAt:Date.now()};
      if(chrome.storage?.session?.set)
        await chrome.storage.session.set({gmLinkedApplication:linked});
      globalThis.gmLinkedApplication=linked;
      feedback.textContent="This browser tab is linked to your saved job for AI context and CV review.";
      show("fill");
    }catch(error){log("Link current application",error);feedback.textContent=error.message||String(error);}
  });
  $("gm-mark-applied")?.addEventListener("click",async()=>{
    const button=$("gm-mark-applied"),feedback=$("gm-applied-status");
    button.disabled=true;
    try{
      if(!freshRow||!savedJob)throw Error("Save the job first.");
      if(!confirm("Did you personally submit this application and see confirmation from the employer? Garamaal will ONLY update its tracking status to Applied."))return;
      const response=await appCall("updateFreshControl",{candidate:currentCandidate(),row:freshRow,
        field:"status",value:"Applied",expected:{company:savedJob.company,role:savedJob.role,url:savedJob.url}});
      appliedConfirmed=true;
      feedback.textContent="Marked Applied for this saved job. "+String(response?.message||"");
      renderFlow("done");
    }catch(error){log("Mark applied after user submission",error);feedback.textContent=error.message||String(error);}
    finally{button.disabled=appliedConfirmed||!freshRow;}
  });
  $("open-garamaal").addEventListener("click",()=>chrome.tabs.create({url:"https://garamaal.web.app/prototype"}));
  show("add");
  void restoreJob();
})();
