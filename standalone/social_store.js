"use strict";
const {safeDriveReason}=require("./social_research");
/* Social backend: Freshmaal Contacts A:L + separate SocialTracking rows + opt-in Drive Research Inbox.
 * All writes require Firebase-authenticated, candidate-mapped callers and production write gate.
 * The service deliberately does NOT scrape or log in to LinkedIn.
 */
const crypto=require("node:crypto");
const CONTACT_HEADERS=["Company","Contact Name","Direct LinkedIn Profile","LinkedIn Search","Applied-for Role","Candidate","Freshmaal Row","Vacancy Link","Person's Position","Verification / Evidence","Outreach Message","Research Date (UTC)"];
const TRACK_HEADERS=["Candidate","Contact Key","Status","Request Sent UTC","Accepted UTC","Follow-up Sent UTC","Next Follow-up","Department","City","Contact Type","Updated UTC"];
const MAX_BATCH=50;
function bad(message,status=400){return Object.assign(new Error(message),{httpCode:status})}
function norm(v){return String(v||"").trim().replace(/\s+/g," ").toLowerCase()}
// Both authorised Garamaal accounts can switch workspaces. Candidate is validated on every RPC.
function canonicalCandidate(text){const x=norm(text);return x==="abhishek"||x==="abhishek nair"?"Abhishek":x==="pooja"||x==="pooja tirupati"||x==="pooja krishna tirupati"?"Pooja":""}
function selectedCandidate(value){
 const candidate=canonicalCandidate(value);
 if(!candidate)throw bad("Select Abhishek or Pooja.",400);
 return candidate;
}
function fullName(candidate){return candidate==="Abhishek"?"Abhishek Nair":"Pooja Krishna Tirupati"}
function contactKey(c){
 const profile=validProfile(c.profile)||"";
 return crypto.createHash("sha256").update([norm(c.company),norm(c.name),profile].join("|")).digest("hex").slice(0,24);
}
function validProfile(text){
 try{const url=new URL(String(text||""));if(url.protocol!=="https:"||!/(^|\.)linkedin\.com$/i.test(url.hostname)||!/^\/in\/[A-Za-z0-9%_-]+\/?$/.test(url.pathname))return "";
 return "https://www.linkedin.com"+url.pathname.replace(/\/$/,"")}catch{return ""}
}
function searchLink(contact){return "https://www.linkedin.com/search/results/people/?keywords="+encodeURIComponent([contact.name,contact.company,contact.title].filter(Boolean).join(" "))}
function sheetUrl(id){return "https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(id)}
async function api(url,token,options={}){
 const r=await (options.fetcher||fetch)(url,{method:options.method||"GET",headers:{Authorization:"Bearer "+token,...(options.body?{"Content-Type":"application/json"}:{})},...(options.body?{body:JSON.stringify(options.body)}:{})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw bad("Google storage request failed (HTTP "+r.status+").",r.status===400?400:r.status===403?403:r.status===429?429:502);
 return data;
}
function range(tab,r){return encodeURIComponent("'"+tab.replace(/'/g,"''")+"'!"+r)}
async function values(token,id,tab,r){
 try{return (await api(sheetUrl(id)+"/values/"+range(tab,r),token)).values||[]}
 catch(e){if(["SocialTracking","SocialTemplates"].includes(tab)&&e.httpCode===400)return [];throw e}
}
async function ensureTracking(token,id){
 const info=await api(sheetUrl(id)+"?fields=sheets(properties(title))",token);
 if((info.sheets||[]).some(s=>s.properties?.title==="SocialTracking")){
  const first=await values(token,id,"SocialTracking","A1:K1");
  if(first.length&&TRACK_HEADERS.some((h,i)=>String(first[0][i]||"")!==h))throw bad("SocialTracking A:K headers changed.",409);
  if(!first.length)await api(sheetUrl(id)+"/values/"+range("SocialTracking","A1:K1")+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[TRACK_HEADERS]}});
  return;
 }
 await api(sheetUrl(id)+":batchUpdate",token,{method:"POST",body:{requests:[{addSheet:{properties:{title:"SocialTracking"}}}]}});
 await api(sheetUrl(id)+"/values/"+range("SocialTracking","A1:K1")+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[TRACK_HEADERS]}});
}
function parseContact(row,index){
 return {sheetRow:index+1,company:String(row[0]||"").trim(),name:String(row[1]||"").trim(),
 profile:validProfile(row[2]),search:String(row[3]||"").trim(),job:String(row[4]||""),
 candidate:canonicalCandidate(row[5]),freshRow:String(row[6]||""),vacancy:String(row[7]||""),
 title:String(row[8]||"").trim(),evidence:String(row[9]||""),message:String(row[10]||""),
 date:String(row[11]||"")};
}
async function allContacts(token,id){
 const rows=await values(token,id,"Connections","A1:L");
 if(rows.length&&CONTACT_HEADERS.some((h,i)=>String(rows[0][i]||"")!==h))throw bad("Freshmaal Connections A:L headers changed. No data was modified.",409);
 return rows.slice(1).map((r,i)=>parseContact(r,i+1)).filter(c=>c.name&&c.company&&c.candidate);
}
function trackingRow(r,candidate){return {row:r.row||0,candidate,key:String(r.cells?.[1]||""),status:String(r.cells?.[2]||"identified"),
 sent:String(r.cells?.[3]||""),accepted:String(r.cells?.[4]||""),followupSent:String(r.cells?.[5]||""),
 next:String(r.cells?.[6]||""),department:String(r.cells?.[7]||""),city:String(r.cells?.[8]||"Dublin"),
 type:String(r.cells?.[9]||"Employee"),updated:String(r.cells?.[10]||"")}}
async function allTracking(token,id,candidate){
 const rows=await values(token,id,"SocialTracking","A1:K");
 if(rows.length&&TRACK_HEADERS.some((h,i)=>String(rows[0][i]||"")!==h))throw bad("SocialTracking headers changed.",409);
 return rows.slice(1).map((cells,i)=>trackingRow({cells,row:i+2},candidate))
 .filter(x=>canonicalCandidate(rows[x.row-1][0])===candidate);
}
function uniqueContacts(list,candidate){
 const seen=new Map();
 for(const c of list){if(c.candidate!==candidate)continue;const k=contactKey(c);const old=seen.get(k);
 if(!old||(!old.profile&&c.profile)||(!old.message&&c.message))seen.set(k,c)}
 return [...seen.values()].map(c=>({...c,key:contactKey(c),search:c.search||searchLink(c)}));
}
async function list({token,id,candidate}){
 const [raw,tracking]=await Promise.all([allContacts(token,id),allTracking(token,id,candidate)]);
 const track=new Map(tracking.map(x=>[x.key,x]));
 return {items:uniqueContacts(raw,candidate).map(c=>({...c,relation:track.get(c.key)||{
 status:"identified",sent:"",accepted:"",followupSent:"",next:"",department:"",city:"Dublin",type:"Employee"
 }})),trackingCount:tracking.length,sheetUrl:"https://docs.google.com/spreadsheets/d/"+id+"/edit#gid=0"};
}
function clean(value,n=120){const s=String(value||"").trim().replace(/\u0000/g,"");if(s.length>n)throw bad("Input too long");return /^[=+@-]/.test(s)?"'"+s:s}
async function writeStatus({token,id,candidate,key,status,next,department,city,type,confirm}){
 if(confirm!==true)throw bad("Confirm the manual status update.");
 const acceptable=["identified","sent","accepted","replied","later"];
 if(!acceptable.includes(status))throw bad("Invalid networking status");
 if(!/^[0-9a-f]{24}$/.test(String(key)))throw bad("Invalid contact key");
 if(next&&!/^\d{4}-\d{2}-\d{2}$/.test(next))throw bad("Invalid follow-up date");
 const exists=uniqueContacts(await allContacts(token,id),candidate).find(c=>contactKey(c)===key);
 if(!exists)throw bad("Contact no longer exists in this candidate's Freshmaal records",409);
 await ensureTracking(token,id);
 const old=(await allTracking(token,id,candidate)).find(r=>r.key===key);
 const now=new Date().toISOString();
 const sent=["sent","accepted","replied"].includes(status)?old?.sent||now:status==="identified"?"":old?.sent||"";
 const accepted=["accepted","replied"].includes(status)?old?.accepted||now:status==="identified"?"":old?.accepted||"";
 const followupSent=old?.followupSent||"";
 const row=[fullName(candidate),key,status,sent,accepted,followupSent,next||old?.next||"",clean(department||old?.department||"",100),clean(city||old?.city||"Dublin",80),clean(type||old?.type||"Employee",45),now];
 const target=old?"A"+old.row+":K"+old.row:"A1:K";
 await api(sheetUrl(id)+"/values/"+range("SocialTracking",target)+(old?"?valueInputOption=RAW":"\\:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS").replace("\\:append",":append"),token,{method:old?"PUT":"POST",body:{values:[row]}});
 return {saved:true,status,updated:now};
}
async function setFollowup({token,id,candidate,key,confirm}){
 if(confirm!==true)throw bad("Confirm that you manually sent the LinkedIn follow-up.");
 const track=(await allTracking(token,id,candidate)).find(x=>x.key===key);
 if(!track||!["accepted","replied"].includes(track.status))throw bad("Mark the connection accepted before recording a follow-up.");
 if(!uniqueContacts(await allContacts(token,id),candidate).some(c=>contactKey(c)===key))throw bad("Contact not found",404);
 const now=new Date().toISOString();
 await api(sheetUrl(id)+"/values/"+range("SocialTracking","F"+track.row+":G"+track.row)+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[[now,""]]}});
 return {saved:true,followupSent:now};
}
async function importContacts({token,driveAccess,id,candidate,items,confirm,sourceFileId}){
 if(confirm!==true)throw bad("Approve the contact import first.");
 if(!Array.isArray(items)||items.length<1||items.length>MAX_BATCH)throw bad("Import between 1 and "+MAX_BATCH+" contacts.");
 const existing=await allContacts(token,id),keys=new Set(uniqueContacts(existing,candidate).map(c=>contactKey(c)));
 const names=new Set(existing.filter(c=>c.candidate===candidate).map(c=>norm(c.company)+"|"+norm(c.name)));
 const now=new Date().toISOString(),rows=[],added=[],tracked=[];
 for(const p of items){
  const name=clean(p.name,100),company=clean(p.company,120),title=clean(p.title,140);
  if(!name||!company)throw bad("Name and company are required for every contact.");
  const profile=p.profile?validProfile(p.profile):"";
  if(p.profile&&!profile)throw bad("A supplied LinkedIn profile is invalid");
  const c={company,name,title,profile};const key=contactKey({...c,profile:p.profileVerified===true?profile:""});
  const nk=norm(company)+"|"+norm(name);if(keys.has(key)||names.has(nk))continue;keys.add(key);names.add(nk);
  const evidence=clean(p.evidence||"User-submitted contact; role and LinkedIn identity not independently verified",400);
  const direct=profile&&p.profileVerified===true?profile:"";
  const message=clean(p.message||"",300);
  rows.push([company,name,direct,searchLink(c),"Networking",fullName(candidate),"","",title,evidence,message,now]);
  added.push({name,company,key});
  tracked.push([fullName(candidate),key,"identified","","","","",clean(p.department||"",100),clean(p.city||"Dublin",80),clean(p.contactType||"Employee",45),now]);
 }
 if(!rows.length)return {saved:0,skipped:items.length,verified:true,sourceMarkedUsed:false};
 await api(sheetUrl(id)+"/values/"+range("Connections","A1:L")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",token,{method:"POST",body:{values:rows}});
 const after=uniqueContacts(await allContacts(token,id),candidate);
 const allSaved=added.every(x=>after.some(c=>contactKey(c)===x.key));
 if(!allSaved)throw bad("Contacts may have been written but verification failed. Do not mark the research file used.",409);
 await ensureTracking(token,id);
 const prior=await allTracking(token,id,candidate),priorKeys=new Set(prior.map(x=>x.key));
 const newTracking=tracked.filter(x=>!priorKeys.has(x[1]));
 if(newTracking.length)await api(sheetUrl(id)+"/values/"+range("SocialTracking","A1:K")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",token,{method:"POST",body:{values:newTracking}});
 let sourceMarkedUsed=false,renameWarning="";
 if(sourceFileId){try{await markUsed({token:driveAccess,candidate,fileId:sourceFileId,verifiedCount:rows.length,confirm:true});sourceMarkedUsed=true}catch(e){renameWarning=String(e.message||e).slice(0,200)}}
 return {saved:rows.length,skipped:items.length-rows.length,verified:true,sourceMarkedUsed,renameWarning};
}
// Per-candidate department template library. Intro/closing are user-owned.
// Research-only personalisation is never generated by this service.
const TEMPLATE_TAB="SocialTemplates";
const TEMPLATE_HEADERS=["Candidate","Department","Introduction","Closing","Updated UTC"];
const DEPARTMENTS=["General","Deals","Corporate Finance","Valuations","Transaction Services","Financial Due Diligence","Transfer Pricing","Tax Technology","Wealth Management","Financial Planning","Investment Specialist","Investment Advisor","Paraplanner","Recruiter"];
function templateDepartment(value) {
 const s=String(value||"").trim();
 if(s.length>100||!s)throw bad("Choose a valid department.");
 return s;
}
function defaultTemplate(candidate,dept){
 selectedCandidate(candidate);
 const d=templateDepartment(dept);
 const base=candidate==="Abhishek"
  ?"I'm an ACCA member with an MSc in Finance from UCD"
  :"I have a UCD master's background, CSP and QFA";
 const focus=/deals|transaction|due diligence|corporate finance|valuation/i.test(d)
   ?" and I'm exploring opportunities in "+d
   :/wealth|investment|paraplann|financial planning/i.test(d)
     ?" and I'm interested in "+d
     :d==="General"?" and I'm exploring finance and advisory": " and I'm interested in "+d;
 return {department:d,introduction:"Hi {{first_name}}, "+base+focus+".",
  closing:"I'd appreciate connecting. Thank you.",custom:false};
}
async function ensureTemplates(token,id){
 const info=await api(sheetUrl(id)+"?fields=sheets(properties(title))",token);
 const found=(info.sheets||[]).some(s=>s.properties?.title===TEMPLATE_TAB);
 if(!found){
  await api(sheetUrl(id)+":batchUpdate",token,{method:"POST",body:{requests:[{addSheet:{properties:{title:TEMPLATE_TAB}}}]}});
 }
 const rows=await values(token,id,TEMPLATE_TAB,"A1:E1");
 if(rows.length&&TEMPLATE_HEADERS.some((x,i)=>String(rows[0][i]||"")!==x))
  throw bad("SocialTemplates headers changed. No templates overwritten.",409);
 if(!rows.length){
  await api(sheetUrl(id)+"/values/"+range(TEMPLATE_TAB,"A1:E1")+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[TEMPLATE_HEADERS]}});
 }
}
async function templateRows(token,id){
 // Do not create tabs during reads. Initial installations use built-in defaults.
 const rows=await values(token,id,TEMPLATE_TAB,"A1:E");
 if(rows.length&&TEMPLATE_HEADERS.some((x,i)=>String(rows[0][i]||"")!==x))
  throw bad("SocialTemplates A:E headers changed.",409);
 return rows.slice(1).map((v,i)=>({row:i+2,candidate:canonicalCandidate(v[0]),department:String(v[1]||"").trim(),
  introduction:String(v[2]||""),closing:String(v[3]||"")}))
  .filter(r=>r.candidate&&r.department);
}
async function getTemplates({token,id,candidate}){
 candidate=selectedCandidate(candidate);
 const rows=(await templateRows(token,id)).filter(x=>x.candidate===candidate);
 const byName=new Map(rows.map(x=>[norm(x.department),x]));
 const deptNames=[...new Set([...DEPARTMENTS,...rows.map(x=>x.department)])];
 const templates=deptNames.map(dept=>{
  const o=byName.get(norm(dept));
  return o?{department:dept,introduction:o.introduction,closing:o.closing,custom:true}:
  defaultTemplate(candidate,dept);
 });
 return {candidate,templates};
}
function checkTemplateText(text){
 const s=String(text||"").trim();
 if(!s||s.length>260)throw bad("Template lines must be between 1 and 260 characters.");
 if(/\{\{(?!first_name|department|company)[^}]+\}\}/.test(s))
  throw bad("Only {{first_name}}, {{company}} and {{department}} placeholders are supported.");
 if(/^\s*[=+@]/.test(s))throw bad("Templates cannot begin with a spreadsheet formula.");
 return s;
}
async function saveTemplate({token,id,candidate,department,introduction,closing,confirm}){
 candidate=selectedCandidate(candidate);
 if(confirm!==true)throw bad("Confirm saving the department template.");
 department=templateDepartment(department);
 introduction=checkTemplateText(introduction);closing=checkTemplateText(closing);
 await ensureTemplates(token,id);
 const rows=await templateRows(token,id);
 const match=rows.find(x=>x.candidate===candidate&&norm(x.department)===norm(department));
 const vals=[fullName(candidate),department,introduction,closing,new Date().toISOString()];
 const dest=match?"A"+match.row+":E"+match.row:"A1:E";
 const path=range(TEMPLATE_TAB,dest)+(match?"?valueInputOption=RAW":":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS");
 await api(sheetUrl(id)+"/values/"+path,token,{method:match?"PUT":"POST",body:{values:[vals]}});
 const verified=(await templateRows(token,id)).find(x=>x.candidate===candidate&&norm(x.department)===norm(department));
 if(!verified||verified.introduction!==introduction||verified.closing!==closing)
  throw bad("Template save verification failed; please refresh.",409);
 return {saved:true,department,introduction,closing,candidate};
}
function driveFolder(candidate,env=process.env){const val=env[candidate==="Abhishek"?"SOCIAL_INBOX_ABHISHEK_FOLDER_ID":"SOCIAL_INBOX_POOJA_FOLDER_ID"];if(!val||!/^[A-Za-z0-9_-]{20,}$/.test(val))throw bad("Research Inbox Drive folder is not configured for this candidate.",503);return val}
function driveToken(token){return {Authorization:"Bearer "+token}}
async function driveRequest(url,token,opts={}){
 const r=await (opts.fetcher||fetch)(url,{...opts,headers:{...driveToken(token),...(opts.headers||{})}});
 const v=await r.json().catch(()=>({}));
 if(!r.ok)throw bad("Google Drive request failed ("+r.status+").",r.status===403?403:502);
 return v;
}
function safeSlug(v){return String(v||"company").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,44)||"research"}
async function submitResearch({token,candidate,company,department,pageUrl,pastedText}){
 const folder=driveFolder(candidate);
 company=clean(company,120);department=clean(department,120);
 if(!company)throw bad("Company is required.");
 if(!pastedText&&!pageUrl)throw bad("Paste a LinkedIn page URL or copied page content.");
 if(pageUrl){
  let u;try{u=new URL(pageUrl)}catch{throw bad("Enter a valid page URL")}
  if(u.protocol!=="https:"||!/(^|\.)linkedin\.com$/i.test(u.hostname))throw bad("Use a LinkedIn HTTPS URL.");
 }
 if(String(pastedText||"").length>25000)throw bad("Copied page text exceeds 25,000 characters.");
 const fileName="NEW_"+(candidate==="Abhishek"?"a":"p")+"_"+new Date().toISOString().replace(/[:.]/g,"-")+"_"+safeSlug(company)+"_"+crypto.randomBytes(3).toString("hex")+".txt";
 const body=["GARAMAAL RESEARCH INPUT","Candidate: "+fullName(candidate),"Company: "+company,
 "Department: "+department,"LinkedIn page: "+String(pageUrl||""),"Submitted: "+new Date().toISOString(),
 "","COPIED CONTENT (user supplied, unverified):",String(pastedText||"")].join("\n");
 const boundary="garamaal_"+crypto.randomBytes(6).toString("hex");
 const metadata=JSON.stringify({name:fileName,mimeType:"text/plain",parents:[folder]});
 const payload="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n"+
 "--"+boundary+"\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"+body+"\r\n--"+boundary+"--";
 const r=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",{
 method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"multipart/related; boundary="+boundary},body:payload});
 const data=await r.json().catch(()=>({}));
  if(!r.ok){
   const reason=safeDriveReason(data);
   throw bad("Could not save TXT to candidate Drive folder (HTTP "+r.status+(reason?"; "+reason:"")+").",r.status===403?403:502);
  }
  if(!data.id)throw bad("Drive did not confirm saving the TXT file.",502);
 return {id:data.id,name:data.name,url:data.webViewLink||"https://drive.google.com/file/d/"+data.id+"/view"};
}
async function listResearch({token,candidate}){
 const folder=driveFolder(candidate),prefix=candidate==="Abhishek"?"_a_":"_p_";
 const q="'"+folder.replace(/'/g,"\\'")+"' in parents and trashed = false";
 const u="https://www.googleapis.com/drive/v3/files?q="+encodeURIComponent(q)+"&fields=nextPageToken,files(id,name,mimeType,webViewLink,createdTime)&pageSize=100&orderBy=createdTime%20desc";
 const info=await driveRequest(u,token);
 return {files:(info.files||[]).filter(f=>/^(NEW|USED)_/.test(f.name||"")&&String(f.name).includes(prefix)&&["text/plain","image/png","image/jpeg","image/webp"].includes(f.mimeType||"text/plain"))
 .map(f=>({id:f.id,name:f.name,mimeType:f.mimeType||"text/plain",url:f.webViewLink||"https://drive.google.com/file/d/"+f.id+"/view",status:f.name.startsWith("USED_")?"used":"new"}))};
}
async function markUsed({token,candidate,fileId,verifiedCount,confirm}){
 if(confirm!==true||!Number.isInteger(verifiedCount)||verifiedCount<1)throw bad("Only mark USED after verified contacts have been imported.");
 const files=(await listResearch({token,candidate})).files;
 const file=files.find(f=>f.id===fileId&&f.status==="new");
 if(!file)throw bad("New research file not found in your candidate's Drive folder.",404);
 const name="USED_"+file.name.slice(4);
 const data=await driveRequest("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+"?fields=id,name",token,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
 return {saved:true,file:data.name||name};
}
module.exports={selectedCandidate,canonicalCandidate,contactKey,validProfile,uniqueContacts,searchLink,fullName,list,writeStatus,setFollowup,importContacts,submitResearch,listResearch,markUsed,TRACK_HEADERS,CONTACT_HEADERS,DEPARTMENTS,TEMPLATE_HEADERS,defaultTemplate,checkTemplateText,getTemplates,saveTemplate};
