"use strict";
// The release snapshot keeps legacy CV/Sheets code immutable. This tiny scoped
// function persists explicit Swipe application progress in existing BE/BF only.
const SOURCE=String.raw`
function updateApplicationProgress(payload) {
  authorise_();payload=payload||{};
  const candidate=String(payload.candidate||"");
  person_(candidate);
  const allowed=["Unapplied","Applied","Applied + Connected","Rejected","Accepted"];
  const progress=String(payload.progress||"").trim();
  if(!allowed.includes(progress))throw new Error("Invalid application progress");
  return lockRun_(()=>{
    const sh=sheet_("fresh");
    const row=expected_(sh,payload.row,3,payload.expected);
    const col=candidate==="Pooja"?58:57;
    const cell=sh.getRange(row,col);
    cell.setValue(progress);
    SpreadsheetApp.flush();
    if(String(cell.getDisplayValue()).trim()!==progress)
      throw new Error("Application progress could not be verified");
    invalidateDashboardReads_();
    return {saved:true,candidate,row,progress,message:"Application progress saved to Freshmaal"};
  });
}
`;
module.exports={SOURCE};
