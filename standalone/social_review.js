"use strict";
/**
 * Social screenshot extraction review queue.
 * Screenshots are uploaded in the existing Research inbox. AI may append
 * only Pending rows; no screenshot inference is treated as verified.
 * Users review corrections and drafts in Social UI before import to Swipe.
 * No Jobs/CV files or operations are touched.
 */
const crypto=require("node:crypto");
const TAB="SocialReviewQueue";
const HEAD=["Candidate","Review ID","Person Name","Company","Department","Designation","Location","LinkedIn Profile","Evidence / Source","Source File ID","Review Status","Networking Purposes","Primary Purpose","Invitation Introduction","Invitation Middle","Invitation Closing","Search URL","Connections Row","Updated UTC","Review Notes"];
const STATUSES=["Pending","Reviewed","Draft Ready","Imported","Rejected"];
const PURPOSES=["Just connect","Coffee chat","Senior leader — connect only","Inspired by profile","Looking for a mentor","Career or industry insights","Exploring opportunities","UCD / alumni connection"];
const owner=c=>c==="Abhishek"?"Abhishek Nair":c==="Pooja"?"Pooja Krishna Tirupati":"";
const fault=(message,httpCode=400)=>Object.assign(Error(message),{httpCode});
const range=(cols)=>encodeURIComponent("'"+TAB+"'!"+cols);
const sheet=id=>"https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(id);
async function api(url,token,{method="GET",body,fetcher=fetch}={}){
 const response=await fetcher(url,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw fault("Social review Sheet is unavailable (HTTP "+response.status+").",response.status===403?403:502);
 return result;
}
async function list({token,id,candidate,fetcher=fetch}){
 if(!owner(candidate))throw fault("Choose Abhishek or Pooja.");
 let got;
 try{got=await api(sheet(id)+"/values/"+range("A1:T"),token,{fetcher});}
 catch(e){if(e.httpCode===400)return {candidate,items:[],configured:false};throw e}
 const rows=got.values||[];
 if(!rows.length)return {candidate,items:[],configured:false};
 if(HEAD.some((h,i)=>String(rows[0][i]||"")!==h))throw fault("SocialReviewQueue A:T headers differ. Nothing changed.",409);
 const items=rows.slice(1).map((r,index)=>({
  row:index+2,candidate:r[0]||"",id:r[1]||"",name:r[2]||"",company:r[3]||"",
  department:r[4]||"",designation:r[5]||"",location:r[6]||"",
  profile:r[7]||"",evidence:r[8]||"",sourceFileId:r[9]||"",
  status:r[10]||"Pending",purposes:String(r[11]||"").split(" | ").filter(Boolean),
  primary:r[12]||"",intro:r[13]||"",middle:r[14]||"",closing:r[15]||"",
  searchUrl:r[16]||"",connectionsRow:r[17]||"",updated:r[18]||"",notes:r[19]||""
 })).filter(r=>r.candidate===owner(candidate)&&r.name&&r.id);
 return {candidate,items,configured:true};
}
function str(v,max=260){
 const s=String(v??"").trim().replace(/\r\n?/g,"\n");
 if(s.length>max||s.includes("\u0000"))throw fault("Text exceeds the maximum length ("+max+").");
 return s;
}
function cell(v,max=260){
 const s=str(v,max);
 if(/^[=+@]/.test(s))throw fault("Cells cannot begin with a spreadsheet formula.");
 return s;
}
function link(url){
 const x=str(url,360);
 if(!x)return "";
 let u;try{u=new URL(x)}catch{throw fault("Invalid LinkedIn profile URL.");}
 if(u.protocol!=="https:"||!/(^|\.)linkedin\.com$/i.test(u.hostname)||!/^\/in\/[^/]+\/?$/.test(u.pathname))
  throw fault("Use a verified HTTPS LinkedIn /in/ profile URL, or leave it blank.");
 return u.href;
}
function purposes(v,primary){
 const arr=Array.isArray(v)?v.map(x=>str(x,60)):[];
 const uniq=[...new Set(arr)];
 if(uniq.some(x=>!PURPOSES.includes(x)))throw fault("Unknown networking intention.");
 const first=cell(primary,60);
 if(first&&!uniq.includes(first))throw fault("Primary intention must be selected.");
 return {purposes:uniq,primary:first||uniq[0]||""};
}
function textRow(it){
 return [it.candidate,it.id,it.name,it.company,it.department,it.designation,it.location,it.profile,it.evidence,it.sourceFileId,it.status,it.purposes.join(" | "),it.primary,it.intro,it.middle,it.closing,it.searchUrl,it.connectionsRow,it.updated,it.notes];
}
function compose(i,m,c){return [i,m,c].map(x=>String(x||"").replace(/^\n+|\n+$/g,"")).filter(Boolean).join("\n\n");}
function existing(data,row,id){
 const x=data.items.find(item=>item.row===Number(row)&&item.id===id);
 if(!x)throw fault("Review row changed, is missing or belongs to another candidate. Refresh.",409);
 return x;
}
async function ensure({token,id,fetcher=fetch}){
 const data=await api(sheet(id)+"?fields=sheets(properties(title))",token,{fetcher});
 if(!(data.sheets||[]).some(x=>x.properties?.title===TAB))
  await api(sheet(id)+":batchUpdate",token,{method:"POST",body:{requests:[{addSheet:{properties:{title:TAB,gridProperties:{rowCount:500,columnCount:20}}}}]},fetcher});
 const rows=await api(sheet(id)+"/values/"+range("A1:T1"),token,{fetcher});
 const saved=rows.values?.[0]||[];
 if(saved.length&&HEAD.some((v,i)=>saved[i]!==v))throw fault("Review Sheet headers changed. No changes made.",409);
 if(!saved.length)await api(sheet(id)+"/values/"+range("A1:T1")+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[HEAD]},fetcher});
}
async function stage({token,id,candidate,record,confirm,fetcher=fetch}){
 if(confirm!==true)throw fault("Confirm adding an extracted person to the review queue.");
 if(!owner(candidate))throw fault("Select an authorized candidate.");
 const it={candidate:owner(candidate),id:"REV-"+crypto.randomUUID(),name:cell(record.name,120),
 company:cell(record.company,120),department:cell(record.department,120),designation:cell(record.designation,160),
 location:cell(record.location||"Dublin",100),profile:link(record.profile),evidence:cell(record.evidence,500),
 sourceFileId:cell(record.sourceFileId,150),status:"Pending",purposes:[],primary:"",
 intro:"",middle:"",closing:"",searchUrl:cell(record.searchUrl,450),connectionsRow:"",
 updated:new Date().toISOString(),notes:cell(record.notes,450)};
 if(!it.name||!it.company)throw fault("Person name and company are needed, even for review.");
 if(!it.sourceFileId&&!it.evidence&&!it.notes)throw fault("Include screenshot source, evidence or an extraction note.");
 await ensure({token,id,fetcher});
 const before=await list({token,id,candidate,fetcher});
 if(before.items.some(x=>x.name.toLowerCase()===it.name.toLowerCase()&&x.company.toLowerCase()===it.company.toLowerCase()&&x.status!=="Rejected"))
  throw fault("This candidate/company/person is already staged. Review their existing row.",409);
 await api(sheet(id)+"/values/"+range("A1:T")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",token,{method:"POST",body:{values:[textRow(it)]},fetcher});
 const after=await list({token,id,candidate,fetcher});
 if(!after.items.some(x=>x.id===it.id))throw fault("The staged contact could not be confirmed. Refresh.",409);
 return {saved:true,id:it.id};
}
async function update({token,id,candidate,row,reviewId,expectedUpdated,record,status,confirm,fetcher=fetch}){
 if(confirm!==true)throw fault("Confirm the reviewed changes.");
 if(!owner(candidate))throw fault("Candidate required.");
 const before=await list({token,id,candidate,fetcher});
 if(!before.configured)throw fault("Review queue is not initialized.",409);
 const old=existing(before,row,reviewId);
 if(old.updated!==expectedUpdated)throw fault("This review row changed since you opened it. Refresh.",409);
 if(!STATUSES.includes(status)||status==="Imported")throw fault("Invalid manual review status.");
 if(old.status==="Imported")throw fault("Imported contacts cannot be modified in the review queue.",409);
 if(status==="Draft Ready"&&old.status!=="Reviewed"&&old.status!=="Draft Ready")throw fault("Review the person's details before preparing the message.",409);
 if(status==="Reviewed"&&old.status==="Pending"&&!record.evidence&&!old.evidence&&!old.sourceFileId)
  throw fault("Retain the screenshot source or verification evidence first.");
 const intentions=purposes(record.purposes,record.primary);
 const next={...old,name:cell(record.name,120),company:cell(record.company,120),
  department:cell(record.department,120),designation:cell(record.designation,160),
  location:cell(record.location,100),profile:link(record.profile),
  evidence:cell(record.evidence,500),notes:cell(record.notes,450),
  purposes:intentions.purposes,primary:intentions.primary,status,
  updated:new Date().toISOString()};
 if(!next.name||!next.company||!next.department||!next.designation)
  throw fault("Review name, company, department and designation before saving.");
 if(status==="Draft Ready"){
  if(!next.primary)throw fault("Select at least one networking intention.");
  next.intro=cell(record.intro,260);next.middle=cell(record.middle,260);
  next.closing=cell(record.closing,260);
  if(!next.intro||!next.closing)throw fault("Invitation introduction and closing are required.");
  if(compose(next.intro,next.middle,next.closing).length>300)
   throw fault("The entire invitation is over LinkedIn's 300-character limit.");
 }else if(old.status==="Draft Ready"&&status==="Reviewed"){
  next.intro="";next.middle="";next.closing="";
 }
 await api(sheet(id)+"/values/"+range("A"+old.row+":T"+old.row)+"?valueInputOption=RAW",token,
  {method:"PUT",body:{values:[textRow(next)]},fetcher});
 const after=await list({token,id,candidate,fetcher});
 const actual=existing(after,old.row,reviewId);
 if(actual.updated!==next.updated||actual.company!==next.company||actual.status!==next.status||
    actual.department!==next.department||actual.designation!==next.designation||actual.primary!==next.primary)
  throw fault("Review save verification failed. Refresh.",409);
 return {saved:true,item:actual};
}
async function promote({token,id,candidate,row,reviewId,expectedUpdated,confirm,importContact,fetcher=fetch}){
 if(confirm!==true)throw fault("Approve the exact invitation and move this verified contact into Swipe.");
 if(typeof importContact!=="function")throw fault("Import is not configured.",503);
 const before=await list({token,id,candidate,fetcher});
 const item=existing(before,row,reviewId);
 if(item.updated!==expectedUpdated)throw fault("Review details changed. Refresh.",409);
 if(item.status!=="Draft Ready")throw fault("A reviewed and approved 300-character message is required.",409);
 if(compose(item.intro,item.middle,item.closing).length>300)throw fault("Message exceeds 300 characters.");
 // Existing importer de-duplicates against Connections, respects candidate
 // identity and writes structured M:N:O plus composed legacy K.
 await importContact({token,id,candidate,items:[{
  name:item.name,company:item.company,title:item.designation,
  department:item.department,profile:item.profile,profileVerified:false,
  evidence:item.evidence||"Owner-reviewed screenshot extract; see SocialReviewQueue "+item.id,
  introduction:item.intro,personalisedMiddle:item.middle,closing:item.closing
 }],confirm:true});
 // The importer may skip a duplicate, but an exact candidate/person/company
 // existence check must precede marking this row Imported.
 const checker=require("./social_store");
 const actual=await checker.list({token,id,candidate});
 const found=actual.items.find(c=>c.name.toLowerCase()===item.name.toLowerCase()&&c.company.toLowerCase()===item.company.toLowerCase());
 if(!found)throw fault("Connections import not confirmed; queue left Draft Ready.",409);
 const rowNumber=found.sheetRow;
 const updated={...item,status:"Imported",connectionsRow:String(rowNumber),updated:new Date().toISOString()};
 await api(sheet(id)+"/values/"+range("A"+row+":T"+row)+"?valueInputOption=RAW",token,
  {method:"PUT",body:{values:[textRow(updated)]},fetcher});
 const after=await list({token,id,candidate,fetcher});
 if(existing(after,row,reviewId).status!=="Imported")throw fault("Review queue import marker not verified; check Connections.",409);
 return {imported:true,connectionsRow:rowNumber};
}
module.exports={TAB,HEAD,STATUSES,PURPOSES,compose,list,ensure,stage,update,promote};
