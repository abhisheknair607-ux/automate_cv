"use strict";
/** Additive user-owned Social Research: target organisation search presets,
 * screenshot/chat source and follow-up draft record. No LinkedIn scraping.
 * Sheet writes affect only SocialTargets / SocialFollowups, never Jobs/Sheet1.
 */
const crypto=require("node:crypto");
const TARGET_TAB="SocialTargets",CONVO_TAB="SocialFollowups";
const TARGET_HEAD=["Candidate","Company","Department","City","LinkedIn Search URL","Updated UTC"];
const CONVO_HEAD=["Candidate","ID","Contact Name","Company","Source Type","Drive File ID","Drive URL","Draft Reply","Status","Next Follow-up","Updated UTC"];
function err(s,httpCode=400){return Object.assign(Error(s),{httpCode})}
function value(v,max=160){const s=String(v||"").trim().replace(/\u0000/g,"");if(s.length>max)throw err("Text is too long (max "+max+").");return s}
const candidateName=c=>c==="Pooja"?"Pooja Krishna Tirupati":c==="Abhishek"?"Abhishek Nair":"";
function candidateCheck(c){if(!candidateName(c))throw err("Choose Abhishek or Pooja.");return c}
function safeLink(link,kind="people"){
 if(!link)return "";
 let u;try{u=new URL(link)}catch{throw err("Enter a valid LinkedIn URL.")}
 if(u.protocol!=="https:"||!/(^|\.)linkedin\.com$/i.test(u.hostname))throw err("Only HTTPS LinkedIn links are supported.");
 if(kind==="people"&&!/^\/search\/results\/people\/?$/i.test(u.pathname))
   throw err("Saved filters must be from LinkedIn People search results.");
 if(kind==="source"&&!(/^\/company\/[^/]+\/?$/i.test(u.pathname)||/^\/search\/results\/(companies|people)\/?$/i.test(u.pathname)))
   throw err("Enter a LinkedIn company or People search page.");
 return u.href;
}
function researchUrl({company,department,city}){
 const words=[company,department,city].map(x=>value(x,120)).filter(Boolean).join(" ");
 if(!words)throw err("Select a company, department or city.");
 return "https://www.linkedin.com/search/results/people/?keywords="+encodeURIComponent(words);
}
function range(tab,cols){return encodeURIComponent("'"+tab+"'!"+cols)}
function sheet(id){return "https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(id)}
async function api(url,token,{method="GET",body,fetcher=fetch}={}){
 const response=await fetcher(url,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw err("Google storage unavailable ("+response.status+").",response.status===400?400:response.status===403?403:502);
 return result;
}
async function read({token,id,tab,cols,fetcher}){
 try{return (await api(sheet(id)+"/values/"+range(tab,cols),token,{fetcher})).values||[]}
 catch(e){if(e.httpCode===400)return [];throw e}
}
async function ensure({token,id,tab,head,fetcher}){
 const x=await api(sheet(id)+"?fields=sheets(properties(title))",token,{fetcher});
 const found=(x.sheets||[]).some(r=>r.properties?.title===tab);
 if(!found)await api(sheet(id)+":batchUpdate",token,{method:"POST",body:{requests:[{addSheet:{properties:{title:tab}}}]},fetcher});
 const current=await read({token,id,tab,cols:"A1:"+String.fromCharCode(64+head.length)+"1",fetcher});
 if(current.length&&head.some((k,i)=>current[0][i]!==k))throw err("Saved "+tab+" columns are incompatible. Nothing overwritten.",409);
 if(!current.length)await api(sheet(id)+"/values/"+range(tab,"A1:"+String.fromCharCode(64+head.length)+"1")+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[head]},fetcher});
}
async function listTargets({token,id,candidate,fetcher}){
 candidateCheck(candidate);
 const rows=await read({token,id,tab:TARGET_TAB,cols:"A1:F",fetcher});
 if(rows.length&&TARGET_HEAD.some((k,i)=>rows[0][i]!==k))throw err("SocialTargets columns changed.",409);
 return {targets:rows.slice(1).map((r,i)=>({row:i+2,candidate:r[0],company:r[1],department:r[2],city:r[3],searchUrl:r[4]||"",updated:r[5]}))
   .filter(x=>x.candidate===candidateName(candidate))};
}
async function saveTarget({token,id,candidate,company,department,city,confirm,fetcher}){
 candidateCheck(candidate);
 if(confirm!==true)throw err("Confirm saving the target.");
 company=value(company,120);department=value(department,120);city=value(city||"Dublin",100);
 if(!company||!department)throw err("Company and department are required.");
 const search=researchUrl({company,department,city});
 await ensure({token,id,tab:TARGET_TAB,head:TARGET_HEAD,fetcher});
 const entries=(await listTargets({token,id,candidate,fetcher})).targets;
 const prior=entries.find(t=>t.company.toLowerCase()===company.toLowerCase()&&t.department.toLowerCase()===department.toLowerCase()&&t.city.toLowerCase()===city.toLowerCase());
 const vals=[candidateName(candidate),company,department,city,search,new Date().toISOString()];
 await api(sheet(id)+"/values/"+range(TARGET_TAB,prior?"A"+prior.row+":F"+prior.row:"A1:F")+
  (prior?"?valueInputOption=RAW":":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"),token,
  {method:prior?"PUT":"POST",body:{values:[vals]},fetcher});
 const verified=(await listTargets({token,id,candidate,fetcher})).targets.some(t=>t.company===company&&t.department===department&&t.city===city&&t.searchUrl===search);
 if(!verified)throw err("Saved search could not be verified. Refresh.",409);
 return {saved:true,company,department,city,searchUrl:search,updated:!!prior};
}
function driveFolder(candidate,env=process.env){
 candidateCheck(candidate);
 const folder=env[candidate==="Abhishek"?"SOCIAL_INBOX_ABHISHEK_FOLDER_ID":"SOCIAL_INBOX_POOJA_FOLDER_ID"];
 if(!folder||!/^[A-Za-z0-9_-]{20,}$/.test(folder))throw err("Research Inbox Drive folder missing for "+candidate+".",503);
 return folder;
}
async function uploadDrive({token,candidate,filename,content,mimeType,fetcher=fetch}){
 const folder=driveFolder(candidate);
 const boundary="grm_"+crypto.randomBytes(10).toString("hex");
 const metadata=JSON.stringify({name:filename,mimeType,parents:[folder]});
 // Multipart supports both UTF-8 text and binary image bytes with one Cloud Run credential.
 const contentBytes=Buffer.isBuffer(content)?content:Buffer.from(content,"utf8");
 const payload=Buffer.concat([
 Buffer.from("--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n","utf8"),
 Buffer.from("--"+boundary+"\r\nContent-Type: "+mimeType+"\r\n\r\n","utf8"),
 contentBytes,Buffer.from("\r\n--"+boundary+"--","utf8")
 ]);
 const response=await fetcher("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",{
  method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"multipart/related; boundary="+boundary},body:payload
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.id)throw err("Could not securely upload conversation to Drive.",response.status===403?403:502);
 return {id:data.id,name:data.name||filename,url:data.webViewLink||"https://drive.google.com/file/d/"+data.id+"/view"};
}
function safeImage({imageData,mimeType}){
 if(!["image/jpeg","image/png","image/webp"].includes(mimeType))throw err("Only JPEG, PNG and WebP screenshots are accepted.");
 if(typeof imageData!=="string"||imageData.length>4200000||!/^[A-Za-z0-9+/]+={0,2}$/.test(imageData))throw err("Screenshot must be under 1 MB.");
 const buffer=Buffer.from(imageData,"base64");
 if(buffer.length<100||buffer.length>3*1024*1024)throw err("Screenshot must be between 100 bytes and 1 MB.");
 const png=buffer.length>8&&buffer.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"));
 const jpg=buffer.length>3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
 const webp=buffer.length>12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP";
 if(!(mimeType==="image/png"&&png||mimeType==="image/jpeg"&&jpg||mimeType==="image/webp"&&webp))throw err("Screenshot bytes do not match the selected image type.");
 return buffer;
}
/**
 * Initial LinkedIn research screenshot: preserve the screenshot as an unverified
 * Drive lead, not a contact row. GPT / a reviewer must verify names, roles and
 * sources before using the separate Connections import.
 */
