"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const store=require("../contacts_store");
function fakeSheets(){
 const state={tab:null,headers:[],rows:[],requests:[]};
 const respond=x=>({ok:true,json:async()=>x});
 async function fetcher(uri,args={}){
  const url=new URL(uri);const path=decodeURIComponent(url.pathname);
  const body=args.body?JSON.parse(args.body):{},method=args.method||"GET";
  state.requests.push({path,method,body});
  if(path.endsWith("/spreadsheets/mockbook")&&method==="GET")
   return respond({sheets:state.tab?[{properties:state.tab}]:[]});
  if(path.endsWith("mockbook:batchUpdate")&&method==="POST"){
   if(body.requests?.[0]?.addSheet){
    state.tab={sheetId:2299,title:"Connections",gridProperties:{rowCount:1000,columnCount:12}};
    return respond({replies:[{addSheet:{properties:state.tab}}]});
   }
  }
  if(path.includes("/values/")&&method==="GET"){
   if(path.endsWith("'Connections'!A1:L1"))return respond({values:state.headers.length?[state.headers]:[]});
   if(path.endsWith("'Connections'!A2:L3"))return respond({values:state.rows.slice(0,2)});
   if(path.endsWith("'Connections'!A2:L1000"))return respond({values:state.rows});
  }
  if(path.includes("/values/")&&method==="PUT"){
   if(path.endsWith("'Connections'!A1:L1")){state.headers=body.values[0];return respond({updatedCells:12})}
  }
  if(path.endsWith("/values:batchUpdate")){
   for(const data of body.data||[]){
    const n=Number(data.range.match(/!A(\d+):L\d+/)?.[1]);
    if(n)state.rows[n-2]=data.values[0];
   }
   return respond({totalUpdatedCells:(body.data||[]).length*12});
  }
  if(path.includes(":append")&&method==="POST"){
   state.rows.push(...(body.values||[]));return respond({updates:{updatedRows:body.values?.length||0}});
  }
  throw Error("Unexpected Sheets request "+method+" "+uri);
 }
 return {state,fetcher};
}
test("Contacts tab is isolated, created with required user fields, and idempotently reused",async()=>{
 const fake=fakeSheets();
 const job={source:"fresh",candidate:"Abhishek",row:19,company:"ABC Wealth",
  role:"Investment Analyst",url:"https://example.org/jobs/19"};
 const contact={name:"Jane Smith",title:"Head of Investments",
  profileUrl:"https://www.linkedin.com/in/jane-smith",
  searchUrl:"https://www.linkedin.com/search/results/people/?keywords=Jane%20Smith",
  verification:"Direct profile cited in search",evidence:"Named on the employer's leadership page",
  message:"Hi Jane,\n\nI'm Abhishek Nair. I'd appreciate connecting.\n\nThank you."};
 const a=await store.save({token:"test",spreadsheetId:"mockbook",job,contacts:[contact],fetcher:fake.fetcher});
 assert.equal(a.saved,1);assert.equal(a.updated,0);
 assert.equal(fake.state.tab.title,"Connections");
 assert.equal(fake.state.rows.length,1);
 assert.deepEqual(fake.state.headers,store.HEADER);
 assert.deepEqual(fake.state.rows[0].slice(0,8),[
  "ABC Wealth","Jane Smith","https://www.linkedin.com/in/jane-smith",
  contact.searchUrl,"Investment Analyst","Abhishek",19,job.url
 ]);
 const again=await store.save({token:"test",spreadsheetId:"mockbook",job,contacts:[contact],fetcher:fake.fetcher});
 assert.equal(again.saved,0);
 assert.equal(fake.state.rows.length,1);
 const view=await store.read({token:"test",spreadsheetId:"mockbook",job,fetcher:fake.fetcher});
 assert.equal(view.contacts.length,1);
 assert.equal(view.contacts[0].name,"Jane Smith");
 assert.ok(view.url.includes("gid=2299"));
 // Different candidate gets a different row for the same person, without touching Abhishek's row.
 await store.save({token:"test",spreadsheetId:"mockbook",job:{...job,candidate:"Pooja"},
   contacts:[contact],fetcher:fake.fetcher});
 assert.equal(fake.state.rows.length,2);
 assert.equal(fake.state.rows[1][5],"Pooja");
});
test("Unverified direct LinkedIn URLs are never persisted, and no extra tab is created when list empty",async()=>{
 const fake=fakeSheets();
 const job={source:"fresh",candidate:"Pooja",row:4,company:"Bank",role:"Adviser",url:"https://example.com/vacancy"};
 const x={name:"Jack Walker",title:"Manager",profileUrl:"https://www.linkedin.com/in/unverified",
  searchUrl:"https://www.linkedin.com/search/results/people/?keywords=Jack%20Walker",
  evidence:"Public role listed",verification:"Direct profile not verified",message:"Hi Jack"};
 assert.equal(store.normalizeContact(job,x).cells[2],"");
 const empty=await store.save({token:"x",spreadsheetId:"mockbook",job,contacts:[],fetcher:fake.fetcher});
 assert.equal(empty.saved,0);assert.equal(fake.state.tab,null);
 await store.save({token:"x",spreadsheetId:"mockbook",job,contacts:[x],fetcher:fake.fetcher});
 assert.equal(fake.state.rows[0][2],"");
 const result=await store.read({token:"x",spreadsheetId:"mockbook",job,fetcher:fake.fetcher});
 assert.equal(result.contacts[0].profileUrl,null);
});
test("Malformed jobs and read-only mode block writes",async()=>{
 const fake=fakeSheets();
 const job={source:"fresh",candidate:"Abhishek",row:3,company:"A",role:"B",url:"https://example.org"};
 await assert.rejects(store.save({token:"x",spreadsheetId:"mockbook",job,contacts:[{}],readOnly:true,fetcher:fake.fetcher}),/Read-only/);
 await assert.rejects(store.save({token:"x",spreadsheetId:"mockbook",job:{...job,source:"taaza"},contacts:[{}],fetcher:fake.fetcher}),/Invalid/);
 assert.equal(fake.state.requests.length,0);
});


