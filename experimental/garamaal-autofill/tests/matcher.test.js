const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {suggest,eligible}=require("../extension/matcher.js");
const {facts,validate}=require("../extension/reasoner.js");
const {answer,validRequest}=require("../server/ai.js");
const profile=require("../examples/sample-profile.json");
const f=(label,type="text",extra={})=>({id:"x",label,type,hasValue:false,...extra});
test("known facts fill, existing values stay untouched",()=>{
  assert.equal(suggest(f("First Name"),profile).value,"Alex");
  assert.equal(suggest(f("Email Address","email"),profile).value,"alex@example.com");
  assert.equal(suggest(f("First Name","text",{hasValue:true}),profile),null);
});
test("consequential and unknown questions stay blank",()=>{
  for(const label of ["Salary Expectation","Visa sponsorship","Passport Number",
    "Security Email","Reference First Name","Date of Birth",
    "Do you have relatives employed here?","Conflict of interest declaration",
    "Criminal convictions","Disability status"]){
    assert.equal(eligible(f(label,"select")),false,label);
    assert.equal(suggest(f(label),profile),null,label);
  }
  assert.equal(suggest(f("Have you used forecasting software?","select"),profile),null);
});
test("AI response requires supplied evidence and exact option",()=>{
  const p={...profile,skills:["Financial modelling"],work:[{title:"Analyst",employer:"Fictional Ltd",
    achievements:["Built financial forecasts for three business units"]}]};
  const field=f("Do you have experience with budgeting and forecasting?","radio",{
    options:[{label:"Yes",value:"Y"},{label:"No",value:"N"}]});
  const supplied=facts(p,field);
  assert.ok(supplied.some(x=>x.text.includes("forecasts")));
  assert.equal(validate(field,{fieldId:"x",answer:"Y",evidenceIds:[supplied[0].id]},supplied).value,"Y");
  assert.equal(validate(field,{fieldId:"x",answer:"Yes",evidenceIds:[supplied[0].id]},supplied),null);
  assert.equal(validate(field,{fieldId:"x",answer:"Y",evidenceIds:["invented"]},supplied),null);
  assert.equal(validate(field,{fieldId:"x",answer:"Y",evidenceIds:[]},supplied),null);
  assert.equal(validate({...field,hasValue:true},{fieldId:"x",answer:"Y",evidenceIds:[supplied[0].id]},supplied),null);
});
test("AI request validation and model response parsing",async()=>{
  const data={fields:[{id:"x",label:"Forecasting experience",facts:[{id:"f0",text:"Built forecasts"}]}]};
  assert.equal(validRequest(data),true);
  assert.equal(validRequest({...data,fields:[{...data.fields[0],facts:[{id:"f0",text:"x".repeat(401)}]}]}),false);
  const response=await answer(data,async(_url,opts)=>{
    assert.equal(JSON.parse(opts.body).messages[0].role,"system");
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      answers:[{fieldId:"x",answer:"Yes",evidenceIds:["f0"]}]})}}]})};
  });
  assert.equal(response.answers[0].evidenceIds[0],"f0");
});
test("DOM writer never touches actions or existing input",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const events=[];
  const input={tagName:"INPUT",type:"text",value:"",disabled:false,readOnly:false,
    getAttribute:()=> "gm-autofill-0",dispatchEvent:e=>events.push(e.type)};
  const status={textContent:""};
  const stub={addEventListener(){},replaceChildren(){}};
  const document={querySelector:s=>s==="#status"?status:stub,
    querySelectorAll:()=>[input]};
  const context={document,chrome:{storage:{local:{get(){}}}},Event:class{constructor(type){this.type=type}},
    HTMLInputElement:function(){},HTMLTextAreaElement:function(){},HTMLSelectElement:function(){}};
  vm.runInNewContext(source+"\nglobalThis.__fillForm=fillForm;",context);
  assert.equal(context.__fillForm([{id:"gm-autofill-0",fieldType:"text",value:"Alex"}])[0],true);
  assert.equal(input.value,"Alex");
  assert.deepEqual(events,["input","change"]);
  assert.equal(context.__fillForm([{id:"gm-autofill-0",fieldType:"text",value:"Other"}])[0],false);
  input.type="submit";input.value="";
  assert.equal(context.__fillForm([{id:"gm-autofill-0",fieldType:"text",value:"Other"}])[0],false);
});
test("AI cannot infer No from missing evidence",()=>{
  const field=f("Have you built forecasts?","select",{options:[{label:"Yes",value:"Y"},{label:"No",value:"N"}]});
  const supplied=[{id:"f0",text:"Financial modelling"}];
  assert.equal(validate(field,{fieldId:"x",answer:"N",evidenceIds:["f0"]},supplied),null);
});
test("native dropdowns and radio groups use exact profile-backed options",()=>{
  assert.equal(suggest(f("Country of residence","select",{options:[
    {label:"Choose a country",value:""},{label:"United Kingdom",value:"GB"},
    {label:"Ireland",value:"IE"}]}),profile).value,"IE");
  assert.equal(suggest(f("Country of residence","radio",{options:[
    {label:"United Kingdom",value:"GB"},{label:"Ireland",value:"IE"}]}),profile).value,"IE");
  assert.equal(suggest(f("University","select",{options:[
    {label:"Select university",value:""},{label:"Example University",value:"example-u"}]}),profile).value,"example-u");
  assert.equal(suggest(f("University","select",{options:[
    {label:"Example University",value:"example-u",disabled:true}]}),profile),null);
  assert.equal(suggest(f("Country of residence","select",{hasValue:true,
    options:[{label:"Ireland",value:"IE"}]}),profile),null);
});
test("birth date fills only from an explicit valid profile date",()=>{
  const dob={...profile,basics:{...profile.basics,dateOfBirth:"1994-04-12"}};
  const byLabel=(label,type,options)=>suggest(f(label,type,{options}),dob)?.value;
  assert.equal(byLabel("Date of birth","date"),"1994-04-12");
  assert.equal(byLabel("Birth day","select",[{label:"12",value:"12"}]),"12");
  assert.equal(byLabel("Birth month","select",[{label:"April",value:"04"}]),"04");
  assert.equal(byLabel("Birth year","select",[{label:"1994",value:"1994"}]),"1994");
  assert.equal(byLabel("Birth year","number"),"1994");
  assert.equal(byLabel("Date of birth","text"),undefined,"unknown text format stays manual");
  assert.equal(suggest(f("Date of birth","date"),{basics:{}}),null);
  assert.equal(suggest(f("Date of birth","date"),{basics:{dateOfBirth:"1994-02-31"}}),null);
  assert.equal(suggest(f("Date of birth","date",{hasValue:true}),dob),null);
});
test("DOM writer updates date, select and radio without protected clicks",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const calls=[];
  const make=(tagName,type,id)=>({
    tagName,type,value:"",disabled:false,readOnly:false,checked:false,
    getAttribute:()=>id,dispatchEvent:e=>calls.push(type+":"+e.type)
  });
  const date=make("INPUT","date","gm-autofill-0");
  const select=make("SELECT","select-one","gm-autofill-1");
  select.options=[{value:"",textContent:"Choose"},{value:"IE",textContent:"Ireland",disabled:false}];
  Object.defineProperty(select,"selectedOptions",{get(){return [select.options.find(o=>o.value===select.value)]}});
  const radio=make("INPUT","radio","gm-autofill-2");radio.value="IE";
  const stub={addEventListener(){},replaceChildren(){}};
  const context={document:{querySelector:()=>stub,querySelectorAll:()=>[date,select,radio]},
    chrome:{storage:{local:{get(){}}}},Event:class{constructor(type){this.type=type}},
    HTMLInputElement:function(){},HTMLTextAreaElement:function(){},HTMLSelectElement:function(){}};
  vm.runInNewContext(source+"\nglobalThis.__fillForm=fillForm;",context);
  const result=context.__fillForm([
    {id:"gm-autofill-0",fieldType:"date",value:"1994-04-12"},
    {id:"gm-autofill-1",fieldType:"select",value:"IE"},
    {id:"gm-autofill-2",fieldType:"radio",value:"IE"}]);
  assert.deepEqual([...result],[true,true,true]);
  assert.equal(date.value,"1994-04-12");
  assert.equal(select.value,"IE");
  assert.equal(radio.checked,true);
  assert.equal(calls.length,6);
});
test("autocomplete can identify unusual labels but cannot override a conflicting label",()=>{
  assert.equal(suggest(f("Applicant","text",{autocomplete:"given-name"}),profile).value,"Alex");
  assert.equal(suggest(f("Last Name","text",{autocomplete:"given-name"}),profile),null);
});
test("scanner reads live accessibility names and control metadata",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const stub={addEventListener(){},replaceChildren(){}};
  const input={tagName:"INPUT",type:"text",name:"candidateGiven",id:"candidate-given",
    value:"",disabled:false,readOnly:false,labels:[],
    getClientRects:()=>[{}],closest:()=>null,setAttribute(){},
    getAttribute:key=>({"aria-labelledby":"given-label",autocomplete:"given-name"}[key]||"")};
  const doc={querySelector:s=>s.startsWith("#")?stub:null,
    querySelectorAll:s=>s==="input,textarea,select"?[input]:[],
    getElementById:id=>id==="given-label"?{innerText:"Candidate given name"}:null};
  const context={document:doc,chrome:{storage:{local:{get(){}}}},
    getComputedStyle:()=>({visibility:"visible"})};
  vm.runInNewContext(source+"\nglobalThis.__scanForm=scanForm;",context);
  const result=context.__scanForm();
  assert.equal(result.fields.length,1);
  assert.match(result.fields[0].label,/Candidate given name/);
  assert.equal(result.fields[0].autocomplete,"given-name");
  assert.equal(result.unsupported.customDropdowns,0);
});
test("Inspect page reads field metadata without invoking the writer",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const handlers={},calls=[],status={textContent:""};
  const control=id=>({addEventListener:(_event,fn)=>{handlers[id]=fn},disabled:false});
  const inspect=control("inspect"),fill=control("fill");
  const review={replaceChildren(){},append(){}};
  const doc={querySelector:id=>({
    "#file":control("file"),"#status":status,"#review":review,
    "#fill":fill,"#inspect":inspect,"#source":control("source")
  })[id],createElement:()=>({append(){},textContent:"",className:""})};
  const context={document:doc,GaramaalMatcher:{eligible:()=>true},
    chrome:{storage:{local:{get(){}}},tabs:{query:async()=>[{id:1,url:"http://127.0.0.1:8765/"}]},
      scripting:{executeScript:async args=>{calls.push(args.func.name);
        return [{result:{fields:[{label:"Candidate name",type:"text",hasValue:false}],
          unsupported:{customDropdowns:1,checkboxes:2,fileInputs:0}}}]}}}};
  vm.runInNewContext(source,context);
  await handlers.inspect();
  assert.deepEqual(calls,["scanForm"]);
  assert.match(status.textContent,/Nothing changed/);
  assert.match(status.textContent,/1 custom dropdowns/);
});

