/**
 * Garamaal / Taaza: LinkedIn alert-email intake.
 * Install as a STANDALONE Apps Script, signed in as the COMMON MAILBOX.
 *
 * Only writes to new "Email Alerts" and "Email Import Log" tabs in Taaza.
 * Does NOT modify Jobs, Fresh Maal, candidate controls, CV processing, or app UI.
 * Existing independent Taaza sync mirrors validated jobs to Jobs every 20 minutes.
 */
var GARAMAAL_ALERTS = Object.freeze({
  sheetId: '1jt3WXqpnzVOYcKCpABIp-7UMUPr48kVhMkLfzGEHHZY',
  intakeTab: 'Email Alerts',
  logTab: 'Email Import Log',
  importedLabel: 'Job Discovery/Imported',
  reviewLabel: 'Job Discovery/Review',
  maxThreads: 100,
  search: 'from:jobalerts-noreply@linkedin.com newer_than:7d -in:spam -in:trash'
});
var ALERT_HEADERS = [
  'Company Name','Designation','Link','Job Description','Location',
  'Posted Date','Application End Date','Role Start Date','Date Added',
  'Salary & Visa Sponsorship','Send to CV Sheet','CV Sheet Status',
  'Discovery Source','Alert Owner','Gmail Message ID','LinkedIn Job ID'
];
var ALERT_LOG_HEADERS = [
  'Processed At','Gmail Message ID','Gmail Thread ID','Alert Received At',
  'Subject','Alert Owner','Jobs Found','Jobs Added','Duplicates Skipped','Result','Details'
];

function ensureLinkedInAlertTabs_() {
  var book = SpreadsheetApp.openById(GARAMAAL_ALERTS.sheetId);
  var expected = [
    [GARAMAAL_ALERTS.intakeTab, ALERT_HEADERS],
    [GARAMAAL_ALERTS.logTab, ALERT_LOG_HEADERS]
  ];
  var output = {};
  expected.forEach(function(pair) {
    var sh = book.getSheetByName(pair[0]);
    if (!sh) {
      sh = book.insertSheet(pair[0]);
      sh.getRange(1,1,1,pair[1].length).setValues([pair[1]]);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,pair[1].length).setFontWeight('bold');
    } else {
      var actual = sh.getRange(1,1,1,pair[1].length).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(pair[1]))
        throw new Error('Existing tab has a different schema: ' + pair[0] + '. No rows changed.');
    }
    output[pair[0]] = sh;
  });
  // Make the existing category sync detect this as a regional source:
  // the first three columns deliberately match other specialist job tabs.
  return output;
}

/** Run once from the common Gmail account only AFTER forwarding filters are working. */
function installLinkedInAlertImporter() {
  ensureLinkedInAlertTabs_();
  var handlers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'importLinkedInJobAlerts';
  });
  handlers.forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importLinkedInJobAlerts').timeBased().everyMinutes(15).create();
  GmailApp.getUserLabelByName(GARAMAAL_ALERTS.importedLabel) ||
    GmailApp.createLabel(GARAMAAL_ALERTS.importedLabel);
  GmailApp.getUserLabelByName(GARAMAAL_ALERTS.reviewLabel) ||
    GmailApp.createLabel(GARAMAAL_ALERTS.reviewLabel);
  Logger.log('15-minute import trigger installed for common mailbox; no CV jobs started.');
}

/** Safe preview: emits counts; does not write a sheet or label any email. */
function previewLinkedInJobAlerts() { return runLinkedInAlertImport_(true); }

/** Trigger entry point; use only after preview has been reviewed. */
function importLinkedInJobAlerts() { return runLinkedInAlertImport_(false); }

