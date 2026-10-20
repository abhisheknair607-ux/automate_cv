"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,"Social frontend JS must be available");
function harness(){
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{id,style:{},value:"",innerHTML:"",textContent:"",classList:{add(){},remove(){},toggle(){}},addEventListener(){},focus(){},setSelectionRange(){}});
  return nodes.get(id);
 };
 class Provider{addScope(){}setCustomParameters(){}}
 const u={email:"abhisheknair607@gmail.com",uid:"owner"};
 const a={currentUser:u,signInWithPopup:async()=>({user:u,credential:{accessToken:"test"}})};
 const f=()=>a;f.GoogleAuthProvider=Provider;Provider.credentialFromResult=r=>r.credential;
 const ctx=vm.createContext({window:{firebase:{apps:[{}],auth:f},__cvStandalone:{requestSpecial:async(endpoint,arg)=>({candidate:arg.candidate,readOnly:true,items:[],templates:[]})}},document:{getElementById:node,addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},navigator:{},setTimeout,clearTimeout,confirm:()=>true,prompt:()=>"",console});
 new vm.Script(script,{filename:"social.html"}).runInContext(ctx);
 return {run:code=>vm.runInContext(code,ctx),node};
}
const person=JSON.stringify({name:"Jane Example",company:"EY",title:"Senior Consultant",key:"0123456789abcdef01234567",profile:"",message:"Hi Jane, old opening.\nOne verified role detail.\nOld ending.",relation:{status:"identified",department:"Deals",city:"Dublin"},introduction:"Hi Jane, old opening.",personalisedMiddle:"One verified role detail.",closing:"Old ending."});
test("Editing a master template changes existing unsent Swipe preview without editing saved Connections K",()=>{
 const h=harness();
 h.run("state.candidate='Abhishek';state.view='swipe';state.readOnly=false");
 h.run("state.templates={Deals:{department:'Deals',introduction:'Hello {{first_name}}, new introduction.',closing:'New closing.'}}");
 h.run("state.items=["+person+"];render()");
 const msg=h.run("invitationPreview(state.items[0]).text");
 assert.match(msg,/Hello Jane, new introduction/);
 assert.match(msg,/One verified role detail/);
 assert.match(msg,/New closing/);
 assert.doesNotMatch(msg,/old opening|Old ending/);
 assert.equal(h.run("state.items[0].message"),"Hi Jane, old opening.\nOne verified role detail.\nOld ending.");
 const markup=h.node("app").innerHTML;
 assert.match(markup,/id="swipeInvitationText"/);
 assert.match(markup,/Current master introduction/);
 assert.match(markup,/K preserved/);
 assert.match(markup,/Copy invitation/);
 assert.match(markup,/aria-label="Invitation character count"/);
 assert.match(markup,/\d+ \/ 300/);
});
test("Legacy records preview master but sent invitations remain unchanged",()=>{
 const h=harness();
 h.run("state.candidate='Abhishek';state.templates={Deals:{introduction:'NEW INTRO',closing:'NEW CLOSE'}}");
 h.run("state.items=["+person+"]");
 h.run("state.items[0].message='One old unstructured invitation.';state.items[0].introduction='';state.items[0].personalisedMiddle='';state.items[0].closing=''");
 assert.equal(h.run("invitationPreview(state.items[0]).kind"),"legacy");
 assert.match(h.run("invitationPreview(state.items[0]).text"),/NEW INTRO/);
 assert.match(h.run("invitationPreview(state.items[0]).text"),/NEW CLOSE/);
 h.run("state.items[0].message='Hi Jane, old opening.\\nPersonalised proof.\\nOld ending.';state.items[0].relation.status='sent'");
 assert.equal(h.run("invitationPreview(state.items[0]).kind"),"sent");
 assert.equal(h.run("invitationPreview(state.items[0]).text"),"Hi Jane, old opening.\nPersonalised proof.\nOld ending.");
});
test("300-character counter reflects composed invitation and prevents oversize copy",()=>{
 const h=harness();
 h.run("state.candidate='Abhishek';state.view='swipe';state.readOnly=false");
 h.run("state.templates={Deals:{introduction:'A'.repeat(295),closing:'B'.repeat(40)}}");
 h.run("state.items=["+person+"];render()");
 const count=h.run("invitationCount(state.items[0])");
 assert.equal(count.withinLimit,false);
 assert.ok(count.length>300);
 const markup=h.node("app").innerHTML;
 assert.match(markup,/swipe-count over/);
 assert.match(markup,/Over limit/);
 assert.match(markup,/disabled title="Invitation exceeds 300 characters"/);
 h.run("state.templates.Deals={introduction:'Hello Jane',closing:'Regards'};render()");
 assert.equal(h.run("invitationCount(state.items[0]).withinLimit"),true);
 assert.doesNotMatch(h.node("app").innerHTML,/disabled title="Invitation exceeds 300 characters"/);
});
test("Compact Swipe layout uses symmetrical tools and actions, preserving prompt and status controls",()=>{
 const h=harness();
 h.run("state.candidate='Abhishek';state.view='swipe';state.readOnly=false;state.items=["+person+"];render()");
 const markup=h.node("app").innerHTML;
 for(const id of ["personalisationOpen","editTemplate","later","undo","sent","swipeInvitationText"])assert.match(markup,new RegExp('id="'+id+'"'));
 assert.match(markup,/class="swipe-tool-grid"/);
 assert.match(markup,/class="swipe-actions"/);
 const css=html.slice(html.lastIndexOf("/* Social-only Swipe card"),html.indexOf("</style>"));
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/min-height:0/);
 const copy=h.run("makeMessage(state.items[0])");
 assert.match(copy,/Hi Jane,/);
});
