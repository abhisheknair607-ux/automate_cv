"use strict";
const {directProfileAnswers}=require("./autofill_profile_sections");
const ProfileMapping=require("./autofill_mapping");
const {extractStructuredProfile}=require("./autofill_structured");
const allowedTypes=new Set(["text","email","tel","url","search","textarea","number","date","select","radio","checkbox","customSelect"]);
const manualReview=/\bcurrent position\b|professional certifications?|certifications? or licen[cs](?:e|ure)|licen[cs](?:e|ure)|\blanguages?\b|areas? of interest/i;
const protectedQuestion=/password|passcode|captcha|verification|security code|national id|passport|birth|\bage\b|gender|\brace\b|ethnic|disab|veteran|(?:medical|health)\s+(?:conditions?|history|status|information|records?|issues?|disabilit\w*|accommodat\w*|restrictions?|questionnaire|leave)|(?:your|personal|physical|mental|any)\s+(?:medical|health)\b|criminal|salary|compensation|sponsorship|visa|work authori|signature|consent|declaration|terms|certify|acknowledg|agree|accept|confirm|authorize|authorise|reference|referee|emergency|ssn|tax id|social security|conflict of interest|relatives?|family members?/i;
const normal=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const repeatedRecordField=f=>/\b(?:work experience|professional experience|employment history|experience|education history|education)\b/i
  .test(String(f.context||""));
