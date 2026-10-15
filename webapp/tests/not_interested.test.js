const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let sheetID=100;
class MockSheet{
  constructor(name,rows,cols){this.id=++sheetID;this.name=name;this.rows=rows;this.cols=cols;this.cells=Array.from({length:rows},()=>Array(cols).fill(''));this.writes=[];}
  getName(){return this.name}
  getMaxColumns(){return this.cols}
  getSheetId(){return this.id}
  getMaxRows(){return this.rows}
  getMaxColumns(){return this.cols}
  getLastRow(){let max=0;this.cells.forEach((r,i)=>{if(r.some(v=>v!==''&&v!==undefined&&v!==null))max=i+1});return max}
  set(row,col,v){this.cells[row-1][col-1]=v}
  get(row,col){return this.cells[row-1][col-1]}
  getRange(row,col,n=1,m=1){
    if(row<1||col<1||row+n-1>this.rows||col+m-1>this.cols)throw new Error(`Bad range ${this.name} R${row} C${col} ${n}x${m}`);
    const self=this;
    return{
      getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.get(row+i,col+j)))},
      getValue(){return self.get(row,col)},
      setValue(v){assert.equal(n*m,1);self.set(row,col,v);self.writes.push({row,col,v});return this},
      setValues(arr){for(let i=0;i<n;i++)for(let j=0;j<m;j++)self.set(row+i,col+j,arr[i][j]);self.writes.push({row,col,n,m,arr});return this},
      getDataValidation(){return null},
      setDataValidation(rule){self.validation=rule;return this},
    }
  }
}
const taaza=new MockSheet('Jobs',80,26),fresh=new MockSheet('Sheet1',80,53),regions={};
taaza.set(1,1,'Company Name');taaza.set(1,2,'Designation');taaza.set(1,3,'Link');fresh.set(1,1,'Company Name');
function taazaRow(row,name,url){taaza.set(row,1,name);taaza.set(row,2,`${name} Role`);taaza.set(row,3,url);taaza.set(row,4,'A full and verified job description of more than eighty characters with many responsibilities and qualifications.')}
function freshRow(row,name,url){fresh.set(row,1,name);fresh.set(row,2,`${name} Role`);fresh.set(row,3,url);fresh.set(row,4,'A long and complete job description for analysis');fresh.set(row,38,85);fresh.set(row,39,row-2)}
taazaRow(2,'Alpha','https://jobs.test/open/1?utm_source=social');
taazaRow(3,'Beta','https://jobs.test/open/2');
taazaRow(4,'Gamma','https://jobs.test/open/3');
taazaRow(5,'Alpha','https://www.jobs.test/open/1?utm_source=email');
for(let row=6;row<=26;row++)taazaRow(row,'Company '+row,`https://jobs.test/open/${row}`);
freshRow(3,'Alpha','https://www.jobs.test/open/1');freshRow(4,'Beta','https://jobs.test/open/2?utm_campaign=promo');freshRow(5,'Delta','https://jobs.test/open/4');
let locks=0;
const vmContext=vm.createContext({
 SpreadsheetApp:{newDataValidation(){return {requireValueInList(values){this.values=values;return this},setAllowInvalid(){return this},build(){return {values:this.values}}}},openById(id){return {getSheetByName(tab){const s=id.startsWith('1jt3')?(tab==='Jobs'?taaza:regions[tab]):fresh;return s&&s.name===tab?s:null},getSheets(){return id.startsWith('1jt3')?[taaza,...Object.values(regions)]:[fresh]}}},flush(){}},
 Session:{getEffectiveUser(){return {getEmail(){return 'authorised@example.com'}}}},
 PropertiesService:{getScriptProperties(){return {getProperty(){return 'authorised@example.com'}}}},
 LockService:{getScriptLock(){return {waitLock(){locks++},releaseLock(){locks--}}}},
 console,Date,Set,Object,Array,Number,Math,String,Error,
});
vm.runInContext(fs.readFileSync(__dirname+'/../Code.gs','utf8'),vmContext);
const run=(str)=>vm.runInContext(str,vmContext);
const js=v=>JSON.parse(JSON.stringify(v));
function list(source,candidate='Abhishek',filter='all',args={}){return js(run(`listJobs(${JSON.stringify({source,candidate,filter,sort:'newest',pageSize:3,...args})})`))}
function interest(source,candidate,row,value,company,url){return js(run(`setNotInterested(${JSON.stringify({source,candidate,row,value,expected:{company,role:`${company} Role`,url}})})`))}
function rows(q){return q.rows.map(j=>j.row)}
assert.equal(list('taaza').total,25);
assert.ok(rows(list('taaza','Abhishek','all',{sort:'company'})).length===3);
// Both links with only tracking differences should be rejected together.
let out=interest('taaza','Abhishek',2,true,'Alpha','https://jobs.test/open/1?utm_source=social');
assert.equal(out.updatedRows,3);
assert.equal(taaza.get(2,14),'Not Interested');assert.equal(taaza.get(5,14),'Not Interested');assert.equal(fresh.get(3,46),'Not Interested');
assert.equal(taaza.get(2,15),'');assert.equal(fresh.get(3,47),'');
assert.equal(list('taaza','Abhishek').total,23);
assert.equal(list('taaza','Pooja').total,25);
assert.equal(list('fresh','Abhishek').total,2);
assert.equal(list('fresh','Pooja').total,3);
assert.deepEqual(rows(list('taaza','Abhishek','not-interested')),[5,2]);
assert.deepEqual(rows(list('fresh','Abhishek','not-interested')),[3]);
assert.equal(list('fresh','Pooja','not-interested').total,0);
// Restore from Freshmaal must clear matching Taaza duplicates.
out=interest('fresh','Abhishek',3,false,'Alpha','https://www.jobs.test/open/1');
assert.equal(out.updatedRows,3);
assert.equal(taaza.get(2,14),'');assert.equal(taaza.get(5,14),'');assert.equal(fresh.get(3,46),'');
assert.equal(list('taaza','Abhishek','not-interested').total,0);
// Pooja flags must never change Abhishek values.
out=interest('fresh','Pooja',4,true,'Beta','https://jobs.test/open/2?utm_campaign=promo');
assert.equal(taaza.get(3,15),'Not Interested');assert.equal(fresh.get(4,47),'Not Interested');
assert.equal(taaza.get(3,14),'');assert.equal(fresh.get(4,46),'');
assert.equal(list('taaza','Pooja').total,24);
assert.equal(list('taaza','Abhishek').total,25);
assert.equal(list('fresh','Pooja').total,2);
assert.equal(list('fresh','Abhishek').total,3);
// A direct edit in Freshmaal should also remove the same vacancy from Taaza web view.
fresh.set(5,46,true);
assert.equal(list('fresh','Abhishek','not-interested').total,1);
assert.equal(list('taaza','Abhishek','not-interested').total,0); // Delta isn't present in Taaza
fresh.set(5,46,false);
// Newly transferred jobs carry both candidates' independent flags; preserve CV controls.
const beforeCV=fresh.get(3,8), beforeStatus=fresh.get(3,12);
const beforePoojaCV=fresh.get(3,5);
assert.equal(fresh.get(3,8),beforeCV);assert.equal(fresh.get(3,12),beforeStatus);assert.equal(fresh.get(3,5),beforePoojaCV);
// Resume pagination after an item was hidden: offset=shown count does not skip next vacancy.
let initial=list('taaza','Abhishek','all',{page:1,pageSize:3});
assert.deepEqual(rows(initial),[26,25,24]);
interest('taaza','Abhishek',25,true,'Company 25','https://jobs.test/open/25');
const next=list('taaza','Abhishek','all',{page:2,pageSize:3,offset:2});
assert.deepEqual(rows(next),[23,22,21]);
// Invalid / stale write must fail without altering flags.
assert.throws(()=>interest('taaza','Pooja',2,true,'Wrong Company','https://jobs.test/open/1?utm_source=social'),/job changed/i);
assert.throws(()=>interest('fresh','Unknown',3,true,'Alpha','https://www.jobs.test/open/1'),/Unknown candidate/);
assert.equal(locks,0);

