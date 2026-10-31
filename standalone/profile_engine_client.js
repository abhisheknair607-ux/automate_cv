/* Garamaal Profile Engine: the editable evidence layer, not yet the CV source. */
(function(){
 "use strict";
 const legacy=window.GaramaalProfile||null;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const api=(endpoint,body)=>window.__cvStandalone.requestSpecial("profile/"+endpoint,body);
 const candidate=()=>typeof state!=="undefined"&&state.candidate==="Pooja"?"pooja":"abhishek";
 const emptyStar={situation:"",task:"",action:"",result:""};
 let mount=null,data=null,active="experience",expanded="",search="",busy=false,message="",preview=null,previous=null,key="abhishek";
 const count=s=>(data?.records||[]).filter(r=>r.section===s).length;
 const nice=s=>s==="verified"?"Verified":s==="exclude"?"Excluded":"Review needed";
 function button(action,label,extra=""){return '<button type="button" class="gmp-btn '+extra+'" data-gmp="'+action+'">'+label+'</button>'}
 function choices(value,options){return options.map(o=>'<option value="'+esc(o.id)+'" '+(value===o.id?"selected":"")+'>'+esc(o.title)+'</option>').join("")}
 function records(){
   if(!data?.records?.length)return '<div class="gmp-empty"><h3>No imported evidence yet</h3><p>Your original Google Drive documents can be imported into structured sections without changing the existing CV workflow.</p>'+button("preview","Inspect Drive sources","gmp-btn-primary")+'</div>';
   const items=data.records.filter(r=>r.section===active &&
      (!search||[r.title,r.originalText,...(r.tags||[])].join(" ").toLowerCase().includes(search.toLowerCase())));
   if(!items.length)return '<div class="gmp-empty"><strong>No evidence in this section.</strong><p>Choose another section, clear the search or add new evidence.</p></div>';
   return items.map(r=>{
    const star=r.star||emptyStar;
    return '<div class="gmp-card"><details data-record="'+esc(r.id)+'" '+(expanded===r.id?"open":"")+'>'+
      '<summary><strong>'+esc(r.title)+'</strong><small>'+nice(r.status)+'</small><span aria-hidden="true">⌄</span></summary>'+
      '<div class="gmp-card-body">'+
      '<p class="gmp-label">Original evidence · protected from editing</p>'+
      '<div class="gmp-original">'+esc(r.originalText)+'</div>'+
      '<div class="gmp-meta">'+esc(r.source?.kind||"user")+' · '+esc(r.source?.locator||"Candidate added")+'</div>'+
      '<div class="gmp-field"><label>Move to section</label><select data-field="section">'+choices(r.section,data.sections)+'</select></div>'+
      '<h4>STAR achievement</h4><div class="gmp-star">'+
      ["situation","task","action","result"].map(name=>'<label class="gmp-field">'+name[0].toUpperCase()+name.slice(1)+
       '<textarea data-star="'+name+'" maxlength="4000" placeholder="Enter supported '+name+' details">'+esc(star[name]||"")+'</textarea></label>').join("")+
      '</div>'+
      '<label class="gmp-field">CV-ready wording (review before use)<textarea data-field="cvBullet" maxlength="4000" placeholder="Clear action, scope, measurable result where verified">'+esc(r.cvBullet||"")+'</textarea></label>'+
      '<div class="gmp-metrics"><strong>Numbers found in source (not automatically verified):</strong> '+(r.metrics?.length?r.metrics.map(m=>'<span class="gmp-tag">'+esc(m)+'</span>').join(""):"No clear metrics found")+'</div>'+
      '<label class="gmp-field"><span><input data-field="metricsReviewed" type="checkbox" '+(r.metricsReviewed?"checked":"")+'/> I reviewed the numbers and their meaning against the original evidence</span></label>'+
      '<label class="gmp-field">Evidence status<select data-field="status">'+
         [["needs-review","Needs review"],["verified","Verified"],["exclude","Exclude from CV"]].map(([id,title])=>'<option value="'+id+'" '+(r.status===id?"selected":"")+'>'+title+'</option>').join("")+'</select></label>'+
      button("save-record","Save this evidence","gmp-btn-primary")+'</div></details></div>';
   }).join("");
 }
 function render(){
  if(!mount)return;
  const sections=data?.sections||[];
  const sourceCount=data?.sources?.length||0,recordCount=data?.records?.length||0;
  mount.innerHTML='<div class="gmp-app" role="dialog" aria-modal="true" aria-label="Garamaal Career Profile">'+
   '<header class="gmp-head"><div><p>GARAMAAL · CAREER INTELLIGENCE</p><h2>My Career Profile</h2></div>'+
   '<div class="gmp-head-controls"><span class="gmp-candidate">'+(key==="pooja"?"Pooja":"Abhishek")+'</span>'+button("close","Close")+'</div></header>'+
   '<div class="gmp-banner"><strong>CV evidence source: existing Google Drive</strong> · This editable structured profile is not used to make CVs until the workflow migration is tested. '+
    sourceCount+' Drive source files · '+recordCount+' evidence records · Revision '+(data?.revision||0)+'</div>'+
   '<div class="gmp-layout"><aside class="gmp-side">'+
      sections.map(s=>'<button data-section="'+esc(s.id)+'" aria-current="'+String(active===s.id)+'"><span>'+esc(s.title)+'</span><small>'+count(s.id)+'</small></button>').join("")+
      '<hr style="border:0;border-top:1px solid #c4a184;margin:10px 0">'+button("add-section","+ Add section")+'</aside>'+
   '<main class="gmp-main">'+
    (sections.length?'<select aria-label="Profile section" class="gmp-mobile-sections" data-gmp-mobile>'+choices(active,sections)+'</select>':"")+
    (data?.imported?
     '<h3>'+esc(sections.find(s=>s.id===active)?.title||"Profile evidence")+'</h3>'+
     '<p>Review original facts, complete STAR fields, check numbers, and decide whether this evidence belongs in a tailored CV.</p>'+
     '<div class="gmp-actions"><input class="gmp-search" type="search" data-gmp-search placeholder="Search original experience and skills" value="'+esc(search)+'">'+
       button("add-record","+ Add evidence")+button("add-section","+ Add section")+button("preview","Check Drive source changes")+'</div>'+records():
     '<div class="gmp-empty"><h3>Import your real Drive profile</h3><p>No source data has been imported for this candidate yet. Garamaal will read the configured Summary Router and Master Evidence Bank, organise them into reviewable sections, and retain the original text.</p>'+
     '<p><strong>Your existing CV automation will not change.</strong></p>'+button("preview","Inspect Drive sources","gmp-btn-primary")+
     (legacy?' '+button("legacy","Open previous local draft"):"")+'</div>')+
    (preview?'<div class="gmp-card" style="padding:14px"><h3>Source import preview</h3>'+
      '<p>'+preview.sources.map(s=>esc(s.title)+' ('+s.records+' records)').join(" · ")+'</p>'+
      '<p>'+preview.totalRecords+' total records. '+preview.counts.map(x=>esc(x.section)+': '+x.records).join(" · ")+'</p>'+
      (data?.imported?'<p>Re-import is intentionally blocked while existing edits need a reviewed merge.</p>':
       button("import","Import and structure my Drive profile","gmp-btn-primary"))+'</div>':"")+
    '</main></div><div class="gmp-status" role="status" aria-live="polite">'+esc(message||"Original Drive evidence remains unchanged.")+'</div></div>';
 }
 function say(text){message=text;const el=mount?.querySelector(".gmp-status");if(el)el.textContent=text}
 async function run(action,body,after){
  if(busy)return;busy=true;
  mount?.querySelectorAll("button").forEach(b=>b.disabled=true);
  try{const out=await api(action,body);if(after)await after(out);return out}
  catch(e){say(e.message||"Profile request failed");return null}
  finally{busy=false;mount?.querySelectorAll("button").forEach(b=>b.disabled=false)}
 }
 async function refresh(){
  const out=await run("read",{candidate:key},value=>{data=value;message="Profile loaded.";render()});
  return out;
 }
 function open(){
  if(mount)close();
  previous=document.activeElement;key=candidate();data=null;expanded="";preview=null;search="";message="Loading authorised profile…";
  mount=document.createElement("div");mount.className="gmp-root";mount.id="garamaal-profile-engine";document.body.append(mount);
  render();refresh();
 }
 function close(){
  mount?.remove();mount=null;data=null;
  (previous?.isConnected?previous:document.getElementById("gmv3-account-drawer-button"))?.focus?.();
 }
 async function saveRecord(card){
  const entry=data?.records?.find(r=>r.id===card.dataset.record);if(!entry)return;
  const val=name=>card.querySelector('[data-field="'+name+'"]');
  const star={};
  for(const name of ["situation","task","action","result"])star[name]=card.querySelector('[data-star="'+name+'"]').value;
  const changes={star,cvBullet:val("cvBullet").value,section:val("section").value,
    status:val("status").value,metricsReviewed:val("metricsReviewed").checked};
  const oldId=entry.id;
  await run("record",{candidate:key,revision:data.revision,id:oldId,changes},result=>{
    Object.assign(entry,changes);data.revision=result.revision;active=changes.section;expanded=oldId;
    message="Evidence saved to secure candidate profile.";render();
  });
 }
 async function addSection(){
  const title=window.prompt("Name for your new profile section (2–90 characters)");
  if(!title)return;
  const saved=await run("add-section",{candidate:key,revision:data.revision,title});
  if(saved)await refresh();
 }
 async function addRecord(){
  const title=window.prompt("Title of new achievement, project or experience");
  if(!title)return;
  const originalText=window.prompt("Describe the factual evidence (STAR details can be added after saving)");
  if(!originalText)return;
  const saved=await run("add-record",{candidate:key,revision:data.revision,section:active,title,originalText});
  if(saved)await refresh();
 }
 document.addEventListener("click",async e=>{
  if(!mount)return;
  if(e.target===mount){close();return}
  const section=e.target.closest?.("[data-section]");
  if(section&&mount.contains(section)){active=section.dataset.section;expanded="";search="";render();return}
  const button=e.target.closest?.("[data-gmp]");
  if(!button||!mount.contains(button))return;
  const action=button.dataset.gmp;
  if(action==="close"){close();return}
  if(action==="legacy"){close();legacy?.open();return}
  if(action==="save-record"){await saveRecord(button.closest("[data-record]"));return}
  if(action==="add-section"){await addSection();return}
  if(action==="add-record"){await addRecord();return}
  if(action==="preview"){
    await run("import-preview",{candidate:key},p=>{preview=p;message="Source preview completed. No files changed.";render()});return;
  }
  if(action==="import"){
    if(!window.confirm("Import original Drive evidence for "+key+" into your editable Garamaal Profile? This does not change your CV source."))return;
    const saved=await run("import",{candidate:key,confirm:true});
    if(saved){preview=null;await refresh();say("Source evidence imported. Review records and STAR metrics before CV use.");}
    return;
  }
 });
 document.addEventListener("toggle",e=>{if(!mount?.contains(e.target)||!e.target.matches?.("[data-record]"))return;
  if(e.target.open)expanded=e.target.dataset.record;
 },true);
 document.addEventListener("change",e=>{
  if(!mount?.contains(e.target))return;
  if(e.target.matches("[data-gmp-mobile]")){active=e.target.value;expanded="";search="";render()}
 });
 document.addEventListener("input",e=>{
  if(!mount?.contains(e.target)||!e.target.matches("[data-gmp-search]"))return;
  search=e.target.value;
  // Filter cards in place; avoid re-rendering the focused search input.
  mount.querySelectorAll("[data-record]").forEach(d=>{
   const r=data.records.find(x=>x.id===d.dataset.record);
   d.parentElement.hidden=!!search&&![r.title,r.originalText,...(r.tags||[])].join(" ").toLowerCase().includes(search.toLowerCase());
  });
 });
 document.addEventListener("keydown",e=>{if(mount&&e.key==="Escape"){e.preventDefault();close()}});
 window.GaramaalProfile=Object.freeze({open,close});
})();