test("connected answers still require evidence and exact enabled controls",()=>{
  const {validateRemote}=require("../extension/reasoner.js");
  const field=f("Country of residence","select",{options:[
    {label:"Ireland",value:"IE"},{label:"United Kingdom",value:"GB",disabled:true}]});
  assert.equal(validateRemote(field,{fieldId:"x",answer:"IE",evidenceIds:["e0"]}).value,"IE");
  assert.equal(validateRemote(field,{fieldId:"x",answer:"GB",evidenceIds:["e0"]}),null);
  assert.equal(validateRemote(field,{fieldId:"x",answer:"Ireland",evidenceIds:["e0"]}),null);
  assert.equal(validateRemote(field,{fieldId:"x",answer:"IE",evidenceIds:[]}),null);
  assert.equal(validateRemote(f("Salary expectation","text"),
    {fieldId:"x",answer:"100000",evidenceIds:["e0"]}),null);
});
test("Garamaal tab uses its saved profile and same-origin Firebase session",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const calls=[],stored=JSON.stringify({basics:{fullName:"Alex Example",address:"Local only"},equalEmployment:{disability:"Private"},preferences:{visa:"Private"}});
  const context={globalThis:null,
    firebase:{auth:()=>({currentUser:{getIdToken:async()=> "fictional-token"}})},
    localStorage:{getItem:key=>key==="gmv3-career-profile-local-v1:Abhishek"?stored:null},
    fetch:async(url,opts)=>{calls.push({url,opts});
      return {ok:true,json:async()=>url.endsWith("/candidate")?
        {candidate:"abhishek"}:{answers:[]}}}};
  context.globalThis=context;
  vm.runInNewContext(source.match(/async function askGaramaal\(payload\)\{[\s\S]*?\n\}/)[0]+
    "\nglobalThis.__ask=askGaramaal;",context);
  assert.deepEqual((await context.__ask({fields:[]})).answers,[]);
  assert.deepEqual(calls.map(x=>x.url),["/api/autofill/candidate","/api/autofill/answer"]);
  assert.equal(calls[1].opts.headers.Authorization,"Bearer fictional-token");
  const sent=JSON.parse(calls[1].opts.body).profile;
  assert.equal(sent.basics.fullName,"Alex Example");
  assert.equal(sent.basics.address,undefined);
  assert.equal(sent.equalEmployment,undefined);
  assert.equal(sent.preferences.visa,undefined);
  assert.equal(context.__ask.toString().includes("chrome.storage"),false);
});test("connected mode requests the signed-in app tab and fills only the active job tab",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const handlers={},calls=[],status={textContent:""};
  const control=id=>({value:id==="source"?"garamaal":"",disabled:false,
    addEventListener:(_event,fn)=>{handlers[id]=fn}});
  const controls={file:control("file"),source:control("source"),
    fill:control("fill"),inspect:control("inspect")};
  const review={replaceChildren(){},append(){}};
  const doc={querySelector:id=>({
    "#file":controls.file,"#source":controls.source,"#fill":controls.fill,
    "#inspect":controls.inspect,"#status":status,"#review":review
  })[id],createElement:()=>({textContent:"",className:"",append(){}})};
  const field={id:"gm-autofill-0",label:"Country of residence",type:"select",
    options:[{label:"Ireland",value:"IE"}],hasValue:false};
  const salary={id:"gm-autofill-1",label:"Salary expectation",type:"text",hasValue:false};
  const chrome={storage:{local:{get:(_keys,cb)=>cb({source:"garamaal"}),set:async()=>{}}},
    permissions:{request:async()=>true},
    tabs:{query:async q=>q.active?[{id:11,url:"https://jobs.example/apply"}]:
      [{id:22,url:"https://garamaal.web.app/prototype"}]},
    scripting:{executeScript:async args=>{
      calls.push({tabId:args.target.tabId,name:args.func.name,world:args.world});
      if(args.func.name==="scanForm")return [{result:{fields:[field,
        {id:"gm-autofill-2",label:"LinkedIn",type:"text",hasValue:false},salary],job:{}}}];
      if(args.world==="MAIN")return [{result:{answers:[
        {fieldId:field.id,answer:"IE",evidenceIds:["e0"]}]}}];
      return [{result:[true]}];
    }}};
  const context={document:doc,chrome,GaramaalMatcher:require("../extension/matcher.js"),
    GaramaalReasoner:require("../extension/reasoner.js")};
  vm.runInNewContext(source,context);
  await handlers.fill();
  assert.deepEqual(calls.map(x=>x.tabId),[11,11,22,11]);
  assert.equal(calls[2].world,"MAIN");
  assert.match(status.textContent,/1\/2 eligible fields filled/);
});

