"use strict";
/* Freshmaal Sheet1 BC:BE (55-57) reserved for JD opportunity signals.
 * Only explicit user action saves; existing A:BA cells never overwritten.
 * Before creation, header compatibility is checked and fail-closed.
 */
const columns=[
 {key:"contact",title:"JD Contact Evidence",col:"BB"},
 {key:"visa",title:"JD Visa Sponsorship Evidence",col:"BC"},
 {key:"salary",title:"JD Salary Above 50k Evidence",col:"BD"}
];
const start=54,last=56;
async function google(url,token,method="GET",body){
 const r=await fetch(url,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error("Google Sheets clue storage failed (HTTP "+r.status+").");
 return r.json();
}
async function save({token,spreadsheetId,job,clues,confirm,readOnly}){
 if(readOnly)throw Object.assign(Error("Read-only app."),{httpCode:403});
 if(confirm!==true)throw Object.assign(Error("Confirm before writing job clues."),{httpCode:400});
 if(!job||job.source!=="fresh"||!Number.isInteger(job.row)||job.row<3||job.row>1000)
  throw Object.assign(Error("Invalid Freshmaal vacancy."),{httpCode:400});
 const url="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(spreadsheetId);
 const meta=await google(url+"?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",token);
 const tab=meta.sheets?.find(x=>x.properties?.title==="Sheet1")?.properties;
 if(!tab||tab.gridProperties.rowCount<job.row)throw Error("Freshmaal row not found.");
 if(tab.gridProperties.columnCount<last){
  // Add up to BD only; existing data outside BA is never replaced.
  const extra=last-tab.gridProperties.columnCount;
  if(tab.gridProperties.columnCount!==53)throw Error("Unexpected new columns. Review sheet before enabling JD clue storage.");
  await google(url+":batchUpdate",token,"POST",{
   requests:[{appendDimension:{sheetId:tab.sheetId,dimension:"COLUMNS",length:extra}}]});
 }
 const head=await google(url+"/values/"+encodeURIComponent("'Sheet1'!BB1:BD2"),token);
 for(let i=0;i<3;i++){
  const existing=String(head.values?.[0]?.[i]||"");
  if(existing&&existing!==columns[i].title)
   throw Error("Clue column "+columns[i].col+" is already occupied; no vacancy data was written.");
 }
 const header=columns.map(x=>x.title);
 const evidence=[
  clues.contact?"CONTACT: "+clues.contact.evidence:"NOT STATED",
  clues.visa?.status==="yes"?"YES: "+clues.visa.evidence:
    clues.visa?.status==="no"?"NO: "+clues.visa.evidence:"NOT STATED",
  clues.salary&&Number(clues.salary.annualValue)>50000?
    "ABOVE 50K: "+clues.salary.currency+" "+clues.salary.annualValue+" · "+clues.salary.evidence:"NOT STATED"
 ].map(x=>String(x).slice(0,480));
 await google(url+"/values:batchUpdate",token,"POST",{valueInputOption:"RAW",data:[
  {range:"'Sheet1'!BB1:BD1",values:[header]},
  {range:"'Sheet1'!BB"+job.row+":BD"+job.row,values:[evidence]}
 ]});
 return {saved:true,row:job.row,columns:"BB:BD",message:"Verified JD clues saved into Freshmaal BB–BD. No application data was changed."};
}
module.exports={columns,save};
