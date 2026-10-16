"use strict";
(function(){
const configs={
 Abhishek:{name:"Abhishek Nair",summary:"https://docs.google.com/document/d/1B6e8GKtUcZKjHtB6lzHRjZxcZQPW6d67/edit",
 goal:"https://drive.google.com/file/d/1KqnWYEi9GejUhkqiRnQ1D1G6DlAtnH_M/view",guide:"https://drive.google.com/file/d/14x-QVBIHCX2keCX8fK4uA67qBwn-juIk/view",
 profile:"AX",career:"AY",score:"AL",rank:"AM"},
 Pooja:{name:"Pooja Krishna Tirupati",summary:"https://docs.google.com/document/d/1lT_OP5Il-R8ifvvYqfO0NEARJYzo76SS/edit",
 goal:"https://drive.google.com/file/d/1Fyy2txzfuWHFjARgZjOETDplYHqGHy2o/view",guide:"https://drive.google.com/file/d/1lwt3MWy5EmD8SiXItgHBhACg2SnNlOEf/view",
 profile:"AZ",career:"BA",score:"AN",rank:"AO"}
};
const sheet="https://docs.google.com/spreadsheets/d/1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc/edit";
function makePrompt(candidate){
 const p=configs[candidate];if(!p)throw Error("Select Abhishek or Pooja first.");
 return [
 "RUN INCREMENTAL FRESHMAAL JOB RANKING + JD OPPORTUNITY SIGNALS — "+p.name,
 "Use ChatGPT's connected Google Drive/Sheets apps; DO NOT call a separate paid ranking API. This is job scoring, not a CV/cover-letter workflow. Do not claim success without opening sources and verifying sheet writes.",
 "EXACT candidate sources (do not use similar files): Summary Doc: "+p.summary,
 "Current Ultimate Career Goal: "+p.goal,
 "Rank - Job scoring rubric: "+p.guide,
 "Full vacancy database: "+sheet+" ; sheet tab Sheet1, first job row 3, A=company, B=designation, C=vacancy URL, D=FULL JD, AG=location.",
 "Existing scoring guide: https://github.com/abhisheknair607-ux/automate_cv/blob/migration/standalone-google-auth-no-appscript/docs/RANK_JOBS_FRESH_MAAL.md",
 "Use raw JD as authority for job facts; candidate Summary Doc for verified professional evidence; latest Ultimate Career Goal for priorities; Rank - Job for scoring. Do not mix the two candidates. For Pooja, the current goal makes PRIVATE WEALTH the primary direction, overriding the older PE/VC goal wording in her historical ranking guide.",
 "Candidate score columns: "+p.profile+"=Profile Fit /100, "+p.career+"=Career Fit /100, "+p.score+"=Combined Priority Score, "+p.rank+"=ALL-job Rank. Never edit the other candidate's scoring columns.",
 "INCREMENTAL: first locate every row with BLANK combined score in "+p.score+". Score ONLY those unscored jobs; preserve ALL previously scored jobs and existing historical sub-scores even if their profile components are blank.",
 "For each unscored vacancy read its FULL actual JD, identify critical/preferred/secondary job requirements and JD keywords. Separately report keyword coverage. Score Profile Fit /100 using direct, transferable and academic evidence from the Summary Doc with mandatory qualification/seniority caps; score Career Fit /100 against CURRENT Ultimate Career Goal; Combined = ROUND(Profile*0.55 + Career*0.45, 0). Report main evidence and 3 important gaps without fabricating qualifications.",
 "DURING THAT SAME JD PASS, record three other application-decision signals, with exact JD excerpts:",
 "CONTACTS: Identify explicit named hiring managers, recruiters, team contacts or contact routes appearing IN the JD. Do not invent LinkedIn profiles; do not automatically perform paid external networking research. If absent, say NOT STATED.",
 "VISA: YES only if explicit employer offer of visa/work permit sponsorship; NO only if explicitly unavailable; otherwise NOT STATED. Cite exact JD wording. Do not infer sponsorship from nationality, office, company brand or work location.",
 "SALARY: retain original EUR/GBP currency and stated annual BASE amount or range. Record whether the entire range exceeds 50,000 or only its upper end exceeds 50,000. Do not treat a bonus, per-day rate, or unspecified salary as annual base. If not stated, say NOT STATED.",
 "Prioritisation: salary >50,000, credible named contacts and confirmed sponsorship are visible POSITIVE decision signals; explicit lack of sponsorship or low base salary may be practical shortlist risks. Do not silently change the 55% Profile /45% Career scoring formula to compensate. These extra signals belong in the application recommendation, separate from ranking math.",
 "Store JD opportunity signals in Freshmaal Sheet1 BB (JD Contact Evidence), BC (JD Visa Sponsorship Evidence), BD (JD Salary Above 50k Evidence). For BB write CONTACT: name/role + exact JD excerpt or NOT STATED. For BC write YES: explicit offer excerpt, NO: explicit refusal excerpt, or NOT STATED. For BD write ABOVE 50K: explicit annual base amount or PARTIAL ABOVE 50K: range whose upper end alone exceeds 50,000; otherwise NOT STATED. These exact prefixes control Garamaal's golden eye: NOT STATED and NO never activate the eye. Check sheet column count (may stop at BA), expand to BD only when safe, verify headers and do not overwrite unrelated data. For previously scored jobs with blank BB:BD, you may backfill JD clues in manageable batches WITHOUT rescoring them or changing historical scores. If write permission/columns are unavailable report row-by-row for review.",
 "For each score write re-read and verify exact company, designation, vacancy URL, JD, row and that combined score is blank. Write new numeric values ONLY to "+p.profile+", "+p.career+", "+p.score+"; write independently verified JD evidence to BB:BD for new rows (or historical rows when those cells are blank). Never change CV toggles, application statuses, JDs, URLs, files, costs or existing scores. Do not infer missing historical score components.",
 "ADDITIONALLY SAVE NAMED JD CONTACTS to a SEPARATE tab 'Connections' within the SAME Freshmaal spreadsheet (not Sheet1). If and only if a person's FULL NAME and contact purpose are explicit in the JD, store one row with exactly these A:L headers: Company | Contact Name | Direct LinkedIn Profile | LinkedIn Search | Applied-for Role | Candidate | Freshmaal Row | Vacancy Link | Person's Position | Verification / Evidence | Outreach Message | Research Date (UTC). Fill Company, Name, Role, Candidate, row and vacancy URL from the exact verified sheet row. Build a LinkedIn people search URL using https://www.linkedin.com/search/results/people/?keywords= plus URL-encoded name/company/designation. Leave the DIRECT LinkedIn link BLANK unless independently verified. Cite the exact JD wording and do not invent a person's title. Form a humble, personalised, under-300-character connection note; avoid unverified career claims. If tab absent, create it safely with the exact headers; if present verify schema. De-duplicate by Candidate + Freshmaal Row + Vacancy Link + Contact Name before appending; do not overwrite existing or other candidate's rows. If the connected app cannot safely create or update the tab, produce an import-ready table instead and flag the limitation.",
 "GLOBAL RANK: retain every prior numeric score PLUS all new scores and re-rank the entire set in descending order. Example: score 20 new jobs, recalculate ranks for all 120. Ranking is formula driven in "+p.rank+"; do not put static ranks there. If rank formulas are missing or fixed values, flag Garamaal Dashboard 'Fix rank formulas' as a separate explicit repair.",
 "OUTPUT: exact sources opened, number of existing vs newly scored jobs, per-row Profile/Career/Combined numbers, visa/salary/contact evidence and applied-first advice, missing sources or eligibility concerns, and verified write counts. If a document or spreadsheet is inaccessible, do NOT invent results or claim rows were updated."
 ].join("\n\n");
}
async function copyText(value,label){
 let done=false;
 try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(value);done=true}}catch(_){}
 if(!done){const t=document.createElement("textarea");t.value=value;t.readOnly=true;t.style.cssText="position:fixed;left:-9999px;top:0";document.body.appendChild(t);t.focus();t.select();try{done=document.execCommand("copy")}finally{t.remove()}}
 if(done)toast(label+" copied.");else window.prompt("Copy this text:",value);
}
async function repairRanks(){
 if(!window.__cvStandalone?.requestSpecial){toast("Rank repair requires Garamaal Cloud Run.",true);return}
 if(!confirm("Restore dynamic ranking formulas in AM and AO for all job rows? This changes ONLY rank cells; scores, statuses and CVs remain untouched."))return;
 try{const x=await window.__cvStandalone.requestSpecial("repair-ranks",{confirm:true});toast(x.message||"Ranking formulas repaired.")}catch(e){toast(e.message||"Could not repair ranking formulas.",true)}
}
document.addEventListener("click",e=>{
 const x=e.target.closest("[data-action]");if(!x)return;
 if(x.dataset.action==="copy-ranking"){copyText(makePrompt(state.candidate),state.candidate+" ranking prompt");return}
 if(x.dataset.action==="repair-ranks"){repairRanks();return}
});
window.__cvRanking={makePrompt,copyText,configs};
})();
