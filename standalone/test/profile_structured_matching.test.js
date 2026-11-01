"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const root=path.resolve(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const {findMatches,evidencePackage}=require("../profile_structured_match");
const row=(id,reviewStatus="confirmed",value="25%",evidence="Verified internal portfolio efficiency report")=>({
 id, title:"Portfolio operational improvement",situation:"Review of portfolio operations",
 task:"Improve efficiency",action:"Analysed portfolio and supported process changes",
 result:"Contributed to operational efficiency improvement",
 metricValue:value,metricContext:value?"Improvement in process efficiency":"",evidenceNote:evidence,
 reviewStatus,additionalMetrics:[]});
const profile={
 candidate:"pooja",revision:7,overview:{headline:"Commercial Finance Analyst"},
 lists:{experience:[
  {id:"job0000001",employer:"Example Employer",title:"Proposition Manager",startDate:"2023",endDate:"2025",
   location:"Dublin",summary:"Portfolio analysis and business performance",achievements:[row("achievement000001")]},
  {id:"job0000002",employer:"Other Firm",title:"Financial Advisor",summary:"Pensions and investment advice",
   achievements:[{...row("achievement000002","needs-review","", ""),
    title:"Pension fact-finding",result:"Collected client requirements"}]}
 ],projects:[],skills:[{id:"skill00001",name:"Financial modelling",category:"Finance",notes:"Portfolio analysis"}],
 education:[],certifications:[],awards:[],volunteering:[],preferences:[]}
};
test("JD matching ranks relevant candidate-linked achievements and never presents an ATS score",()=>{
 const result=findMatches(profile,"Financial planning, portfolio analysis and business performance modelling with an efficiency focus");
 assert.equal(result.candidate,"pooja");
 assert.equal(result.revision,7);
 assert.equal(result.notAnAtsScore,true);
 assert.ok(result.selected.some(x=>x.id==="experience:job0000001:achievement000001"));
 assert.ok(result.selected.some(x=>!x.eligibleForCv));
 assert.equal(result.draftOnly,true);
});
test("Candidate confirmation and metric evidence are prerequisites for handoff",()=>{
 const pkg=evidencePackage(profile,"Portfolio performance efficiency improvement and financial modelling");
 assert.deepEqual(pkg.selectedIds,["experience:job0000001:achievement000001"]);
 assert.match(pkg.markdown,/Example Employer/);
 assert.match(pkg.markdown,/Verified internal portfolio efficiency report/);
 const dirty=JSON.parse(JSON.stringify(profile));
 dirty.lists.experience[0].achievements[0].evidenceNote="";
 const newer=evidencePackage(dirty,"Portfolio performance efficiency improvement and financial modelling");
 assert.deepEqual(newer.selectedIds,[]);
 assert.doesNotMatch(newer.markdown,/Contributed to operational efficiency improvement/);
});
test("JD and candidate mismatches fail closed",()=>{
 assert.throws(()=>findMatches({...profile,candidate:"other"},"Relevant financial planning JD"),/Invalid candidate/);
 assert.throws(()=>findMatches(profile,"Too short"),/Paste a job description/);
 assert.deepEqual(findMatches(profile,"Completely unrelated aeronautical design experience").totals.candidateConfirmed,0);
});
test("Staging endpoints are authenticated and do not dispatch paid CV jobs",()=>{
 const svc=read("profile_structured_service.js"),bridge=read("bridge.js"),ui=read("profile_structured_ui.js");
 assert.match(svc,/findMatches\(snap\.data\(\),req\.body\?\.jdText/);
 assert.match(svc,/evidencePackage\(snap\.data\(\),req\.body\?\.jdText/);
 assert.match(svc,/snap\.data\(\)\.revision!==req\.body\?\.revision/);
 assert.match(svc,/permit\(email,key\)/);
 assert.doesNotMatch(svc,/workflow_dispatch|OPENAI_API_KEY|runCvApiNow/);
 assert.match(bridge,/"profile\/structured\/cv-package"/);
 assert.match(ui,/btn\("match-jd"/);
 assert.match(ui,/btn\("download-package"/);
 assert.match(ui,/reviewStatus/);
 const p=cp.spawnSync("node",["--check",path.join(root,"profile_structured_ui.js")],{encoding:"utf8"});
 assert.equal(p.status,0,p.stderr);
});