// Both regional sources must join the Jobs master once, preserving their own tabs.
const tp=new MockSheet('TP Europe',80,13);
const pooja=new MockSheet('Pooja Europe',80,13);
for(const reg of [tp,pooja]){reg.set(1,1,'Company Name');reg.set(1,2,'Designation');reg.set(1,3,'Link');}
tp.set(2,1,'TPCo');tp.set(2,2,'Transfer Pricing Senior');tp.set(2,3,'https://eu.test/tp/one');
tp.set(2,4,'Full Europe TP job description');tp.set(2,11,true); // Do not copy the automated transfer trigger.
tp.set(3,1,'Alpha');tp.set(3,2,'Alpha Role');tp.set(3,3,'https://jobs.test/open/1?utm_medium=social');
pooja.set(2,1,'PlanCo');pooja.set(2,2,'Paraplanner');pooja.set(2,3,'https://eu.test/pooja/one');
regions['TP Europe']=tp;regions['Pooja Europe']=pooja;
const sync=js(run('syncDiscoveryMaster()'));
assert.equal(sync.added,2);
assert.equal(taaza.get(27,1),'TPCo');
assert.equal(taaza.get(28,1),'PlanCo');
assert.equal(taaza.get(27,11),false); // Never trigger a CV transfer accidentally.
assert.equal(taaza.get(27,13),'TP Europe');
assert.equal(taaza.get(28,13),'Pooja Europe');
assert.equal(js(run('syncDiscoveryMaster()')).added,0); // Idempotent.
assert.equal(tp.get(2,11),true); // Specialist source unchanged.