test("scanner prefers nearby labels over sample placeholders on a real-style form",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const stub={addEventListener(){},replaceChildren(){}};
  const make=(type,title,hint)=>{
    const label={innerText:title,getClientRects:()=>[{}],contains:()=>false};
    const input={tagName:"INPUT",type,labels:[],name:"",id:"",value:"",
      disabled:false,readOnly:false,getClientRects:()=>[{}],closest:()=>null,
      setAttribute(){},getAttribute:key=>key==="placeholder"?hint:""};
    input.parentElement={parentElement:null,querySelectorAll:key=>
      key==="label"?[label]:[input]};
    return input;
  };
  const inputs=[make("text","First Name *","John"),make("text","Last Name *","Doe"),
    make("email","Email *","john.doe@example.com"),
    make("tel","Phone *","+1 (123) 456-7890")];
  const doc={querySelector:s=>s.startsWith("#")?stub:null,
    getElementById:()=>null,
    querySelectorAll:s=>s==="input,textarea,select"?inputs:[]};
  const context={document:doc,chrome:{storage:{local:{get(){}}}},
    getComputedStyle:()=>({visibility:"visible"})};
  vm.runInNewContext(source+"\nglobalThis.__scanForm=scanForm;",context);
  const fields=context.__scanForm().fields;
  assert.deepEqual(Array.from(fields,x=>x.label.split(" | ")[0]),
    ["First Name","Last Name","Email","Phone"]);
  assert.deepEqual(Array.from(fields,x=>suggest(x,profile)?.value),
    ["Alex","Example","alex@example.com",profile.basics.phone]);
});
test("connected fill stops with a clear message when Garamaal access is denied",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const handlers={},status={textContent:""},control=id=>({value:id==="source"?"garamaal":"",
    disabled:false,addEventListener:(_event,fn)=>{handlers[id]=fn}});
  const nodes={"#file":control("file"),"#source":control("source"),
    "#fill":control("fill"),"#inspect":control("inspect"),
    "#status":status,"#review":{replaceChildren(){}}};
  const doc={querySelector:id=>nodes[id]};
  const chrome={storage:{local:{get:(_keys,cb)=>cb({source:"garamaal"})}},
    permissions:{request:async()=>false},
    tabs:{query:async()=>{throw Error("Tab should not be scanned")}}};
  vm.runInNewContext(source,{document:doc,chrome});
  await handlers.fill();
  assert.match(status.textContent,/Allow Garamaal site access/);
});

