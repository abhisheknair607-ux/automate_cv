"use strict";
/* Only called after an authenticated user's explicit confirmation.
 * A single Sheets batch request repairs the two rank columns as formulas.
 * Scores, checkboxes, statuses, JDs and generated CVs are never changed.
 */
const SHEET_NAME="Sheet1";
function rankFormula(scoreCol,row){
  if(!["AL","AN"].includes(scoreCol)||!Number.isInteger(row)||row<3)throw Error("Invalid rank formula request");
  return '=IF('+scoreCol+row+'="","",COUNTIF('+scoreCol+'$3:'+scoreCol+',">"&'+scoreCol+row+')+COUNTIF('+scoreCol+'$3:'+scoreCol+row+','+scoreCol+row+'))';
}
async function jsonRequest(url,token,method="GET",body){
  const response=await fetch(url,{method,headers:{
    Authorization:"Bearer "+token,
    ...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error("Google Sheets formula maintenance failed (HTTP "+response.status+").");
  return response.json();
}
async function repairRankFormulas({token,spreadsheetId,confirm,readOnly}){
  if(readOnly)throw Object.assign(Error("Read-only dashboard."),{httpCode:403});
  if(confirm!==true)throw Object.assign(Error("Explicit confirmation required to repair rank columns."),{httpCode:400});
  if(!/^[A-Za-z0-9_-]{20,}$/.test(String(spreadsheetId||"")))throw Error("Invalid target spreadsheet.");
  const base="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(spreadsheetId);
  const metadata=await jsonRequest(base+"?fields=sheets(properties(title,gridProperties(rowCount,columnCount)))",token);
  const sheet=(metadata.sheets||[]).find(x=>x.properties?.title===SHEET_NAME)?.properties;
  if(!sheet||sheet.gridProperties.columnCount<41)throw Error("Freshmaal rank columns not available.");
  const final=Math.min(1000,Number(sheet.gridProperties.rowCount)||0);
  if(final<3)throw Error("No job rows available.");
  const data=[
    {range:"'Sheet1'!AM3:AM"+final,values:Array.from({length:final-2},(_,i)=>[rankFormula("AL",i+3)])},
    {range:"'Sheet1'!AO3:AO"+final,values:Array.from({length:final-2},(_,i)=>[rankFormula("AN",i+3)])}
  ];
  const result=await jsonRequest(base+"/values:batchUpdate",token,"POST",{
    valueInputOption:"USER_ENTERED",data,includeValuesInResponse:false
  });
  if(Number(result.totalUpdatedCells)!==(final-2)*2)throw Error("Rank repair was not fully verified; review the two formula columns.");
  return {updatedCells:result.totalUpdatedCells,fromRow:3,toRow:final,
    message:"Abhishek AM and Pooja AO ranking formulas restored through row "+final+
      ". Combined scores were not modified."};
}
module.exports={rankFormula,repairRankFormulas};