async function saveLeadScreenshot({token,candidate,company,department,city,imageData,mimeType,confirm,fetcher}){
 candidateCheck(candidate);
 if(confirm!==true)throw err("Confirm saving this screenshot to the private candidate Research Inbox.");
 company=value(company,120);department=value(department||"General",120);city=value(city||"Dublin",90);
 if(!company)throw err("Enter the company before saving initial research.");
 const image=safeImage({imageData,mimeType});
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 const prefix=candidate==="Abhishek"?"a":"p";
 const extension={"image/png":".png","image/jpeg":".jpg","image/webp":".webp"}[mimeType];
 const filename="NEW_"+prefix+"_"+stamp+"_"+safeStem(company)+"_"+safeStem(department)+"_"+safeStem(city)+"_"+crypto.randomBytes(4).toString("hex")+extension;
 const file=await uploadDrive({token,candidate,filename,content:image,mimeType,fetcher});
 return {saved:true,file,pendingVerification:true,importedContacts:0};
}
function safeStem(s){return value(s||"contact",90).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"contact"}
async function listConversations({token,id,candidate,fetcher}){
 candidateCheck(candidate);
 const rows=await read({token,id,tab:CONVO_TAB,cols:"A1:K",fetcher});
 if(rows.length&&CONVO_HEAD.some((k,i)=>rows[0][i]!==k))throw err("SocialFollowups columns changed.",409);
 return {items:rows.slice(1).map((r,i)=>({row:i+2,candidate:r[0],id:r[1],contact:r[2],company:r[3],sourceType:r[4],fileId:r[5],driveUrl:r[6],draft:r[7]||"",status:r[8]||"new",next:r[9]||"",updated:r[10]||""}))
  .filter(x=>x.candidate===candidateName(candidate))};
}
async function saveConversation({token,driveToken,id,candidate,contact,company,chatText,imageData,mimeType,confirm,fetcher}){
 candidateCheck(candidate);if(confirm!==true)throw err("Confirm saving this chat/screenshot to your private research folder.");
 contact=value(contact,100);company=value(company,120);chatText=value(chatText,45000);
 if(!contact||!company)throw err("Contact and company are required.");
 if(!chatText&&!imageData)throw err("Paste a conversation or add a screenshot.");
 if(chatText&&imageData)throw err("Choose pasted chat or screenshot for each source record.");
 // Screenshots and text are stored separately, not sent to an LLM.
 const idSuffix=crypto.randomBytes(5).toString("hex"),stamp=new Date().toISOString().replace(/[:.]/g,"-");
 let contents,mime,filename;
 if(imageData){
  contents=safeImage({imageData,mimeType});mime=mimeType;
  filename="NEW_CHAT_"+candidate.toLowerCase()+"_"+stamp+"_"+safeStem(contact)+"_"+idSuffix+
   ({ "image/jpeg":".jpg","image/png":".png","image/webp":".webp" }[mimeType]);
 }else{
  contents="GARAMAAL LINKEDIN CONVERSATION (USER-COPIED; NOT VERIFIED)\nCandidate: "+candidateName(candidate)+
  "\nContact: "+contact+"\nCompany: "+company+"\nCaptured: "+new Date().toISOString()+
  "\n\nCOPIED CONVERSATION:\n"+chatText+"\n";
  mime="text/plain";filename="NEW_CHAT_"+candidate.toLowerCase()+"_"+stamp+"_"+safeStem(contact)+"_"+idSuffix+".txt";
 }
 const upload=await uploadDrive({token:driveToken||token,candidate,filename,content:contents,mimeType:mime,fetcher});
 await ensure({token,id,tab:CONVO_TAB,head:CONVO_HEAD,fetcher});
 const idCode=crypto.randomBytes(12).toString("hex");
 const vals=[candidateName(candidate),idCode,contact,company,imageData?"screenshot":"paste",upload.id,upload.url,"","new","",new Date().toISOString()];
 try{
  await api(sheet(id)+"/values/"+range(CONVO_TAB,"A1:K")+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
   token,{method:"POST",body:{values:[vals]},fetcher});
 }catch(e){throw err("Screenshot/chat saved to Drive, but follow-up list was not updated. File: "+upload.name,502)}
 return {saved:true,id:idCode,file:upload};
}
async function saveDraft({token,id,candidate,conversationId,draft,next,status="draft",confirm,fetcher}){
 candidateCheck(candidate);if(confirm!==true)throw err("Confirm saving this draft.");
 draft=value(draft,1600);next=value(next,10);if(!/^[a-f0-9]{24}$/.test(String(conversationId)))throw err("Invalid conversation ID.");
 if(!draft)throw err("Paste your reviewed follow-up draft first.");
 if(next&&!/^\d{4}-\d{2}-\d{2}$/.test(next))throw err("Enter a YYYY-MM-DD follow-up date.");
 if(!["draft","sent"].includes(status))throw err("Invalid follow-up status.");
 const item=(await listConversations({token,id,candidate,fetcher})).items.find(x=>x.id===conversationId);
 if(!item)throw err("Conversation no longer found.",404);
 const newRow=[candidateName(candidate),item.id,item.contact,item.company,item.sourceType,item.fileId,item.driveUrl,draft,status,next,new Date().toISOString()];
 await api(sheet(id)+"/values/"+range(CONVO_TAB,"A"+item.row+":K"+item.row)+"?valueInputOption=RAW",token,{method:"PUT",body:{values:[newRow]},fetcher});
 return {saved:true,status};
}
module.exports={TARGET_HEAD,CONVO_HEAD,researchUrl,safeLink,safeImage,saveLeadScreenshot,listTargets,saveTarget,listConversations,saveConversation,saveDraft,uploadDrive,driveFolder};
