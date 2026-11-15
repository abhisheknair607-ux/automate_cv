"use strict";
/* Shared, side-panel-local document identity and format rules. No tokens/CV content persisted. */
(function(root){
  const DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PDF="application/pdf";
  const clean=s=>String(s||"").replace(/\s+/g," ").trim();
  const normalized=s=>clean(s).toLocaleLowerCase("en");
  function canonical(url){
    try{
      const u=new URL(String(url||""));
      if(u.protocol!=="https:" && !(u.protocol==="http:" && /^(127\.0\.0\.1|localhost)$/.test(u.hostname)))return "";
      u.hash="";u.username="";u.password="";
      for(const key of [...u.searchParams.keys()])
        if(/^(utm_|fbclid$|gclid$|ref$|trk$|tracking|source$)/i.test(key))u.searchParams.delete(key);
      u.searchParams.sort();
      return u.origin.toLowerCase()+u.pathname.replace(/\/+$/,"")+u.search;
    }catch{return "";}
  }
  function identity({candidate,row,job}){
    const c=clean(candidate),n=Number(row),j=job||{};
    if(!["Abhishek","Pooja"].includes(c)||!Number.isInteger(n)||n<3||
       !clean(j.company)||!clean(j.role)||!canonical(j.url))return null;
    return {candidate:c,row:n,company:clean(j.company),role:clean(j.role),url:canonical(j.url)};
  }
  function equal(a,b){
    return Boolean(a&&b&&a.candidate===b.candidate&&a.row===b.row&&
      normalized(a.company)===normalized(b.company)&&
      normalized(a.role)===normalized(b.role)&&canonical(a.url)===canonical(b.url));
  }
  function looksLikeDoc(bytes,filename,mime){
    const name=String(filename||"").toLowerCase();
    if(!bytes||bytes.length<8)return false;
    if(mime===DOCX&&name.endsWith(".docx"))
      return bytes[0]===80&&bytes[1]===75&&[3,5,7].includes(bytes[2])&&[4,6,8].includes(bytes[3]);
    if(mime===PDF&&name.endsWith(".pdf"))
      return bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
    return false;
  }
  function safeFilename(name){
    const cleanName=String(name||"").split(/[\\/]/).pop().replace(/[^\w.() -]/g,"_").slice(0,180);
    return /\.(docx|pdf)$/i.test(cleanName)?cleanName:"";
  }
  function bindDocument(jobKey,data){
    if(!jobKey||!data||!Number.isInteger(data.size)||data.size<=0||data.size>5_000_000||
      !/^[a-f0-9]{64}$/.test(String(data.sha256||""))||!safeFilename(data.filename)||
      safeFilename(data.filename)!==data.filename||
      ![DOCX,PDF].includes(data.mime)||
      (data.mime===DOCX&&!/\.docx$/i.test(data.filename))||
      (data.mime===PDF&&!/\.pdf$/i.test(data.filename)))return null;
    // A verified binding requires the actual source bytes, not just labels.
    if(typeof data.base64!=="string"||data.base64.length<12)return null;
    try{
      const signature=Uint8Array.from(atob(data.base64.slice(0,24)),c=>c.charCodeAt(0));
      if(!looksLikeDoc(signature,data.filename,data.mime))return null;
    }catch{return null;}
    return {...jobKey,filename:safeFilename(data.filename),mime:data.mime,size:data.size,
      version:"sha256:"+data.sha256,runId:data.runId||null,obtainedAt:Date.now()};
  }
  function attachmentGuard({jobKey,document,tabUrl,tabId,siteApproval}){
    if(!equal(jobKey,document))return {ok:false,reason:"job-or-candidate-mismatch"};
    if(!/^sha256:[a-f0-9]{64}$/.test(document.version||""))return {ok:false,reason:"unverified-document"};
    const dest=canonical(tabUrl);
    if(!dest)return {ok:false,reason:"invalid-application-url"};
    if(dest===jobKey.url)return {ok:true,kind:"exact-vacancy"};
    if(siteApproval?.tabId===tabId&&siteApproval?.url===dest&&siteApproval?.key===jobKey.candidate+":"+jobKey.row)
      return {ok:true,kind:"approved-target"};
    return {ok:false,reason:"review-target",target:dest};
  }
  const api={DOCX,PDF,canonical,identity,equal,looksLikeDoc,safeFilename,bindDocument,attachmentGuard};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalCvHandoff=api;
})(globalThis);