test("required single-choice selects only a real enabled option",()=>{
  const {singleRequiredChoice}=require("../extension/matcher.js");
  const options=[{label:"Select",value:"",disabled:false},
    {label:"EMEA",value:"emea",disabled:false}];
  const region=f("What Region are you applying to?","select",{required:true,options});
  assert.equal(singleRequiredChoice(region)?.value,"emea");
  assert.equal(singleRequiredChoice({...region,required:false}),null);
  assert.equal(singleRequiredChoice({...region,hasValue:true}),null);
  assert.equal(singleRequiredChoice({...region,label:"Visa sponsorship"}),null);
  assert.equal(singleRequiredChoice({...region,options:[...options,
    {label:"Americas",value:"americas",disabled:false}]}),null);
  assert.equal(singleRequiredChoice({...region,options:[options[0],
    {label:"EMEA",value:"emea",disabled:true}]}),null);
});

test("single-choice fill rescans dependent dropdowns after each selection",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const field=(id,label,value)=>({id,label,type:"select",required:true,hasValue:false,
    options:[{label:"Select",value:"",disabled:false},
      {label:value,value,disabled:false}]});
  const sequence=[field("gm-autofill-0","Region","EMEA"),
    field("gm-autofill-1","Program","Graduate"),
    field("gm-autofill-2","Position Preference - Year","2027")];
  let selected=0,scans=0;
  const chrome={storage:{local:{get(){}}},scripting:{executeScript:async ({func})=>{
    if(func.name==="scanForm"){
      scans++;
      return [{result:{fields:selected<sequence.length?[sequence[selected]]:[]}}];
    }
    if(func.name==="fillForm"){selected++;return [{result:[true]}];}
    throw Error("Unexpected injection");
  }}};
  const stub={addEventListener(){},replaceChildren(){}};
  const document={querySelector:()=>stub};
  const context={document,chrome,GaramaalMatcher:require("../extension/matcher.js"),
    setTimeout:fn=>fn()};
  vm.runInNewContext(source+"\nglobalThis.__fillChoices=fillSingleRequiredChoices;",context);
  const filled=await context.__fillChoices(11);
  assert.deepEqual(Array.from(filled,x=>x.displayValue),["EMEA","Graduate","2027"]);
  assert.equal(scans,4);
  assert.equal(selected,3);
});