test("Previously saved full-name BDO contacts appear only for matching candidate, row and vacancy",async()=>{
 const fake=fakeSheets();
 const vacancy="https://bdoireland.pinpointhq.com/en/postings/391e7aaf-2db7-45e7-b7e9-9fbc3963f994";
 const job={source:"fresh",candidate:"Abhishek",row:68,company:"BDO",
   role:"International Corporate Tax Opportunities - Register Your Interest",url:vacancy};
 fake.state.tab={sheetId:2299,title:"Connections",gridProperties:{rowCount:1000,columnCount:12}};
 fake.state.headers=[...store.HEADER];
 fake.state.rows=[
   ["BDO","Kevin Doyle","","https://www.linkedin.com/search/results/people/?keywords=Kevin",
     job.role,"Abhishek Nair","68",vacancy,"Partner, International Tax","Firm source","Hi","2026-10-16"],
   ["BDO","Pooja Contact","","https://www.linkedin.com/search/results/people/?keywords=Pooja",
     job.role,"Pooja Tirupati","68",vacancy,"Tax Director","Firm source","Hi","2026-10-16"],
   ["BDO","Another row","","https://www.linkedin.com/search/results/people/?keywords=Other",
     job.role,"Abhishek Nair","69",vacancy,"Tax Director","Firm source","Hi","2026-10-16"],
   ["Elsewhere","Not BDO","","https://www.linkedin.com/search/results/people/?keywords=Other",
     job.role,"Abhishek Nair","68",vacancy,"Tax Director","Firm source","Hi","2026-10-16"],
 ];
 const view=await store.read({token:"x",spreadsheetId:"mockbook",job,fetcher:fake.fetcher});
 assert.deepEqual(view.contacts.map(c=>c.name),["Kevin Doyle"]);
 assert.equal(store.identity("Abhishek Nair",68,vacancy,"Kevin Doyle"),
              store.identity("Abhishek",68,vacancy,"Kevin Doyle"));
});