function runLinkedInAlertImport_(preview) {
  var lock = LockService.getScriptLock();
  if (!preview && !lock.tryLock(20000)) throw new Error('Another alert importer is running.');
  try {
    var sheets = preview
      ? {
          intake: SpreadsheetApp.openById(GARAMAAL_ALERTS.sheetId).getSheetByName(GARAMAAL_ALERTS.intakeTab),
          log: SpreadsheetApp.openById(GARAMAAL_ALERTS.sheetId).getSheetByName(GARAMAAL_ALERTS.logTab)
        }
      : (function(){ var x = ensureLinkedInAlertTabs_();
          return {intake:x[GARAMAAL_ALERTS.intakeTab],log:x[GARAMAAL_ALERTS.logTab]}; })();
    if (!sheets.intake || !sheets.log)
      throw new Error('Email Alerts and Email Import Log must exist. Run install after setup.');
    var processed = new Set(readColumn_(sheets.log,2,2));
    var seen = existingJobKeys_();
    var threads = GmailApp.search(GARAMAAL_ALERTS.search,0,GARAMAAL_ALERTS.maxThreads);
    var imported = GmailApp.getUserLabelByName(GARAMAAL_ALERTS.importedLabel);
    var review = GmailApp.getUserLabelByName(GARAMAAL_ALERTS.reviewLabel);
    var result = {emails:0,found:0,added:0,duplicates:0,needsReview:0,preview:preview};
    var pendingRows = [];
    var pendingLogs = [];
    var threadMarks = [];

    threads.forEach(function(thread) {
      var threadResult = {review:false,processed:false};
      thread.getMessages().forEach(function(message) {
        var messageId = String(message.getId());
        if (processed.has(messageId)) return;
        if (!isLinkedInAlert_(message)) return;
        result.emails++;
        var owner = alertOwner_(message);
        var parsed = parseLinkedInAlertHtml_(message.getBody());
        var found = parsed.jobs.length;
        result.found += found;
        var added = 0, duplicate = 0;
        parsed.jobs.forEach(function(job) {
          var key = 'li:' + job.id;
          if (seen.has(key)) { duplicate++; result.duplicates++; return; }
          seen.add(key);
          added++;
          result.added++;
          pendingRows.push([
            job.company,job.role,job.url,'Open original job description',
            job.location,'','','',Utilities.formatDate(new Date(),'Europe/Dublin','yyyy-MM-dd'),
            '',false,'','LinkedIn Job Alert',owner,messageId,job.id
          ]);
        });
        var state = parsed.uncertain ? 'Review' : (found ? 'Processed' : 'No vacancies');
        if (parsed.uncertain) {result.needsReview++;threadResult.review=true;}
        pendingLogs.push([
          Utilities.formatDate(new Date(),'Europe/Dublin','yyyy-MM-dd HH:mm:ss'),
          messageId,String(thread.getId()),
          Utilities.formatDate(message.getDate(),'Europe/Dublin','yyyy-MM-dd HH:mm:ss'),
          String(message.getSubject()).slice(0,250),owner,
          found,added,duplicate,state,parsed.uncertain ? 'One or more jobs had incomplete titles, companies or links.' : ''
        ]);
        processed.add(messageId);
        threadResult.processed = true;
      });
      if (threadResult.processed) threadMarks.push({thread:thread,review:threadResult.review});
    });
    if (preview) {
      Logger.log(JSON.stringify(result));
      return result;
    }
    // Read again immediately before writing; refuse overwrite if any pending key appeared
    // during this run (LockService prevents this script's concurrent runs).
    if (pendingRows.length) appendRows_(sheets.intake,pendingRows);
    if (pendingLogs.length) appendRows_(sheets.log,pendingLogs);
    threadMarks.forEach(function(x) {
      try { if (x.review && review) review.addToThread(x.thread);
            else if (imported) imported.addToThread(x.thread);
      } catch (e) { Logger.log('Label update failed: ' + String(e)); }
    });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    if (!preview) lock.releaseLock();
  }
}
function appendRows_(sheet,rows) {
  var start = sheet.getLastRow()+1;
  var ending = start+rows.length-1;
  if (ending > sheet.getMaxRows())
    sheet.insertRowsAfter(sheet.getMaxRows(),ending-sheet.getMaxRows());
  sheet.getRange(start,1,rows.length,rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
  var written = sheet.getRange(start,1,rows.length,3).getValues();
  for (var i=0;i<rows.length;i++)
    for (var j=0;j<3;j++)
      if (String(written[i][j]) !== String(rows[i][j]))
        throw new Error('Write verification failed on '+sheet.getName()+' row '+(start+i));
}
function readColumn_(sheet,start,col) {
  var n=Math.max(0,sheet.getLastRow()-start+1);
  return n ? sheet.getRange(start,col,n,1).getValues().map(function(r){return String(r[0]||'');}) : [];
}
function existingJobKeys_() {
  var book=SpreadsheetApp.openById(GARAMAAL_ALERTS.sheetId);
  var result=new Set();
  book.getSheets().forEach(function(sh){
    if (sh.getName()===GARAMAAL_ALERTS.logTab) return;
    var head=sh.getRange(1,1,1,3).getValues()[0].map(function(x){return String(x||'').toLowerCase().trim();});
    if (!['company name','company','employer'].includes(head[0]) ||
        !['designation','job title','role','position','title'].includes(head[1]) ||
        !['link','job link','vacancy link','url','job url'].includes(head[2])) return;
    var last=sh.getLastRow();
    if (last<2) return;
    sh.getRange(2,3,last-1,1).getValues().forEach(function(row) {
      var id=linkedinId_(String(row[0]||''));
      if(id) result.add('li:'+id);
    });
  });
  return result;
}
function isLinkedInAlert_(message) {
  var from=String(message.getFrom()||'').toLowerCase();
  var subject=String(message.getSubject()||'');
  if (!from.includes('jobalerts-noreply@linkedin.com')) return false;
  // Ignore setup confirmations or unrelated LinkedIn notifications with no jobs.
  if (/alert.+has been created/i.test(subject)) return false;
  return true;
}
function alertOwner_(message) {
  var to=String(message.getTo()||'').toLowerCase();
  if (to.includes('poojaktirupati@gmail.com')) return 'Pooja';
  if (to.includes('itsabhisheknnair@gmail.com')) return 'Abhishek';
  return 'Unassigned';
}
function linkedinId_(link) {
  var match=String(link||'').match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/([0-9]{7,15})/i);
  return match ? match[1] : '';
}
function decodeHtml_(v) {
  return String(v||'').replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&middot;|&#183;/gi,'·').replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));})
    .replace(/&#x([0-9a-f]+);/gi,function(_,n){return String.fromCharCode(parseInt(n,16));});
}
function cleanText_(v) {
  var s=decodeHtml_(v).replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(?:div|p|li|h[1-6])>/gi,'\n')
    .replace(/<[^>]*>/g,' ');
  return s.split(/\r?\n/).map(function(x){return x.replace(/\s+/g,' ').trim();}).filter(Boolean);
}
/** Accept only actual job-posting anchors; never "See all jobs" search links. */
function parseLinkedInAlertHtml_(html) {
  var re=/<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  var anchors=[], m;
  while ((m=re.exec(String(html||'')))!==null) {
    var href=decodeHtml_(m[2]),id=linkedinId_(href);
    if(!id)continue;
    var lines=cleanText_(m[3]);
    var posting=/job_posting/i.test(href);
    var detail=lines.find(function(x){return x.indexOf(' · ')>=0 || x.indexOf('·')>=0;})||'';
    var parts=detail.split(/\s*·\s*/);
    var role=(lines[0]||'').trim();
    var company=(parts.length>=2?parts[0]:'').trim();
    var location=(parts.length>=2?parts[1]:'').trim();
    location=location.replace(/\s+(?:Premium|Actively recruiting|[0-9,]+\s+company alumni).*$/i,'').trim();
    var score=(posting?10:0)+(role&&company?4:0)+lines.length;
    anchors.push({id:id,role:role,company:company,location:location,
      url:'https://www.linkedin.com/jobs/view/'+id+'/',score:score});
  }
  var best={};
  anchors.forEach(function(job){
    if(!best[job.id] || best[job.id].score<job.score)best[job.id]=job;
  });
  var jobs=[],uncertain=false;
  Object.keys(best).forEach(function(id){
    var job=best[id];
    if (!job.role||!job.company||job.role===job.company ||
        job.role.length>250||job.company.length>200) {uncertain=true;return;}
    jobs.push(job);
  });
  return {jobs:jobs,uncertain:uncertain};
}
