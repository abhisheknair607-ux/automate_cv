/* Garamaal Profile Stage 3: authenticated, responsive, evidence-first editor.
 * Drive originals are immutable. The CV worker still reads Google Drive.
 * No browser prompts or profile-specific direct Firebase clients.
 */
(function(){
 "use strict";
 const doc=document,previousEditor=window.GaramaalProfile||null;
 const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const api=(name,body)=>window.__cvStandalone.requestSpecial("profile/"+name,body);
 const currentCandidate=()=>typeof state!=="undefined"&&state.candidate==="Pooja"?"pooja":"abhishek";
 const names=["situation","task","action","result"];
 let mount=null,previous=null,data=null,readiness=null,preview=null,key="abhishek";
 let active="experience",query="",filter="all",expanded="",limit=40,form=null,archived=false,dirty=false,busy=false,status="";
 let jdText="",jdMatch=null,starAssists={},numericChecks={};
 let refreshPlan=null,refreshDecisions={},historyList=null,historySnapshot=null;
 const buttons=(action,title,extra="",aria="")=>'<button type="button" class="gmp-btn '+extra+'" data-action="'+action+'"'+
   (aria?' aria-label="'+esc(aria)+'"':'')+'>'+title+'</button>';
 const sourceUrl=id=>/^[a-zA-Z0-9_-]{15,120}$/.test(String(id||""))?
    "https://drive.google.com/file/d/"+encodeURIComponent(id)+"/view":"";
 const sections=()=>data?.sections||[];
 const selected=()=>sections().find(x=>x.id===active&&!x.archived);
 const records=()=>data?.records||[];
 const total=id=>records().filter(r=>r.section===id).length;
 const sectionSelect=(value,mode="record")=>sections().filter(s=>!s.archived).map(s=>
   '<option value="'+esc(s.id)+'"'+(s.id===value?' selected':'')+'>'+esc(s.title)+'</option>').join("");
 const checked=value=>value?" checked":"";
 const hiddenWrite=()=>readiness?.profileWritesApproved===false;
 function setStatus(message){status=message;const el=mount?.querySelector(".gmp-status");if(el)el.textContent=message}
 function hasUnsaved(){return dirty||!!form;}
 function guardExit(){return !hasUnsaved()||window.confirm("You have unsaved profile changes. Discard them?")}
 function btnBusy(yes){
  busy=yes;
  mount?.querySelectorAll("button").forEach(el=>{el.disabled=yes});
 }
 async function request(name,body){
  if(busy)return null;
  btnBusy(true);
  try{return await api(name,body)}
  catch(error){setStatus(error.message||"Request failed. Profile not changed.");return null}
  finally{btnBusy(false)}
 }
 async function load({initial=false}={}){
  if(!mount)return;
  const loaded=await request("read",{candidate:key});
  if(!loaded)return;
  data=loaded;form=null;dirty=false;limit=40;
  if(!selected())active=sections().find(s=>!s.archived)?.id||"experience";
  setStatus(initial?"Profile loaded. Original Drive records remain unchanged.":"Profile refreshed.");
  render();
 }
 function filterMatches(record){
  if(query.trim()&&![
   record.title,record.originalText,record.cvBullet,...(record.tags||[]),
   record.source?.locator,sections().find(s=>s.id===record.section)?.title
  ].join(" ").toLowerCase().includes(query.toLowerCase().trim()))return false;
  if(!query.trim()&&record.section!==active)return false;
  if(filter==="review"&&!(record.status==="needs-review"||
    (record.classification?.needsReview&&!record.classificationReviewed)))return false;
  if(filter==="duplicate"&&!record.duplicateOf)return false;
  if(filter==="reference"&&record.cvEligible!==false)return false;
  if(filter==="verified"&&record.status!=="verified")return false;
  return true;
 }
 function provenance(r){
  const link=sourceUrl(r.source?.fileId);
  const pos=r.source?.lineStart?" · Extracted lines "+r.source.lineStart+"–"+r.source.lineEnd:"";
  return '<div class="gmp-meta">'+esc(r.source?.kind==="user"?"Candidate-added":r.source?.kind==="router"?"Drive reference":"Drive evidence")+
    ' · '+esc(r.source?.locator||"User entry")+esc(pos)+
    (link?' · <a href="'+link+'" target="_blank" rel="noopener noreferrer">Open original Drive file ↗</a>':"")+'</div>';
 }

 function starAssistancePanel(r){
  const preview=starAssists[r.id];
  if(!preview)return "";
  const fields=preview.fields||{};
  return '<section class="gmp-stage4-card" aria-label="Source-backed STAR suggestions">'+
   '<h5>Source-backed STAR suggestions <small>Review only · nothing saved</small></h5>'+
   '<p class="gmp-stage4-note">Only verbatim excerpts are proposed. Empty fields mean the original evidence does not support a safe suggestion.</p>'+
   names.map(name=>{
    const item=fields[name],label=name.charAt(0).toUpperCase()+name.slice(1);
    return item?'<label class="gmp-stage4-option"><input type="checkbox" data-assist-star="'+name+'">'+
     '<span><strong>'+label+'</strong><small>Source characters '+item.source.start+'–'+item.source.end+'</small>'+
     '<span class="gmp-stage4-quote">'+esc(item.text)+'</span></span></label>':
     '<div class="gmp-stage4-gap"><strong>'+label+':</strong> No reliable excerpt found. Add only if supported by evidence.</div>';
   }).join("")+
   (preview.bullet?'<label class="gmp-stage4-option"><input type="checkbox" data-assist-bullet>'+
    '<span><strong>CV draft (verbatim excerpt)</strong><span class="gmp-stage4-quote">'+esc(preview.bullet.text)+'</span></span></label>':"")+
   '<p class="gmp-stage4-note"><strong>Numbers observed in the original:</strong> '+
    (preview.sourceNumbers?.length?preview.sourceNumbers.map(m=>'<span class="gmp-tag" title="'+esc(m.sourceQuote)+'">'+esc(m.value)+'</span>').join(""):"None")+
    '</p><p class="gmp-stage4-note">Each number still needs context and ownership verification.</p>'+
   buttons("apply-star-preview","Insert selected excerpts into draft","gmp-btn-primary")+
   '</section>';
 }
 function numericReviewPanel(r){
  const item=numericChecks[r.id];
  if(!item)return "";
  const checks=item.checks||[];
  const unsupported=checks.filter(x=>x.status==="unsupported-number");
  const different=checks.filter(x=>x.status==="context-review");
  return '<section class="gmp-stage4-card" aria-label="Numbers checked against original evidence"><h5>Numerical evidence review</h5>'+
    '<p><strong>'+checks.length+' numerical phrase'+(checks.length===1?"":"s")+' checked</strong> · '+
      unsupported.length+' not present · '+different.length+' possible outcome mismatches</p>'+
    (checks.length?checks.map(c=>
     '<div class="gmp-metric-audit"><strong>'+esc(c.value)+'</strong> · <span class="gmp-metric-status '+esc(c.status)+'">'+
       esc(c.status==="unsupported-number"?"Unsupported":c.status==="context-review"?"Context mismatch":"Value found; review required")+'</span>'+
     '<p>'+esc(c.warning)+'</p>'+
     (c.sourceContexts?.length?'<details><summary>Show original sentence'+(c.sourceContexts.length>1?"s":"")+'</summary>'+
       c.sourceContexts.map(ref=>'<blockquote>'+esc(ref.sourceQuote)+'</blockquote>').join("")+'</details>':"")+'</div>'
     ).join(""):'<p>No recognised numbers in this draft; this does not establish the draft is factually supported.</p>')+
    '<p class="gmp-stage4-note">Only original evidence can support a number. A matching amount is never automatic proof of outcome, attribution or timing. Review before marking verified.</p></section>';
 }
 function jdMatcherPanel(){
  if(!data?.imported)return "";
  const result=jdMatch;
  return '<section class="gmp-jd-box"><details data-jd-details'+(result?" open":"")+'>'+
   '<summary><strong>JD keyword evidence screen</strong> <small>Local draft · no CV generation</small></summary>'+
   '<div class="gmp-jd-body"><label class="gmp-field">Paste a job description<textarea data-jd-text maxlength="20000" rows="5" placeholder="Paste the JD to identify supported keywords and evidence gaps. JD text is never saved to the Profile.">'+esc(jdText)+'</textarea></label>'+
   buttons("match-jd","Find evidence-backed keywords","gmp-btn-primary")+
   '<p class="gmp-stage4-note">A matching word does not establish competence. Suggestions are exact phrase/alias matches only.</p>'+
   (result?'<div class="gmp-jd-results"><h5>Supported keywords for review ('+result.matchedTerms.length+')</h5>'+
     (result.matchedTerms.length?result.matchedTerms.map(item=>'<div class="gmp-jd-term"><strong>'+esc(item.term)+'</strong>'+
       item.recordMatches.slice(0,4).map(hit=>'<div class="gmp-jd-evidence"><span>'+esc(hit.title)+' · '+esc(hit.recordStatus)+
        '</span><p>'+esc(hit.sourceQuote)+'</p>'+
        '<button type="button" class="gmp-btn gmp-btn-small" data-action="insert-jd-tag" data-record-id="'+esc(hit.recordId)+
        '" data-term="'+esc(item.term)+'">Review and insert tag</button></div>').join("")+'</div>').join(""):
       '<p>No supported terms found in the original evidence.</p>')+
    '<h5>JD terms not supported by source ('+result.unmatchedTerms.length+')</h5>'+
     (result.unmatchedTerms.length?'<p class="gmp-stage4-warning">'+result.unmatchedTerms.map(x=>esc(x.term)).join(" · ")+'</p>':
      '<p>No unmatched terms in the limited keyword dictionary; this is not a complete skills assessment.</p>')+
    '</div>':"")+'</div></details></section>';
 }
 function evidenceCard(r){
  const editable=r.source?.kind==="user",star=r.star||{};
  const statusList=[["needs-review","Needs review"],["verified","Verified"],["exclude","Exclude from CV"]];
  const statusOptions=statusList.filter(x=>r.cvEligible!==false||x[0]!=="verified");
  const sourceBadge=r.cvEligible===false?"Routing reference":r.source?.kind==="user"?"User-added":"Original evidence";
  return '<article class="gmp-card" data-card="'+esc(r.id)+'"><details data-record="'+esc(r.id)+'"'+(expanded===r.id?" open":"")+'>'+
   '<summary><div class="gmp-record-title"><strong>'+esc(r.title)+'</strong><small>'+
    esc(sections().find(s=>s.id===r.section)?.title||"Unclassified")+' · '+esc(sourceBadge)+'</small></div>'+
    '<span class="gmp-pill">'+esc(r.status==="verified"?"Verified":r.status==="exclude"?"Excluded":"Review")+'</span><span aria-hidden="true">⌄</span></summary>'+
   '<div class="gmp-card-body">'+
   '<div class="gmp-split"><label class="gmp-field">Record title<input data-field="title" maxlength="180" value="'+esc(r.title)+'"></label>'+
   '<label class="gmp-field">Section<select data-field="section">'+sectionSelect(r.section)+'</select></label></div>'+
   (editable?
    '<label class="gmp-field">Your factual evidence<textarea data-field="originalText" maxlength="12000" rows="6">'+esc(r.originalText)+'</textarea></label>'+
    '<p class="gmp-review-note">Changing factual evidence resets its metrics and verified status.': 
    '<p class="gmp-label">Original evidence — protected from editing</p>'+
    '<div class="gmp-original">'+esc(r.originalText)+'</div>')+
    (editable?'</p>':'')+
    (editable?'':'<label class="gmp-field">Structured working facts (editable; original kept above)<textarea data-field="workingText" maxlength="12000" rows="5" placeholder="Correct or clarify the source facts here. New claims require separate evidence review.">'+esc(r.workingText||"")+'</textarea></label>')+
    provenance(r)+
    (r.classification?.needsReview?
     '<p class="gmp-review-note"><strong>Classification review:</strong> '+esc(r.classification.reason)+'. Confirm the section below.</p>':"")+
    (r.cvEligible===false?'<p class="gmp-review-note">This is a routing instruction, not a standalone CV claim. It cannot be verified for CV use.</p>':"")+
    (r.duplicateOf?'<p class="gmp-review-note">Possible duplicate of record '+esc(r.duplicateOf)+'. Both originals are preserved.</p>':"")+
    '<label class="gmp-check"><input type="checkbox" data-field="classificationReviewed"'+checked(r.classificationReviewed)+'>'+
    ' I reviewed the section classification</label>'+
    (r.cvEligible===false?'<p class="gmp-stage4-note">Routing references are not eligible for STAR suggestions or numerical-claim approval.</p>':
     '<div class="gmp-stage4-actions">'+buttons("suggest-star","Suggest STAR from original")+
     buttons("check-claims","Check draft numbers")+'</div>')+
    '<div data-star-panel>'+starAssistancePanel(r)+'</div>'+
    '<div data-numeric-panel>'+numericReviewPanel(r)+'</div>'+
    '<h4>STAR evidence</h4><div class="gmp-star">'+names.map(n=>
      '<label class="gmp-field">'+n[0].toUpperCase()+n.slice(1)+
      '<textarea data-star="'+n+'" maxlength="4000" rows="3" placeholder="Enter only what the original evidence supports">'+esc(star[n]||"")+'</textarea></label>').join("")+'</div>'+
    '<label class="gmp-field">CV-ready bullet (draft, not yet used by the CV generator)<textarea data-field="cvBullet" maxlength="4000" rows="3" placeholder="Action · scope · verified result">'+esc(r.cvBullet||"")+'</textarea></label>'+
    '<label class="gmp-field">Search keywords and skills (comma-separated)<input data-field="tags" maxlength="1800" value="'+esc((r.tags||[]).join(", "))+'" placeholder="transfer pricing, stakeholder management"></label>'+
    '<div class="gmp-metrics"><strong>Numbers detected in original source:</strong> '+
      ((r.metrics||[]).length?r.metrics.map(m=>'<span class="gmp-tag">'+esc(m)+'</span>').join(""):"None detected")+'</div>'+
    (r.workingMetrics?.length?'<div class="gmp-metrics"><strong>Numbers in edited working facts:</strong> '+
      r.workingMetrics.map(m=>'<span class="gmp-tag">'+esc(m)+'</span>').join("")+'</div>':'')+
    '<label class="gmp-check"><input type="checkbox" data-field="metricsReviewed"'+checked(r.metricsReviewed)+'> I checked the figures against the original record</label>'+
    '<label class="gmp-field">Review status<select data-field="status">'+
      statusOptions.map(([val,label])=>'<option value="'+val+'"'+(r.status===val?" selected":"")+'>'+label+'</option>').join("")+'</select></label>'+
    '<div class="gmp-record-footer">'+buttons("save-record","Save evidence","gmp-btn-primary")+
      buttons("reset-record","Discard field changes")+'</div></div></details></article>';
 }
 function editor(){
  if(!form)return "";
  let title="",contents="";
  if(form.mode==="add-record"){
   title="Add factual evidence";
   contents='<p>Record the original facts first. STAR details and numbers can be reviewed after saving.</p>'+
    '<label class="gmp-field">Title<input name="title" required minlength="2" maxlength="180" placeholder="e.g., TaxLink — client coordination" value="'+esc(form.title||"")+'"></label>'+
    '<label class="gmp-field">Section<select name="section">'+sectionSelect(form.section||active)+'</select></label>'+
    '<label class="gmp-field">Description / proof<textarea name="originalText" required minlength="2" maxlength="12000" rows="6" placeholder="What you actually did, tools, responsibilities, impact, source context">'+esc(form.originalText||"")+'</textarea></label>';
  }else{
   const changing=form.mode==="rename-section";
   title=changing?"Rename section":"Add a new section";
   contents='<label class="gmp-field">Section name<input name="title" required minlength="2" maxlength="90" value="'+esc(form.title||"")+'" placeholder="e.g., Industry research"></label>'+
    '<p>Custom sections can be reordered and archived when empty. Original evidence is never deleted.</p>';
  }
  return '<section class="gmp-inline-editor" aria-label="'+esc(title)+'"><div class="gmp-form-head"><h3>'+esc(title)+'</h3>'+
    buttons("cancel-form","Cancel")+'</div><form id="gmp-editor-form">'+contents+
    '<div class="gmp-actions"><button type="submit" class="gmp-btn gmp-btn-primary">Save</button></div></form></section>';
 }
 function sourcePreview(){
  if(!preview)return "";
  return '<section class="gmp-inline-editor"><h3>Drive import preview</h3>'+
   '<p>'+preview.sources.map(s=>esc(s.title)+' ('+s.records+' records)').join(" · ")+'</p>'+
   '<p>'+preview.totalRecords+' records · '+Number(preview.classificationReview||0)+' classification checks · '+
    Number(preview.routerReferences||0)+' routing references · '+Number(preview.duplicateCandidates||0)+' potential duplicates</p>'+
   '<p>Extracted-text audit: '+(preview.allSourcesComplete?"Passed":"Not verified")+'</p>'+
   (data?.imported?'<p>Refreshing an imported profile needs a future reviewed merge; existing edits are safe.</p>':
    (readiness?.profileWritesApproved&&preview.allSourcesComplete?buttons("import","Import evidence","gmp-btn-primary"):
      '<p>Import is locked until the authenticated staging write gate is approved.</p>'))+'</section>';
 }

 function refreshPanel(){
  if(!refreshPlan)return "";
  const p=refreshPlan,changes=p.changes||[],summary=p.summary||{};
  const selections={added:[["","Choose..."],["accept","Import new evidence"],["skip","Skip for now"]],
    changed:[["","Choose..."],["replace","Use updated source, archive old"],["keep","Keep previous, unverified"]],
    removed:[["","Choose..."],["archive","Archive missing source"],["keep","Keep for review, not CV"]]};
  const decided=changes.filter(c=>refreshDecisions[c.id]).length;
  return '<section class="gmp-inline-editor gmp-refresh-review" aria-label="Review Drive changes">'+
   '<div class="gmp-form-head"><h3>Review Google Drive changes</h3>'+buttons("close-refresh","Close review")+'</div>'+
   '<p>'+Number(summary.added||0)+' added · '+Number(summary.changed||0)+' updated · '+
    Number(summary.removed||0)+' missing · '+Number(summary.unchanged||0)+' unchanged</p>'+
   '<p class="gmp-review-note">No information is overwritten. Replaced and missing originals remain in the profile history. Updated claims require fresh STAR and metrics review.</p>'+
   (changes.length?'<div class="gmp-refresh-items">'+changes.map(change=>
    '<div class="gmp-refresh-item"><div class="gmp-refresh-meta"><strong>'+esc(change.type.toUpperCase())+
     '</strong><small>'+esc(change.sourceKind)+' · '+esc(change.locator)+'</small></div>'+
     (change.beforeExcerpt?'<details><summary>Previous original'+(change.beforeTruncated?' (excerpt)':'')+
       '</summary><pre>'+esc(change.beforeExcerpt)+'</pre></details>':'')+
     (change.afterExcerpt?'<details><summary>Latest Drive original'+(change.afterTruncated?' (excerpt)':'')+
       '</summary><pre>'+esc(change.afterExcerpt)+'</pre></details>':'')+
     '<label class="gmp-field">Your decision<select data-refresh-decision="'+esc(change.id)+'">'+
      selections[change.type].map(([v,label])=>'<option value="'+v+'"'+
       (refreshDecisions[change.id]===v?' selected':'')+'>'+label+'</option>').join("")+
     '</select></label></div>').join("")+'</div>'+
    '<p>'+decided+' of '+changes.length+' decisions chosen. Select one option for every item.</p>'+
    buttons("apply-refresh","Apply reviewed Drive changes","gmp-btn-primary"):
    '<p>There are no source changes to merge. The original profile remains intact.</p>')+
   '</section>';
 }
 function historyPanel(){
  if(!historyList)return "";
  const versions=historyList.versions||[],snap=historySnapshot;
  return '<section class="gmp-inline-editor gmp-history-review">'+
   '<div class="gmp-form-head"><h3>Profile revision history</h3>'+buttons("close-history","Close history")+'</div>'+
   '<p class="gmp-stage4-note">Immutable, read-only snapshots saved with each approved edit. No rollback is performed by opening a version.</p>'+
   (historyList.baselinePending?'<p class="gmp-review-note">Legacy baseline will be snapshotted during the next approved edit.</p>':'')+
   '<div class="gmp-history-list">'+(versions.length?versions.map(v=>
    '<div class="gmp-history-item"><span><strong>Revision '+v.revision+'</strong> · '+esc(v.action)+
     '<small>'+esc(v.createdAt||"")+' · '+Number(v.recordCount||0)+' records</small></span>'+
     '<button type="button" class="gmp-btn gmp-btn-small" data-action="view-history" data-history-revision="'+v.revision+'">View</button></div>').join(""):
    '<p>No stored history versions. New edits will create snapshots.</p>')+'</div>'+
   (snap?'<div class="gmp-history-snapshot"><h4>Snapshot '+snap.revision+' · '+esc(snap.action)+'</h4>'+
     '<p>'+esc(snap.createdAt||"")+' · '+Number(snap.profile?.records?.length||0)+' records · read-only</p>'+
     (snap.profile?.records||[]).slice(0,15).map(r=>
      '<details><summary>'+esc(r.title)+' · '+esc(r.status)+'</summary>'+
       '<pre>'+esc(String(r.originalText||"").slice(0,1800))+'</pre></details>').join("")+
      ((snap.profile?.records||[]).length>15?'<p>Showing the first 15 records from this snapshot.</p>':'')+
     '</div>':"")+'</section>';
 }
 function readinessPane(){
  if(!readiness)return "";
  return '<section class="gmp-inline-editor"><h3>Staging connection status</h3><p>Firestore: '+
   (readiness.firestore?.ready?"Readable":"Unavailable")+' · Editing: '+
   (readiness.profileWritesApproved?"Approved":"Locked")+'</p><p>'+
   (readiness.drive||[]).map(s=>esc(s.kind)+": "+(s.accessible?"Accessible":"Not available")).join(" · ")+'</p></section>';
 }
 function sidePanel(){
  const visible=sections().filter(s=>!s.archived);
  const index=sections().findIndex(s=>s.id===active);
  return '<aside class="gmp-side" aria-label="Career profile sections">'+
    '<div class="gmp-side-head"><strong>SECTIONS</strong>'+buttons("add-section","+ Add","gmp-btn-small")+'</div>'+
    '<nav class="gmp-section-nav">'+visible.map(s=>'<button type="button" class="gmp-section-button" data-section="'+esc(s.id)+'" aria-current="'+String(active===s.id)+'">'+
       '<span>'+esc(s.title)+'</span><small>'+total(s.id)+'</small></button>').join("")+'</nav>'+
    '<div class="gmp-section-manage"><strong>Manage selected section</strong>'+
      '<div class="gmp-section-controls">'+buttons("move-up","↑","gmp-btn-small", "Move section up")+
       buttons("move-down","↓","gmp-btn-small","Move section down")+
       (active.startsWith("custom_")?buttons("rename-section","Rename","gmp-btn-small")+buttons("archive-section","Archive","gmp-btn-small"):"")+'</div></div>'+
    buttons("toggle-archived",archived?"Hide archived":"Archived sections","gmp-btn-small")+
    (archived?'<div class="gmp-archived">'+sections().filter(s=>s.archived).map(s=>
      '<div>'+esc(s.title)+' '+buttons("restore-section","Restore","gmp-btn-small").replace("data-action=","data-section-id=\""+esc(s.id)+"\" data-action=")+'</div>').join("")+'</div>':"")+'</aside>';
 }
 function main(){
  if(!data)return '<div class="gmp-empty"><h3>Loading profile</h3><p>Checking your authenticated candidate record.</p></div>';
  if(!data.imported)return '<div class="gmp-empty"><h3>Bring your Google Drive evidence into Garamaal</h3>'+
    '<p>First check both Drive sources and Firestore access. Previewing does not change your original files or CV workflow.</p>'+
    '<div class="gmp-actions">'+buttons("readiness","Check connections")+buttons("preview","Preview source import","gmp-btn-primary")+
    (previousEditor?buttons("legacy","Open previous local draft"):"")+'</div></div>'+readinessPane()+sourcePreview();
  const list=records().filter(filterMatches);
  return '<div class="gmp-main-head"><div><h3>'+esc(query.trim()?"Search results":selected()?.title||"Career evidence")+'</h3>'+
   '<p>'+list.length+' matching records · Your original source documents are always preserved.</p></div></div>'+
   '<div class="gmp-toolbar"><label class="gmp-search-wrap">Search all evidence'+
   '<input class="gmp-search" type="search" data-search value="'+esc(query)+'" placeholder="Skills, results, employers, keywords"></label>'+
   '<label class="gmp-filter-wrap">Show<select data-filter><option value="all"'+(filter==="all"?" selected":"")+'>All records</option>'+
   [['review','Needs review'],['duplicate','Possible duplicates'],['verified','Verified'],['reference','Routing references']].map(([v,label])=>
    '<option value="'+v+'"'+(filter===v?" selected":"")+'>'+label+'</option>').join("")+'</select></label></div>'+
   '<div class="gmp-actions">'+buttons("add-record","+ Add evidence","gmp-btn-primary")+
   buttons("add-section","+ Add section")+buttons("preview","Check Drive sources")+
   buttons("readiness","Connections")+
   buttons("refresh-preview","Review Drive changes")+buttons("history","Version history")+'</div>'+
   refreshPanel()+historyPanel()+jdMatcherPanel()+editor()+
   '<div class="gmp-results"><div class="gmp-record-list">'+(list.length?list.slice(0,limit).map(evidenceCard).join(""):
    '<div class="gmp-empty"><strong>No matching evidence.</strong><p>Change the filter or add factual evidence in this section.</p></div>')+'</div>'+
   (list.length>limit?buttons("load-more","Load more ("+(list.length-limit)+" remaining)"):"")+'</div>'+
   readinessPane()+sourcePreview();
 }
 function render(){
  if(!mount)return;
  const k=key==="pooja"?"Pooja":"Abhishek",n=records().length,review=records().filter(r=>r.status==="needs-review").length;
  mount.classList.toggle("gmp-dark",window.GaramaalTheme?.get?.()==="dark");
  mount.innerHTML='<div class="gmp-app" role="dialog" aria-modal="true" aria-label="'+esc(k)+' Career Profile">'+
   '<header class="gmp-head"><div><p>GARAMAAL / PROFILE ENGINE</p><h2>Career evidence<span class="gmp-accent">.</span></h2></div>'+
    '<div class="gmp-head-controls"><span class="gmp-candidate">'+k+'</span>'+buttons("close","Close","gmp-close")+'</div></header>'+
   '<div class="gmp-banner"><strong>CV source: original Google Drive</strong> · Profile edits are saved separately until CV migration is approved.'+
    (data?.imported?' <span class="gmp-stats">'+n+' records · '+review+' to review · rev '+data.revision+'</span>':"")+'</div>'+
   '<div class="gmp-layout">'+(data?.imported?sidePanel():'<aside class="gmp-side"><p>Existing Drive sources</p></aside>')+
    '<main class="gmp-main" id="gmp-main" tabindex="-1">'+
    (data?.imported?'<label class="gmp-mobile-label">Section<select class="gmp-mobile-sections" data-mobile-section>'+sectionSelect(active)+'</select></label>'+
     '<div class="gmp-mobile-manage">'+buttons("move-up","Move up")+buttons("move-down","Move down")+
     (active.startsWith("custom_")?buttons("rename-section","Rename")+buttons("archive-section","Archive"):"")+
     buttons("toggle-archived",archived?"Hide archived":"Archived")+'</div>'+
     (archived?'<div class="gmp-mobile-archived">'+sections().filter(x=>x.archived).map(x=>
       '<div><strong>'+esc(x.title)+'</strong>'+
       buttons("restore-section","Restore","gmp-btn-small").replace("data-action=","data-section-id=\""+esc(x.id)+"\" data-action=")+'</div>').join("")+'</div>':""):"")+
     main()+'</main></div>'+
    '<div class="gmp-status" role="status" aria-live="polite">'+esc(status||"Original evidence remains unchanged.")+'</div></div>';
 }
 async function open(){
  if(mount)close(true);
  previous=doc.activeElement;key=currentCandidate();data=null;readiness=null;preview=null;query="";filter="all";active="experience";expanded="";limit=40;form=null;dirty=false;jdText="";jdMatch=null;starAssists={};numericChecks={};refreshPlan=null;refreshDecisions={};historyList=null;historySnapshot=null;status="Loading secure profile…";
  mount=doc.createElement("div");mount.className="gmp-root";mount.id="garamaal-profile-engine";doc.body.append(mount);render();
  await load({initial:true});
  if(!mount)return;
  const connection=await request("readiness",{candidate:key});
  if(connection){readiness=connection;render()}
  mount?.querySelector('[data-action="close"]')?.focus();
 }
 function close(force=false){
  if(!mount)return;
  if(!force&&!guardExit())return;
  mount.remove();mount=null;data=null;
  (previous?.isConnected?previous:doc.getElementById("gmv3-account-drawer-button"))?.focus?.();
 }
 function navigate(section){
  if(!guardExit())return;
  active=section;form=null;dirty=false;expanded="";limit=40;query="";filter="all";render();
 }
 async function refresh(message){
  if(!mount)return;
  const out=await request("read",{candidate:key});
  if(!out)return;
  data=out;form=null;dirty=false;expanded="";limit=40;starAssists={};numericChecks={};jdMatch=null;refreshPlan=null;refreshDecisions={};historyList=null;historySnapshot=null;
  if(!selected())active=sections().find(x=>!x.archived)?.id||"experience";
  status=message||"Profile saved.";render();
 }
 async function editSection(action,id=active,title=""){
  if(!data?.imported)return;
  const result=await request("section",{candidate:key,revision:data.revision,id,action,title});
  if(result)await refresh("Section "+(action==="rename"?"renamed":action==="archive"?"archived":action==="restore"?"restored":"reordered")+".");
 }
 async function submitInline(el){
  if(!data?.imported)return;
  const values=Object.fromEntries(new FormData(el));
  if(form.mode==="add-record"){
   const result=await request("add-record",{candidate:key,revision:data.revision,section:values.section,title:values.title,originalText:values.originalText});
   if(result){active=values.section;await refresh("New evidence saved. Complete STAR fields before marking it verified.");}
  }else if(form.mode==="add-section"){
   const result=await request("add-section",{candidate:key,revision:data.revision,title:values.title});
   if(result)await refresh("Section added.");
  }else if(form.mode==="rename-section"){
   const result=await request("section",{candidate:key,revision:data.revision,id:form.id,action:"rename",title:values.title});
   if(result)await refresh("Section renamed.");
  }
 }
 async function saveRecord(card){
  const id=card?.dataset.record,r=records().find(x=>x.id===id);
  if(!r)return;
  const f=k=>card.querySelector('[data-field="'+k+'"]');
  const star=Object.fromEntries(names.map(name=>[name,card.querySelector('[data-star="'+name+'"]').value]));
  const changes={title:f("title").value,section:f("section").value,
   cvBullet:f("cvBullet").value,tags:f("tags").value.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean),
   metricsReviewed:f("metricsReviewed").checked,classificationReviewed:f("classificationReviewed").checked,
   status:f("status").value,star};
  if(r.source?.kind==="user")changes.originalText=f("originalText").value;
  else changes.workingText=f("workingText").value;
  const result=await request("record",{candidate:key,revision:data.revision,id,changes});
  if(result){active=changes.section;await refresh("Evidence changes saved.");expanded=id;render();}
 }
 doc.addEventListener("click",async event=>{
  if(!mount)return;
  if(event.target===mount){close();return}
  const summary=event.target.closest?.("summary");
  if(summary&&mount.contains(summary)){
   const details=summary.closest("[data-record]");
   if(details){
    if(form||(expanded&&expanded!==details.dataset.record&&dirty)){
     if(!guardExit()){event.preventDefault();return}
     event.preventDefault();
     dirty=false;form=null;expanded=details.dataset.record;
     status="Unsaved edits discarded. Original saved records are unchanged.";
     render();return;
    }
    mount.querySelectorAll("details[data-record]").forEach(node=>{if(node!==details)node.open=false});
    expanded=details.dataset.record;
   }
   return;
  }
  const section=event.target.closest?.("[data-section]");
  if(section&&mount.contains(section)){navigate(section.dataset.section);return}
  const el=event.target.closest?.("[data-action]");
  if(!el||!mount.contains(el)||busy)return;
  const action=el.dataset.action;
  if(action==="close"){close();return}
  if(action==="legacy"){if(guardExit()){close(true);previousEditor?.open()}return}
  if(action==="reset-record"){if(!guardExit())return;dirty=false;render();return}
  if(action==="suggest-star"){
   const card=el.closest("[data-record]"),id=card?.dataset.record;
   if(!id)return;
   const result=await request("suggest",{candidate:key,recordId:id,revision:data.revision});
   if(result){
    starAssists[id]=result;
    const panel=card.querySelector("[data-star-panel]");
    if(panel)panel.innerHTML=starAssistancePanel(records().find(r=>r.id===id));
    setStatus("Verbatim source excerpts ready. Select fields and insert them into your unsaved draft.");
   }
   return;
  }
  if(action==="check-claims"){
   const card=el.closest("[data-record]"),id=card?.dataset.record;
   if(!id)return;
   const parts=[card.querySelector('[data-field="workingText"]')?.value||"",
    card.querySelector('[data-field="cvBullet"]')?.value||"",
    ...names.map(n=>card.querySelector('[data-star="'+n+'"]')?.value||"")];
   const result=await request("check-claims",{candidate:key,recordId:id,
    revision:data.revision,claimText:parts.join("\n")});
   if(result){
    numericChecks[id]=result;
    const panel=card.querySelector("[data-numeric-panel]");
    if(panel)panel.innerHTML=numericReviewPanel(records().find(r=>r.id===id));
    setStatus(result.unsupportedNumbers.length?
      "Some numbers are not in the original. Correct them before verifying.":
      "Recognised numbers found in source. Their meaning and ownership still need your review.");
   }
   return;
  }
  if(action==="apply-star-preview"){
   const card=el.closest("[data-record]"),id=card?.dataset.record,proposal=starAssists[id];
   if(!proposal)return;
   const selected=names.filter(n=>card.querySelector('[data-assist-star="'+n+'"]')?.checked&&proposal.fields[n]);
   const addBullet=card.querySelector("[data-assist-bullet]")?.checked&&proposal.bullet;
   if(!selected.length&&!addBullet){setStatus("Select one or more source excerpts first.");return}
   const targets=selected.map(n=>card.querySelector('[data-star="'+n+'"]'));
   if(addBullet)targets.push(card.querySelector('[data-field="cvBullet"]'));
   if(targets.some(input=>input?.value.trim())&&
      !window.confirm("Replace existing draft fields with selected source excerpts? Unsaved changes can be discarded."))return;
   for(const n of selected)card.querySelector('[data-star="'+n+'"]').value=proposal.fields[n].text;
   if(addBullet)card.querySelector('[data-field="cvBullet"]').value=proposal.bullet.text;
   const stat=card.querySelector('[data-field="status"]');
   if(stat)stat.value="needs-review";
   const metrics=card.querySelector('[data-field="metricsReviewed"]');
   if(metrics)metrics.checked=false;
   numericChecks[id]=null;
   const panel=card.querySelector("[data-numeric-panel]");
   if(panel)panel.innerHTML="";
   dirty=true;setStatus("Source excerpts inserted into a draft only. Check claims and Save evidence separately.");
   return;
  }
  if(action==="match-jd"){
   if(hasUnsaved()){
    if(!guardExit())return;
    dirty=false;form=null;
    status="Unsaved profile edits discarded before keyword screening.";
   }
   const jd=mount.querySelector("[data-jd-text]")?.value||jdText;
   jdText=jd;
   const result=await request("jd-match",{candidate:key,revision:data.revision,jdText});
   if(result){
    jdMatch=result;status="JD screening complete. Terms require candidate review; nothing was saved.";render();
    const box=mount?.querySelector(".gmp-jd-box");
    box?.scrollIntoView?.({block:"nearest"});
   }
   return;
  }
  if(action==="insert-jd-tag"){
   const id=el.dataset.recordId,term=el.dataset.term;
   const match=jdMatch?.matchedTerms?.find(x=>x.term===term&&x.recordMatches?.some(y=>y.recordId===id));
   const record=records().find(r=>r.id===id);
   if(!match||!record||record.cvEligible===false)return;
   if(!guardExit())return;
   active=record.section;expanded=id;query="";filter="all";form=null;dirty=false;
   const index=records().filter(r=>r.section===active).findIndex(r=>r.id===id);
   limit=Math.max(40,index+1);render();
   const card=[...mount.querySelectorAll("[data-record]")].find(c=>c.dataset.record===id);
   const tags=card?.querySelector('[data-field="tags"]');
   if(!tags){setStatus("Unable to open matching evidence. Select the record manually.");return}
   const previous=tags.value.split(",").map(x=>x.trim()).filter(Boolean);
   if(!previous.some(x=>x.toLowerCase()===term.toLowerCase())){
    previous.push(term);tags.value=previous.join(", ");dirty=true;
   }
   tags.focus();
   setStatus("JD term added to the draft tag field, not saved or verified. Check the original evidence and Save.");
   return;
  }
  if(action==="save-record"){await saveRecord(el.closest("[data-record]"));return}
  if(action==="cancel-form"){form=null;dirty=false;render();return}
  if(action==="add-record"||action==="add-section"||action==="rename-section"){
   if(!guardExit())return;
   form={mode:action,section:active,id:active,title:action==="rename-section"?selected()?.title:""};
   dirty=false;render();mount.querySelector(".gmp-inline-editor input")?.focus();return;
  }
  if(action==="move-up"||action==="move-down"||action==="archive-section"){
   if(!guardExit())return;
   await editSection(action);return;
  }
  if(action==="restore-section"){if(!guardExit())return;await editSection("restore",el.dataset.sectionId);return}
  if(action==="toggle-archived"){if(!guardExit())return;archived=!archived;render();return}
  if(action==="load-more"){limit+=40;render();return}
  if(action==="readiness"){
   const p=await request("readiness",{candidate:key});if(p){readiness=p;status="Connection check completed.";render()}return;
  }
  if(action==="preview"){
   const p=await request("import-preview",{candidate:key});if(p){preview=p;status="Preview completed. No Drive files changed.";render()}return;
  }
  if(action==="import"){
   if(!window.confirm("Import candidate-owned Drive originals into the editable Profile? The CV generator will continue reading Drive."))return;
   const p=await request("import",{candidate:key,confirm:true});
   if(p){preview=null;await refresh("Drive evidence imported for review; no CV workflow changes.");}
  }
 });
 doc.addEventListener("submit",event=>{
  if(!mount?.contains(event.target)||event.target.id!=="gmp-editor-form")return;
  event.preventDefault();submitInline(event.target);
 });
 doc.addEventListener("change",event=>{
  if(!mount?.contains(event.target))return;
  const el=event.target;
  if(el.matches("[data-mobile-section]")){navigate(el.value);return}
  if(el.matches("[data-filter]")){if(!guardExit()){el.value=filter;return}filter=el.value;dirty=false;form=null;render()}
 });
 doc.addEventListener("input",event=>{
  if(!mount?.contains(event.target))return;
  const el=event.target;
  if(el.matches("[data-jd-text]")){jdText=el.value;return}
  if(el.matches("[data-search]")){
   if(dirty||form){
    el.value=query;
    setStatus("Save or discard unsaved edits before searching.");
    return;
   }
   query=el.value;limit=40;expanded="";
   const hits=records().filter(filterMatches);
   const target=mount.querySelector(".gmp-results");
   if(target)target.innerHTML='<div class="gmp-record-list">'+(hits.length?hits.slice(0,limit).map(evidenceCard).join(""):
     '<div class="gmp-empty"><strong>No matching evidence.</strong></div>')+'</div>'+
      (hits.length>limit?buttons("load-more","Load more ("+(hits.length-limit)+" remaining)"):"");
   const summary=mount.querySelector(".gmp-main-head p");
   if(summary)summary.textContent=hits.length+" matching records · Your original source documents are always preserved.";
   return;
  }
  if(el.matches("[data-field],[data-star],#gmp-editor-form [name]")){
   dirty=true;setStatus("Unsaved edits · Save or discard before leaving this section.");
  }
 });
 doc.addEventListener("toggle",event=>{
  if(mount?.contains(event.target)&&event.target.matches?.("[data-record]")&&event.target.open)
   expanded=event.target.dataset.record;
 },true);
 doc.addEventListener("keydown",event=>{
  if(!mount)return;
  if(event.key==="Escape"){event.preventDefault();close();return}
  if(event.key==="Tab"){
   const focusable=[...mount.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary')]
    .filter(node=>node.getClientRects().length);
   const first=focusable[0],last=focusable.at(-1);
   if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus()}
   else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus()}
  }
 });
 window.GaramaalProfile=Object.freeze({open,close});
})();
