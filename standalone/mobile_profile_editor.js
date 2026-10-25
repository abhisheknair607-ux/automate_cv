/* Editable Profile V1 for the read-only Garamaal PROTOTYPE.
 * Browser-local, candidate-separated draft only. NEVER writes profile fields to
 * Freshmaal/Drive, CV generator, ranking engine, or any API.
 */
(function(){
 "use strict";
 if(typeof document==="undefined"||!document.body.classList.contains("gmv3-jobs-workspace"))return;
 const doc=document;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const who=()=>typeof state!=="undefined"&&state.candidate==="Pooja"?"Pooja":"Abhishek";
 const storeKey=name=>"gmv3-career-profile-local-v1:"+name;
 const sections=[
  ["identity","01","Personal details","Name, headline, location, summary"],
  ["work","02","Work experience","Employers, responsibilities and outcomes"],
  ["education","03","Education","Degrees and institutions"],
  ["certifications","04","Certifications","ACCA, QFA and further qualifications"],
  ["achievements","05","Achievements & projects","Impact, awards and evidence"],
  ["skills","06","Skills & interests","Tools, expertise and interests"],
  ["story","07","Personal story","An optional narrative for applications"],
  ["preferences","08","Career preferences","Roles, departments and locations"]
 ];
 function initial(){return {
  basics:{fullName:"",headline:"",city:"",country:"",summary:""},
  work:[{employer:"",title:"",period:"",achievements:""}],
  education:[{institution:"",qualification:"",period:""}],
  certifications:"",achievements:"",skills:"",story:"",
  preferences:{roles:"",departments:"",locations:"",workType:"",visa:""}
 }}
 function getProfile(name){
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(storeKey(name))||"null")}catch(_){}
  const base=initial();
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return base;
  for(const k of ["certifications","achievements","skills","story"])if(typeof raw[k]==="string")base[k]=raw[k].slice(0,20000);
  for(const k of ["basics","preferences"]){if(raw[k]&&typeof raw[k]==="object"){
   for(const field of Object.keys(base[k]))if(typeof raw[k][field]==="string")base[k][field]=raw[k][field].slice(0,4000)
  }}
  for(const k of ["work","education"])if(Array.isArray(raw[k]))base[k]=raw[k].slice(0,12).map(obj=>{
   const result={...initial()[k][0]};
   for(const f of Object.keys(result))if(typeof obj?.[f]==="string")result[f]=obj[f].slice(0,4000);
   return result;
  });
  return base;
 }
 function filled(d,key){
  if(key==="identity")return Object.values(d.basics).some(v=>v.trim());
  if(key==="work"||key==="education")return d[key].some(row=>Object.values(row).some(v=>v.trim()));
  if(key==="preferences")return Object.values(d.preferences).some(v=>v.trim());
  return !!String(d[key]).trim();
 }
 function complete(d){return sections.filter(([id])=>filled(d,id)).length}
 const field=(path,label,value,opts={})=>'<label class="gmv3-pf-field"><span>'+esc(label)+'</span>'+
  (opts.multi?'<textarea name="'+esc(path)+'" rows="'+(opts.rows||3)+'" maxlength="'+(opts.limit||4000)+'" placeholder="'+esc(opts.placeholder||"")+'">'+esc(value)+'</textarea>':
  '<input name="'+esc(path)+'" type="text" maxlength="'+(opts.limit||250)+'" value="'+esc(value)+'" placeholder="'+esc(opts.placeholder||"")+'" autocomplete="off">')+'</label>';
 function grouped(key,arr){
  const work=key==="work";
  return arr.map((item,i)=>'<div class="gmv3-pf-entry">'+
   '<div class="gmv3-pf-entry-head"><strong>'+ (work?"Experience ":"Education ") +(i+1)+'</strong>'+
   '<button type="button" data-gmp-remove="'+key+':'+i+'" aria-label="Remove entry '+(i+1)+'">Remove</button></div>'+
   (work?
    field("work."+i+".employer","Employer",item.employer,{placeholder:"Company or organisation"})+
    field("work."+i+".title","Job title",item.title)+
    field("work."+i+".period","Dates",item.period,{placeholder:"Start – end"})+
    field("work."+i+".achievements","Responsibilities and results",item.achievements,{multi:true,rows:3}):
    field("education."+i+".institution","Institution",item.institution)+
    field("education."+i+".qualification","Qualification",item.qualification)+
    field("education."+i+".period","Dates",item.period))+
   '</div>').join("")+
   '<button type="button" class="gmv3-pf-add" data-gmp-add="'+key+'">＋ Add '+(work?"experience":"education")+'</button>';
 }
 function fieldsFor(d,key){
  if(key==="identity")return field("basics.fullName","Full name",d.basics.fullName)+
    field("basics.headline","Professional headline",d.basics.headline,{placeholder:"e.g. Finance professional"})+
    '<div class="gmv3-pf-dual">'+field("basics.city","City",d.basics.city)+field("basics.country","Country",d.basics.country)+'</div>'+
    field("basics.summary","Professional summary",d.basics.summary,{multi:true});
  if(key==="work"||key==="education")return grouped(key,d[key]);
  if(key==="certifications")return field("certifications","Qualifications and certifications",d.certifications,{multi:true,rows:4,placeholder:"One qualification per line"});
  if(key==="achievements")return field("achievements","Achievements, projects and evidence",d.achievements,{multi:true,rows:4,placeholder:"Outcomes, metrics, awards, project links"});
  if(key==="skills")return field("skills","Skills, software and interests",d.skills,{multi:true,rows:4,placeholder:"Separate skills with commas or lines"});
  if(key==="story")return field("story","My professional story",d.story,{multi:true,rows:5,placeholder:"Optional context for future CVs and letters"});
  if(key==="preferences")return field("preferences.roles","Preferred job titles",d.preferences.roles)+
   field("preferences.departments","Departments",d.preferences.departments)+
   field("preferences.locations","Preferred locations",d.preferences.locations)+
   field("preferences.workType","Work type",d.preferences.workType,{placeholder:"Remote / hybrid / on-site"})+
   field("preferences.visa","Sponsorship preference",d.preferences.visa,{placeholder:"e.g. sponsorship needed in the UK"});
  return "";
 }
 let mount=null,current=null,model=null,previous=null,dirty=false;
 function collect(){
  if(!mount)return;
  const form=mount.querySelector("#gmv3-profile-form");if(!form)return;
  form.querySelectorAll("[name]").forEach(el=>{
   const value=String(el.value||"").slice(0,4000);
   const parts=el.name.split(".");
   if(parts.length===1){if(Object.prototype.hasOwnProperty.call(model,parts[0]))model[parts[0]]=value}
   else if(parts.length===2&&model[parts[0]]&&typeof model[parts[0]]==="object"&&!Array.isArray(model[parts[0]]))model[parts[0]][parts[1]]=value;
   else if(parts.length===3&&Array.isArray(model[parts[0]])&&model[parts[0]][Number(parts[1])])model[parts[0]][Number(parts[1])][parts[2]]=value;
  });
 }
 function render(openSection){
  if(!mount)return;
  const score=complete(model),pct=Math.round(score/sections.length*100);
  mount.innerHTML='<div class="gmv3-pf-backdrop"><section class="gmv3-pf-dialog" role="dialog" aria-modal="true" aria-label="My career profile">'+
   '<header class="gmv3-pf-top"><button type="button" data-gmp="close" aria-label="Close profile">‹</button>'+
   '<div><span>MY CAREER, MY WAY</span><h1>Career profile<span>.</span></h1></div>'+
   '<div class="gmv3-pf-candidate">'+esc(current)+'</div></header>'+
   '<div class="gmv3-pf-scroll"><div class="gmv3-pf-progress"><div><strong>Profile progress</strong><small>'+score+' of '+sections.length+' sections started</small></div>'+
   '<div class="gmv3-pf-track" role="progressbar" aria-label="Profile sections started" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div></div>'+
   '<form id="gmv3-profile-form">'+sections.map(([id,n,label,desc])=>
   '<details data-section="'+id+'" class="gmv3-pf-section" '+(openSection===id?'open':'')+'><summary>'+
   '<span class="gmv3-pf-number">'+n+'</span><span class="gmv3-pf-section-title"><strong>'+label+'</strong><small>'+desc+'</small></span>'+
   '<span class="gmv3-pf-dot '+(filled(model,id)?"is-filled":"")+'" aria-label="'+(filled(model,id)?"Started":"Not started")+'"></span></summary>'+
   '<div class="gmv3-pf-section-fields">'+fieldsFor(model,id)+'</div></details>').join("")+'</form>'+
   '<p class="gmv3-pf-footnote">Draft saved only in this browser for '+esc(current)+'. No changes to Sheets, CV generation or ranking.</p></div>'+
   '<footer class="gmv3-pf-footer"><button type="button" data-gmp="clear" class="gmv3-pf-reset">Clear draft</button>'+
   '<button type="button" data-gmp="save" class="gmv3-pf-save">Save profile</button></footer>'+
   '<div class="gmv3-pf-message" role="status" aria-live="polite"></div></section></div>';
 }
 function close(){
  if(!mount)return;
  mount.remove();mount=null;dirty=false;
  (previous?.isConnected?previous:doc.querySelector("#gmv3-account-drawer-button"))?.focus?.();
 }
 function open(){
  if(mount)close();
  current=who();model=getProfile(current);previous=doc.activeElement;
  mount=doc.createElement("div");mount.id="gmv3-profile-modal";doc.body.append(mount);
  render();
  mount.querySelector('[data-gmp="close"]')?.focus();
 }
 function save(){
  collect();
  try{localStorage.setItem(storeKey(current),JSON.stringify({...model,version:1,updatedAt:new Date().toISOString()}))}catch(err){
   mount.querySelector(".gmv3-pf-message").textContent="Browser storage is unavailable. This draft is not saved.";return;
  }
  dirty=false;
  const openSection=mount.querySelector(".gmv3-pf-section[open]")?.querySelector("summary")?.parentElement?.dataset?.section;
  render(openSection);
  mount.querySelector(".gmv3-pf-message").textContent="Saved on this device.";
 }
 doc.addEventListener("click",e=>{
  if(!mount||!mount.contains(e.target))return;
  if(e.target.classList.contains("gmv3-pf-backdrop")){close();return}
  const el=e.target.closest?.("[data-gmp],[data-gmp-add],[data-gmp-remove]");
  if(!el)return;
  if(el.dataset.gmp==="close"){close();return}
  if(el.dataset.gmp==="save"){save();return}
  if(el.dataset.gmp==="clear"){
   if(!window.confirm("Clear the browser-only draft for "+current+"?"))return;
   try{localStorage.removeItem(storeKey(current))}catch(_){}
   model=initial();render();return;
  }
  const add=el.dataset.gmpAdd,remove=el.dataset.gmpRemove;
  if(add&&["work","education"].includes(add)){
   collect();if(model[add].length>=12)return;
   model[add].push({...initial()[add][0]});dirty=true;render(add);return
  }
  if(remove){
   const [key,n]=remove.split(":");collect();
   if(["work","education"].includes(key)&&Number.isInteger(+n)){
    model[key].splice(+n,1);dirty=true;render(key)
   }
  }
 });
 doc.addEventListener("input",e=>{if(mount?.contains(e.target)&&e.target.matches?.("[name]"))dirty=true});
 doc.addEventListener("keydown",e=>{
  if(!mount)return;
  if(e.key==="Escape"){close();return}
  if(e.key==="Tab"){
   const focusables=[...mount.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),summary')].filter(el=>el.getClientRects().length);
   const first=focusables[0],last=focusables.at(-1);
   if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 window.GaramaalProfile=Object.freeze({open,close});
})();