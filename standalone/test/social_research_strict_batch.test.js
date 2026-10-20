"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.resolve(__dirname,"../social.html"),"utf8");
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function testUI(handler){
 const nodes=new Map(),events={};
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{id,innerHTML:"",value:"",style:{},files:[],disabled:false,
   classList:{add(){},toggle(){},remove(){}},focus(){},setAttribute(){},
   showModal(){this.open=true},close(){this.open=false},addEventListener(){}});
  return nodes.get(id);
 };
 class Provider{addScope(){}setCustomParameters(){}}
 Provider.credentialFromResult=result=>result.credential;
 const user={uid:"owner",email:"abhisheknair607@gmail.com"};
 const auth={currentUser:user,signInWithPopup:async()=>({user,credential:{accessToken:"owner-drive-token-test-123456"}})};
 const firebaseAuth=()=>auth;firebaseAuth.GoogleAuthProvider=Provider;
 const context=vm.createContext({
  window:{firebase:{apps:[{}],auth:firebaseAuth},isSecureContext:false,__cvStandalone:{requestSpecial:handler}},
  document:{getElementById:get,addEventListener:(n,fn)=>{events[n]=fn},readyState:"complete"},
  navigator:{},localStorage:{getItem(){return null},setItem(){}},
  confirm:()=>true,prompt:()=>"",setTimeout,clearTimeout,console,
 });
 class Reader{readAsDataURL(file){this.result="data:"+file.type+";base64,ZmFrZUJ5dGVz";this.onload()}}
 context.FileReader=Reader;
 new vm.Script(script).runInContext(context);
 return {get,events,context,run:code=>vm.runInContext(code,context)};
}
const common=async(method,arg)=>{
 if(method==="social/data")return {candidate:arg.candidate,readOnly:false,items:[]};
 if(method==="social/targets/list")return {targets:[],companies:["EY"],departments:["Deals"]};
 if(method==="social/inbox/list")return {files:[]};
 if(method==="social/conversations/list")return {items:[]};
 return {candidate:arg.candidate,templates:[],items:[]};
};
test("Research dropdown catalog does not modify dashboard filtering and location popup is free text",async()=>{
 const h=testUI(common);
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchCompany="EY";state.researchDepartment="Deals";render()');
 const markup=h.get("app").innerHTML;
 assert.match(markup,/<select id="targetCompany"/);
 assert.match(markup,/<select id="targetDepartment"/);
 assert.match(markup,/id="researchAddCompany"/);
 assert.match(markup,/id="researchAddDepartment"/);
 assert.match(markup,/id="researchLocationOpen"/);
 assert.match(markup,/aria-label="Change city or country/);
 assert.match(markup,/id="initialScreenshot"[^>]*multiple/);
 h.get("researchLocationValue").value="Berlin, Germany";
 h.run("saveResearchLocation()");
 assert.equal(h.get("targetCity").value,"Berlin, Germany");
 assert.match(h.get("researchNow").href||h.run("selectedResearchUrl()"),/Berlin/);
 assert.equal(h.run("state.company"),"");
 assert.equal(h.run("state.department"),"");
});
test("Adding company and department writes candidate-scoped catalog, not Contacts",async()=>{
 const changes=[];
 const h=testUI(async(method,arg)=>{
  if(method==="social/targets/save"){
   changes.push(arg);
   return {saved:true,kind:arg.catalogKind,name:arg.catalogName};
  }
  if(method==="social/targets/list")return {targets:[],companies:["EY","BlackRock"],departments:["Deals","Private Credit"]};
  return common(method,arg);
 });
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";render();openResearchOption("company")');
 h.get("researchOptionName").value="BlackRock";
 await h.run("saveResearchOption()");
 h.run('openResearchOption("department")');
 h.get("researchOptionName").value="Private Credit";
 await h.run("saveResearchOption()");
 assert.equal(changes.length,2);
 assert.deepEqual(changes.map(x=>x.catalogKind),["company","department"]);
 assert.deepEqual(changes.map(x=>x.candidate),["Abhishek","Abhishek"]);
 assert.equal(h.run("state.researchCompany"),"BlackRock");
 assert.equal(h.run("state.researchDepartment"),"Private Credit");
 assert.equal(h.run("state.items.length"),0);
});
test("Multi screenshot upload gives per-image progress; failed-only retry never duplicates a saved file",async()=>{
 let calls=[];
 const h=testUI(async(method,arg)=>{
  if(method==="social/inbox/image"){
   calls.push(arg);
   if(calls.length===2)throw Error("Drive temporarily unavailable");
   return {saved:true,file:{id:"drive-"+calls.length,name:"NEW_a_"+calls.length+".png"}};
  }
  return common(method,arg);
 });
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";state.researchCompany="EY";state.researchDepartment="Deals";render()');
 h.get("targetCompany").value="EY";h.get("targetDepartment").value="Deals";h.get("targetCity").value="Dublin";
 const f=(name)=>({name,type:"image/png",size:1200});
 h.get("initialScreenshot").files=[f("first.png"),f("second.png"),f("third.png")];
 await h.run("saveInitialResearchImage()");
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.candidate==="Abhishek"&&c.company==="EY"&&c.department==="Deals"));
 assert.equal(h.run('state.photoResults.filter(x=>x.status==="saved").length'),2);
 assert.equal(h.run("state.photoFailures.length"),1);
 assert.match(h.get("app").innerHTML,/Retry 1 failed/);
 await h.run("retryResearchPhotos()");
 assert.equal(calls.length,4,"Only previously failed item is retried");
 assert.equal(h.run("state.photoFailures.length"),0);
 assert.equal(h.run("state.photoResults[0].fileName"),"second.png");
 assert.match(h.get("app").innerHTML,/Saved NEW/);
});
test("Batch rejects 11 items and oversize images before any upload",async()=>{
 const calls=[];const h=testUI(async(method,arg)=>{
  if(method==="social/inbox/image")calls.push(arg);
  return common(method,arg);
 });
 await new Promise(resolve=>setImmediate(resolve));
 h.run('state.view="inbox";render()');
 h.get("targetCompany").value="EY";h.get("targetDepartment").value="Deals";
 const f=(i)=>({name:"file-"+i+".png",type:"image/png",size:200});
 h.get("initialScreenshot").files=Array.from({length:11},(_,i)=>f(i));
 await h.run("saveInitialResearchImage()");
 assert.equal(calls.length,0);
 h.get("initialScreenshot").files=[{...f(1),size:3*1024*1024+1}];
 await h.run("saveInitialResearchImage()");
 assert.equal(calls.length,0);
});