test("toolbar action opens a persistent side panel without broad site access",()=>{
  const manifest=require("../extension/manifest.json");
  assert.equal(manifest.side_panel.default_path,"popup.html");
  assert.equal(manifest.action.default_popup,undefined);
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.equal(manifest.optional_host_permissions,undefined);
  assert.ok(manifest.host_permissions.includes("https://blackrock.tal.net/*"));
  assert.ok(manifest.host_permissions.includes("https://app.spott.io/*"));
  const worker=fs.readFileSync(require.resolve("../extension/background.js"),"utf8");
  assert.match(worker,/openPanelOnActionClick:true/);
});
test("scanner reads a required dropdown question from an adjacent table cell",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const stub={addEventListener(){},replaceChildren(){}};
  const cell={innerText:"What Region are you applying to? *",
    getClientRects:()=>[{}],contains:()=>false};
  const select={tagName:"SELECT",labels:[],name:"",id:"",required:false,
    disabled:false,readOnly:false,options:[
      {value:"",textContent:"Select",disabled:false},
      {value:"EMEA",textContent:"EMEA",disabled:false}],
    selectedOptions:[{value:"",textContent:"Select"}],
    getClientRects:()=>[{}],setAttribute(){},getAttribute:()=>"",
    closest:key=>key==="tr"?row:null,parentElement:null};
  const row={querySelectorAll:key=>key==="th,td"?[cell]:[select]};
  const doc={querySelector:key=>key.startsWith("#")?stub:null,
    getElementById:()=>null,
    querySelectorAll:key=>key==="input,textarea,select"?[select]:[]};
  const context={document:doc,chrome:{storage:{local:{get(){}}}},
    getComputedStyle:()=>({visibility:"visible"})};
  vm.runInNewContext(source+"\nglobalThis.__scanForm=scanForm;",context);
  const [field]=context.__scanForm().fields;
  assert.equal(field.label,"What Region are you applying to?");
  assert.equal(field.required,true);
  assert.equal(require("../extension/matcher.js").singleRequiredChoice(field)?.value,"EMEA");
});
test("side panel explains when a job tab URL is withheld",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const handlers={},status={textContent:""};
  const control=id=>({value:id==="source"?"garamaal":"",
    disabled:false,addEventListener:(_event,fn)=>{handlers[id]=fn}});
  const nodes={"#file":control("file"),"#source":control("source"),
    "#fill":control("fill"),"#inspect":control("inspect"),
    "#status":status,"#review":{replaceChildren(){}}};
  const chrome={storage:{local:{get:(_keys,cb)=>cb({source:"garamaal"})}},
    tabs:{query:async()=>[{id:11}]}};
  vm.runInNewContext(source,{document:{querySelector:id=>nodes[id]},chrome});
  await handlers.inspect();
  assert.match(status.textContent,/No access to this job page/);
});
test("Next clicks one clear control and never a Submit control",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const fn=source.match(/function clickNext\(\)\{[\s\S]*?\n\}/)[0];
  const make=(text,tagName="BUTTON")=>({tagName,innerText:text,
    getClientRects:()=>[{}],getAttribute:()=>null,disabled:false,
    clicks:0,click(){this.clicks++}});
  const next=make("Save and Continue"),submit=make("Submit Application");
  const buttons=[next,submit];
  const context={document:{querySelectorAll:()=>buttons},
    getComputedStyle:()=>({visibility:"visible",display:"block"}),
    location:{href:"https://jobs.example/apply",origin:"https://jobs.example"},URL};
  vm.runInNewContext(fn+"\nglobalThis.__next=clickNext;",context);
  assert.equal(context.__next().clicked,true);
  assert.equal(next.clicks,1);
  assert.equal(submit.clicks,0);
  buttons.push(make("Next"));
  assert.equal(context.__next().clicked,false,"ambiguous navigation stays manual");
  assert.equal(next.clicks,1);
  buttons.splice(0,buttons.length,submit);
  assert.equal(context.__next().clicked,false,"Submit alone stays manual");
  assert.equal(submit.clicks,0);
});

