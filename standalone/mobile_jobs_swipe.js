/* Garamaal /prototype Jobs Swipe — gesture-first Stage 3.
 * Uses existing per-candidate listJobs/getJob read APIs.
 * PREVIEW MODE: all gestures and decisions are browser-only. Never call
 * setJobPreference, transferJob, updateFreshControl, updateApplicationProgress,
 * or the paid runCvApiNow API against live Freshmaal.
 */
(function(global){
 "use strict";
 const types=Object.freeze({left:"Not interested",down:"Maybe later",right:"Review next step"});
 function clean(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
 function direction(dx,dy){
  if(Math.abs(dx)>=72 && Math.abs(dx)>=Math.abs(dy)*1.22)return dx<0?"left":"right";
  if(dy>=76 && dy>Math.abs(dx)*1.2)return "down";
  return null;
 }
 function jobKey(job){
  const url=String(job.url||"").trim().toLowerCase().replace(/#.*$/,"").replace(/\/$/,"");
  let sum=2166136261;for(let i=0;i<url.length;i++)sum=Math.imul(sum^url.charCodeAt(i),16777619)>>>0;
  return (job.source==="fresh"?"f":"t")+":"+String(job.row)+":"+sum.toString(36);
 }
 function workTerms(detail){
  const jd=String(detail?.jd||"").replace(/\s+/g," ").trim();
  const salary=String(detail?.salary||"").trim();
  let pay="";
  if(/(?:€|£|\$)\s*[\d,]+(?:\s*[-–]\s*(?:€|£|\$)?\s*[\d,]+)?(?:\s*(?:per annum|p\.a\.|annually|\/year|\/hour|hourly|per hour))?/i.test(salary))pay=salary.slice(0,90);
  if(!pay){
   const match=jd.match(/(?:salary|pay|compensation|remuneration|package|hourly rate|annual salary)\s*(?:range|is|from|:|-)?\s*((?:€|£|\$)\s*[\d,]+(?:\s*(?:-|–|to)\s*(?:€|£|\$)?\s*[\d,]+)?(?:\s*(?:per annum|annually|a year|\/year|per hour|\/hour|p\.a\.))?)/i);
   if(match)pay=match[1].trim();
  }
  let visa="";
  if(/\b(?:no|without|not offering|unable to provide|cannot provide)\s+(?:visa|work.permit)\s+sponsorship\b|\b(?:visa|work.permit)\s+sponsorship\s+(?:is\s+)?(?:not|unavailable)\b/i.test(jd))visa="Sponsorship not offered";
  else if(/\b(?:visa|work.permit)\s+sponsorship\s+(?:is\s+)?(?:available|offered|provided)\b|\b(?:offers?|provides?)\s+(?:visa|work.permit)\s+sponsorship\b/i.test(jd))visa="Sponsorship offered";
  else if(/\b(?:must|need to)\s+(?:already\s+)?(?:have|hold)\s+(?:the\s+)?(?:right|legal (?:right|authorization))\s+to\s+work\b/i.test(jd))visa="Right to work required";
  // Brief verbatim excerpt of the saved JD, not an invented AI paraphrase.
  let summary="";
  const raw=jd.replace(/^(?:job description|about the role|the role)\s*[:.\-]?\s*/i,"");
  const sentence=raw.split(/(?<=[.!?])\s+/)[0]||"";
  if(sentence.length>=35)summary=sentence.slice(0,165)+(sentence.length>165?"…":"");
  // Bounded additional excerpt: never expose the entire saved JD on the swipe card.
  const remaining=raw.slice(Math.min(raw.length,Math.min(sentence.length,165))).trim();
  const maxExtra=Math.min(760,Math.max(0,remaining.length-40));
  const more=maxExtra>=20?remaining.slice(0,maxExtra).trim()+(remaining.length>maxExtra?"…":""):"";
  return {pay,visa,summary,more};
 }
 function phase(job,local){
  local=local||{};
  const progress=local.progress||job.progress||"Unapplied";
  if(local.rejected||job.notInterested||progress==="Applied + Connected"||progress==="Accepted")return "hidden";
  if(local.connected&&progress==="Applied")return "hidden";
  if(progress==="Applied")return "connect";
  if(job.cvLink)return "apply";
  if(job.source==="taaza")return "discovery";
  if(local.cvDrafted)return "cv-pending";
  return local.interested||job.favorite?"cv":"interest";
 }
 const helpers=Object.freeze({direction,phase,jobKey,workTerms});
 if(typeof module!=="undefined"&&module.exports)module.exports=helpers;
 if(typeof document==="undefined"||typeof window==="undefined")return;
 const doc=document;
 let surface=null,active=false,candidate="",epoch=0,loading=false,deck=[],later=[],seen=new Set(),current=null,details=null,panelOpen=false;
 const cursors={fresh:{page:1,done:false},taaza:{page:1,done:false}};
 let decisions={},pointer=null,card=null,interactionBusy=false,metadata=new Map(),expanded=false,suppressCardClickUntil=0;
 const storageKey=name=>"gmv3-swipe-preview-v2:"+name;
 function person(){try{return typeof state!=="undefined"&&state.candidate==="Pooja"?"Pooja":"Abhishek"}catch(_){return "Abhishek"}}
 function loadDecisions(name){try{const v=JSON.parse(localStorage.getItem(storageKey(name))||"{}");return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}catch(_){return {}}}
 function persist(){try{localStorage.setItem(storageKey(candidate),JSON.stringify(decisions))}catch(_){}}
 function choice(job){return decisions[jobKey(job)]||{}}
 function save(job,partial){decisions[jobKey(job)]=Object.assign({},choice(job),partial);persist()}
 function eligible(job){return phase(job,choice(job))!=="hidden"}
 function resetState(name){
  candidate=name;epoch++;deck=[];later=[];seen.clear();current=null;details=null;panelOpen=false;interactionBusy=false;expanded=false;suppressCardClickUntil=0;
  for(const src of ["fresh","taaza"]){cursors[src].page=1;cursors[src].done=false}
  decisions=loadDecisions(name);metadata.clear();
 }
 function activeJob(){return current||deck[0]||null}
 function badge(job){
  const st=phase(job,choice(job));
  return {discovery:"Interested? Start here",interest:"Ready to shortlist",cv:"Prepare a CV", "cv-pending":"CV request drafted",apply:"CV ready — application step",connect:"Applied — connection step"}[st]||"Review";
 }
 function safeLink(v){try{const u=new URL(String(v||""));return /^https?:$/.test(u.protocol)?u.href:""}catch(_){return ""}}
 function footer(){return '<div class="gmv3-swipe-help"><span>← Reject</span><span>↓ Later</span><span>Continue →</span></div><p class="gmv3-swipe-small">Swipe the card itself in any direction. Drag with a mouse on desktop, or use ← ↓ → when the card is focused.</p>'}
 function shell(content){
  if(!surface)return;
  surface.innerHTML='<div class="gmv3-swipe-body gmv3-gesture-screen">'+
   '<div class="gmv3-swipe-heading"><div><span class="gmv3-swipe-kicker">CAREER DECK · '+clean(candidate)+'</span><h2>Swipe & apply<span aria-hidden="true">.</span></h2></div>'+
   '<button class="gmv3-swipe-reset" type="button" data-gs="reset" title="Clear browser-only swipe decisions">Reset test</button></div>'+
   '<p class="gmv3-swipe-readonly">Browser-only QA · Reads your real Jobs list · No Sheet edits, application changes or paid CV runs</p>'+
   '<div id="gmv3-card-stage" aria-live="polite">'+content+'</div>'+footer()+
   '<div id="gmv3-swipe-action-layer" aria-live="polite"></div></div>';
  card=surface.querySelector(".gmv3-drag-card");
 }
 function cardHtml(job){
  const key=jobKey(job),details=metadata.get(key);
  const summary=details?.summary?'<p class="gmv3-swipe-summary">'+clean(details.summary)+'</p>':"";
  const metadataTags=[
    details?.visa?'<span class="gmv3-swipe-evidence">'+clean(details.visa)+'</span>':"",
    details?.pay?'<span class="gmv3-swipe-evidence">'+clean(details.pay)+'</span>':""
  ].filter(Boolean).join("");
  const url=safeLink(job.url);
  const title=url?'<a class="gmv3-swipe-title-link" href="'+clean(url)+'" target="_blank" rel="noopener noreferrer" aria-label="Open employer vacancy or apply page for '+clean(job.role||"job")+'">'+clean(job.role||"Position not specified")+'</a>':clean(job.role||"Position not specified");
  const company=url?'<a class="gmv3-swipe-company-link" href="'+clean(url)+'" target="_blank" rel="noopener noreferrer" aria-label="Open vacancy or apply page for '+clean(job.company||"company")+'">'+clean(job.company||"Company not specified")+'</a>':clean(job.company||"Company not specified");
  const moreItems=[
    details?.more?'<p class="gmv3-swipe-more-excerpt">'+clean(details.more)+'</p>':"",
    job.deadline?'<span>Deadline: '+clean(job.deadline)+'</span>':"",
    job.progress?'<span>Application: '+clean(choice(job).progress||job.progress)+'</span>':"",
    job.source==='fresh'?'<span>Make CV listing</span>':'<span>Discovery listing</span>'
  ].filter(Boolean).join("");
  return '<article class="gmv3-drag-card'+(expanded?' gmv3-card-expanded':'')+'" tabindex="0" aria-expanded="'+String(expanded)+'" aria-label="Tap to '+(expanded?'collapse':'expand')+' highlights, or swipe card left to reject, down to postpone, right for next step" data-gs="card">'+
   '<div class="gmv3-drag-flash gmv3-left" aria-hidden="true">PASS</div><div class="gmv3-drag-flash gmv3-right" aria-hidden="true">NEXT</div>'+
   '<div class="gmv3-drag-flash gmv3-down" aria-hidden="true">LATER</div>'+ 
   '<div class="gmv3-swipe-drag-grip" aria-hidden="true"><span class="gmv3-swipe-grip-mark">≡</span><span>Swipe from here</span><span class="gmv3-swipe-grip-mark">⇄</span></div>'+
   '<div class="gmv3-swipe-card-top"><span class="gmv3-swipe-source">'+company+'</span></div>'+
   '<h3>'+title+'</h3>'+
   (job.location?'<p class="gmv3-swipe-place">'+clean(job.location)+'</p>':"")+
   '<div class="gmv3-swipe-summary-area">'+summary+'</div>'+
   '<div class="gmv3-swipe-tags">'+metadataTags+'</div>'+ 
   '<div class="gmv3-swipe-extra" id="gmv3-swipe-quick-details" role="region" tabindex="0" aria-label="Scroll additional job highlights" '+(expanded?'':'hidden')+'><strong>More about this role · scroll for details</strong>'+moreItems+'</div>'+
   '<div class="gmv3-swipe-card-foot"><button type="button" class="gmv3-expand-hint" data-gs="toggle" aria-controls="gmv3-swipe-quick-details" aria-expanded="'+String(expanded)+'">'+(expanded?'Show less':'Show more')+'</button><button type="button" data-gs="jd" class="gmv3-jd-expand">Job description ↗</button></div>'+
   '</article>';
 }
 async function readEvidence(job){
  const key=jobKey(job);
  if(metadata.has(key))return;
  const ticket=epoch;
  try{
   const detail=await run("getJob",{source:job.source,row:job.row,candidate});
   if(ticket!==epoch||!active)return;
   const info=workTerms(detail||{});
   metadata.set(key,info);
   if(current===job&&!panelOpen){
    const area=card?.querySelector(".gmv3-swipe-summary-area");
    const tags=card?.querySelector(".gmv3-swipe-tags");
    if(area)area.innerHTML=info.summary?'<p class="gmv3-swipe-summary">'+clean(info.summary)+'</p>':"";
    if(tags)tags.innerHTML=[info.visa,info.pay].filter(Boolean).map(v=>'<span class="gmv3-swipe-evidence">'+clean(v)+'</span>').join("");
    const more=card?.querySelector('.gmv3-swipe-more-excerpt');
    const extra=card?.querySelector('.gmv3-swipe-extra');
    if(extra&&info.more&&!more)extra.insertAdjacentHTML('beforeend','<p class="gmv3-swipe-more-excerpt">'+clean(info.more)+'</p>');
   }
  }catch(_){
   // Do not show fabricated salary or visa claims when source lookup fails.
  }
 }
 function render(){
  if(!active||!surface)return;
  if(person()!==candidate){open(surface);return}
  if(panelOpen)return;
  if(!current){current=deck.shift()||null}
  if(current&&!eligible(current)){current=null;render();return}
  if(current){shell(cardHtml(current));readEvidence(current);return}
  if(loading){shell('<div class="gmv3-swipe-empty" role="status"><strong>Finding your next job…</strong><p>Checking candidate-specific Discovery and Make CV records.</p></div>');return}
  if(!cursors.fresh.done||!cursors.taaza.done){shell('<div class="gmv3-swipe-empty" role="status">Loading more vacancies…</div>');refill();return}
  if(later.length){deck.push(...later.splice(0));current=null;render();return}
  shell('<div class="gmv3-swipe-empty"><strong>You’re caught up.</strong><p>No more jobs to review in this feed. Reopen Swipe to refresh the source records.</p><button type="button" data-gs="refresh">Refresh feed</button></div>');
 }
 async function refill(){
  if(loading||!active)return;
  loading=true;const ticket=epoch;
  try{
   for(const src of ["fresh","taaza"]){
    const cursor=cursors[src];if(cursor.done)continue;
    // Existing server-side candidate-aware listJobs is the only source.
    const result=await run("listJobs",{source:src,candidate,tabId:"all",filter:"all",sort:src==="fresh"?"score":"newest",page:cursor.page,pageSize:15,query:""});
    if(!active||ticket!==epoch)return;
    const rows=Array.isArray(result.rows)?result.rows:[];
    for(const entry of rows){
     const job=Object.assign({},entry,{source:src});
     const key=jobKey(job);if(seen.has(key)||!eligible(job))continue;
     seen.add(key);deck.push(job);
    }
    cursor.done=cursor.page>=Number(result.pages||1)||rows.length===0;
    cursor.page++;
   }
  }catch(error){
   if(active&&ticket===epoch){const el=surface?.querySelector("#gmv3-card-stage");if(el&&!deck.length)el.innerHTML='<div class="gmv3-swipe-empty"><strong>Couldn’t load the feed.</strong><p>'+clean(error.message||"Please try again.")+'</p><button type="button" data-gs="refresh">Retry</button></div>';}
   loading=false;return;
  }
  loading=false;
  if(active&&ticket===epoch)render();
 }
 function finishSwipe(kind){
  if(!current||interactionBusy)return;
  interactionBusy=true;
  const item=current;
  const node=card;
  if(node){
   node.classList.add("gmv3-dismiss-"+kind);
  }
  const done=()=>{
   if(!active||current!==item)return;
   if(kind==="left")save(item,{rejected:true});
   else if(kind==="down")later.push(item);
   current=null;interactionBusy=false;expanded=false;
   render();
  };
  if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)done();else setTimeout(done,180);
 }
 function openOptions(){
  if(!current||panelOpen||interactionBusy)return;
  panelOpen=true;
  const job=current,d=choice(job),st=phase(job,d);
  const box=surface.querySelector("#gmv3-swipe-action-layer");
  const links=job.cvLink?'<a href="'+clean(safeLink(job.cvLink))+'" rel="noopener noreferrer" target="_blank">Open generated CV ↗</a>':"";
  let options="";
  if(st==="discovery"){
   options='<button data-gs-option="interest">★ Interested</button>'+
    (job.jdReady?'<button data-gs-option="transfer">Prepare for CV</button>':'<button data-gs-option="jd">Review missing JD first</button>');
  }else if(st==="interest"||st==="cv"){
   options=(st==="interest"?'<button data-gs-option="interest">★ Interested</button>':"")+
    '<button data-gs-option="cv">Generate CV</button>';
  }else if(st==="cv-pending"){
   options='<button data-gs-option="cv">Review CV request</button><button data-gs-option="later">Check later</button>';
  }else if(st==="apply"){
   options='<button data-gs-option="applied">Mark applied</button><button data-gs-option="unapplied">Not applied yet</button>'+links;
  }else if(st==="connect"){
   options='<button data-gs-option="connected">Mark connected</button><button data-gs-option="not-connected">Not connected yet</button>'+links;
  }
  box.innerHTML='<div class="gmv3-choice-shade" role="presentation"><section class="gmv3-choice-sheet" role="dialog" aria-modal="true" aria-label="Choose next action">'+
   '<div class="gmv3-choice-heading"><div><span>NEXT STEP</span><h3>'+clean(job.role||"Job")+'</h3></div><button type="button" data-gs-option="close" aria-label="Close options">×</button></div>'+
   '<p>'+clean(job.company||"")+' · '+clean(badge(job))+'</p>'+
   '<div class="gmv3-choice-buttons">'+options+'</div>'+
   '<p class="gmv3-choice-note">Preview only — choices are saved in this browser, not in Freshmaal or Google Sheets. CV generation does not run here.</p></section></div>';
  box.querySelector('[data-gs-option="close"]')?.focus();
 }
 function closeOptions(){panelOpen=false;const el=surface?.querySelector("#gmv3-swipe-action-layer");if(el)el.innerHTML="";card?.focus()}
 function park(item){
  current=null;interactionBusy=false;panelOpen=false;expanded=false;
  later.push(item);
  render();
  if(deck.length<3 && (!cursors.fresh.done||!cursors.taaza.done))refill();
 }
 function showNotice(message){
  const stage=surface?.querySelector("#gmv3-card-stage");
  if(stage)stage.insertAdjacentHTML("beforeend",'<p role="status" class="gmv3-swipe-toast">'+clean(message)+'</p>');
 }
 function act(action){
  const job=current;if(!job)return;
  if(action==="close"){closeOptions();return}
  if(action==="jd"){closeOptions();showDetails();return}
  if(action==="later"){closeOptions();finishSwipe("down");return}
  if(action==="interest"){
   save(job,{interested:true});closeOptions();park(job);return
  }
  if(action==="transfer"){
   save(job,{interested:true,transferDrafted:true});
   closeOptions();park(job);return
  }
  if(action==="cv"){
   if(job.cvLink){closeOptions();showNotice("Your CV is already saved. Swipe right to mark the application.");return}
   save(job,{interested:true,cvDrafted:true});closeOptions();
   park(job);return
  }
  if(action==="applied"){
   save(job,{progress:"Applied"});closeOptions();park(job);return
  }
  if(action==="unapplied"){
   save(job,{progress:"Unapplied"});closeOptions();park(job);return
  }
  if(action==="connected"){
   save(job,{progress:"Applied + Connected",connected:true});closeOptions();
   current=null;expanded=false;render();return
  }
  if(action==="not-connected"){
   save(job,{progress:"Applied",connected:false});closeOptions();park(job);
  }
 }
 async function showDetails(){
  if(!current||panelOpen)return;
  const item=current;panelOpen=true;
  const layer=surface.querySelector("#gmv3-swipe-action-layer");
  layer.innerHTML='<div class="gmv3-choice-shade"><section class="gmv3-choice-sheet" role="dialog" aria-modal="true" aria-label="Job description"><div class="gmv3-choice-heading"><h3>Job description</h3><button type="button" data-gs-option="close" aria-label="Close">×</button></div><p role="status">Loading saved JD…</p></section></div>';
  try{
   const detail=await run("getJob",{source:item.source,row:item.row,candidate});
   if(!panelOpen||current!==item)return;
   const box=layer.querySelector(".gmv3-choice-sheet");
   if(!box)return;
   box.innerHTML='<div class="gmv3-choice-heading"><h3>'+clean(detail?.role||item.role)+'</h3><button type="button" data-gs-option="close">×</button></div>'+
    '<p>'+clean(detail?.company||item.company)+'</p><div class="gmv3-choice-jd">'+clean(detail?.jd||"Full job description is not available.")+'</div>'+
    '<div class="gmv3-choice-buttons">'+detailActions(item)+'</div>'+
    (safeLink(item.url)?'<a href="'+clean(safeLink(item.url))+'" target="_blank" rel="noopener noreferrer">Employer listing ↗</a>':"")+
    '<p class="gmv3-choice-note">Swipe decisions are browser-only. Generate CV prepares a preview request; no paid work is launched.</p>';
  }catch(error){
   if(panelOpen){const p=layer.querySelector('p[role="status"]');if(p)p.textContent=String(error.message||"Could not load JD")}
  }
 }
 function detailActions(job){
  const st=phase(job,choice(job));
  if(st==="discovery")return '<button type="button" data-gs-option="interest">Interested</button><button type="button" data-gs-option="transfer">Prepare for CV</button>';
  if(st==="cv"||st==="interest"||st==="cv-pending")return '<button type="button" data-gs-option="cv">Generate CV (preview request)</button>';
  if(st==="apply")return '<button type="button" data-gs-option="applied">Mark applied</button><button type="button" data-gs-option="unapplied">Not applied yet</button>';
  if(st==="connect")return '<button type="button" data-gs-option="connected">Connected</button><button type="button" data-gs-option="not-connected">Not connected yet</button>';
  return "";
 }
 function onPointerDown(e){
  const node=e.target.closest?.(".gmv3-drag-card");
  if(!node||!current||panelOpen||interactionBusy||e.isPrimary===false)return;
  if(e.target.closest("button,a,summary,details,input,textarea,select,.gmv3-swipe-extra"))return;
  // Expanded cards need native vertical scrolling. Only the top grip handles
  // gestures then; the rest of the card is free for touch/trackpad scrolling.
  if(expanded&&!e.target.closest(".gmv3-swipe-drag-grip"))return;
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};
  node.setPointerCapture?.(e.pointerId);
 }
 function onPointerMove(e){
  if(!pointer||pointer.id!==e.pointerId||!card)return;
  pointer.dx=e.clientX-pointer.x;pointer.dy=e.clientY-pointer.y;
  if(Math.hypot(pointer.dx,pointer.dy)>13)suppressCardClickUntil=Date.now()+450;
  const dx=Math.max(-180,Math.min(180,pointer.dx));
  const dy=Math.max(-180,Math.min(180,pointer.dy));
  card.style.transform="translate("+dx+"px,"+Math.max(-12,dy)+"px) rotate("+(dx/32)+"deg)";
  const dir=direction(pointer.dx,pointer.dy);
  card.dataset.swiping=dir||"none";
 }
 function onPointerEnd(e){
  if(!pointer||pointer.id!==e.pointerId)return;
  const dir=direction(pointer.dx,pointer.dy);
  if(Math.hypot(pointer.dx,pointer.dy)>13)suppressCardClickUntil=Date.now()+450;
  pointer=null;
  if(card){card.style.transform="";delete card.dataset.swiping;}
  if(dir==="left"||dir==="down")finishSwipe(dir);
  else if(dir==="right")openOptions();
 }
 function onKeyboard(e){
  if(!active||panelOpen||!current)return;
  if(doc.activeElement!==card)return;
  if(e.key==="ArrowLeft"){e.preventDefault();finishSwipe("left")}
  else if(e.key==="ArrowDown"){e.preventDefault();finishSwipe("down")}
  else if(e.key==="ArrowRight"){e.preventDefault();openOptions()}
  else if(e.key==="Enter"||e.key===" "){e.preventDefault();expanded=!expanded;render();card?.focus()}
 }
 function onClick(e){
  if(!active)return;
  if(e.target.closest?.("a"))return; // Do not intercept employer/application hyperlinks.
  // Interacting with scrollable information must never collapse the card.
  if(e.target.closest?.(".gmv3-swipe-extra"))return;
  const el=e.target.closest?.("[data-gs],[data-gs-option]");
  if(!el){if(e.target.classList.contains("gmv3-choice-shade"))closeOptions();return}
  const action=el.getAttribute("data-gs-option");
  if(action){act(action);return}
  const command=el.getAttribute("data-gs");
  if(command==="card"){
    if(panelOpen||interactionBusy||Date.now()<suppressCardClickUntil)return;
    expanded=!expanded;render();card?.focus();return;
  }
  if(command==="toggle"){expanded=!expanded;render();card?.focus();return}
  if(command==="jd"){showDetails();return}
  if(command==="refresh"){open(surface);return}
  if(command==="reset"){
   if(!window.confirm("Clear "+candidate+"'s browser-only swipe test decisions? No Sheets data will change."))return;
   try{localStorage.removeItem(storageKey(candidate))}catch(_){}
   open(surface);
  }
 }
 function open(target){
  surface=target||surface;if(!surface)return;
  active=true;resetState(person());surface.hidden=false;
  shell('<div class="gmv3-swipe-empty" role="status"><strong>Loading your career deck…</strong><p>Personalised jobs from your existing candidate profile.</p></div>');
  refill();
 }
 function close(){active=false;epoch++;panelOpen=false;current=null;pointer=null;expanded=false}
 if(doc.body.classList.contains("gmv3-jobs-workspace")){
  doc.addEventListener("keydown",onKeyboard);
  doc.addEventListener("click",e=>{
   if(e.target.closest?.('[data-action="candidate"]'))setTimeout(()=>{if(active&&person()!==candidate)open(surface)},0);
  },true);
 }
 // Bind once at root; rendering the next card does not reinstall listeners.
 doc.addEventListener("pointerdown",e=>{if(active&&surface?.contains(e.target))onPointerDown(e)});
 doc.addEventListener("pointermove",e=>{if(active&&pointer)onPointerMove(e)});
 doc.addEventListener("pointerup",e=>{if(active&&pointer)onPointerEnd(e)});
 doc.addEventListener("pointercancel",e=>{if(pointer&&pointer.id===e.pointerId){pointer=null;if(card){card.style.transform="";delete card.dataset.swiping}}});
 doc.addEventListener("click",e=>{if(active&&surface?.contains(e.target))onClick(e)});
 global.GaramaalSwipeDeck=Object.freeze({open,close,direction,phase,jobKey});
})(typeof window!=="undefined"?window:globalThis);
