"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const release=fs.readFileSync(path.join(root,"garamaal-release-webapp/Code.gs"),"utf8");

test("Capture Job allocator never reuses occupied values or blank-valued formulas",()=>{
  const a=release.indexOf("function openSlot_("),b=release.indexOf("function addDiscovery(",a);
  assert(a>=0&&b>a,"Release allocator function exists");
  const fn=vm.runInNewContext("(function(){const SETTINGS={freshTab:'Sheet1'};"+
    release.slice(a,b)+";return openSlot_;})()");
  const grid=(length,width=58)=>Array.from({length},()=>Array(width).fill(""));
  const fixture=(name,rows,formulaRows)=>({
    getName:()=>name,
    getMaxRows:()=>rows.length,
    getRange:(row,col,count,width)=>({
      getValues:()=>rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),
      getFormulas:()=>formulaRows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width))
    }),
    insertRowsAfter:(last,n)=>{assert.equal(last,rows.length);for(let i=0;i<n;i++){rows.push(Array(58).fill(""));formulaRows.push(Array(58).fill(""));}}
  });
  const data=grid(7),formulas=grid(7);
  data[2][13]="Favorite"; // An orphaned candidate preference is not a free row
  formulas[3][38]='=IF(A4="", "", 1)'; // A formula returning blank must still be protected
  for(const col of [5,6,7,8,9,10,42,43,48,49])data[4][col-1]=false;
  assert.equal(fn(fixture("Sheet1",data,formulas),3,1000),5);
  const limited=grid(4),limitedFormulas=grid(4);
  limited.forEach(row=>row[0]="occupied");
  assert.throws(()=>fn(fixture("Sheet1",limited,limitedFormulas),3,4),/No safe empty job rows/);
  const master=grid(3,17),masterFormulas=grid(3,17);
  master.forEach(row=>row[0]="occupied");
  assert.equal(fn(fixture("Jobs",master,masterFormulas),2),4);
  assert.equal(master[0][0],"occupied");
  assert.equal(master.length,4);
});

test("Capture Job deduplicates against live URL columns",()=>{
  assert.match(release,/const matchAt=links\.findIndex\(x=>canonical_\(x\[0\]\)===key\)/);
  assert.match(release,/const index=links\.findIndex\(a=>canon&&canonical_\(a\[0\]\)===canon\)/);
  assert.match(release,/fresh\.getRange\(newRow,1,1,4\)\.setValues/);
  assert.match(release,/fresh\.getRange\(newRow,33\)\.setValue\(location\)/);
});

test("Website install button remains gated until a verified Chrome Web Store ID",()=>{
  const server=fs.readFileSync(path.join(root,"standalone/server.js"),"utf8");
  const js=fs.readFileSync(path.join(root,"standalone/extension_install.js"),"utf8");
  new vm.Script(server,{filename:"standalone/server.js"});
  new vm.Script(js,{filename:"standalone/extension_install.js"});
  assert.match(server,/GARAMAAL_EXTENSION_PUBLIC_ENABLED/);
  assert.match(server,/CHROME_WEB_STORE_EXTENSION_ID/);
  assert.match(server,/app\.get\("\/extension-install\.js"/);
  assert.equal(server.match(/html=html\.replace\("<\/body>",'<script src="\/extension-install\.js"><\/script><\/body>'\)/g)?.length,3);
  assert.match(js,/if\(available\)\{window\.open/);
  assert.match(js,/textContent="Extension soon"/);
});
