"use strict";
const http=require("node:http");
const MODEL=process.env.GARAMAAL_AI_MODEL;
const KEY=process.env.OPENAI_API_KEY;
const EXTENSION_ID=process.env.GARAMAAL_EXTENSION_ID;
const PORT=Number(process.env.GARAMAAL_AI_PORT||8766);
const instruction="You answer job application questions using only the supplied candidate evidence. Be favourable but truthful. Missing evidence is not a negative answer. For legal, eligibility, immigration, criminal, disability, conflict, declaration or consent questions return no answer. Never invent facts. For select/radio return the exact option value. Otherwise return concise text. Return JSON with answers: [{fieldId,answer,evidenceIds}]. Omit uncertain fields.";
function validRequest(data){
  if(!data||!Array.isArray(data.fields)||data.fields.length>20)return false;
  return data.fields.every(f=>typeof f.id==="string"&&f.id.length<80&&
    typeof f.label==="string"&&f.label.length<600&&
    Array.isArray(f.facts)&&f.facts.length<=12&&
    f.facts.every(x=>typeof x.id==="string"&&typeof x.text==="string"&&x.text.length<=400));
}
async function answer(data,fetcher=fetch){
  if(!validRequest(data))throw Error("Invalid request");
  const payload={model:MODEL,temperature:0,response_format:{type:"json_object"},
    messages:[
      {role:"system",content:instruction},
      {role:"user",content:JSON.stringify({job:data.job||{},fields:data.fields})}
    ]};
  const r=await fetcher("https://api.openai.com/v1/chat/completions",{
    method:"POST",headers:{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
    body:JSON.stringify(payload)});
  if(!r.ok)throw Error("AI service returned "+r.status);
  const body=await r.json();
  const parsed=JSON.parse(body.choices?.[0]?.message?.content||"{}");
  return {answers:Array.isArray(parsed.answers)?parsed.answers:[]};
}
if(require.main===module){
  if(!MODEL||!KEY||!EXTENSION_ID)throw Error("Set GARAMAAL_AI_MODEL, OPENAI_API_KEY and GARAMAAL_EXTENSION_ID");
  const origin="chrome-extension://"+EXTENSION_ID;
  http.createServer(async(req,res)=>{
    const send=(code,obj)=>{res.writeHead(code,{"Content-Type":"application/json",
      "Access-Control-Allow-Origin":origin,"Vary":"Origin","Cache-Control":"no-store"});
      res.end(JSON.stringify(obj));};
    if(req.headers.origin!==origin){send(403,{error:"Forbidden origin"});return;}
    if(req.method==="OPTIONS"){res.writeHead(204,{"Access-Control-Allow-Origin":origin,
      "Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type",
      "Vary":"Origin"});res.end();return;}
    if(req.method!=="POST"||req.url!=="/answer"){send(404,{error:"Not found"});return;}
    try{
      let raw="";
      for await(const chunk of req){raw+=chunk;if(raw.length>25000)throw Error("Request too large");}
      send(200,await answer(JSON.parse(raw)));
    }catch(e){send(400,{error:e.message});}
  }).listen(PORT,"127.0.0.1",()=>console.log("Garamaal development AI listening on 127.0.0.1:"+PORT));
}
module.exports={answer,validRequest};