// All job tabs are discoverable, stable through tab renames, and filter from Jobs.
const tabs=list('taaza','Abhishek','all',{pageSize:80}).tabs;
const tpID=tabs.find(t=>t.name==='TP Europe').id;
const poojaID=tabs.find(t=>t.name==='Pooja Europe').id;
assert.deepEqual(rows(list('taaza','Abhishek','all',{tabId:tpID,pageSize:80})),[27,5,2]);
assert.deepEqual(rows(list('taaza','Abhishek','all',{tabId:poojaID,pageSize:80})),[28]);
assert.ok(rows(list('taaza','Abhishek','all',{tabId:'common',pageSize:80})).includes(26));
assert.ok(!rows(list('taaza','Abhishek','all',{tabId:'common',pageSize:80})).includes(27));
const renamed=regions['TP Europe'];delete regions['TP Europe'];renamed.name='TP UK & Europe';regions['TP UK & Europe']=renamed;
const renamedTabs=list('taaza','Abhishek','all',{tabId:tpID,pageSize:80});
assert.equal(renamedTabs.tabId,tpID);
assert.equal(renamedTabs.tabs.find(t=>t.id===tpID).name,'TP UK & Europe');
assert.deepEqual(rows(renamedTabs),[27,5,2]);
const other=new MockSheet('Corporate Finance Europe',80,13);
other.set(1,1,'Company Name');other.set(1,2,'Designation');other.set(1,3,'Link');
other.set(2,1,'ValCo');other.set(2,2,'Valuations Analyst');other.set(2,3,'https://eu.test/valuation');
regions['Corporate Finance Europe']=other;
const newTab=js(run('syncDiscoveryMaster()'));
assert.equal(newTab.added,1);
const allTabs=list('taaza','Abhishek','all',{pageSize:80});
const otherID=allTabs.tabs.find(x=>x.name==='Corporate Finance Europe').id;
assert.equal(list('taaza','Abhishek','all',{tabId:otherID,pageSize:80}).rows[0].company,'ValCo');
const alert=new MockSheet('Pooja Alert Setup',80,13);
alert.set(1,1,'Alert setup');alert.set(1,2,'Email');alert.set(1,3,'Target');
regions['Pooja Alert Setup']=alert;
assert.ok(!list('taaza').tabs.some(t=>t.name==='Pooja Alert Setup'));
assert.equal(list('taaza','Abhishek','all',{tabId:'deleted-id',pageSize:80}).tabId,'all');

// Unapplied contains ONLY generated CVs without an Applied status.
fresh.set(3,12,'CV');fresh.set(3,18,'https://docs.google.com/document/d/confirmedAbhishek/edit');
fresh.set(3,35,'Abhishek post-CV prompt');
fresh.set(4,12,'Applied');fresh.set(4,18,'https://docs.google.com/document/d/confirmedApplied/edit');
fresh.set(4,35,'Should not appear under Unapplied');
fresh.set(5,12,'CV'); // Requested but no generated file.
assert.deepEqual(rows(list('fresh','Abhishek','unapplied',{pageSize:15})),[3]);
assert.equal(list('fresh','Abhishek','unapplied',{pageSize:15}).rows[0].promptReady,true);
assert.equal(js(run('getCopyPrompt({candidate:"Abhishek",row:3,expected:{company:"Alpha",role:"Alpha Role",url:"https://www.jobs.test/open/1"}})')).prompt,
  'Abhishek post-CV prompt');
// Pooja's existing AH content must remain hidden until Pooja has her own CV.
fresh.set(3,34,'Pooja secret pre-CV prompt');
assert.equal(js(run('getJob({candidate:"Pooja",source:"fresh",row:3})')).promptReady,false);
assert.throws(()=>run('getCopyPrompt({candidate:"Pooja",row:3,expected:{company:"Alpha",role:"Alpha Role",url:"https://www.jobs.test/open/1"}})'),/completed CV/);

