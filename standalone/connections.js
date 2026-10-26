"use strict";
const crypto=require("node:crypto");
const MODEL="gpt-6.1-sol",TARGET=.15,LIMIT=.20;
const tiers=Object.freeze({"1-5":{min:1,max:5,output:1300,estimate:.06},
 "5-10":{min:5,max:10,output:2400,estimate:.11},
 "10-15":{min:10,max:15,output:3600,estimate:.15}});
const cache=new Map(),pending=new Set(),spent=new Map();
const short=(s,n=100)=>String(s||"").replace(/\s+/g," ").trim().slice(0,n);
function linkedinSearch(q){return "https://www.linkedin.com/search/results/people/?keywords="+encodeURIComponent(q)}
function safeProfile(raw){
 try{const u=new URL(String(raw||""));if(u.protocol!=="https:"||!/(^|\.)linkedin\.com$/i.test(u.hostname)||!/^\/in\/[A-Za-z0-9-]+\/?$/.test(u.pathname))return null;
 return "https://www.linkedin.com"+u.pathname.replace(/\/+$/,"/")}catch{return null}
}
function keyFor(job,tier){return crypto.createHash("sha256").update([job.candidate,job.row,job.url,job.role,job.company,tier].join("|")).digest("hex")}
function baseKey(job){return keyFor(job,"all-tiers")}
function searches(job){const b=[job.company,job.role,job.location].map(v=>short(v,85)).filter(Boolean).join(" ");
 return [["Team managers",b+" Manager"],["Leadership",b+" Director Partner"],["Colleagues",b+" Associate Analyst"],["Recruiters",b+" Talent Acquisition"]]
 .map(([label,q])=>({label,url:linkedinSearch(q)}))}
function note(job,name){
 const first=short(name,60).split(" ")[0]||"there",me=job.candidate==="Pooja"?"Pooja Tirupati":"Abhishek Nair";
 let msg="Hi "+first+",\n\nI'm "+me+". I'm exploring "+short(job.role,50)+" opportunities at "+short(job.company,65)+". I'd be grateful to connect and learn from your experience.\n\nThank you for your time.";
 if([...msg].length>300)msg="Hi "+first+",\n\nI'm "+me+". I'd appreciate connecting and learning about your experience at "+short(job.company,60)+".\n\nThank you.";
 return [...msg].slice(0,300).join("")
}
function sources(response){return new Set((response.output||[]).filter(x=>x.type==="message").flatMap(x=>x.content||[]).flatMap(x=>x.annotations||[])
 .filter(x=>x.type==="url_citation").map(x=>safeProfile(x.url)).filter(Boolean))}
function text(response){return (response.output||[]).filter(x=>x.type==="message").flatMap(x=>x.content||[])
 .filter(x=>x.type==="output_text").map(x=>x.text).join("").trim()}
function decodeJSON(raw){const s=String(raw||"").trim(),a=s.indexOf("{"),b=s.lastIndexOf("}");
 if(a<0||b<a)throw Error("Search returned incomplete structured findings.");return JSON.parse(s.slice(a,b+1))}
function validated(list,job,response,max){
 const cited=sources(response),seen=new Set();
 return (Array.isArray(list)?list:[]).flatMap(item=>{
  const name=short(item?.name,80),title=short(item?.title,90),team=short(item?.team,90),evidence=short(item?.evidence,220);
  if(name.split(/\s+/).length<2||(!title&&!evidence)||seen.has(name.toLowerCase()))return [];
  seen.add(name.toLowerCase());const url=safeProfile(item?.profileUrl),profileUrl=url&&cited.has(url)?url:null;
  return [{name,title,team,evidence,profileUrl,searchUrl:linkedinSearch([name,job.company,title].join(" ")),
   verification:profileUrl?"Direct profile cited in search":"Direct profile not verified",message:note(job,name)}];
 }).slice(0,max)
}
function cost(response,calls){const u=response.usage||{};
 return +(Number(u.input_tokens||0)*2/1e6+Number(u.output_tokens||0)*10/1e6+calls*.01).toFixed(4)}
