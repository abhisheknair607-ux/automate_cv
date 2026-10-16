"use strict";
/**
 * Minimal synchronous, request-local Google Sheets replacement for the APIs
 * currently used by webapp/Code.gs. The existing business rules remain
 * unchanged. Cloud Run is configured with concurrency=1 / max-instances=1;
 * each request is atomic from this process's perspective.
 *
 * The Cloud Run runtime service account needs Editor access to both Sheets.
 */
const {execFileSync} = require("node:child_process");

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function colLetters(n) {
  let s = "";
  while (n > 0) { n--; s = COLS[n % 26] + s; n = Math.floor(n / 26); }
  return s;
}
function api(token, path, {method="GET", body, query}={}) {
  const url = new URL("https://sheets.googleapis.com/v4/spreadsheets/" + path);
  for (const [key,val] of Object.entries(query || {}))
    if (val !== undefined) url.searchParams.set(key,String(val));
  const args = ["--fail-with-body","--silent","--show-error","--max-time","25","-X",method,
    "-H","Authorization: Bearer "+token, "-H","Content-Type: application/json"];
  if (body !== undefined) args.push("--data-binary",JSON.stringify(body));
  args.push(url.toString());
  let raw;
  try { raw = execFileSync("curl",args,{encoding:"utf8",timeout:29000,maxBuffer:32*1024*1024}); }
  catch(err) {
    const details = String(err.stdout || err.stderr || err.message || "").slice(0,450);
    // Never include the bearer token, curl arguments or secret environment vars.
    throw new Error("Google Sheets operation failed: " + details);
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw new Error("Invalid Google Sheets response"); }
}
function toSheetValue(val) {
  if (val == null) return "";
  if (Object.prototype.toString.call(val)==="[object Date]") return val.toISOString();
  return typeof val==="string"||typeof val==="number"||typeof val==="boolean" ? val : String(val);
}
function quote(name) {return "'" + String(name).replace(/'/g,"''") + "'";}
class Range {
  constructor(sheet, row, col, count=1, width=1) {
    if (![row,col,count,width].every(n=>Number.isInteger(n)&&n>0)
        || row+count-1>sheet.getMaxRows() || col+width-1>sheet.getMaxColumns()) {
      throw new Error("Invalid Google Sheets cell range");
    }
    Object.assign(this,{sheet,row,col,count,width});
  }
  getValues() {
    const data=this.sheet.grid();
    return Array.from({length:this.count},(_,i)=>Array.from({length:this.width},(_,j)=>{
      const r=data[this.row-1+i]||[];
      return r[this.col-1+j]===undefined?"":r[this.col-1+j];
    }));
  }
  getDisplayValues() {return this.getValues().map(r=>r.map(x=>String(x==null?"":x)));}
  getValue() {return this.getValues()[0][0];}
  // Apps Script Range parity: needed by candidate-specific BE/BF status reads.
  getDisplayValue() {return this.getDisplayValues()[0][0];}
  setValues(rows) {
    if (!Array.isArray(rows)||rows.length!==this.count||
        rows.some(r=>!Array.isArray(r)||r.length!==this.width))
      throw new Error("Data dimensions do not match destination range");
    const values=rows.map(r=>r.map(toSheetValue));
    const {sheet}=this;
    const range=quote(sheet.name)+"!"+colLetters(this.col)+this.row+
      ":"+colLetters(this.col+this.width-1)+(this.row+this.count-1);
    api(sheet.runtime.token,encodeURIComponent(sheet.book.id)+"/values/"+encodeURIComponent(range),{
      method:"PUT",query:{valueInputOption:"RAW"},body:{range,majorDimension:"ROWS",values}
    });
    const grid=sheet.cached;
    if(grid) for(let i=0;i<this.count;i++) {
      const idx=this.row-1+i;
      while(grid.length<=idx)grid.push([]);
      for(let j=0;j<this.width;j++)grid[idx][this.col-1+j]=values[i][j];
    }
    return this;
  }
  setValue(value) {return this.setValues([[value]]);}
  getDataValidations() {
    const {sheet}=this;
    const range=quote(sheet.name)+"!"+colLetters(this.col)+this.row+
      ":"+colLetters(this.col+this.width-1)+(this.row+this.count-1);
    const metadata=api(sheet.runtime.token,encodeURIComponent(sheet.book.id),{
      query:{ranges:range,includeGridData:"true",
        fields:"sheets(data(startRow,startColumn,rowData(values(dataValidation))))"}
    });
    const chunk=(metadata.sheets||[]).flatMap(sh=>sh.data||[])[0]||{};
    const out=Array.from({length:this.count},()=>Array(this.width).fill(null));
    (chunk.rowData||[]).forEach((row,i)=>{
      (row.values||[]).forEach((cell,j)=>{
        if(i<this.count&&j<this.width&&cell.dataValidation) {
          const original=cell.dataValidation;
          const rule=original.condition||{};
          out[i][j]={
            getCriteriaType:()=>rule.type==="ONE_OF_LIST"?"VALUE_IN_LIST":
              rule.type==="ONE_OF_RANGE"?"VALUE_IN_RANGE":rule.type,
            getCriteriaValues:()=>{
              if(rule.type==="ONE_OF_LIST") return [(rule.values||[]).map(v=>v.userEnteredValue||"")];
              if(rule.type==="ONE_OF_RANGE") {
                const expression=String(rule.values?.[0]?.userEnteredValue||"").replace(/^=/,"");
                const match=expression.match(/^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
                if(match) {
                  const name=(match[1]||match[2]).replace(/''/g,"'");
                  const number=x=>[...x.toUpperCase()].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0);
                  const ref=sheet.book.getSheetByName(name);
                  if(ref)return [ref.getRange(Number(match[4]),number(match[3]),Number(match[6])-Number(match[4])+1,number(match[5])-number(match[3])+1)];
                }
              }
              return [];
            }
          };
        }
      });
    });
    return out;
  }
  getDataValidation() {return this.getDataValidations()[0][0];}
  setDataValidation(rule) {
    const {sheet}=this;
    const condition={type:"ONE_OF_LIST",values:(rule.values||[]).map(v=>({userEnteredValue:String(v)}))};
    api(sheet.runtime.token,encodeURIComponent(sheet.book.id)+":batchUpdate",{
      method:"POST",body:{requests:[{repeatCell:{
        range:{sheetId:sheet.id,startRowIndex:this.row-1,endRowIndex:this.row-1+this.count,
          startColumnIndex:this.col-1,endColumnIndex:this.col-1+this.width},
        cell:{dataValidation:{condition,strict:rule.strict,showCustomUi:true}},
        fields:"dataValidation"
      }}]}
    });
    return this;
  }
}
class Sheet {
  constructor(book,props) {
    this.book=book;this.runtime=book.runtime;
    this.name=props.title;this.id=props.sheetId;
    this.maxRows=props.gridProperties.rowCount;
    this.maxCols=props.gridProperties.columnCount;
    this.cached=null;
  }
  getName(){return this.name;}
  getSheetId(){return this.id;}
  getMaxRows(){return this.maxRows;}
  getMaxColumns(){return this.maxCols;}
  grid() {
    if(this.cached)return this.cached;
    const range=quote(this.name)+"!A1:"+colLetters(this.maxCols)+this.maxRows;
    const data=api(this.runtime.token,encodeURIComponent(this.book.id)+"/values/"+encodeURIComponent(range),{
      query:{valueRenderOption:"UNFORMATTED_VALUE",dateTimeRenderOption:"FORMATTED_STRING"}
    });
    return this.cached=data.values||[];
  }
  getLastRow(){
    const rows=this.grid();
    for(let i=rows.length-1;i>=0;i--)
      if((rows[i]||[]).some(v=>v!==null&&v!==undefined&&v!==""))return i+1;
    return 0;
  }
  getRange(row,col,numRows=1,numCols=1){return new Range(this,row,col,numRows,numCols);}
  insertRowsAfter(at,count) {
    if(at!==this.maxRows||!Number.isInteger(count)||count<=0)
      throw new Error("Only safe appendRows are supported");
    api(this.runtime.token,encodeURIComponent(this.book.id)+":batchUpdate",{
      method:"POST",body:{requests:[{appendDimension:{sheetId:this.id,dimension:"ROWS",length:count}}]}
    });
    this.maxRows+=count;
  }
}
class Book {
  constructor(runtime,id) {
    this.runtime=runtime;this.id=id;this.sheets=null;
  }
  load(){
    if(this.sheets)return;
    const data=api(this.runtime.token,encodeURIComponent(this.id),{
      query:{fields:"sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))"}
    });
    this.sheets=(data.sheets||[]).filter(x=>x.properties).map(x=>new Sheet(this,x.properties));
  }
  getSheetByName(name) {this.load();return this.sheets.find(x=>x.name===name)||null;}
  getSheets() {this.load();return [...this.sheets];}
}
function createSpreadsheetApp(token, ids) {
  const runtime={token};
  const books=new Map();
  return {
    DataValidationCriteria:{VALUE_IN_LIST:"VALUE_IN_LIST",VALUE_IN_RANGE:"VALUE_IN_RANGE"},
    openById(id) {
      if(!Object.values(ids).includes(id))throw new Error("Spreadsheet is not permitted");
      if(!books.has(id)) books.set(id,new Book(runtime,id));
      return books.get(id);
    },
    newDataValidation(){
      const data={values:[],strict:true};
      return {
        requireValueInList(vals){data.values=[...vals];return this;},
        setAllowInvalid(allowed){data.strict=!allowed;return this;},
        build(){return {...data};}
      };
    },
    flush(){ /* All REST mutations are sent synchronously before returning. */ }
  };
}
module.exports={createSpreadsheetApp,colLetters,toSheetValue,api,Range};
