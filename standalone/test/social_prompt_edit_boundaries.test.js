"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function mock(){
 const m=new Map();const get=id=>{
  if(!m.has(id))m.set(id,{value:"",innerHTML:"",style:{},files:[],classList:{add(){},remove(){},toggle(){}},focus(){},setSelectionRange(){},showModal(){this.open=true},close(){this.open=false}});
  return m.get(id);
 };
 class P{addScope(){}setCustomParameters(){}}
 const u={email:"abhisheknair607@gmail.com",uid:"1"},a={currentUser:u,signInWithPopup:async()=>({user:u,credential:{accessToken:"test"}})};
 const f=()=>a;f.GoogleAuthProvider=P;P.credentialFromResult=r=>r.credential;
 const ctx=vm.createContext({window:{firebase:{apps:[{}],auth:f},__cvStandalone:{requestSpecial:async()=>({readOnly:false,candidate:"Abhishek",items:[]})}},document:{getElementById:get,addEventListener(){}},navigator:{},localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,console,confirm:()=>true,prompt:()=>""});
 new vm.Script(script).runInContext(ctx);
 return {run:c=>vm.runInContext(c,ctx),get};
}
test("Swipe has the notepad after Add, but dashboard headings remain unchanged",()=>{
 const h=mock();
 const bar=h.run('heading("Discover & swipe",true)');
 assert.match(bar,/id="personalisationOpen"/);
 assert.ok(bar.indexOf('id="refresh"')<bar.indexOf('id="addContact"'));
 assert.ok(bar.indexOf('id="addContact"')<bar.indexOf('id="personalisationOpen"'));
 assert.doesNotMatch(h.run('heading("Networking")'),/personalisationOpen/);
 assert.match(html,/id="personalisationDialog"/);
 assert.match(html,/id="personalisationInstructions"/);
 assert.match(html,/id="copyPersonalisationPrompt"/);
});
test("New line-edit prompt is strictly scoped to one candidate Connections N cell",()=>{
 const h=mock();
 const prompt=h.run('personalisationEditPrompt({name:"Jane Example",company:"EY",title:"Director",sheetRow:42},"Please make the middle line less formal.")');
 for(const expected of [
  "1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc",
  "Connections!N42","Abhishek Nair",
  "Jane Example","EY","column F",
  "Research public internet sources",
  "Please make the middle line less formal",
  "ASK for my explicit approval",
  "Never edit Connections A:M or O",
  "<=300 characters"
 ])assert.ok(prompt.includes(expected),"Expected constraint missing: "+expected);
 assert.ok(!prompt.includes("Pooja Krishna Tirupati (Connections column F)"));
 h.run('state.candidate="Pooja"');
 const other=h.run('personalisationEditPrompt({name:"Jane Example",company:"EY",title:"Director",sheetRow:52},"")');
 assert.match(other,/Pooja Krishna Tirupati/);
 assert.match(other,/Connections!N52/);
 assert.match(other,/DO NOT MODIFY ANY CELL UNTIL I DO/);
});
test("Research source import prompt explicitly restricts columns and requires verified read-back",()=>{
 const h=mock();
 const prompt=h.run("researchPrompt()");
 for(const expected of ["Connections A:O only for NEW","J Evidence/source URLs","K composed","SocialTracking tab: append NEW rows in A:K","SocialTemplates (A:E)","SocialFollowups (A:K)","READ-ONLY","read back the edited cells"])assert.ok(prompt.includes(expected),"Missing: "+expected);
});
test("Follow-up prompt defaults to no writes, or one approved SocialFollowups H cell",()=>{
 const h=mock(),prompt=h.run('conversationResearchPrompt({contact:"Jane",company:"EY",id:"abcdef",driveUrl:"https://drive.google.com/file/d/test/view"})');
 for(const expected of ["SocialFollowups","H Draft Reply","DEFAULT: NO SHEET WRITES","ONLY GPT-editable cell","Connections (A:O, including M=Invitation Introduction","SocialTracking (A:K)","I:K are READ-ONLY"])assert.ok(prompt.includes(expected),"Missing: "+expected);
 assert.match(prompt,/manually send/);
});
