/* Garamaal structured Profile staging UI: one experience per job, repeatable sections.
 * No automatic unreviewed Drive-to-career-field mapping. Source archive is separate. */
(function(){
 "use strict";
 const original=window.GaramaalProfile;
 if(!original?.open||!window.__cvStandalone?.requestSpecial)return;
 const api=(name,body)=>window.__cvStandalone.requestSpecial("profile/structured/"+name,body);
 const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const TYPES=[
  ["experience","Work experience","job history","Add experience"],
  ["projects","Projects","projects and case studies","Add project"],
  ["skills","Skills & tools","individual skills","Add skill"],
  ["education","Education","degrees and courses","Add education"],
  ["certifications","Certifications","professional qualifications","Add certification"],
  ["awards","Awards","achievements and recognition","Add award"],
  ["volunteering","Leadership & volunteering","other experience","Add experience"],
  ["preferences","Career preferences","target roles and locations","Add preference"]
 ];
 const FIELDS={
  experience:[["employer","Employer"],["title","Job title"],["location","Location"],["startDate","Start date"],["endDate","End date / Present"],["summary","Role overview"]],
  projects:[["name","Project name"],["role","Your contribution"],["period","Period"],["description","Project overview"]],
  skills:[["name","Skill or tool"],["category","Category"],["proficiency","Proficiency"],["notes","Evidence / experience"]],
  education:[["institution","University or institution"],["qualification","Qualification"],["location","Location"],["startDate","Start date"],["endDate","End date"],["details","Relevant details"]],
  certifications:[["name","Certification"],["issuer","Issuing body"],["date","Date"],["details","Details"]],
  awards:[["title","Achievement or award"],["organisation","Awarding organisation"],["date","Date"],["details","Details"]],
  volunteering:[["organisation","Organisation"],["role","Role"],["period","Period"],["details","Details"]],
  preferences:[["targetRole","Target role"],["location","Preferred locations"],["workType","Work arrangements"],["notes","Notes"]]
 };
 const ACH_FIELDS=["title","situation","task","action","result","metricValue","metricContext","evidenceNote"];
 const makeId=()=>("id"+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,64);
 const freshAch=()=>Object.fromEntries([["id",makeId()],...ACH_FIELDS.map(k=>[k,""]),["additionalMetrics",[]]]);
 const fresh=(type)=>Object.fromEntries([["id",makeId()],...FIELDS[type].map(([k])=>[k,""]),...(type==="experience"||type==="projects"?[["achievements",[]]]:[])]);
 let root=null,previous=null,profile=null,key="abhishek",active="overview",expanded="",dirty=false,busy=false,status="",versionList=null,viewHistory=null;
 const btn=(action,label,extra="",attrs="")=>'<button type="button" class="gsp-btn '+extra+'" data-action="'+action+'" '+attrs+'>'+label+'</button>';
 const title=type=>TYPES.find(x=>x[0]===type)?.[1]||"Profile";
 const request=async(name,args)=>{if(busy)return null;busy=true;setStatus("Checking saved Profile…");try{return await api(name,args)}
  catch(e){setStatus(e.message||"Profile request failed.");return null}finally{busy=false}};
 function setStatus(message){status=message;const el=root?.querySelector("[data-gsp-status]");if(el)el.textContent=message}
 const changed=()=>{dirty=true;setStatus("Unsaved changes — use Save Profile before leaving.")};
 const count=type=>(profile?.lists?.[type]||[]).length;
 function field(label,k,value,opts={}){
  const target=opts.target||"overview",type=opts.type||"",index=opts.index??"",ach=opts.ach??"",metric=opts.metric??"";
  const attrs='data-target="'+esc(target)+'" data-type="'+esc(type)+'" data-index="'+esc(index)+'" data-ach="'+esc(ach)+'" data-metric="'+esc(metric)+'" data-field="'+esc(k)+'"';
  const large=opts.large||/summary|description|details|evidenceNote|notes|result|situation|task|action|metricContext|headline/i.test(k);
  return '<label class="gsp-field"><span>'+esc(label)+'</span>'+
   (large?'<textarea rows="'+(opts.big?5:2)+'" '+attrs+' maxlength="10000">'+esc(value)+'</textarea>':
   '<input type="text" '+attrs+' maxlength="3000" value="'+esc(value)+'">')+'</label>';
 }
 function achCard(type,i,ach,j){
  const a=ach;
  return '<details class="gsp-ach" '+(a.title?"":"open")+'><summary><strong>'+esc(a.title||"New achievement")+'</strong><small>STAR + numbers</small></summary>'+
  '<div class="gsp-ach-content"><div class="gsp-two">'+field("Achievement title","title",a.title,{target:"ach",type,index:i,ach:j})+
  field("Metric / numerical result","metricValue",a.metricValue,{target:"ach",type,index:i,ach:j})+'</div>'+
  '<div class="gsp-star-grid">'+
  field("Situation","situation",a.situation,{target:"ach",type,index:i,ach:j})+
  field("Task","task",a.task,{target:"ach",type,index:i,ach:j})+
  field("Action","action",a.action,{target:"ach",type,index:i,ach:j})+
  field("Result","result",a.result,{target:"ach",type,index:i,ach:j})+
  '</div>'+
  '<div class="gsp-two">'+
  field("What does the number measure?","metricContext",a.metricContext,{target:"ach",type,index:i,ach:j})+
  field("Evidence / source notes","evidenceNote",a.evidenceNote,{target:"ach",type,index:i,ach:j})+
  '</div>'+ 
  '<div class="gsp-metric-section"><div class="gsp-add-row"><strong>Additional measurable outcomes</strong>'+btn("add-metric","+ Add numerical outcome","gsp-btn-small",'data-type="'+type+'" data-index="'+i+'" data-ach="'+j+'"')+'</div>'+
  (a.additionalMetrics||[]).map((m,k)=>'<div class="gsp-metric-row"><div class="gsp-two">'+
    field("Number / value","value",m.value,{target:"metric",type,index:i,ach:j,metric:k})+
    field("What it measures","context",m.context,{target:"metric",type,index:i,ach:j,metric:k})+'</div>'+ 
    field("Supporting evidence","evidence",m.evidence,{target:"metric",type,index:i,ach:j,metric:k})+
    btn("remove-metric","Remove number","gsp-danger",'data-type="'+type+'" data-index="'+i+'" data-ach="'+j+'" data-metric="'+k+'"')+'</div>').join("")+
  '</div>'+
  '<div class="gsp-inline-foot">'+btn("remove-ach","Remove achievement","gsp-danger",'data-type="'+type+'" data-index="'+i+'" data-ach="'+j+'"')+
  '<small>STAR and numerical evidence stay inside this experience — they are not separate profile sections.</small></div></div></details>';
 }
 function card(type,x,i){
  const show=expanded===type+"-"+x.id;
  const name=x.employer||x.name||x.institution||x.organisation||x.title||x.targetRole||"New "+title(type).toLowerCase();
  const detail=type==="experience"?[x.title,x.startDate,x.endDate].filter(Boolean).join(" · "):type==="skills"?x.category: x.role||x.qualification||x.issuer||x.period||"";
  const values=FIELDS[type].map(([k,label])=>field(label,k,x[k]||"",{target:"entry",type,index:i,big:k==="summary"||k==="description"})).join("");
  const achievements=type==="experience"||type==="projects"?
  '<section class="gsp-ach-section"><div class="gsp-section-heading"><div><h4>Achievements and evidence</h4>'+
   '<p>Add several achievements under this one '+(type==="experience"?"job":"project")+'. Each can have its own STAR explanation and measurable outcome.</p></div>'+
   btn("add-ach","+ Add achievement","gsp-btn-primary",'data-type="'+type+'" data-index="'+i+'"')+'</div>'+
   (x.achievements||[]).map((a,j)=>achCard(type,i,a,j)).join("")+
   (!(x.achievements||[]).length?'<div class="gsp-empty-small">No achievements added yet.</div>':"")+'</section>':"";
  return '<article class="gsp-card"><button type="button" class="gsp-card-top" data-action="expand" data-type="'+type+'" data-id="'+esc(x.id)+'" aria-expanded="'+show+'">'+
    '<span class="gsp-number">'+String(i+1).padStart(2,"0")+'</span><span class="gsp-card-titles"><strong>'+esc(name)+'</strong><small>'+esc(detail||"Select to enter details")+'</small></span>'+
    '<span class="gsp-toggle">'+(show?"Collapse −":"Edit +")+'</span></button>'+
    (show?'<div class="gsp-card-body"><div class="gsp-fields">'+values+'</div>'+achievements+
    '<div class="gsp-inline-foot">'+btn("remove-entry","Remove this entry","gsp-danger",'data-type="'+type+'" data-index="'+i+'"')+'</div></div>':"")+'</article>';
 }
 function nav(){
  const choices=[["overview","Overview","Profile"],...TYPES.map(t=>[t[0],t[1],String(count(t[0]))])];
  return '<nav class="gsp-nav" aria-label="Profile sections">'+choices.map(([key,name,c])=>
   '<button type="button" data-action="navigate" data-type="'+key+'" aria-current="'+String(active===key)+'">'+
   '<span>'+esc(name)+'</span><small>'+esc(c)+'</small></button>').join("")+'</nav>';
 }
 function overview(){
  const o=profile.overview;
  return '<div class="gsp-intro"><span class="gsp-eyebrow">PERSONAL INFORMATION</span><h3>Professional overview</h3>'+
   '<p>Enter the details as if you were filling in a new Profile. The Drive documents remain available as reference only.</p></div>'+
  '<section class="gsp-card gsp-overview"><div class="gsp-fields">'+
  field("Full name","fullName",o.fullName)+field("Professional headline","headline",o.headline)+
  field("Location","location",o.location)+field("LinkedIn / portfolio links","links",o.links)+
  '<div class="gsp-wide">'+field("Professional summary","summary",o.summary,{big:true})+'</div></div></section>';
 }
 function listSection(){
  const type=active,info=TYPES.find(x=>x[0]===type),rows=profile.lists[type];
  return '<div class="gsp-intro"><span class="gsp-eyebrow">'+esc(info[2]).toUpperCase()+'</span><h3>'+esc(info[1])+'</h3>'+
   '<p>Each item is a separate, editable entry. Add as many as needed; nothing is copied automatically from the Drive router.</p></div>'+
   '<div class="gsp-add-row"><span><strong>'+rows.length+' '+esc(info[1].toLowerCase())+'</strong> in this Profile</span>'+
   btn("add-entry","+ "+esc(info[3]),"gsp-btn-primary",'data-type="'+type+'"')+'</div>'+
  (rows.length?rows.map((x,i)=>card(type,x,i)).join(""):'<div class="gsp-empty"><strong>Start with your first entry</strong><p>Your Profile will be organised into individual records rather than the original Drive headings.</p></div>');
 }
 function history(){
  if(!versionList)return "";
  return '<div class="gsp-history"><h4>Saved revision history</h4>'+
   (versionList.length?versionList.map(h=>'<div class="gsp-version"><span>Revision '+h.revision+' · '+esc(h.createdAt||"")+'</span>'+
   btn("history-version","Preview","gsp-btn-small",'data-version="'+h.revision+'"')+'</div>').join(""):'<p>No previous revisions saved.</p>')+
   (viewHistory?'<p class="gsp-note">Revision '+viewHistory.revision+' is available as a read-only backup. Use Download revision if needed.</p>'+
   btn("download-history","Download revision","gsp-btn-small"):"")+'</div>';
 }
 function render(){
  if(!root)return;
  if(!profile){root.innerHTML='<div class="gsp-app"><p>Opening your structured Profile…</p><p data-gsp-status>'+esc(status)+'</p></div>';return}
  const isDark=window.GaramaalTheme?.get?.()==="dark";root.classList.toggle("gsp-dark",!!isDark);
  root.innerHTML='<div class="gsp-app" role="dialog" aria-modal="true" aria-label="Structured Garamaal career profile">'+
   '<header class="gsp-header"><div><span class="gsp-eyebrow">GARAMAAL / CAREER PROFILE</span><h2>My career profile</h2></div>'+
   '<div class="gsp-header-actions"><span class="gsp-pill">'+(key==="pooja"?"Pooja":"Abhishek")+'</span>'+btn("close","Close")+'</div></header>'+
   '<div class="gsp-topline">Your information, your format. <strong>Firestore saves + revision history.</strong> Drive evidence is preserved separately. No CV source switch.</div>'+
   '<div class="gsp-body"><aside class="gsp-sidebar">'+nav()+
   '<div class="gsp-source">'+btn("source-archive","Open original Drive evidence","gsp-btn-link")+'<small>The original raw evidence is never shown as your editable career layout.</small></div>'+
   '</aside><main class="gsp-main">'+(active==="overview"?overview():listSection())+
   history()+'</main></div>'+
   '<footer class="gsp-footer"><span data-gsp-status role="status">'+esc(status||"No unsaved changes.")+'</span>'+
   '<div class="gsp-actions">'+btn("history","Version history")+btn("backup","Download backup for Drive")+btn("save","Save Profile","gsp-btn-primary")+'</div></footer></div>';
 }
 function updateField(el){
  const k=el.dataset.field,target=el.dataset.target,type=el.dataset.type,i=Number(el.dataset.index||0),j=Number(el.dataset.ach||0),m=Number(el.dataset.metric||0);
  if(target==="overview"&&Object.prototype.hasOwnProperty.call(profile.overview,k))profile.overview[k]=el.value;
  else if(target==="entry"&&profile.lists[type]?.[i]&&Object.prototype.hasOwnProperty.call(profile.lists[type][i],k))profile.lists[type][i][k]=el.value;
  else if(target==="ach"&&profile.lists[type]?.[i]?.achievements?.[j]&&Object.prototype.hasOwnProperty.call(profile.lists[type][i].achievements[j],k))profile.lists[type][i].achievements[j][k]=el.value;
  else if(target==="metric"&&profile.lists[type]?.[i]?.achievements?.[j]?.additionalMetrics?.[m]&&Object.prototype.hasOwnProperty.call(profile.lists[type][i].achievements[j].additionalMetrics[m],k))profile.lists[type][i].achievements[j].additionalMetrics[m][k]=el.value;
  else return;
  changed();
 }
 function dl(file,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=doc.createElement("a");
  a.href=url;a.download=file;a.style.display="none";doc.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function cleanExit(){
  if(dirty&&!window.confirm("You have unsaved Profile changes. Discard them?"))return false;
  root?.remove();root=null;profile=null;dirty=false;versionList=null;viewHistory=null;
  previous?.focus?.();return true;
 }
 async function open(){
  if(root&&!cleanExit())return;
  previous=doc.activeElement;key=typeof state!=="undefined"&&state.candidate==="Pooja"?"pooja":"abhishek";
  root=doc.createElement("div");root.className="gsp-root";doc.body.append(root);
  profile=null;active="overview";expanded="";dirty=false;status="Loading saved Profile…";render();
  const res=await request("read",{candidate:key});
  if(!root)return;
  if(!res?.profile){setStatus("Unable to load the Profile.");return}
  profile=res.profile;status=res.writesApproved?"Editable staging Profile ready.":"Viewing staging Profile. Saving is not yet enabled.";
  render();
 }
 const doc=document;
 doc.addEventListener("input",e=>{if(root?.contains(e.target)&&e.target.matches("[data-field]"))updateField(e.target)});
 doc.addEventListener("click",async e=>{
  const b=e.target.closest("button[data-action]");
  if(!b||!root?.contains(b)||busy||!profile)return;
  const action=b.dataset.action,type=b.dataset.type,i=Number(b.dataset.index||0),j=Number(b.dataset.ach||0);
  if(action==="close"){cleanExit();return}
  if(action==="navigate"){active=type;expanded="";versionList=null;viewHistory=null;render();return}
  if(action==="expand"){expanded=expanded===type+"-"+b.dataset.id?"":type+"-"+b.dataset.id;render();return}
  if(action==="add-entry"){const entry=fresh(type);profile.lists[type].push(entry);expanded=type+"-"+entry.id;changed();render();return}
  if(action==="remove-entry"){
   if(!window.confirm("Remove this entry from the draft? It will disappear from the saved Profile only after Save."))return;
   profile.lists[type].splice(i,1);expanded="";changed();render();return;
  }
  if(action==="add-ach"){profile.lists[type][i].achievements.push(freshAch());changed();render();return}
  if(action==="remove-ach"){
   if(!window.confirm("Remove this achievement from the draft?"))return;
   profile.lists[type][i].achievements.splice(j,1);changed();render();return;
  }
  if(action==="add-metric"){
   const a=profile.lists[type]?.[i]?.achievements?.[j];
   if(!a)return;
   a.additionalMetrics=a.additionalMetrics||[];
   a.additionalMetrics.push({id:makeId(),value:"",context:"",evidence:""});changed();render();return;
  }
  if(action==="remove-metric"){
   const a=profile.lists[type]?.[i]?.achievements?.[j];
   if(!a||!window.confirm("Remove this numerical outcome from the draft?"))return;
   a.additionalMetrics.splice(Number(b.dataset.metric||0),1);changed();render();return;
  }
  if(action==="source-archive"){
   if(!cleanExit())return;
   original.open();return;
  }
  if(action==="save"){
   const result=await request("save",{candidate:key,revision:profile.revision,profile});
   if(result?.revision){
    profile.revision=result.revision;dirty=false;versionList=null;
    setStatus("Saved to Firestore · Revision "+result.revision+". Download a backup for Google Drive when needed.");
   }return;
  }
  if(action==="history"){
   if(dirty){setStatus("Save or discard changes before opening revision history.");return}
   const results=await request("history",{candidate:key});
   if(results){versionList=results.versions||[];viewHistory=null;render()}return;
  }
  if(action==="history-version"){
   const version=Number(b.dataset.version);
   const result=await request("history-version",{candidate:key,revision:version});
   if(result){viewHistory=result;render()}return;
  }
  if(action==="download-history"){
   if(!viewHistory)return;
   dl("Garamaal_"+key+"_revision_"+viewHistory.revision+".json",
     {schema:"garamaal-career-backup-v1",candidate:key,revision:viewHistory.revision,profile:viewHistory.profile});
   setStatus("Historical revision downloaded. Store this JSON file privately.");return;
  }
  if(action==="backup"){
   if(dirty){setStatus("Save your pending edits before downloading a backup.");return}
   const latest=await request("read",{candidate:key});
   if(!latest?.profile)return;
   const p=latest.profile;
   if(!Number.isSafeInteger(p.revision)||p.revision<1){setStatus("Save your Profile before downloading a backup.");return}
   const day=new Date().toISOString().slice(0,10);
   dl("Garamaal_"+(key==="pooja"?"Pooja":"Abhishek")+"_career_profile_rev"+p.revision+"_"+day+".json",
      {schema:"garamaal-career-backup-v1",candidate:key,revision:p.revision,exportedAt:new Date().toISOString(),profile:p});
   setStatus("Backup downloaded. Upload the private JSON file to your Google Drive backup folder.");return;
  }
 });
 doc.addEventListener("keydown",e=>{if(root&&e.key==="Escape"){e.preventDefault();cleanExit()}});
 window.GaramaalProfile=Object.freeze({open,close:cleanExit});
})();
