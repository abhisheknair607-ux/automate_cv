"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const store=require("../social_store");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
const headings=[...store.CONTACT_HEADERS,...store.COMPONENT_HEADERS];
function ui(){
 const nodes=new Map(),get=id=>{
  if(!nodes.has(id))nodes.set(id,{value:"",innerHTML:"",style:{},textContent:"",disabled:false,
  classList:{toggle(){}},showModal(){},close(){},focus(){}});
  return nodes.get(id);
 };
 const ctx=vm.createContext({window:{firebase:{apps:[{}],auth:()=>({currentUser:null})},__cvStandalone:{requestSpecial:async()=>({})}},document:{getElementById:get,addEventListener(){}},navigator:{},localStorage:{getItem(){return null}},setTimeout,clearTimeout,console});
 new vm.Script(inline).runInContext(ctx);
 return {run:code=>vm.runInContext(code,ctx),get};
}
test("Whitespace in introduction and between components survives template replacement and rendering",()=>{
 const intro="Hi Angela, \n\nI'm an ACCA Test with an MSc in Finance from UCD.";
 assert.equal(store.composeInvitation(intro,"Verified middle.","Thank you."),
  "Hi Angela, \n\nI'm an ACCA Test with an MSc in Finance from UCD.\n\nVerified middle.\n\nThank you.");
 const h=ui();
 const actual=h.run('composeInvitationParts("Hi Angela, \\n\\nI am testing.", "Personal detail.", "Thank you.")');
 assert.equal(actual,"Hi Angela, \n\nI am testing.\n\nPersonal detail.\n\nThank you.");
 assert.match(html,/white-space:pre-wrap/);
});
test("Legacy contact previews newest master without inventing a middle from K",()=>{
 const h=ui();
 h.run('state.candidate="Abhishek";state.templates={General:{introduction:"Hi {{first_name}}, \\n\\nI am an ACCA Test.",closing:"Thanks for connecting."}}');
 h.run('state.items=[{key:"legacy",sheetRow:2,name:"Angela Fleming",company:"BDO",title:"Partner",message:"Hello Angela, ACCA member and BDO tax opportunities.",relation:{status:"identified",department:"Uncategorised"}}]');
 const preview=h.run("invitationPreview(state.items[0])");
 assert.equal(preview.kind,"legacy");
 assert.equal(preview.text,"Hi Angela, \n\nI am an ACCA Test.\n\nThanks for connecting.");
 assert.doesNotMatch(preview.text,/ACCA member/);
 assert.equal(h.run("state.items[0].message"),"Hello Angela, ACCA member and BDO tax opportunities.");
});
function fakeSheets(){
 const before=["BDO","Angela Fleming","","","Networking","Abhishek Nair","","","Partner","", "Old combined paragraph with personal detail.","2026-10-16","","",""];
 const rows=[headings.slice(),before.slice()],writes=[];
 const fetch=async(raw,options={})=>{
  const url=decodeURIComponent(String(raw)),method=options.method||"GET";
  const ok=obj=>({ok:true,status:200,json:async()=>obj});
  if(!url.includes("/values/"))return {ok:false,status:400,json:async()=>({})};
  if(method==="PUT"){
   writes.push({url,data:JSON.parse(options.body)});
   if(!url.includes("'Connections'!M2:O2"))return {ok:false,status:400,json:async()=>({})};
   const cols=JSON.parse(options.body).values[0];rows[1].splice(12,3,...cols);return ok({});
  }
  if(url.includes("'Connections'!A1:O"))return ok({values:rows});
  if(url.includes("'Connections'!M1:O1"))return ok({values:[rows[0].slice(12,15)]});
  if(url.includes("'Connections'!A2:O2"))return ok({values:[rows[1]]});
  return ok({values:[]});
 };
 return {fetch,rows,writes};
}
test("Reviewed migration updates ONLY M2:O2; preserves K and candidate, and rejects duplicates/stale updates",async()=>{
 const original=global.fetch,d=fakeSheets();global.fetch=d.fetch;
 try{
  const p={token:"example",id:"sheet",candidate:"Abhishek",contactRow:2,company:"BDO",name:"Angela Fleming",
   previousMessage:d.rows[1][10],introduction:"Hi Angela, \n\nI am an ACCA Test.",
   middle:"Your financial services work is interesting.",closing:"Thanks.",confirm:true};
  const result=await store.migrateLegacyInvitation(p);
  assert.equal(result.saved,true);
  assert.equal(result.originalMessagePreserved,true);
  assert.equal(d.writes.length,1);
  assert.match(d.writes[0].url,/M2:O2/);
  assert.equal(d.rows[1][10],"Old combined paragraph with personal detail.");
  assert.deepEqual(d.rows[1].slice(12,15),[p.introduction,p.middle,p.closing]);
  await assert.rejects(store.migrateLegacyInvitation(p),/already structured/);
  await assert.rejects(store.migrateLegacyInvitation({...p,name:"Another Person"}),/identity or candidate changed/);
  await assert.rejects(store.migrateLegacyInvitation({...p,candidate:"Pooja"}),/identity or candidate changed/);
  assert.equal(d.writes.length,1);
 }finally{global.fetch=original;}
});
test("Migration rejects missing approval, unsafe components or stale K without writes",async()=>{
 const original=global.fetch,d=fakeSheets();global.fetch=d.fetch;
 try{
  const p={token:"example",id:"sheet",candidate:"Abhishek",contactRow:2,company:"BDO",name:"Angela Fleming",
   previousMessage:d.rows[1][10],introduction:"Hi Angela.",middle:"Middle.",closing:"Thank you.",confirm:true};
  await assert.rejects(store.migrateLegacyInvitation({...p,confirm:false}),/confirm/i);
  await assert.rejects(store.migrateLegacyInvitation({...p,previousMessage:"stale"}),/Original invitation changed/);
  await assert.rejects(store.migrateLegacyInvitation({...p,middle:"x".repeat(280)}),/260 characters/);
  await assert.rejects(store.migrateLegacyInvitation({...p,introduction:"=IMPORTXML"}),/formula/);
  assert.equal(d.writes.length,0);
 }finally{global.fetch=original;}
});
test("Legacy review displays old K, master M/O and editable N, with explicit server confirmation",()=>{
 assert.match(html,/id="reviewLegacyInvitation"/);
 assert.match(html,/id="legacyInvitationOriginal" readonly/);
 assert.match(html,/id="legacyInvitationIntro" readonly/);
 assert.match(html,/id="legacyInvitationMiddle"/);
 assert.match(html,/id="legacyInvitationClosing" readonly/);
 assert.match(html,/request\("invitation\/migrate"/);
 assert.match(html,/original K message stays unchanged/i);
 assert.match(html,/Review the legacy personalised line first/);
});