"use strict";

const DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DRIVE_API="https://www.googleapis.com/drive/v3/files/";

function driveId(link) {
  let url;
  try { url=new URL(String(link||"")); } catch { return null; }
  if(url.protocol!=="https:")return null;
  const host=url.hostname.toLowerCase();
  let match;
  if(host==="docs.google.com")match=url.pathname.match(/^\/document\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/);
  else if(host==="drive.google.com") {
    match=url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/);
    if(!match && url.pathname==="/open")match=[null,url.searchParams.get("id")];
  }
  return match && /^[A-Za-z0-9_-]{20,}$/.test(match[1]||"") ? match[1] : null;
}

function filename(name,kind) {
  const clean=String(name||"").replace(/[^\x20-\x7e]|[<>:"/\\|?*]/g,"_").replace(/^[. ]+|[. ]+$/g,"").slice(0,180);
  return (clean && /\.docx$/i.test(clean) ? clean : kind.toUpperCase()+".docx");
}

async function getDocument({candidate,row,kind,token,lookup,fetchImpl=fetch}) {
  if(!["Abhishek","Pooja"].includes(candidate) || !Number.isInteger(row) || row<3 || !["cv","cl"].includes(kind))
    throw Object.assign(new Error("Invalid document request."),{httpCode:400});
  const job=await lookup(candidate,row);
  if(!job || job.source!=="fresh" || job.row!==row || !job.url)
    throw Object.assign(new Error("Application not found."),{httpCode:404});
  const id=driveId(kind==="cv"?job.cvLink:job.clLink);
  if(!id)throw Object.assign(new Error("Completed document is unavailable."),{httpCode:404});
  const headers={Authorization:"Bearer "+token};
  const metadataResponse=await fetchImpl(DRIVE_API+encodeURIComponent(id)+"?fields=id,name,mimeType,size,trashed",{headers,signal:AbortSignal.timeout(30000)});
  if(!metadataResponse.ok)throw Object.assign(new Error("Document could not be read from Drive."),{httpCode:502});
  const metadata=await metadataResponse.json();
  if(metadata.id!==id || metadata.trashed || metadata.mimeType!==DOCX)
    throw Object.assign(new Error("The saved document is not a DOCX file."),{httpCode:422});
  if(Number(metadata.size)>25*1024*1024)
    throw Object.assign(new Error("Document is too large to download here."),{httpCode:413});
  const fileResponse=await fetchImpl(DRIVE_API+encodeURIComponent(id)+"?alt=media",{headers,signal:AbortSignal.timeout(60000)});
  if(!fileResponse.ok || !fileResponse.body)
    throw Object.assign(new Error("Document download failed."),{httpCode:502});
  return {response:fileResponse,name:filename(metadata.name,kind),size:Number(metadata.size)||null};
}

module.exports={DOCX,driveId,filename,getDocument};