const words=s=>new Set(normal(s).split(" ").filter(w=>w.length>3));
function candidateForEmail(email,raw){
  let map;try{map=JSON.parse(raw||"{}")}catch{throw Error("Invalid autofill candidate mapping")}
  const candidate=map[String(email||"").toLowerCase().trim()];
  if(!["abhishek","pooja"].includes(candidate))throw Object.assign(
    new Error("No autofill candidate is assigned to this account"),{httpCode:403});
  return candidate;
}
function evidenceId(candidate,env,kind){
  const key=(candidate==="pooja"?"POOJA_":"")+
    (kind==="master"?"MASTER_EVIDENCE_BANK_FILE_ID":"SUMMARY_DOC_FILE_ID");
  const id=String(env[key]||"").trim();
  if(!id)throw Error("Autofill "+kind+" document is not configured for this candidate");
  return id;
}
function validFields(fields){
  return Array.isArray(fields)&&fields.length>0&&fields.length<=20&&fields.every(f=>
    f&&typeof f.id==="string"&&/^gm-autofill-\d+$/.test(f.id)&&
    typeof f.label==="string"&&f.label.length>0&&f.label.length<=500&&
    allowedTypes.has(f.type)&&
    (!f.datePart||["month","day","year"].includes(f.datePart))&&
    (!f.options||Array.isArray(f.options)&&f.options.length<=100&&
      f.options.every(o=>typeof o.value==="string"&&o.value.length<=120&&
        typeof o.label==="string"&&o.label.length<=200)));
}
function safeFields(fields){
  if(!validFields(fields))throw Object.assign(new Error("Invalid autofill fields"),{httpCode:400});
  return fields.filter(f=>!protectedQuestion.test(f.label+" "+String(f.context||""))&&
    !manualReview.test(f.label))
    .map(f=>({id:f.id,label:f.label.slice(0,500),context:String(f.context||"").slice(0,240),
      type:f.type,datePart:f.datePart||"",options:(f.options||[]).map(o=>({
        label:o.label.slice(0,200),value:o.value.slice(0,120),disabled:!!o.disabled}))}));
}
function profileEvidence(profile){
  if(!profile||typeof profile!=="object"||Array.isArray(profile))return [];
  const out=[];
  const add=(section,value)=>{
    if(typeof value==="string"&&value.trim())out.push({source:"profile",text:
      section+": "+value.trim().slice(0,600)});
  };
  const basics=profile.basics||{};
  for(const key of ["fullName","firstName","lastName","email","phone","city","country",
    "linkedin","headline","summary","dateOfBirth"])add(key,basics[key]);
  for(const section of ["work","education","projects"]){
    for(const [index,item] of (Array.isArray(profile[section])?profile[section]:[]).slice(0,12).entries()){
      if(!item||typeof item!=="object")continue;
      const parts=Object.entries(item).filter(([,v])=>typeof v==="string"&&v.trim())
        .slice(0,12).map(([key,value])=>key+": "+value.slice(0,600));
      if(parts.length)add(section+" "+(index+1),parts.join("; "));
    }
  }
  for(const section of ["skills","achievements","certifications","story"]){
    const value=profile[section];
    if(Array.isArray(value))for(const item of value.slice(0,30))add(section,typeof item==="string"?item:item?.name);
    else add(section,value);
  }
  if(profile.preferences&&typeof profile.preferences==="object"){
    for(const [key,value] of Object.entries(profile.preferences).slice(0,15))add("preference "+key,value);
  }
  return out.slice(0,80);
}
function chunks(text,source="summary"){
  return String(text||"").split(/\n\s*\n|\n(?=[A-Z][A-Za-z ]{2,50}:)/)
    .map(s=>s.replace(/\s+/g," ").trim()).filter(s=>s.length>=15)
    .flatMap(s=>s.match(/.{1,450}/g)||[])
    .map(s=>({source,text:s}));
}
function selectEvidence(items,fields){
  const all=items.map((item,index)=>({...item,index})),chosen=new Set();
  const pick=i=>{if(i>=0&&chosen.size<18)chosen.add(i)};
  all.filter(x=>x.source==="profile").slice(0,2).forEach(x=>pick(x.index));
  for(const field of fields){
    const query=words(field.label+" "+field.context+" "+field.options.map(o=>o.label).join(" "));
    const score=x=>[...query].filter(w=>words(x.text).has(w)).length;
    all.map(x=>({index:x.index,score:score(x)})).filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,2).forEach(x=>pick(x.index));
  }
  const totalQuery=words(fields.map(f=>f.label+" "+f.context).join(" "));
  all.map(x=>({index:x.index,score:[...totalQuery].filter(w=>words(x.text).has(w)).length}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).forEach(x=>pick(x.index));
  return [...chosen].map((index,i)=>({id:"e"+i,source:all[index].source,text:all[index].text}));
}
async function readEvidenceDoc(client,id){
  const base="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id);
  const metadata=(await client.request({url:base+"?fields=id,mimeType"})).data;
  if(metadata?.mimeType==="application/vnd.google-apps.document"){
    const response=await client.request({url:base+"/export?mimeType=text%2Fplain",responseType:"text"});
    return String(response.data||"");
  }
  if(metadata?.mimeType!=="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    throw Error("Autofill evidence file must be a DOCX or Google Doc");
  const response=await client.request({url:base+"?alt=media",responseType:"arraybuffer"});
  const mammoth=require("mammoth");
  const result=await mammoth.extractRawText({buffer:Buffer.from(response.data)});
  return String(result.value||"");
}
async function callModel(input,env,fetcher=fetch){
  const key=String(env.OPENAI_API_KEY||"");
  if(!key)throw Error("Autofill AI key is not configured");
  const prompt="Answer only from supplied candidate evidence. Cite evidence IDs for every answer. Missing information is unknown, not No. Never invent experience, qualifications or contact facts. Skip legal, eligibility, immigration, criminal, disability, conflict, declarations and consent. For repeated employment or education sections, match the section number to the numbered profile evidence; never reuse one record for a different section. For select/radio/custom dropdown return the exact option value. For a checkbox return true only when candidate evidence explicitly supports its label; never check agreements. For mappingFacts, you may also propose exact field-to-profile fact paths as mappings:[{fieldId,profilePath}]. Map only when the question clearly means that fact; respect numbered work and education entries. Do not invent paths or values. Return JSON: {mappings:[{fieldId,profilePath}],answers:[{fieldId,answer,evidenceIds}]}. Omit uncertain mappings and answers.";
  const response=await fetcher("https://api.openai.com/v1/chat/completions",{
    method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model:env.AUTOFILL_MODEL||"gpt-5.4-mini",
      response_format:{type:"json_object"},messages:[
        {role:"system",content:prompt},
        {role:"user",content:JSON.stringify(input)}
      ]})});
  if(!response.ok)throw Error("Autofill AI request failed ("+response.status+")");
  const data=await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content||"{}");
}
function validateAnswers(fields,evidence,result){
  const known=new Map(evidence.map(x=>[x.id,x.text]));
  const byId=new Map(fields.map(f=>[f.id,f]));
  const seen=new Set(),out=[];
  for(const answer of Array.isArray(result?.answers)?result.answers:[]){
    const field=byId.get(answer?.fieldId);
    if(!field||seen.has(field.id))continue;
    const ids=answer.evidenceIds;
    if(!Array.isArray(ids)||!ids.length||ids.some(id=>!known.has(id)))continue;
    const value=String(answer.answer||"").trim();
    if(!value||value.length>500)continue;
    if(field.type==="checkbox"){
      if(value!=="true")continue;
      const text=ids.map(id=>known.get(id)).join(" ");
      const meaningful=normal(field.label).split(" ").filter(w=>w.length>3&&
        !/^(have|with|your|some|experience|skills|using|used|this|that)$/.test(w));
      if(!meaningful.some(w=>words(text).has(w)))continue;
    }else if(field.type==="select"||field.type==="radio"||field.type==="customSelect"){
      const option=field.options.find(o=>o.value===value&&!o.disabled&&o.value);
      if(!option)continue;
      const choice=normal(option.label),cited=normal(ids.map(id=>known.get(id)).join(" "));
      if(["other","prefer not to say","none of the above"].includes(choice))continue;
      if(choice==="no"){
        if(!/\b(no|not|never|none|without|only)\b/.test(cited))continue;
      }else if(choice==="yes"){
        const terms=normal(field.label).split(" ").filter(w=>w.length>3&&
          !["have","your","currently","former","formerly","option","select","please","there"].includes(w));
        if(!terms.some(w=>cited.split(" ").includes(w)))continue;
      }else if(!cited.includes(choice))continue;
    }else if(!ids.some(id=>normal(known.get(id)).includes(normal(value)))){
      continue;
    }
    out.push({fieldId:field.id,answer:value,evidenceIds:ids});seen.add(field.id);
  }
  return out;
}
const quota=new Map();
function consumeQuota(email,now=Date.now()){
  const key=String(email||"").toLowerCase().trim();
  const previous=quota.get(key);
  const state=!previous||now-previous.start>=600000?{start:now,count:0}:previous;
  if(state.count>=30)throw Object.assign(
    new Error("Autofill request limit reached; try again shortly"),{httpCode:429});
  state.count++;quota.set(key,state);
}
async function structuredProfileForEmail({email,env=process.env,client,
  readEvidence=readEvidenceDoc}){
  const candidate=candidateForEmail(email,env.AUTOFILL_CANDIDATE_EMAILS);
  const master=await readEvidence(client,evidenceId(candidate,env,"master"));
  return {candidate,profile:extractStructuredProfile(master),source:"Master Evidence Bank"};
}
async function answerApplication({email,body,env=process.env,client,
  readEvidence=readEvidenceDoc,model=callModel}){
  const candidate=candidateForEmail(email,env.AUTOFILL_CANDIDATE_EMAILS);
  const fields=safeFields(body?.fields);
  if(!fields.length)return {answers:[],source:"none",modelCalls:0};
  consumeQuota(email);
  const job={title:String(body?.job?.title||"").slice(0,160),
    companyName:String(body?.job?.companyName||"").slice(0,160),
    location:String(body?.job?.location||"").slice(0,120),
    description:String(body?.job?.description||"").slice(0,2500)};
  let modelCalls=0;
  const run=async(items,targets,mappingFacts=[])=>{
    const evidence=selectEvidence(items,targets);
    if(!evidence.length&&!mappingFacts.length)return [];
    const response=await model({job,fields:targets,evidence,mappingFacts},env);
    modelCalls++;
    const mapped=ProfileMapping.validateAll(targets,mappingFacts,response);
    const mappedIds=new Set(mapped.map(x=>x.fieldId));
    return [...mapped,...validateAnswers(targets.filter(f=>!mappedIds.has(f.id)),evidence,response)];
  };
  const direct=directProfileAnswers(fields,body?.profile);
  const directIds=new Set(direct.map(x=>x.fieldId));
  const profileTargets=fields.filter(f=>!directIds.has(f.id)&&!repeatedRecordField(f));
  const profileItems=profileEvidence(body?.profile);
  const fromProfile=[...direct,...(profileItems.length&&profileTargets.length?
    await run(profileItems,profileTargets,ProfileMapping.relevantFacts(
      profileTargets,ProfileMapping.facts(body?.profile))):[])];
  const answered=new Set(fromProfile.map(x=>x.fieldId));
  const remaining=fields.filter(f=>!answered.has(f.id)&&!repeatedRecordField(f));
  if(!remaining.length)return {answers:fromProfile,source:"profile",modelCalls};
  const summary=await readEvidence(client,evidenceId(candidate,env,"summary"));
  const fromSummary=await run(chunks(summary,"summary"),remaining);
  const summaryAnswered=new Set(fromSummary.map(x=>x.fieldId));
  const stillMissing=remaining.filter(f=>!summaryAnswered.has(f.id));
  if(!stillMissing.length)return {answers:[...fromProfile,...fromSummary],source:"profile+summary",modelCalls};
  const master=await readEvidence(client,evidenceId(candidate,env,"master"));
  const fromMaster=await run(chunks(master,"master"),stillMissing);
  return {answers:[...fromProfile,...fromSummary,...fromMaster],
    source:"profile+summary+master",modelCalls};
}
module.exports={candidateForEmail,evidenceId,validFields,safeFields,profileEvidence,chunks,
  selectEvidence,readEvidenceDoc,callModel,validateAnswers,consumeQuota,answerApplication,
  repeatedRecordField,structuredProfileForEmail};
