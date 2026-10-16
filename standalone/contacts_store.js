"use strict";
/*
 * Freshmaal: separate, narrow Connections tab, never Sheet1.
 * One row per candidate + exact vacancy + named person. Idempotent updates.
 * Direct LinkedIn links are persisted ONLY if the search has verified them.
 * All writes are authenticated, gated by the Cloud Run production write controls,
 * and made only after explicit user confirmation of networking research.
 */
const TAB="Connections";
const HEADER=Object.freeze([
 "Company","Contact Name","Direct LinkedIn Profile","LinkedIn Search",
 "Applied-for Role","Candidate","Freshmaal Row","Vacancy Link",
 "Person's Position","Verification / Evidence","Outreach Message","Research Date (UTC)"
]);
const escapeKey=s=>String(s||"").trim().toLowerCase();
const asCell=(s,n=600)=>String(s==null?"":s).slice(0,n);
function identity(candidate,row,url,name){
 return [candidate,String(row),escapeKey(url),escapeKey(name)].join("|");
}
function quote(s){return "'"+String(s).replace(/'/g,"''")+"'";}
function bookUrl(id){return "https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(id);}
async function api(url,token,{method="GET",body,fetcher=fetch}={}){
 const response=await fetcher(url,{method,headers:{
  Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error("Freshmaal Connections storage unavailable (HTTP "+response.status+").");
 return response.json();
}
async function tabInfo({token,spreadsheetId,fetcher=fetch}){
 const base=bookUrl(spreadsheetId);
 const data=await api(base+"?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",token,{fetcher});
 return (data.sheets||[]).map(s=>s.properties||{}).find(p=>p.title===TAB)||null;
}
async function ensureTab({token,spreadsheetId,fetcher=fetch}){
 let tab=await tabInfo({token,spreadsheetId,fetcher}),created=false;
 const base=bookUrl(spreadsheetId);
 if(!tab){
  const result=await api(base+":batchUpdate",token,{method:"POST",fetcher,body:{
   requests:[{addSheet:{properties:{title:TAB,gridProperties:{rowCount:1000,columnCount:HEADER.length}}}}]
  }});
  tab=result.replies?.[0]?.addSheet?.properties;
  if(!tab||tab.title!==TAB)throw Error("Could not verify newly created Connections tab.");
  created=true;
 }
 if(tab.gridProperties?.columnCount<HEADER.length)throw Error("Connections tab has insufficient columns; refusing to overwrite.");
 const headerRange=quote(TAB)+"!A1:L1";
 const existing=await api(base+"/values/"+encodeURIComponent(headerRange),token,{fetcher});
 const row=existing.values?.[0]||[];
 // Existing tabs with any non-matching value are not ours. Never alter them.
 for(let i=0;i<HEADER.length;i++){
  if(String(row[i]||"").trim()&&String(row[i]).trim()!==HEADER[i])
   throw Error("An existing Connections tab uses an incompatible header; no contacts were written.");
 }
 if(!row.length||row.some((x,i)=>String(x||"").trim()!==HEADER[i])){
  await api(base+"/values/"+encodeURIComponent(headerRange),token,{method:"PUT",fetcher,
   body:{range:headerRange,majorDimension:"ROWS",values:[HEADER]}});
 }
 return {tab,created};
}
function normalizeContact(job,contact){
 const name=asCell(contact?.name,85).trim();
 const role=asCell(contact?.title,120).trim();
 if(name.split(/\s+/).length<2) return null;
 const searchUrl=String(contact?.searchUrl||"");
 if(!/^https:\/\/www\.linkedin\.com\/search\/results\/people\/\?keywords=/.test(searchUrl))return null;
 const candidate=job.candidate,company=asCell(job.company,180),
  jdRole=asCell(job.role,180),url=asCell(job.url,600);
 const direct=contact?.verification==="Direct profile cited in search"
  && /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9-]+\/?$/.test(String(contact.profileUrl||""))
   ?String(contact.profileUrl):"";
 return {
  id:identity(candidate,job.row,url,name),
  cells:[company,name,direct,searchUrl,jdRole,candidate,Number(job.row),url,role,
   asCell((contact.verification||"")+" · "+(contact.evidence||""),400),
   asCell(contact.message,300),new Date().toISOString().slice(0,10)]
 };
}
async function read({token,spreadsheetId,job,fetcher=fetch}){
 const tab=await tabInfo({token,spreadsheetId,fetcher});
 if(!tab)return {tabFound:false,contacts:[],url:null};
 const base=bookUrl(spreadsheetId);
 const range=quote(TAB)+"!A2:L1000";
 const body=await api(base+"/values/"+encodeURIComponent(range),token,{fetcher});
 const vals=body.values||[];
 const contacts=vals.flatMap((row,i)=>{
  if(String(row[5]||"")!==job.candidate||Number(row[6])!==job.row||escapeKey(row[7])!==escapeKey(job.url))return[];
  return [{row:i+2,name:row[1]||"",title:row[8]||"",profileUrl:row[2]||null,
   searchUrl:row[3]||"",verification:row[2]?"Direct profile cited in search":"Direct profile not verified",
   evidence:row[9]||"",message:row[10]||"",date:row[11]||""}];
 });
 return {tabFound:true,contacts,url:"https://docs.google.com/spreadsheets/d/"+encodeURIComponent(spreadsheetId)+"/edit#gid="+tab.sheetId};
}
async function save({token,spreadsheetId,job,contacts,readOnly=false,fetcher=fetch}){
 if(readOnly)throw Object.assign(Error("Read-only deployment cannot save networking contacts."),{httpCode:403});
 if(!job||job.source!=="fresh"||!["Abhishek","Pooja"].includes(job.candidate)||!Number.isInteger(job.row)||job.row<3)
  throw Error("Invalid Freshmaal job.");
 if(!Array.isArray(contacts)||!contacts.length)return {saved:0,updated:0,skipped:0,url:null,empty:true};
 const validated=contacts.map(x=>normalizeContact(job,x)).filter(Boolean);
 if(!validated.length)return {saved:0,updated:0,skipped:contacts.length,url:null,empty:true};
 const {tab}=await ensureTab({token,spreadsheetId,fetcher});
 const base=bookUrl(spreadsheetId);
 const range=quote(TAB)+"!A2:L1000";
 const result=await api(base+"/values/"+encodeURIComponent(range),token,{fetcher});
 const existing=result.values||[],index=new Map();
 existing.forEach((r,i)=>index.set(identity(r[5],r[6],r[7],r[1]),i+2));
 const updates=[],appends=[],seen=new Set();
 for(const c of validated){
  if(seen.has(c.id))continue;seen.add(c.id);
  if(index.has(c.id)){
   const row=index.get(c.id);
   // Preserve existing verified profile and outreach where a new response has no data.
   const prior=existing[row-2]||[];
   const final=c.cells.map((v,i)=>v||prior[i]||"");
   // Avoid duplicate writes when research returns identical contact details.
   const same=final.every((v,i)=>String(v)===String(prior[i]||""));
   if(!same)updates.push({range:quote(TAB)+"!A"+row+":L"+row,values:[final]});
  }else appends.push(c.cells);
 }
 if(updates.length)await api(base+"/values:batchUpdate",token,{method:"POST",fetcher,
  body:{valueInputOption:"RAW",data:updates}});
 if(appends.length)await api(base+"/values/"+encodeURIComponent(quote(TAB)+"!A:L")+":append"+
  "?valueInputOption=RAW&insertDataOption=INSERT_ROWS",token,{method:"POST",fetcher,
   body:{majorDimension:"ROWS",values:appends}});
 return {saved:appends.length,updated:updates.length,skipped:contacts.length-appends.length-updates.length,
  url:"https://docs.google.com/spreadsheets/d/"+encodeURIComponent(spreadsheetId)+"/edit#gid="+tab.sheetId};
}
module.exports={TAB,HEADER,identity,normalizeContact,read,save,ensureTab};
