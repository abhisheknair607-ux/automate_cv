const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class MockSheet{
  constructor(name,rows,cols){this.name=name;this.rows=rows;this.cols=cols;this.cells=Array.from({length:rows},()=>Array(cols).fill(''));this.writes=[];}
  getName(){return this.name}
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
    }
  }
}
const taaza=new MockSheet('Jobs',80,26),fresh=new MockSheet('Sheet1',80,47);
taaza.set(1,1,'Company Name');fresh.set(1,1,'Company Name');
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
 SpreadsheetApp:{openById(id){return {getSheetByName(tab){const s=id.startsWith('1jt3')?taaza:fresh;return s.name===tab?s:null}}},flush(){}},
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
assert.equal(taaza.get(2,14),true);assert.equal(taaza.get(5,14),true);assert.equal(fresh.get(3,46),true);
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
assert.equal(taaza.get(2,14),false);assert.equal(taaza.get(5,14),false);assert.equal(fresh.get(3,46),false);
assert.equal(list('taaza','Abhishek','not-interested').total,0);
// Pooja flags must never change Abhishek values.
out=interest('fresh','Pooja',4,true,'Beta','https://jobs.test/open/2?utm_campaign=promo');
assert.equal(taaza.get(3,15),true);assert.equal(fresh.get(4,47),true);
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
console.log('PASS: candidate isolation, cross-sheet linkage, duplicate canonical URLs, restoration, filtering, offset paging, validation and lock release');