function check(job,tier){if(!job||!["Abhishek","Pooja"].includes(job.candidate)||!Number.isInteger(job.row)||job.row<3)throw Object.assign(Error("Invalid job."),{httpCode:400});
 if(!tiers[tier])throw Object.assign(Error("Choose 1–5, 5–10 or 10–15 contacts."),{httpCode:400});
 if(!job.web)throw Object.assign(Error("Tick and save Web before researching connections."),{httpCode:409});
 return tiers[tier]}
function preview(job,tier,configured=false){
 const t=check(job,tier),prior=cache.get(keyFor(job,tier)),cached=!!prior&&Date.now()-prior.at<7*86400000;
 const previouslySpent=spent.get(baseKey(job))||0;
 const permitted=cached||previouslySpent+t.estimate<=LIMIT;
 return {tier,min:t.min,max:t.max,estimateUsd:cached?0:t.estimate,targetUsd:TARGET,ceilingUsd:LIMIT,cached,configured,
  previouslySpentUsd:previouslySpent,remainingUsd:Math.max(0,+(LIMIT-previouslySpent).toFixed(4)),permitted,
  searches:searches(job),disclaimer:"Estimate only. One API request and at most one search tool call; no retries. Provider charges are not an absolute hard cap."}
}
async function research(job,tier,apiKey,fetcher=fetch){
 const t=check(job,tier),id=keyFor(job,tier),old=cache.get(id),p=preview(job,tier,!!apiKey);
 if(p.cached)return {...old.value,cached:true,costUsd:0};
 if(!p.permitted)throw Object.assign(Error("This contact tier would exceed the planned $0.20 total research budget for this job. Use cached results or free LinkedIn searches."),{httpCode:409});
 if(!apiKey)return {...p,status:"unconfigured",contacts:[],costUsd:0,
  message:"Connect an OpenAI API key to Cloud Run to enable paid research; free LinkedIn search links are available."};
 if(pending.has(id))throw Object.assign(Error("Search already running for this vacancy."),{httpCode:409});
 pending.add(id);
 try {
  const body={model:MODEL,
   instructions:"Research public evidence for up to "+t.max+" relevant professional networking contacts at the exact company, team and location. "+
    "No guessed people, employers, titles, direct LinkedIn URLs, reporting lines or recruiter claims. "+
    "Prefer decision makers, managers, near-level staff, and recruiters. "+
    "Return ONLY concise JSON with contacts array; each item has name,title,team,evidence,profileUrl. "+
    "Use empty profileUrl when not directly verified by public search. Fewer names are fine if unsupported.",
   input:JSON.stringify({company:short(job.company,120),role:short(job.role,150),
     location:short(job.location,120),url:short(job.url,450),jobDescription:short(job.jd,3800)}),
   tools:[{type:"web_search",search_context_size:"low"}],max_tool_calls:1,max_output_tokens:t.output,
   reasoning:{effort:"low"}};
  const resp=await fetcher("https://api.openai.com/v1/responses",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+apiKey},
    body:JSON.stringify(body),signal:AbortSignal.timeout(90000)
  });
  const result=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Object.assign(Error("Research API unavailable (HTTP "+resp.status+")."),{httpCode:502});
  const calls=(result.output||[]).filter(x=>x.type==="web_search_call").length;
  if(calls>1)throw Error("Search-call policy exceeded.");
  const c=cost(result,calls);
  spent.set(baseKey(job),+(Number(spent.get(baseKey(job))||0)+c).toFixed(4));
  const raw=decodeJSON(text(result)),contacts=validated(raw.contacts,job,result,t.max);
  const value={status:"ready",tier,contacts,searches:searches(job),costUsd:c,model:MODEL,
   requestedMin:t.min,requestedMax:t.max,budgetExceeded:c>LIMIT,
   warning:c>LIMIT?"Actual provider usage exceeded the planned $0.20 ceiling. Do not start further paid research until costs are reviewed.":
     contacts.length<t.min?"Fewer named contacts could be verified. Try the LinkedIn searches.":""};
  cache.set(id,{at:Date.now(),value});return value;
 }finally{pending.delete(id)}
}
module.exports={MODEL,tiers,preview,research,linkedinSearch,safeProfile,note,validated,cost};
