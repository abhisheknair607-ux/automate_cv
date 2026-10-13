/**
 * Freshmaal Job Control Centre — standalone overlay.
 * The only schema additions are candidate-specific Not Interested flags (Taaza N/O, Freshmaal AT/AU).
 * No changes to GitHub CV worker,
 * API model prompts, or Taaza discovery scraper.
 *
 * DEPLOYMENT: Google Apps Script Web app -> Execute as 'User accessing the web app'.
 * Set Script Property ALLOWED_EMAILS to a comma-separated list of the two users'
 * Google account email addresses. Each user must have editor access to both sheets.
 */
const SETTINGS = Object.freeze({
  taazaId: '1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY',
  freshId: '1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc',
  taazaTab: 'Jobs', freshTab: 'Sheet1',
  maxPageSize: 50, maxBulk: 20, maxJD: 49000,
  maxFreshRow: 1000
});
// Persistent per-candidate rejection flags in the existing sheet tabs.
// Taaza N/O (no extra tab); Freshmaal AT/AU (after model tier AR/AS).
const TAAZA_INTEREST = Object.freeze({Abhishek:14, Pooja:15});
const PEOPLE = Object.freeze({
  Abhishek: {cv:8, cl:9, web:10, status:12, score:38, rank:39, selected:42,
             workflow:15, cvLink:18, clLink:19, folder:37, error:22, tier:44, lock:16, notInterested:46},
  Pooja: {cv:5, cl:6, web:7, status:11, score:40, rank:41, selected:43,
          workflow:25, cvLink:28, clLink:29, folder:36, error:32, tier:45, lock:26, notInterested:47}
});

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Freshmaal · Job Control Centre')
    .addMetaTag('viewport', 'width=device-width,initial-scale=1,viewport-fit=cover');
}