test("review lists the filled question and answer with an on-page locator",async()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const nodes={},created=[];
  const make=()=>({children:[],textContent:"",className:"",
    append(...children){this.children.push(...children)},
    addEventListener(_type,fn){this.onClick=fn}});
  const review=make();
  const doc={querySelector:key=>key==="#review"?review:make(),
    createElement:()=>{const node=make();created.push(node);return node}};
  const calls=[];
  const chrome={storage:{local:{get(){}}},tabs:{query:async()=>[{id:42}]},
    scripting:{executeScript:async args=>{calls.push(args);return [{result:true}]}}};
  const context={document:doc,chrome};
  vm.runInNewContext(source+"\nglobalThis.__show=showResults;",context);
  context.__show([{id:"gm-autofill-2",label:"What Program are you applying to?",
    displayValue:"Graduate Rotation",context:"Position Preference"}],[true],42);
  assert.equal(review.children.length,1);
  const [body,button]=review.children[0].children;
  assert.equal(body.children[0].textContent,"What Program are you applying to?");
  assert.equal(body.children[1].textContent,"Graduate Rotation");
  assert.match(body.children[2].textContent,/Position Preference/);
  await button.onClick();
  assert.equal(calls[0].target.tabId,42);
  assert.equal(calls[0].func.name,"locateField");
});
test("field locator IDs remain stable when a dependent field appears",()=>{
  const source=fs.readFileSync(require.resolve("../extension/popup.js"),"utf8");
  const inputs=[];
  const make=name=>{
    const attrs={};
    return {tagName:"INPUT",type:"text",name,id:"",value:"",
      labels:[],disabled:false,readOnly:false,parentElement:null,
      getClientRects:()=>[{}],closest:()=>null,
      getAttribute:key=>attrs[key]||"",
      setAttribute:(key,value)=>{attrs[key]=value}};
  };
  const region=make("region"),program=make("program"),year=make("year");
  inputs.push(region,year);
  const stub={addEventListener(){},replaceChildren(){}};
  const doc={querySelector:key=>key.startsWith("#")?stub:null,getElementById:()=>null,
    querySelectorAll:key=>key==="[data-garamaal-autofill-id]"?
      inputs.filter(x=>x.getAttribute("data-garamaal-autofill-id")):
      key==="input,textarea,select"?inputs:[]};
  const context={document:doc,chrome:{storage:{local:{get(){}}}},
    getComputedStyle:()=>({visibility:"visible"})};
  vm.runInNewContext(source+"\nglobalThis.__scanForm=scanForm;",context);
  context.__scanForm();
  const first=[region,year].map(x=>x.getAttribute("data-garamaal-autofill-id"));
  inputs.splice(1,0,program);
  context.__scanForm();
  assert.deepEqual([region,year].map(x=>x.getAttribute("data-garamaal-autofill-id")),first);
  assert.notEqual(program.getAttribute("data-garamaal-autofill-id"),first[0]);
  assert.notEqual(program.getAttribute("data-garamaal-autofill-id"),first[1]);
});