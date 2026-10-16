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
function savedPeopleMarkup(items){
 const list=Array.isArray(items)?items:[];
 if(!list.length)return '<p class="connection-note">No verified contacts are saved for this candidate and vacancy yet.</p>';
 return list.map(c=>'<section class="connection-person"><strong>'+esc(c.name)+'</strong><small>'+esc(c.title)+'</small>'+
   '<div class="row">'+(c.profileUrl?link(c.profileUrl,"Direct LinkedIn"):'<span class="meta">Direct LinkedIn unverified</span>')+
   link(c.searchUrl,"LinkedIn people search")+'</div>'+
   '<details><summary class="meta">Verification / evidence</summary><p class="connection-note">'+esc(c.evidence)+'</p></details>'+
   '<div class="connection-message">'+esc(c.message)+'</div>'+
   (c.message?'<button class="btn btn-xs" data-action="copy-message" data-message="'+esc(c.message)+'">Copy introduction</button>':'')+
   '</section>').join("");
}
async function contacts(row,tier="1-5"){
 const j=currentJob(row);
 if(!j)return;
 activeJob={row,candidate:state.candidate};
 show("Connections · "+j.company,'<p class="connection-note">Loading saved contacts for this vacancy…</p>');
 if(DEMO){show("Connections · "+j.company,'<p class="connection-note">Preview: no live Sheets connection.</p>');return}
 try {
   // Always show existing ChatGPT or API research before offering any paid action.
   const saved=await window.__cvStandalone.requestSpecial("connections/saved",{candidate:state.candidate,row});
   if(!activeJob||activeJob.row!==row||activeJob.candidate!==state.candidate)return;
   let body='<p class="connection-note">'+esc(j.role)+' · '+esc(state.candidate)+' · Freshmaal #'+row+'</p>'+
     '<h4>'+saved.contacts.length+' saved contacts</h4>'+savedPeopleMarkup(saved.contacts)+
     (saved.sheetUrl?'<div class="row">'+link(saved.sheetUrl,"View all contacts in Freshmaal")+'</div>':'');
   if(j.web){
     const p=await window.__cvStandalone.requestSpecial("connections/preview",{candidate:state.candidate,row,tier});
     if(!activeJob||activeJob.row!==row||activeJob.candidate!==state.candidate)return;
     body+='<hr class="divider"/><h4>Optional new research</h4>'+rangeSelector(row,tier)+
       '<p class="connection-note">Estimated additional cost: $'+Number(p.estimateUsd||0).toFixed(2)+
       '. Provider costs may vary. Existing saved contacts are free to view.</p>'+
       '<div class="row"><button class="btn btn-primary" data-action="connect-research" data-row="'+row+'" '+
       ((p.configured&&p.permitted)||p.cached?'':'disabled')+'>Research / view cached</button>'+
       '<button class="btn" data-action="connect-copy-prompt" data-row="'+row+'">Copy ChatGPT research prompt</button></div>'+
       suggestedSearches(p.searches);
   }else{
     body+='<p class="connection-note">Web is not checked. Saved contacts remain visible; tick Web only to request new research.</p>';
   }
   show("Connections · "+j.company,body);
 }catch(e){show("Connections unavailable",'<p class="connection-note">'+esc(e.message||"Could not load saved contacts")+'</p>')}
}
function researchPrompt(job,tier){
 const c=window.__cvRanking?.configs?.[state.candidate];
 return ["RESEARCH VERIFIED JOB NETWORKING CONTACTS FOR "+state.candidate,
 "Candidate's factual Summary Doc: "+(c?.summary||"Unavailable — request factual context"),
 "Current career goal: "+(c?.goal||"Unavailable — do not invent goals"),
 "Company: "+job.company,"Job title: "+job.role,"Location: "+job.location,
 "Exact vacancy link: "+job.url,"Exact Freshmaal row: "+job.row,
 "Requested: "+tier+" contacts relevant to this job. Find managers, team leaders, department heads, recruiters, and 1–2 levels above; exclude unrelated executives.",
 "For each real person verify company, exact relevant team, up-to-date role, location and confidence. A direct LinkedIn profile only if the exact URL can be sourced and verified. Otherwise provide a LinkedIn people-search link with name, company and designation; label it unverified.",
 "Provide a personal, polite LinkedIn introduction under 300 characters based solely on the candidate's verified Summary Doc, including their name. Do not fabricate experience, claim someone is the hiring manager without evidence, or send messages.",
 "SAVE FINDINGS in Freshmaal spreadsheet https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit, tab 'Connections', not Sheet1, with exact A:L headers: Company, Contact Name, Direct LinkedIn Profile, LinkedIn Search, Applied-for Role, Candidate, Freshmaal Row, Vacancy Link, Person's Position, Verification / Evidence, Outreach Message, Research Date (UTC). Create the tab only after verifying no conflicting tab exists. Save only verified direct links; leave blank when unknown. Include fallback search for every named person. De-duplicate by candidate + exact row + vacancy URL + name. Never overwrite existing CV data, scores, application status or another candidate's rows.",
 "If ChatGPT cannot edit the Google Sheet with its connected apps, clearly explain and provide an import-ready contacts table. Do not claim saved unless each write is verified. List public source URLs for all personnel claims."
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
   (result.saveWarning?'<p class="connection-note" role="alert">'+esc(result.saveWarning)+'</p>':'')+
   (result.sheetUrl?'<p class="connection-note">Saved in Freshmaal · '+link(result.sheetUrl,"Open Connections sheet")+'</p>':'')+
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
