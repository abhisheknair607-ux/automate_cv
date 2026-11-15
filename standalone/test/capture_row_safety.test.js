"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ROOT=path.resolve(__dirname,"../..");
for(const filename of ["webapp/Code.gs","garamaal-release-webapp/Code.gs"]){
  const code=fs.readFileSync(path.join(ROOT,filename),"utf8");
  const match=code.match(/function openSlot_\(sh,firstRow,maxRow\) \{[\s\S]*?\n\}\nfunction addDiscovery/);
  test(filename+" has a guarded row allocator",()=>{
    assert(match,"openSlot_ function found");
    assert(code.includes("const matchAt=links.findIndex"),"live Discovery URL dedup");
    assert(code.includes("const index=links.findIndex"),"live Freshmaal URL dedup");
    const fn=vm.runInNewContext("const SETTINGS={freshTab:'Sheet1'};("+match[0].slice(0,-"\nfunction addDiscovery".length)+")");
    const sheet=(name,rows,opts={})=>({
      getName:()=>name,
      getMaxRows:()=>rows.length,
      getRange:(r,c,n,w)=>({getValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w))}),
      insertRowsAfter:(at,n)=>{if(opts.noAppend)throw Error("No permission to append");for(let i=0;i<n;i++)rows.push([])}
    });
    const arr=(n)=>Array.from({length:n},()=>Array(58).fill(""));
    const safe=arr(8);
    safe[2][13]="Favorite"; // Occupied preference; never take row 3
    assert.equal(fn(sheet("Sheet1",safe),3,1000),4);
    const defaults=arr(6);
    for(const col of [5,6,7,8,9,10,42,43,48,49])defaults[2][col-1]=false;
    assert.equal(fn(sheet("Sheet1",defaults),3,1000),3);
    const scores=arr(6);
    scores[2][37]=80;scores[2][38]=1;
    assert.equal(fn(sheet("Sheet1",scores),3,1000),4);
    const master=Array.from({length:3},()=>Array(17).fill("busy"));
    assert.equal(fn(sheet("Jobs",master),2),4,"Append instead of overwriting");
    assert.equal(master.length,4);
    const full=arr(4);for(const r of full)r[0]="occupied";
    assert.throws(()=>fn(sheet("Sheet1",full),3,4),/No safe empty job rows/);
  });
}
