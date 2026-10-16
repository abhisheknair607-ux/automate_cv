"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const dir=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(dir,p),"utf8");
const ranking=read("standalone/dashboard_ranking.js"),frontend=read("standalone/dashboard_connections.js"),html=read("webapp/Index.html"),server=read("standalone/server.js");
const {jdClues}=require("../job_clues"),{rankFormula}=require("../rank_formulas"),connection=require("../connections");

test("incremental ranking has separate trusted source IDs, scoring and JD signals",()=>{
 const ctx=vm.createContext({document:{addEventListener:()=>{}},navigator:{},state:{candidate:"Abhishek"},toast:()=>{},window:{prompt:()=>{}},confirm:()=>false});
 vm.runInContext(ranking,ctx);
 const a=ctx.window.__cvRanking.makePrompt("Abhishek"),p=ctx.window.__cvRanking.makePrompt("Pooja");
 for(const prompt of [a,p]){
   for(const word of ["INCREMENTAL","VISA:","SALARY:","CONTACTS:","50,000","BB","BC","BD","Profile Fit","Career Fit","Sheet1","rank"])assert.ok(prompt.includes(word),word);
   assert.ok(prompt.includes("1ltT1gPFcpBdz1Wp_CuxkwFpfkwnnhjL316yVu3gxPCc"));
 }
 assert.match(a,/AX=Profile Fit/);
 assert.match(p,/AZ=Profile Fit/);
 assert.match(p,/PRIVATE WEALTH/);
 assert.doesNotMatch(a,/Pooja Krishna Tirupati/);
 assert.doesNotMatch(p,/Abhishek Nair/);
});
test("rank formula uses all historical scores and stable ties",()=>{
 assert.equal(rankFormula("AL",3),'=IF(AL3="","",COUNTIF(AL$3:AL,">"&AL3)+COUNTIF(AL$3:AL3,AL3))');
 assert.equal(rankFormula("AN",123),'=IF(AN123="","",COUNTIF(AN$3:AN,">"&AN123)+COUNTIF(AN$3:AN123,AN123))');
 assert.throws(()=>rankFormula("NO",3),/Invalid/);
});
test("JD eye requires explicit positive visa, salary or named contact",()=>{
 const yes=jdClues("Contact Jane Smith for enquiries.\nWe offer visa sponsorship to qualified candidates.\nSalary €58,000 per year.");
 assert.equal(yes.highlight,true);assert.equal(yes.visa.status,"yes");
 assert.equal(yes.salary.currency,"EUR");
 assert.match(yes.contact.evidence,/Jane Smith/);
 const no=jdClues("Visa sponsorship is not available. Contact our recruitment team. Competitive pay.");
 assert.equal(no.visa.status,"no");assert.equal(no.highlight,false);
 const vague=jdClues("Candidates need the right to work. Salary negotiable.");
 assert.equal(vague.highlight,false);
});
test("three contact ranges, verified URLs only, brief humble messages",()=>{
 assert.deepEqual(Object.keys(connection.tiers),["1-5","5-10","10-15"]);
 assert.equal(connection.safeProfile("https://www.linkedin.com/in/real-person"),"https://www.linkedin.com/in/real-person");
 assert.equal(connection.safeProfile("https://linkedin.com/search/results/people/?keywords=x"),null);
 const j={candidate:"Pooja",row:10,url:"https://example.org/x",company:"Big Company",role:"Wealth Analyst",web:true};
 assert.ok(connection.note(j,"John Smith").length<=300);
 const p=connection.preview(j,"10-15",true);
 assert.equal(p.max,15);assert.ok(p.estimateUsd<=.20);
});
test("Personalised LinkedIn notes use 3 paragraphs, verified recipient detail and correct candidate qualifications",()=>{
 const ab={candidate:"Abhishek",row:68,company:"BDO",role:"International Corporate Tax",web:true};
 const msg=connection.note(ab,{name:"Kevin Doyle",team:"International Tax",title:"Partner"});
 assert.match(msg,/^Hi Kevin,\n\n/);
 assert.match(msg,/\n\nThank you — I'd be grateful to connect\.$/);
 assert.equal(msg.split("\n\n").length,3);
 for(const value of ["Abhishek Nair","ACCA member","EY","UCD","International Tax","BDO"]){
   assert.ok(msg.includes(value),value);
 }
 assert.ok([...msg].length<300);
 const long=connection.note({...ab,company:"Extraordinary International Financial Services Partnership and Management Company"},
   {name:"Alexandrianna Reallylongsurname",team:"International Transfer Pricing and Financial Services Corporate Tax Advisory Strategy Team",title:"Director"});
 assert.ok([...long].length<300);
 assert.match(long,/^Hi Alexandrianna,\n\n/);
 assert.match(long,/\n\nThank you/);
 const pooja=connection.note({...ab,candidate:"Pooja"},{name:"Rachel Green",team:"Tax Advisory",title:"Director"});
 assert.match(pooja,/^Hi Rachel,\n\nI'm Pooja Tirupati\./);
 for(const unsupported of ["ACCA","EY experience","UCD MSc","Abhishek Nair"]){
   assert.equal(pooja.includes(unsupported),false,unsupported);
 }
 assert.ok(pooja.includes("Tax Advisory"));
 assert.match(frontend,/Exactly this readable format/);
 assert.match(frontend,/EY experience, UCD MSc, ACCA member/);
});
test("missing API key cannot incur charge or trigger web call",async()=>{
 const j={candidate:"Abhishek",row:221,url:"https://example.org/x",company:"Big Company",role:"Financial Analyst",web:true};
 const result=await connection.research(j,"1-5","",()=>{throw Error("Should never call API")});
 assert.equal(result.status,"unconfigured");assert.equal(result.costUsd,0);
 assert.ok(result.searches.length);
});
test("Cloud Run installs authenticated research and formula routes; card actions are icons only",()=>{
 new vm.Script(ranking);new vm.Script(frontend);
 for(const word of ["/api/connections/preview","/api/connections/research","/api/repair-ranks","/api/clues/save","await authenticate(req)","dashboard-ranking.js","dashboard-connections.js"])assert.ok(server.includes(word),word);
 for(const word of ['data-action="copy-ranking"','data-action="repair-ranks"','data-action="connections"','data-action="jd-clues"','aria-label="Download CV"','aria-label="Copy post-CV prompt"','__cvConnectOnWebSaved'])assert.ok(html.includes(word),word);
 assert.ok(!html.includes('Download CV</button>'));
});

test("JD opportunities eye routes are recognised by the authenticated Firebase transport",()=>{
 const bridge=read("standalone/bridge.js");
 // Evaluate the ACTUAL endpoint allowlist array rather than duplicating the
 // permitted list in tests; prevent future 'Unsupported operation' regressions.
 const whitelist=bridge.match(/if\(!(\[[^\]]+\])\.includes\(endpoint\)\)/);
 assert.ok(whitelist,"No requestSpecial endpoint allowlist found");
 const endpoints=JSON.parse(whitelist[1]);
 for(const route of ["clues/preview","clues/save","connections/saved","connections/preview","connections/research","repair-ranks"]){
   assert.ok(endpoints.includes(route),"Bridge disallows "+route);
   assert.ok(server.includes('app.post("/api/'+route+'"'),"Cloud Run is missing /api/"+route);
 }
 assert.ok(!endpoints.includes("arbitrary/delete"),"Unexpected API operation allowed");
 assert.match(frontend,/requestSpecial\("clues\/preview"/);
 assert.match(frontend,/requestSpecial\("clues\/save"/);
});
