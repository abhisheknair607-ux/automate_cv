"use strict";
(function(){
let activeJob=null;
const ranges=["1-5","5-10","10-15"];
function esc(v){return h(String(v==null?"":v))}
function link(url,label){const href=safeUrl(url);return href?'<a class="btn btn-xs" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':""}
function currentJob(row){return state.data?.rows?.find(x=>x.row===row)|| (state.detail?.row===row?state.detail:null)}
function root(){return document.getElementById("connectionsMount")}
function hide(){root().innerHTML="";activeJob=null}
function show(title,body){
 root().innerHTML='<div class="connections-shade" data-action="connect-backdrop"><section class="connections-pop" role="dialog" aria-modal="true" aria-label="'+esc(title)+'">'+
 '<div class="connections-header"><h3>'+esc(title)+'</h3><button type="button" class="btn btn-xs" data-action="connect-close" aria-label="Close dialog">×</button></div>'+body+'</section></div>';
}
function rangeSelector(row,selected){
 return '<label for="connect-tier">Contacts to find</label><select id="connect-tier" data-row="'+row+'">'+
 ranges.map(x=>'<option value="'+x+'" '+(selected===x?'selected':'')+'>'+x+' contacts</option>').join("")+'</select>';
}
function suggestedSearches(results){
 return '<p class="connection-note">Free LinkedIn people searches:</p><div class="row">'+
 (results||[]).map(x=>link(x.url,x.label)).join("")+'</div>';
}
async function contacts(row,tier="1-5"){
 const j=currentJob(row);
 if(!j||!j.web){toast("Tick Web first to enable Connections.",true);return}
 activeJob={row,candidate:state.candidate};
 show("Connections · "+j.company,'<p class="connection-note">Checking cached research and budget…</p>');
 if(DEMO){show("Connections · "+j.company,rangeSelector(row,tier)+'<p class="connection-note">Demo: no API charges.</p>');return}
 try{
  const p=await window.__cvStandalone.requestSpecial("connections/preview",{candidate:state.candidate,row,tier});
  if(!activeJob||activeJob.row!==row||activeJob.candidate!==state.candidate)return;
  const box='<p class="connection-note">'+esc(j.company)+' · '+esc(j.role)+'</p>'+rangeSelector(row,tier)+
   '<p class="connection-note">Estimated research cost: <b>$'+Number(p.estimateUsd||0).toFixed(2)+'</b>. Target $0.15, maximum planned $0.20 per job. A provider-level hard spending cap cannot be guaranteed. Free when cached.</p>'+
   '<div class="row"><button class="btn btn-primary" data-action="connect-research" data-row="'+row+'" '+((p.configured&&p.permitted)||p.cached?'':'disabled')+'>'+(p.cached?"View cached research":p.configured&&p.permitted?"Research and confirm cost":"Research unavailable")+'</button>'+
   '<button class="btn" data-action="connect-copy-prompt" data-row="'+row+'">Copy ChatGPT prompt (no API charge)</button></div>'+
   '<p class="connection-note">'+esc(!p.configured?"Paid research is not configured; the free ChatGPT prompt and LinkedIn searches still work.":!p.permitted?"This tier exceeds the remaining planned $0.20 per-job budget; use a lower tier or free search.":"")+'</p>'+
   '<p class="connection-note">'+esc(p.disclaimer)+'</p>'+suggestedSearches(p.searches);
  show("Connections · "+j.company,box);
 }catch(e){show("Connections · "+j.company,'<p class="connection-note">'+esc(e.message||"Could not load the preview.")+'</p>')}
}
function researchPrompt(job,tier){
 return ["RESEARCH VERIFIED JOB NETWORKING CONTACTS FOR "+state.candidate,"Company: "+job.company,
 "Job title: "+job.role,"Location: "+job.location,"Exact vacancy link: "+job.url,
 "Requested: "+tier+" contacts relevant to this job. Find managers, team leaders, department heads, recruiters, and 1–2 levels above; exclude unrelated executives.",
 "For each real person verify company, exact relevant team, up-to-date role, location and confidence. A direct LinkedIn profile only if the exact URL can be sourced and verified. Otherwise provide a LinkedIn people-search link with name, company and designation; label it unverified.",
 "Provide a personal, polite LinkedIn introduction under 300 characters including the candidate's name and a brief, accurate role-relevant introduction. Do not fabricate experience, claim someone is the hiring manager without evidence, or send messages.",
 "Use freely accessible public sources. Show profile URL, fallback search URL and source evidence separately."
 ].join("\n\n");
}
async function copyPrompt(row){
 const job=currentJob(row);if(!job)return;
 const tier=document.getElementById("connect-tier")?.value||"1-5";
 await window.__cvRanking.copyText(researchPrompt(job,tier),"Contacts research prompt");
}
async function startResearch(row){
 const job=currentJob(row);if(!job||!job.web){toast("Tick and save Web first.",true);return}
 const tier=document.getElementById("connect-tier")?.value||"1-5";
 const costs={"1-5":.06,"5-10":.11,"10-15":.15};
 if(!confirm("Start optional paid research ("+tier+" contacts)? Estimated $"+costs[tier].toFixed(2)+" per job, planned ceiling $0.20. Charges can exceed estimates. Proceed?"))return;
 if(DEMO){toast("Preview doesn't charge for research.");return}
 show("Researching contacts",'<p class="connection-note">One web search maximum and no automatic retries. Larger tiers may return fewer verified contacts.</p>');
 try{
  const result=await window.__cvStandalone.requestSpecial("connections/research",{candidate:state.candidate,row,tier,confirm:true});
  if(!activeJob||activeJob.row!==row)return;
  const people=(result.contacts||[]).map(x=>{
   const direct=x.profileUrl?link(x.profileUrl,"Direct verified profile"):'<span class="meta">Direct profile unverified</span>';
   return '<section class="connection-person"><strong>'+esc(x.name)+'</strong><small>'+esc(x.title)+' · '+esc(x.team)+'</small>'+
   '<small>'+esc(x.evidence)+'</small><small>'+esc(x.verification)+'</small><div class="row">'+direct+
   link(x.searchUrl,"LinkedIn search")+'</div><div class="connection-message">'+esc(x.message)+'</div>'+
   '<button class="btn btn-xs" data-action="copy-message" data-message="'+esc(x.message)+'">Copy introduction</button></section>';
  }).join("");
  show("Connections · "+job.company,'<p class="connection-note">'+esc(result.message||result.warning||"")+'</p>'+
   '<p class="connection-note">Estimated charged usage: $'+Number(result.costUsd||0).toFixed(4)+(result.cached?" · cached":"")+'</p>'+
   (people||'<p class="connection-note">No individual contacts verified. Use the searches below.</p>')+
   suggestedSearches(result.searches));
 }catch(e){show("Connections unavailable",'<p class="connection-note">'+esc(e.message||"Search failed.")+'</p><p class="connection-note">No automatic paid retry was made.</p>')}
}
async function jdClues(row){
 const job=currentJob(row);if(!job||!job.cvLink)return;
 activeJob={row,candidate:state.candidate};
 show("JD opportunities · "+job.company,'<p class="connection-note">Reading original saved JD clues…</p>');
 try{
  const data=await window.__cvStandalone.requestSpecial("clues/preview",{candidate:state.candidate,row});
  if(!activeJob||activeJob.row!==row)return;
  const visa=data.visa,contact=data.contact,salary=data.salary;
  const body='<div class="connection-person"><strong>Visa sponsorship: '+esc(visa?.status||"Not stated")+'</strong><small>'+esc(visa?.evidence||"No explicit sponsorship information.")+'</small></div>'+
   '<div class="connection-person"><strong>Salary above 50,000: '+(salary?"Mentioned":"Not stated")+'</strong><small>'+esc(salary?salary.currency+" "+salary.annualValue+" · "+salary.evidence:"No explicit qualifying annual amount detected.")+'</small></div>'+
   '<div class="connection-person"><strong>Named contact: '+(contact?"Mentioned":"Not stated")+'</strong><small>'+esc(contact?.evidence||"No named contact in the job description.")+'</small></div>'+
   '<p class="connection-note">These are clues extracted from the JD, not independently verified employer commitments. The Dashboard ranking prompt can save the same evidence into Sheet1 BB–BD.</p>'+
   '<button class="btn btn-primary" data-action="clues-save" data-row="'+row+'">Save insights to Freshmaal</button>';
  show("JD opportunities · "+job.company,body);
 }catch(e){show("JD opportunities unavailable",'<p class="connection-note">'+esc(e.message||"Unable to read JD clues.")+'</p>')}
}
async function saveClues(row){
 if(!confirm("Save this job's JD evidence into Freshmaal Sheet1 BB–BD? Existing scores and application data are untouched."))return;
 try{const x=await window.__cvStandalone.requestSpecial("clues/save",{candidate:state.candidate,row,confirm:true});
   toast(x.message||"JD clues saved.");hide()
 }catch(e){toast(e.message||"Could not save JD clues.",true)}
}
window.__cvConnectOnWebSaved=row=>{if(state.section==="fresh")contacts(row)};
document.addEventListener("change",e=>{if(e.target?.id==="connect-tier"&&activeJob)contacts(activeJob.row,e.target.value)});
document.addEventListener("click",e=>{
 if(e.target.classList?.contains("connections-shade")){hide();return}
 const x=e.target.closest("[data-action]");if(!x)return;
 const row=Number(x.dataset.row);
 switch(x.dataset.action){
 case "connections":contacts(row);break;
 case "connect-close":hide();break;
 case "connect-copy-prompt":copyPrompt(row);break;
 case "connect-research":startResearch(row);break;
 case "copy-message":window.__cvRanking.copyText(x.dataset.message||"","LinkedIn introduction");break;
 case "jd-clues":jdClues(row);break;
 case "clues-save":saveClues(row);break;
 }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&root()?.innerHTML)hide()});
})();