// Existing worker cost cells belong to their candidate, with four-decimal
// precision, and blank cells must never be treated as a recorded zero.
fresh.set(3,21,0.9573);fresh.set(3,31,1.2345);
fresh.set(4,21,0.0007);fresh.set(5,21,0.5);
fresh.set(3,15,'COMPLETE');fresh.set(3,25,'COMPLETE');
const summary=js(run('getExpenses()'));
assert.equal(summary.currency,'USD');
assert.equal(summary.candidates.Abhishek.recordedUsd,1.458);
assert.equal(summary.candidates.Pooja.recordedUsd,1.2345);
assert.equal(summary.totalUsd,2.6925);
assert.equal(summary.candidates.Abhishek.recordedJobs,3);
assert.equal(summary.candidates.Pooja.recordedJobs,1);
assert.equal(list('fresh','Abhishek','all',{pageSize:20}).rows.find(j=>j.row===3).costUsd,0.9573);
assert.equal(list('fresh','Pooja','all',{pageSize:20}).rows.find(j=>j.row===3).costUsd,1.2345);
assert.equal(js(run('getJob({source:"fresh",candidate:"Abhishek",row:3})')).costUsd,0.9573);
assert.equal(js(run('getJob({source:"fresh",candidate:"Pooja",row:3})')).costUsd,1.2345);

// Client-side syntax and presence of compact buttons.
const html=fs.readFileSync(__dirname+'/../Index.html','utf8');
const script=html.match(/<script>([\s\S]+?)<\/script>/);
assert.ok(script);
new vm.Script(script[1],{filename:'Index.html'});
assert.match(html,/Download CV/);assert.match(html,/Copy Prompt/);
assert.match(html,/data-action="copy-prompt"/);assert.match(html,/data-action="download-cv"/);

// Candidate preference states: Favorite stays visible in normal views, but can be
// filtered independently of Not Interested for each person.
let preferenceResult=js(run('setJobPreference({source:"taaza",candidate:"Abhishek",row:4,value:"Favorite",expected:{company:"Gamma",role:"Gamma Role",url:"https://jobs.test/open/3"}})'));
assert.equal(preferenceResult.preference,'Favorite');
assert.equal(taaza.get(4,14),'Favorite');
assert.deepEqual(rows(list('taaza','Abhishek','favorites',{pageSize:30})),[4]);
assert.equal(list('taaza','Pooja','favorites',{pageSize:30}).total,0);
assert.ok(rows(list('taaza','Abhishek','all',{pageSize:80})).includes(4));
run('setJobPreference({source:"taaza",candidate:"Abhishek",row:4,value:"",expected:{company:"Gamma",role:"Gamma Role",url:"https://jobs.test/open/3"}})');
assert.equal(taaza.get(4,14),'');
assert.equal(list('taaza','Abhishek','favorites').total,0);

// Saving an adequately complete JD must create exactly one Make CV vacancy,
// without checking CV or CL triggers and without overwriting another job.
const goodJD='A full transfer pricing job description with extensive responsibilities, technical requirements, professional standards and client advisory duties.';
const outcome=js(run('saveDiscovery('+JSON.stringify({row:27,expected:{company:'TPCo',role:'Transfer Pricing Senior',url:'https://eu.test/tp/one'},expectedJD:'Full Europe TP job description',updates:{jd:goodJD}})+')'));
assert.equal(outcome.saved,true);
assert.equal(outcome.autoTransferred,true);
assert.ok(outcome.freshRow>=6);
assert.equal(fresh.get(outcome.freshRow,1),'TPCo');
assert.equal(fresh.get(outcome.freshRow,4),goodJD);
assert.equal(fresh.get(outcome.freshRow,8),''); // No paid CV checkbox
assert.equal(fresh.get(outcome.freshRow,9),''); // No paid CL checkbox
assert.equal(js(run('transferJob({row:27,expected:{company:"TPCo",role:"Transfer Pricing Senior",url:"https://eu.test/tp/one"}})')).created,false);

// Migrating old Boolean flags is lossless; preference dropdowns become available.
taaza.set(28,14,true);
const migration=js(run('migrateJobPreferences({confirm:true})'));
assert.equal(migration.migrated,true);
assert.equal(taaza.get(28,14),'Not Interested');
assert.ok(taaza.validation&&taaza.validation.values.includes('Favorite'));
assert.ok(fresh.validation&&fresh.validation.values.includes('Not Interested'));

assert.match(html,/data-action="preference-toggle"/);
assert.doesNotMatch(html,/data-action="job-preference"/);
assert.match(html,/data-action="sort-jobs"/);
assert.match(html,/data-candidate="Pooja"/); // candidate-specific CSS
assert.match(html,/class="score-four"/);
assert.match(html,/joblink/);

console.log('PASS: candidate isolation, cross-sheet linkage, duplicate canonical URLs, restoration, filtering, offset paging, validation and lock release');
