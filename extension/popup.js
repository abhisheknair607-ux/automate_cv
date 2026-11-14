"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const HOSTS=new Set(["garamaal.web.app","automate-cv-dashboard-597435070079.europe-west1.run.app"]);
  let state={candidate:"Abhishek",profiles:{},contacts:{}};
  const status=(message,error=false)=>{
    const el=$("status");el.textContent=message;el.classList.toggle("error",error);
  };
  const activeTab=async()=>{
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tabs[0]?.id)throw new Error("No active tab available.");
    return tabs[0];
  };
  const getProfile=()=>state.profiles[state.candidate]||null;
  const getContact=()=>state.contacts[state.candidate]||{};
  function renderCandidate(){
    $("candidate").value=state.candidate;
    const profile=getProfile();
    const work=profile?.work?.filter(x=>x.employer||x.title).length||0;
    const education=profile?.education?.filter(x=>x.institution||x.qualification).length||0;
    $("profile-state").textContent=profile?
      "Synced: "+(profile.basics?.fullName||state.candidate)+" · "+work+" work entries · "+education+" education entries.":
      "No local profile draft synced for "+state.candidate+".";
    $("email").value=getContact().email||"";
    $("phone").value=getContact().phone||"";
  }
  // Executes only after user clicks Sync, and only on an exact Garamaal origin.
  function readGaramaalDraft(candidate){
    const key="gmv3-career-profile-local-v1:"+candidate;
    const raw=localStorage.getItem(key);
    if(!raw)return {found:false};
    if(raw.length>200000)throw new Error("Profile is too large for prototype sync.");
    const profile=JSON.parse(raw);
    if(!profile||typeof profile!=="object"||Array.isArray(profile))
      throw new Error("Profile draft has an unexpected format.");
    const limit=v=>typeof v==="string"?v.slice(0,4000):"";
    const obj=(item,keys)=>Object.fromEntries(keys.map(k=>[k,limit(item?.[k])]));
    const rows=(arr,keys)=>Array.isArray(arr)?arr.slice(0,12).map(item=>obj(item,keys)):[];
    const result={
      basics:obj(profile.basics,["fullName","headline","city","country","summary"]),
      work:rows(profile.work,["employer","title","period","achievements"]),
      education:rows(profile.education,["institution","qualification","period"]),
      skills:limit(profile.skills),certifications:limit(profile.certifications)
    };
    return {found:true,profile:result};
  }
  async function sync(){
    const tab=await activeTab();
    let url;
    try{url=new URL(tab.url);}catch{throw new Error("Open Garamaal in this tab first.");}
    if(url.protocol!=="https:"||!HOSTS.has(url.hostname))
      throw new Error("For profile sync, open https://garamaal.web.app/prototype in this tab.");
    const response=await chrome.scripting.executeScript({
      target:{tabId:tab.id},func:readGaramaalDraft,args:[state.candidate]
    });
    const data=response?.[0]?.result;
    if(!data?.found)throw new Error("No saved draft for "+state.candidate+". Edit and save that candidate's Profile in Garamaal first.");
    state.profiles[state.candidate]=data.profile;
    await chrome.storage.session.set({profiles:state.profiles});
    renderCandidate();
    status("Profile synced locally for "+state.candidate+". Now open a job application tab.");
  }
  async function inspect(fill){
    if(fill&&!getProfile())throw new Error("Sync the selected candidate's profile before filling.");
    const tab=await activeTab();
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:["content.js"]});
    const result=await chrome.tabs.sendMessage(tab.id,{
      type:fill?"FILL_FIELDS":"SCAN_JOB",profile:getProfile()||{},contact:getContact()
    });
    if(!result?.ok)throw new Error(result?.error||"Could not inspect this webpage.");
    const job=result.job||{},fields=result.fields||{};
    $("results").style.display="block";
    const jobEl=$("job");
    jobEl.replaceChildren();
    const line=document.createElement("strong");
    line.textContent=job.title||"Job title not detected";
    jobEl.append(line);
    for(const value of [job.company,job.location,job.platform]){
      if(!value)continue;
      const row=document.createElement("div");
      row.textContent=value;jobEl.append(row);
    }
    if(job.description){
      const text=document.createElement("p");
      text.className="desc";text.textContent=job.description.slice(0,300)+(job.description.length>300?"…":"");
      jobEl.append(text);
    }
    $("field-count").textContent=(fill?
      (fields.filled?.length||0)+" fields filled. ":"")+
      (fields.fillable||0)+" recognised blank fields; "+(fields.skipped||0)+
      " already filled, hidden or excluded; "+(fields.unknown?.length||0)+" unmatched field labels shown in scan.";
    status(fill?
      "Filled "+(fields.filled?.length||0)+" fields. Review carefully; nothing was submitted.":
      "Detection finished. "+(job.title?"Job title found.":"Job title needs manual review.")+
      " "+(fields.fillable||0)+" recognised blank fields can be filled.");
  }
  const busy=async(fn)=>{
    for(const id of ["sync","scan","fill","save-contact","clear"])$(id).disabled=true;
    try{await fn();}
    catch(e){status(String(e.message||e).slice(0,350),true);}
    finally{for(const id of ["sync","scan","fill","save-contact","clear"])$(id).disabled=false;}
  };
  $("candidate").addEventListener("change",async()=>{
    state.candidate=$("candidate").value==="Pooja"?"Pooja":"Abhishek";
    await chrome.storage.session.set({candidate:state.candidate});
    renderCandidate();
  });
  $("sync").addEventListener("click",()=>busy(sync));
  $("scan").addEventListener("click",()=>busy(()=>inspect(false)));
  $("fill").addEventListener("click",()=>busy(()=>inspect(true)));
  $("save-contact").addEventListener("click",()=>busy(async()=>{
    const email=$("email").value.trim(),phone=$("phone").value.trim();
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Enter a valid email or leave it blank.");
    if(phone&&!/^[+()\d .-]{6,28}$/.test(phone))
      throw new Error("Enter a valid phone number or leave it blank.");
    state.contacts[state.candidate]={email,phone};
    await chrome.storage.session.set({contacts:state.contacts});
    status("Contact fields saved for "+state.candidate+" in this browser session.");
  }));
  $("clear").addEventListener("click",()=>busy(async()=>{
    await chrome.storage.session.clear();
    state={candidate:"Abhishek",profiles:{},contacts:{}};
    renderCandidate();
    $("results").style.display="none";
    status("Session cleared. No candidate information remains in extension session storage.");
  }));
  (async()=>{
    try{
      const stored=await chrome.storage.session.get(["candidate","profiles","contacts"]);
      state.candidate=stored.candidate==="Pooja"?"Pooja":"Abhishek";
      state.profiles=stored.profiles&&typeof stored.profiles==="object"?stored.profiles:{};
      state.contacts=stored.contacts&&typeof stored.contacts==="object"?stored.contacts:{};
      renderCandidate();
      if(getProfile())status("Ready for "+state.candidate+". Open an application and click Detect job.");
    }catch(e){status("Could not read Chrome session storage: "+String(e.message||e),true);}
  })();
})();
