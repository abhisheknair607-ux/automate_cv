"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

// Exercise the real synchronous Sheets adapter with deterministic, read-only
// fake Google Sheets API responses. Never access production spreadsheets.
const adapter=fs.readFileSync(path.join(__dirname,"../sheets.js"),"utf8");
function fixture(formulaResponse,{apiFails=false}={}){
  const calls=[];
  const fakeExec=(program,args)=>{
    assert.equal(program,"curl");
    const uri=new URL(args.at(-1));calls.push(uri);
    if(uri.pathname.endsWith("/spreadsheets/test-sheet")){
      return JSON.stringify({sheets:[{properties:{
        sheetId:0,title:"Jobs",gridProperties:{rowCount:20,columnCount:5}
      }}]});
    }
    if(uri.pathname.includes("/values/")){
      assert.equal(uri.searchParams.get("valueRenderOption"),"FORMULA");
      assert.equal(args[args.indexOf("-X")+1],"GET");
      if(apiFails)throw Object.assign(Error("simulated failure"),{stderr:"simulated failure"});
      return JSON.stringify(formulaResponse);
    }
    throw Error("Unexpected API request: "+uri.pathname);
  };
  const sandbox={module:{exports:{}},URL,require(name){
    if(name==="node:child_process")return {execFileSync:fakeExec};
    throw Error("Unexpected module: "+name);
  }};
  vm.runInNewContext(adapter,sandbox,{filename:"standalone/sheets.js"});
  const app=sandbox.module.exports.createSpreadsheetApp("fake-token",{taaza:"test-sheet"});
  const sheet=app.openById("test-sheet").getSheetByName("Jobs");
  return {sheet,calls};
}

test("Sheets getFormulas returns only formulas in a full-sized aligned matrix",()=>{
  const {sheet,calls}=fixture({values:[
    ['=IF(A3="","",A3)',"ordinary text",false],
    [],
    ["","=SUM(A5:A5)",42]
  ]});
  const formulas=sheet.getRange(3,1,3,3).getFormulas();
  assert.deepEqual(JSON.parse(JSON.stringify(formulas)),[
    ['=IF(A3="","",A3)',"",""],
    ["","",""],
    ["","=SUM(A5:A5)",""]
  ]);
  assert.equal(calls.length,2);
  assert.equal(calls[1].searchParams.get("valueRenderOption"),"FORMULA");
  assert.match(decodeURIComponent(calls[1].pathname),/Jobs.*A3:C5/);
});

test("Sheets getFormula returns the first cell formula or empty string",()=>{
  const {sheet}=fixture({values:[["=A3+B3"]]});
  assert.equal(sheet.getRange(3,1).getFormula(),"=A3+B3");
  const {sheet:blankSheet}=fixture({values:[["ordinary value"]]});
  assert.equal(blankSheet.getRange(3,2).getFormula(),"");
});

test("Sheets formula lookup fails closed for malformed API data",()=>{
  const {sheet}=fixture({values:{invalid:true}});
  assert.throws(()=>sheet.getRange(3,1,2,3).getFormulas(),/invalid formula data/);
});

test("Sheets formula lookup fails closed on API error",()=>{
  const {sheet}=fixture({values:[]},{apiFails:true});
  assert.throws(()=>sheet.getRange(3,1,2,3).getFormulas(),/Google Sheets operation failed/);
});
