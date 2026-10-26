"use strict";
/** Strictly scoped manual duplicate-status update for Taaza Jobs!Q.
 * This module never deletes jobs, alters other columns, calls an AI API or
 * writes unless the authenticated Cloud Run route explicitly enables it.
 */
const API_ROOT="https://sheets.googleapis.com/v4/spreadsheets/";
const VALID_STATUS=new Set(["","Dup","Not Dup","Possible"]);
const HEADER="Duplicate Status";
const COMPANY_HEADER="Company Name";
const ROLE_HEADER="Designation";
const LINK_HEADER="Link";
const {URL}=require("node:url");

function canonical(raw){
 try {
  const u=new URL(String(raw||"").trim());
  if(!["https:","http:"].includes(u.protocol))return "";
  const host=u.hostname.toLowerCase().replace(/^www\./,"");
  let path=u.pathname.replace(/\/+$/,"")||"/";
  if(["linkedin.com","uk.linkedin.com","ie.linkedin.com","nl.linkedin.com","pl.linkedin.com"].includes(host)){
   const m=path.match(/^\/(?:comm\/)?jobs\/view\/(\d{7,15})$/i);
   if(m)return "linkedin:"+m[1];
  }
  if(host==="indeed.com"||host.endsWith(".indeed.com")){
   const jk=u.searchParams.get("jk");
   if(jk&&/^[0-9a-f]{16}$/i.test(jk)&&["/viewjob","/m/viewjob","/rc/clk/dl"].includes(path))return "indeed:"+jk.toLowerCase();
  }
  const pairs=[...u.searchParams].filter(([k])=>!(/^(utm_|fbclid$|gclid$|msclkid$|igshid$|ref_src$|source$|trk$|tracking$|trackingid$|refid$)/i.test(k)))
    .sort(([a,v],[b,w])=>(a+"="+v).localeCompare(b+"="+w));
  return "https://"+host+path+(pairs.length?"?"+new URLSearchParams(pairs).toString():"");
 } catch {return "";}
}
function fail(message,status=400){return Object.assign(new Error(message),{httpCode:status})}
function validate(payload){
 const row=Number(payload?.row),status=String(payload?.status??"");
 const expected=payload?.expected||{};
 if(!Number.isSafeInteger(row)||row<2||row>10000)throw fail("Invalid Jobs row");
 if(!VALID_STATUS.has(status))throw fail("Invalid duplicate status");
 const company=String(expected.company||"").trim(),role=String(expected.role||"").trim();
 const url=String(expected.url||"").trim();
 if(!company||!role||company.length>250||role.length>300||!canonical(url))throw fail("Missing verified job identity");
 // The automatic scanner is read-only at this stage. Manual clicks alone
 // may set Dup / Not Dup / blank, not fabricate a possible match.
 if(status==="Possible")throw fail("Possible matches require a verified scan");
 return {row,status,expected:{company,role,url}};
}
async function request(token,spreadsheetId,path,opts={},fetcher=fetch){
 const route=API_ROOT+encodeURIComponent(spreadsheetId)+path;
 const result=await fetcher(route,{
  method:opts.method||"GET",signal:AbortSignal.timeout(12000),
  headers:{"Authorization":"Bearer "+token,"Accept":"application/json",
    ...(opts.body?{"Content-Type":"application/json"}:{})},
  ...(opts.body?{body:JSON.stringify(opts.body)}:{})
 });
 const data=await result.json().catch(()=>({}));
 if(!result.ok)throw fail("Google Sheets operation failed ("+result.status+")",result.status===403?403:503);
 return data;
}
async function markDuplicate({token,spreadsheetId,payload,fetcher=fetch}){
 if(!token||!spreadsheetId)throw fail("Google Sheets authorization unavailable",503);
 const {row,status,expected}=validate(payload);
 const quote=(value)=>encodeURIComponent("'Jobs'!"+value);
 const get=async area=>(await request(token,spreadsheetId,"/values/"+quote(area),{},fetcher)).values||[];
 // Fail closed unless the approved Q schema is installed.
 const header=await get("A1:Q1");
 if(!header[0]||header[0][0]!==COMPANY_HEADER||header[0][1]!==ROLE_HEADER
    ||header[0][2]!==LINK_HEADER||header[0][16]!==HEADER)
  throw fail("Duplicate Status column is not installed or Jobs headers changed",409);
 const current=await get("A"+row+":Q"+row);
 const cells=current[0]||[];
 if(cells[0]!==expected.company||cells[1]!==expected.role||
    canonical(cells[2])!==canonical(expected.url))throw fail("Job changed; refresh Discovery and try again",409);
 const prior=String(cells[16]||"").trim();
 if(!VALID_STATUS.has(prior))throw fail("Unknown existing duplicate state; no change made",409);
 if(prior===status)return {changed:false,row,status};
 // A second read immediately before write reduces stale-row overwrites.
 const recheck=await get("A"+row+":Q"+row);
 if(JSON.stringify(recheck)!==JSON.stringify(current))throw fail("Job was edited during update; refresh and retry",409);
 await request(token,spreadsheetId,"/values/"+quote("Q"+row),{
  method:"PUT",body:{range:"'Jobs'!Q"+row,majorDimension:"ROWS",values:[[status]],},
 },fetcherWithQuery(fetcher,"valueInputOption=RAW"));
 return {changed:true,row,status};
}
/** Add the required Sheets values.update query parameter without accepting
 * user input or allowing requests to any other domain.
 */
function fetcherWithQuery(fetcher,query){
 return (url,options)=>fetcher(url+"?"+query,options);
}
module.exports={canonical,validate,markDuplicate};