function authorise_() {
  const allowed = String(PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) throw new Error('Access not configured: set ALLOWED_EMAILS in Apps Script project properties.');
  const email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) throw new Error('Access denied for this Google account.');
  return email;
}
function person_(name) {
  if (!Object.prototype.hasOwnProperty.call(PEOPLE, name)) throw new Error('Unknown candidate.');
  return PEOPLE[name];
}
function sheet_(source) {
  if (source !== 'taaza' && source !== 'fresh') throw new Error('Unknown data source.');
  const id = source === 'taaza' ? SETTINGS.taazaId : SETTINGS.freshId;
  const tab = source === 'taaza' ? SETTINGS.taazaTab : SETTINGS.freshTab;
  const sh = SpreadsheetApp.openById(id).getSheetByName(tab);
  if (!sh) throw new Error('Source tab not found: ' + tab);
  return sh;
}
function clean_(v, max) {
  const text = String(v == null ? '' : v).replace(/\u0000/g, '').trim();
  if (text.length > (max || 500)) throw new Error('Text exceeds allowed length.');
  // Prevent spreadsheet formula injection from externally pasted field contents.
  return /^[=+@]/.test(text) ? "'" + text : text;
}
function url_(v) {
  const text = String(v || '').trim();
  if (!/^https?:\/\//i.test(text)) throw new Error('Enter a valid HTTPS/HTTP vacancy link.');
  return clean_(text, 2000);
}
function canonical_(value) {
  // Google Apps Script V8 does not expose every browser URL API consistently.
  const raw=String(value||'').trim().replace(/#.*$/, '');
  const match=raw.match(/^(https?):\/\/([^\/?#]+)(\/[^?#]*)?(?:\?([^#]*))?$/i);
  if(!match)return raw.toLowerCase().replace(/\/$/,'');
  const host=match[2].toLowerCase().replace(/^www\./,'');
  const path=(match[3]||'/').replace(/\/$/,'')||'/';
  const ignore=/^(utm_.+|fbclid|gclid|msclkid|igshid|ref_src|source|trk|tracking|tm_event|tm_company)$/i;
  const query=(match[4]||'').split('&').filter(p=>p&&(!ignore.test(p.split('=')[0]))).sort().join('&');
  return 'https://'+host+path+(query?'?'+query:'');
}
function jdReady_(text) {
  const s = String(text || '').trim();
  return s.length >= 80 && !/^(open original job description|click here|view job description|see original job description|job description missing)$/i.test(s);
}
function truthy_(value) { return value === true || String(value).toLowerCase() === 'true'; }
function expected_(sh, row, firstDataRow, expected) {
  row = Number(row);
  if (!Number.isInteger(row) || row < firstDataRow || row > sh.getMaxRows()) throw new Error('Invalid job row.');
  const live = sh.getRange(row, 1, 1, 3).getValues()[0];
  if (!expected ||
      String(live[0] || '') !== String(expected.company || '') ||
      String(live[1] || '') !== String(expected.role || '') ||
      canonical_(live[2]) !== canonical_(expected.url)) {
    throw new Error('This job changed in Google Sheets. Refresh and try again; nothing was overwritten.');
  }
  return row;
}
function lockRun_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return action(); } finally { lock.releaseLock(); }
}
function getBootstrap() {
  const email = authorise_();
  sheet_('taaza'); sheet_('fresh');
  return {email, people:Object.keys(PEOPLE), sources:{taaza:'Taaza Videshi Maal',fresh:'Freshmaal'},
    links:{taaza:'https://docs.google.com/spreadsheets/d/'+SETTINGS.taazaId+'/edit',
           fresh:'https://docs.google.com/spreadsheets/d/'+SETTINGS.freshId+'/edit'}};
}

function taazaRows_() {
  const sh = sheet_('taaza'), count = Math.max(0, sh.getLastRow() - 1);
  if (!count) return [];
  const left=sh.getRange(2,1,count,4).getValues();
  const right=sh.getRange(2,5,count,9).getValues();
  const reject=sh.getRange(2,14,count,2).getValues();
  return left.map((a,i)=>({row:i+2,company:String(a[0]||''),role:String(a[1]||''),
    url:String(a[2]||''),jd:String(a[3]||''),location:String(right[i][0]||''),
    posted:String(right[i][1]||''),deadline:String(right[i][2]||''),start:String(right[i][3]||''),
    added:String(right[i][4]||''),salary:String(right[i][5]||''),
    sendFlag:truthy_(right[i][6]),transferStatus:String(right[i][7]||''),source:String(right[i][8]||''),
    notInterested:{Abhishek:truthy_(reject[i][0]),Pooja:truthy_(reject[i][1])}}))
    .filter(x=>x.company || x.role || x.url);
}
function freshRows_() {
  const sh = sheet_('fresh'), count = Math.max(0, Math.min(sh.getMaxRows(), SETTINGS.maxFreshRow) - 2);
  if (!count) return [];
  const first=sh.getRange(3,1,count,3).getValues();
  const checks=sh.getRange(3,5,count,8).getValues();
  const stages=sh.getRange(3,13,count,20).getValues();
  const last=sh.getRange(3,33,count,15).getValues();
  return first.map((a,i)=>{
    const person={};
    Object.keys(PEOPLE).forEach(name=>{
      const c=PEOPLE[name], b=checks[i], m=stages[i], e=last[i];
      const shifted=col=> m[col-13];
      person[name]={cv:truthy_(b[c.cv-5]),cl:truthy_(b[c.cl-5]),web:truthy_(b[c.web-5]),
        status:String(b[c.status-5]||''),score:e[c.score-33]===''?'':e[c.score-33],
        rank:e[c.rank-33]===''?'':e[c.rank-33], selected:truthy_(e[c.selected-33]),
        workflow:String(shifted(c.workflow)||''),cvLink:String(shifted(c.cvLink)||''),
        clLink:String(shifted(c.clLink)||''),folder:String(e[c.folder-33]||''),
        error:String(shifted(c.error)||''),tier:String(e[c.tier-33]||'Premium'),
        notInterested:truthy_(e[c.notInterested-33])};
    });
    return {row:i+3,company:String(a[0]||''),role:String(a[1]||''),url:String(a[2]||''),
            location:String(last[i][0]||''),person};
  }).filter(x=>x.company || x.role || x.url);
}

/** Return the live Sheet validation values (list OR range) without inventing states. */
function statusOptions_(validation, current) {
  let choices = [];
  if (validation) {
    const type = validation.getCriteriaType();
    const criteria = validation.getCriteriaValues();
    if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      choices = criteria[0] || [];
    } else if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && criteria[0]) {
      choices = criteria[0].getDisplayValues().reduce((a, row) => a.concat(row), []);
    }
  }
  // Mirrors the pre-existing detail drawer fallback when the cell has no validation.
  if (!choices.length) choices = ['Not started', 'Ready', 'Applied'];
  choices = [...new Set(choices.map(v => String(v == null ? '' : v).trim()).filter(Boolean))].slice(0, 75);
  if (current && !choices.includes(String(current))) choices.unshift(String(current));
  return choices;
}

function listJobs(options) {
  authorise_(); options=options||{};
  const source=options.source==='fresh'?'fresh':'taaza';
  const candidate=String(options.candidate||'Abhishek'); person_(candidate);
  const query=String(options.query||'').trim().toLowerCase().slice(0,150);
  const filter=String(options.filter||'all');
  const pageSize=Math.min(SETTINGS.maxPageSize, Math.max(1, Number(options.pageSize)||10));
  const page=Math.max(1, Math.floor(Number(options.page)||1));
  let jobs=source==='taaza'?taazaRows_():freshRows_();
  // Treat a rejection recorded in either source as effective for this candidate.
  // Direct Sheet edits are reflected in both web lists without altering the other candidate.
  if (source==='taaza') {
    const other=freshRows_();
    const transferred=new Set(other.map(x=>canonical_(x.url)).filter(Boolean));
    const hidden=new Set(other.filter(x=>x.person[candidate].notInterested)
      .map(x=>canonical_(x.url)).filter(Boolean));
    jobs=jobs.map(x=>Object.assign(x,{
      transferred:transferred.has(canonical_(x.url)),jdReady:jdReady_(x.jd),
      notInterested:!!x.notInterested[candidate]||hidden.has(canonical_(x.url))
    }));
    jobs.forEach(x=>delete x.jd);
  } else {
    const hidden=new Set(taazaRows_().filter(x=>x.notInterested[candidate])
      .map(x=>canonical_(x.url)).filter(Boolean));
    jobs=jobs.map(x=>Object.assign(x,{...x.person[candidate],
      notInterested:!!x.person[candidate].notInterested||hidden.has(canonical_(x.url))}));
    jobs.forEach(x=>delete x.person);
  }
  if (filter==='not-interested') jobs=jobs.filter(x=>x.notInterested);
  else jobs=jobs.filter(x=>!x.notInterested);
  if(query)jobs=jobs.filter(x=>[x.company,x.role,x.location,x.url].some(z=>String(z||'').toLowerCase().includes(query)));
  if(filter==='missing'&&source==='taaza')jobs=jobs.filter(x=>!x.jdReady);
  if(filter==='ready'&&source==='taaza')jobs=jobs.filter(x=>x.jdReady&&!x.transferred);
  if(filter==='transferred'&&source==='taaza')jobs=jobs.filter(x=>x.transferred);
  if(filter==='selected'&&source==='fresh')jobs=jobs.filter(x=>x.selected);
  if(filter==='cv'&&source==='fresh')jobs=jobs.filter(x=>x.cv);
  if(filter==='applied'&&source==='fresh')jobs=jobs.filter(x=>String(x.status||'').trim().toLowerCase()==='applied');
  if(filter==='unapplied'&&source==='fresh')jobs=jobs.filter(x=>String(x.status||'').trim().toLowerCase()!=='applied');
  if(filter==='unscored'&&source==='fresh')jobs=jobs.filter(x=>x.score===''||x.score==null);
  const sort=String(options.sort||'newest');
  if (sort==='company')jobs.sort((a,b)=>a.company.localeCompare(b.company));
  else if(sort==='score'&&source==='fresh')jobs.sort((a,b)=>(Number(b.score)||-1)-(Number(a.score)||-1));
  else jobs.sort((a,b)=>b.row-a.row);
  const total=jobs.length, pages=Math.max(1,Math.ceil(total/pageSize));
  const offset=Object.prototype.hasOwnProperty.call(options,'offset')?
    Math.min(total,Math.max(0,Math.floor(Number(options.offset)||0))):
    (Math.min(page,pages)-1)*pageSize;
  const visible = jobs.slice(offset, offset + pageSize);
  if (source === 'fresh' && visible.length) {
    const conf = person_(candidate), sh = sheet_('fresh');
    const start = Math.min(...visible.map(x => x.row));
    const end = Math.max(...visible.map(x => x.row));
    const validations = sh.getRange(start, conf.status, end-start+1, 1).getDataValidations();
    visible.forEach(x => { x.statusOptions = statusOptions_(validations[x.row-start][0], x.status); });
  }
  return {source,candidate,total,page:Math.min(page,pages),pageSize,pages,
    rows:visible,
    counts:{total,selected:source==='fresh'?jobs.filter(x=>x.selected).length:undefined}};
}
function getJob(options) {
  authorise_(); options=options||{};
  const candidate=String(options.candidate||'Abhishek');
  const conf=person_(candidate), source=options.source==='fresh'?'fresh':'taaza';
  const sh=sheet_(source),row=Number(options.row),min=source==='fresh'?3:2;
  if(!Number.isInteger(row)||row<min||row>sh.getMaxRows())throw new Error('Invalid row.');
  if(source==='taaza'){
    const a=sh.getRange(row,1,1,15).getValues()[0];
    return {source,row,company:String(a[0]||''),role:String(a[1]||''),url:String(a[2]||''),
      jd:String(a[3]||''),location:String(a[4]||''),posted:String(a[5]||''),deadline:String(a[6]||''),
      start:String(a[7]||''),added:String(a[8]||''),salary:String(a[9]||''),
      transferStatus:String(a[11]||''),jdReady:jdReady_(a[3]),
      notInterested:truthy_(a[TAAZA_INTEREST[candidate]-1])||
        freshRows_().some(x=>canonical_(x.url)===canonical_(a[2])&&x.person[candidate].notInterested)};
  }
  const a=sh.getRange(row,1,1,47).getValues()[0];
  const data={source,row,company:String(a[0]||''),role:String(a[1]||''),url:String(a[2]||''),
    jd:String(a[3]||''),location:String(a[32]||''),cv:truthy_(a[conf.cv-1]),
    cl:truthy_(a[conf.cl-1]),web:truthy_(a[conf.web-1]),
    status:String(a[conf.status-1]||''),selected:truthy_(a[conf.selected-1]),
    score:a[conf.score-1],rank:a[conf.rank-1],workflow:String(a[conf.workflow-1]||''),
    cvLink:String(a[conf.cvLink-1]||''),clLink:String(a[conf.clLink-1]||''),
    folder:String(a[conf.folder-1]||''),error:String(a[conf.error-1]||''),tier:String(a[conf.tier-1]||'Premium'),
    notInterested:truthy_(a[conf.notInterested-1])||
      taazaRows_().some(x=>canonical_(x.url)===canonical_(a[2])&&x.notInterested[candidate])};
  data.statusOptions=statusOptions_(sh.getRange(row,conf.status).getDataValidation(),data.status);
  return data;
}
/**
 * Hide/restore a vacancy for just one person, in Taaza and Freshmaal together.
 * This is NOT an application status and DOES NOT modify Make CV/CL or GitHub.
 * All matching URL rows are included so duplicated discovery records do not resurface.
 */
function setNotInterested(payload) {
  authorise_(); payload=payload||{};
  const source=String(payload.source||''),candidate=String(payload.candidate||'');
  const person=person_(candidate);
  if(source!=='taaza'&&source!=='fresh') throw new Error('Choose Taaza or Freshmaal.');
  if(typeof payload.value!=='boolean') throw new Error('Not Interested must be true or false.');
  const val=payload.value;
  return lockRun_(()=>{
    const primary=sheet_(source);
    const row=expected_(primary,payload.row,source==='taaza'?2:3,payload.expected);
    const live=primary.getRange(row,1,1,3).getValues()[0];
    const key=canonical_(live[2]);
    if(!key) throw new Error('This vacancy needs a valid link to synchronise Not Interested.');
    // Build the target list before starting any write to avoid partial row discoveries.
    const targets=[];
    const add=(kind,entries,col)=>{
      entries.filter(x=>canonical_(x.url)===key).forEach(x=>targets.push({kind,row:x.row,col,
        expected:{company:x.company,role:x.role,url:x.url}}));
    };
    add('taaza',taazaRows_(),TAAZA_INTEREST[candidate]);
    add('fresh',freshRows_(),person.notInterested);
    if(!targets.some(x=>x.kind===source&&x.row===row))
      throw new Error('The source job was not found. Refresh and try again.');
    targets.forEach(t=>expected_(sheet_(t.kind),t.row,t.kind==='taaza'?2:3,t.expected));
    targets.forEach(t=>sheet_(t.kind).getRange(t.row,t.col).setValue(val));
    SpreadsheetApp.flush();
    for(const t of targets) {
      if(truthy_(sheet_(t.kind).getRange(t.row,t.col).getValue())!==val)
        throw new Error('The Not Interested write could not be verified. Refresh both sheets.');
    }
    return {saved:true,candidate,notInterested:val,updatedRows:targets.length,
      message:val?'Moved to Not Interested for '+candidate+'.':'Restored for '+candidate+'.'};
  });
}

function openSlot_(sh,firstRow,maxRow) {
  const limit=Math.min(sh.getMaxRows(), maxRow||sh.getMaxRows());
  if(limit<firstRow)throw new Error('Spreadsheet has no free job rows.');
  const n=limit-firstRow+1;
  // Ignore pre-filled Rank formulas in AM/AO, but never reuse a partially populated vacancy.
  const main=sh.getRange(firstRow,1,n,4).getValues();
  const isFresh=sh.getName()===SETTINGS.freshTab;
  const state=isFresh?sh.getRange(firstRow,13,n,20).getValues():null;
  for(let i=0;i<n;i++) {
    const hasVacancy=main[i].some(x=>String(x==null?'':x).trim()!=='');
    const hasWorkflow=isFresh&&state[i].some(x=>String(x==null?'':x).trim()!=='');
    if(!hasVacancy&&!hasWorkflow)return i+firstRow;
  }
  throw new Error('No safe free job rows remain inside the existing grid. No data was written.');
}
function addDiscovery(payload) {
  authorise_(); payload=payload||{};
  const company=clean_(payload.company,300),role=clean_(payload.role,400),link=url_(payload.url),
        jd=clean_(payload.jd||'',SETTINGS.maxJD),location=clean_(payload.location||'',500);
  if(!company||!role)throw new Error('Company and designation are required.');
  return lockRun_(()=>{
    const sh=sheet_('taaza'),key=canonical_(link);
    const existing=taazaRows_().find(x=>canonical_(x.url)===key);
    if(existing)return {created:false,row:existing.row,message:'Already in Taaza. Existing entry preserved.'};
    const row=openSlot_(sh,2);
    const values=[company,role,link,jd,location,'',clean_(payload.deadline||'',60),'',
      new Date(),clean_(payload.salary||'',500),false,'','Webapp'];
    sh.getRange(row,1,1,13).setValues([values]);
    // Reset candidate decisions when reusing a previously cleared discovery row.
    sh.getRange(row,14,1,2).setValues([[false,false]]);
    SpreadsheetApp.flush();
    return {created:true,row,message:'Added to Taaza Videshi Maal.'};
  });
}
function saveDiscovery(payload) {
  authorise_();payload=payload||{};
  return lockRun_(()=>{
    const sh=sheet_('taaza'),row=expected_(sh,payload.row,2,payload.expected);
    const updates=payload.updates||{},fields={company:1,role:2,url:3,jd:4,location:5,posted:6,deadline:7,start:8,salary:10};
    if(Object.prototype.hasOwnProperty.call(updates,'jd') &&
       String(sh.getRange(row,4).getValue()||'')!==String(payload.expectedJD||''))
      throw new Error('The JD was edited elsewhere. Reload this job before replacing Column D.');
    const keys=Object.keys(updates);
    if(!keys.length)throw new Error('No changes to save.');
    keys.forEach(key=>{
      if(!fields[key])throw new Error('Field cannot be edited in this screen: '+key);
      const value=key==='url'?url_(updates[key]):clean_(updates[key],key==='jd'?SETTINGS.maxJD:500);
      if((key==='company'||key==='role')&&!value)throw new Error(key+' cannot be blank.');
      sh.getRange(row,fields[key]).setValue(value);
    });
    SpreadsheetApp.flush();
    return {saved:true,row,message:'Saved to Taaza. Freshmaal was not automatically modified.'};
  });
}
function findFresh_(url,company,role) {
  const canon=canonical_(url),rows=freshRows_();
  let match=canon?rows.find(x=>canonical_(x.url)===canon):undefined;
  if(!match&&!canon)match=rows.find(x=>x.company.toLowerCase()===company.toLowerCase()&&x.role.toLowerCase()===role.toLowerCase());
  return match;
}
function transferJob(payload) {
  authorise_();payload=payload||{};
  return lockRun_(()=>{
    const taaza=sheet_('taaza'),row=expected_(taaza,payload.row,2,payload.expected);
    const a=taaza.getRange(row,1,1,5).getValues()[0];
    const company=String(a[0]||''),role=String(a[1]||''),url=String(a[2]||''),jd=String(a[3]||''),location=String(a[4]||'');
    if(!jdReady_(jd))throw new Error('Paste and save the complete JD to Taaza before transferring.');
    const prev=findFresh_(url,company,role);
    if(prev){
      taaza.getRange(row,12).setValue('Already in Freshmaal — row '+prev.row);
      SpreadsheetApp.flush();
      return {created:false,freshRow:prev.row,message:'Already exists in Freshmaal; no duplicate created.'};
    }
    const fresh=sheet_('fresh'),newRow=openSlot_(fresh,3,SETTINGS.maxFreshRow);
    // Only input columns are populated. Never touch old CV state, locks, output links or rank formulas.
    fresh.getRange(newRow,1,1,4).setValues([[company,role,url,jd]]);
    fresh.getRange(newRow,33).setValue(location);
    // Carry Taaza's candidate-specific exclusions to the newly created Freshmaal row.
    const exclusions=taaza.getRange(row,14,1,2).getValues()[0].map(truthy_);
    fresh.getRange(newRow,46,1,2).setValues([exclusions]); // Also clears reused-row flags.
    SpreadsheetApp.flush();
    const verify=fresh.getRange(newRow,1,1,4).getValues()[0];
    if(String(verify[2])!==url||String(verify[3])!==jd)
      throw new Error('Freshmaal write verification failed. Check row '+newRow+' before retrying.');
    taaza.getRange(row,12).setValue('Sent to Freshmaal — row '+newRow);
    SpreadsheetApp.flush();
    return {created:true,freshRow:newRow,message:'Transferred and verified in Freshmaal.'};
  });
}
function bulkTransfer(payload) {
  authorise_();payload=payload||{};
  const rows=Array.isArray(payload.jobs)?payload.jobs:[];
  if(!rows.length||rows.length>SETTINGS.maxBulk)throw new Error('Select 1–20 vacancies to transfer.');
  const results=[];
  // transferJob uses a lock individually. Do not nest locks.
  rows.forEach(x=>{try{results.push({row:x.row,ok:true,...transferJob(x)});}
                  catch(e){results.push({row:x.row,ok:false,error:String(e.message||e)});}});
  return {results,completed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length};
}
function updateFreshJD(payload) {
  authorise_();payload=payload||{};
  if(payload.confirm!==true)throw new Error('Explicit confirmation required to update a transferred JD.');
  return lockRun_(()=>{
    const taaza=sheet_('taaza'),row=expected_(taaza,payload.row,2,payload.expected);
    const a=taaza.getRange(row,1,1,5).getValues()[0];
    const found=findFresh_(String(a[2]||''),String(a[0]||''),String(a[1]||''));
    if(!found)throw new Error('Vacancy has not been transferred. Send to Freshmaal first.');
    if(!jdReady_(a[3]))throw new Error('Taaza JD is incomplete.');
    const fresh=sheet_('fresh');
    const locks=fresh.getRange(found.row,16,1,11).getValues()[0];
    if(String(locks[0]||'').trim() || String(locks[10]||'').trim())
      throw new Error('CV workflow lock is present; JD cannot be changed while processing.');
    const current=fresh.getRange(found.row,4).getValue();
    if(String(current)===String(a[3]))return {changed:false,freshRow:found.row,message:'JD already matches Freshmaal.'};
    fresh.getRange(found.row,4).setValue(String(a[3]));
    SpreadsheetApp.flush();
    return {changed:true,freshRow:found.row,message:'Freshmaal JD updated. Existing CVs are not automatically regenerated.'};
  });
}
function updateFreshControl(payload) {
  authorise_();payload=payload||{};
  return lockRun_(()=>{
    const candidate=String(payload.candidate||''),p=person_(candidate),sh=sheet_('fresh');
    const row=expected_(sh,payload.row,3,payload.expected);
    const fields={cv:p.cv,cl:p.cl,web:p.web,selected:p.selected,status:p.status,tier:p.tier};
    const field=String(payload.field||'');
    if(!Object.prototype.hasOwnProperty.call(fields,field))throw new Error('Unsupported control field.');
    const col=fields[field],cell=sh.getRange(row,col);
    let value;
    if(field==='tier'){
      value=String(payload.value||'').trim();
      if(!['Economy','Balanced','Premium'].includes(value))throw new Error('Select Economy, Balanced or Premium.');
      if(String(sh.getRange(row,p.lock).getValue()||'').trim())throw new Error('CV is running; wait before changing the model.');
    } else if(field==='status'){
      value=clean_(payload.value||'',100);
      const val=cell.getDataValidation();
      if(val){
        const allowed=statusOptions_(val, String(cell.getValue()||''));
        if(value&&!allowed.includes(value))throw new Error('Status is not allowed by Freshmaal: '+value);
      }
    } else {
      if(typeof payload.value!=='boolean')throw new Error('Checkbox value must be true/false.');
      value=payload.value;
    }
    cell.setValue(value);
    SpreadsheetApp.flush();
    const got=cell.getValue();
    if(String(got)!==String(value))throw new Error('Could not verify control update.');
    return {saved:true,row,field,candidate,value,message:field==='tier'?value+' saved for '+candidate+' in Freshmaal.':'Saved directly in Freshmaal.'};
  });
}

function getStats(candidate) {
  authorise_(); person_(candidate);
  const taaza=taazaRows_(), fresh=freshRows_(), own=fresh.map(x=>x.person[candidate]);
  return {discovered:taaza.length,applications:fresh.length,
    selected:own.filter(x=>x.selected).length,
    cvRequested:own.filter(x=>x.cv).length,
    applied:own.filter(x=>String(x.status).toLowerCase()==='applied').length,
    missingJD:taaza.filter(x=>!jdReady_(x.jd)).length,
    notInterestedDiscovery:taaza.filter(x=>x.notInterested[candidate]).length,
    notInterestedFresh:own.filter(x=>x.notInterested).length};
}

/**
 * Queue one candidate/job's existing controlled GitHub Actions workflow.
 * The OpenAI key remains in GitHub Secrets. A separate GitHub Actions
 * fine-grained token stays ONLY in the Google Apps Script script properties.
 */
function runCvApiNow(payload) {
  authorise_();
  payload = payload || {};
  if (payload.confirm !== true) throw new Error('Confirm the paid API run first.');
  return lockRun_(function() {
    const candidate = String(payload.candidate || '');
    const p = person_(candidate);
    const sh = sheet_('fresh');
    const row = expected_(sh, payload.row, 3, payload.expected);
    const a = sh.getRange(row, 1, 1, 47).getValues()[0];
    const status = String(a[p.status - 1] || '').trim().toLowerCase();
    const tier = String(a[p.tier - 1] || 'Premium').trim();
    if (!['Economy', 'Balanced', 'Premium'].includes(tier)) throw new Error('Select a valid CV model first.');
    if (!jdReady_(a[3])) throw new Error('This job does not have a complete JD.');
    if (!truthy_(a[p.cv - 1])) throw new Error('Tick Make CV and save it before running the API.');
    if (status === 'applied') throw new Error('Applied applications cannot be regenerated.');
    if (truthy_(a[p.notInterested - 1])) throw new Error('Restore this job from Not Interested first.');
    if (String(a[p.lock - 1] || '').trim()) throw new Error('This candidate/job is already being processed.');
    if (String(a[p.cvLink - 1] || '').trim() || /^complete$/i.test(String(a[p.workflow - 1] || '').trim()))
      throw new Error('A completed CV already exists. Review the existing result before requesting another.');
    const token = String(PropertiesService.getScriptProperties().getProperty('GITHUB_WORKFLOW_TOKEN') || '').trim();
    if (!token) throw new Error('One-time setup required: set GITHUB_WORKFLOW_TOKEN in Apps Script Script Properties.');
    const cache = CacheService.getScriptCache();
    const key = 'cv-api-manual-' + candidate.toLowerCase() + '-' + row;
    if (cache.get(key)) throw new Error('Already queued recently for this candidate/job. Check GitHub Actions before retrying.');
    const apiUrl = 'https://api.github.com/repos/abhisheknair607-ux/automate_cv/actions/workflows/controlled-cv-test.yml/dispatches';
    const response = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        ref: 'main',
        inputs: {row_number: String(row), candidate: candidate.toLowerCase()}
      }),
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      muteHttpExceptions: true,
      followRedirects: false
    });
    const statusCode = response.getResponseCode();
    if (statusCode !== 204)
      throw new Error('GitHub did not accept the CV run (HTTP ' + statusCode + '). Check token Actions:write permission, expiry and repository access.');
    cache.put(key, 'submitted', 300);
    return {
      queued: true, candidate: candidate, row: row, tier: tier,
      actionsUrl: 'https://github.com/abhisheknair607-ux/automate_cv/actions/workflows/controlled-cv-test.yml',
      message: 'GitHub accepted the ' + tier + ' CV request for ' + candidate + ', row ' + row + '. Check Actions for completion.'
    };
  });
}
