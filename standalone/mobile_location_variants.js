/* Candidate-scoped location facet helpers. No geocoding, network calls or data writes.
 * Group known aliases for SEARCH only; stored Sheet labels stay unchanged.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.GaramaalLocationVariants=api;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const txt=v=>String(v==null?"":v).trim();
 function group(value){
  const x=txt(value).toLowerCase();
  if(!x)return "";
  // Keep nearby unrelated names such as Ukraine, New England and
  // New South Wales out of UK matches. Do not infer country from city alone.
  if(/\b(united kingdom|great britain|britain|british|northern ireland|scotland)\b/.test(x)||
     /(?:^|[^a-z])u\.?k\.?(?=$|[^a-z])/.test(x)||
     /(?:^|[^a-z])g\.?b\.?(?=$|[^a-z])/.test(x)||
     (/\bengland\b/.test(x)&&!/\bnew england\b/.test(x))||
     (/\bwales\b/.test(x)&&!/\bnew south wales\b/.test(x)))
   return "United Kingdom (UK)";
  if(/\b(united states(?: of america)?|america|usa)\b/.test(x)||
     /(?:^|[^a-z])u\.?s\.?a?\.?(?=$|[^a-z])/.test(x))
   return "United States (US)";
  if(/\b(republic of ireland|éire)\b/.test(x))return "Ireland";
  return "";
 }
 function matches(value,search){
  const q=txt(search).toLowerCase();
  if(!q)return true;
  const g=group(value).toLowerCase();
  if(/^(?:u\.?k\.?|g\.?b\.?)$/.test(q))return g==="united kingdom (uk)";
  if(/^(?:u\.?s\.?a?\.?)$/.test(q))return g==="united states (us)";
  return txt(value).toLowerCase().includes(q)||g.includes(q);
 }
 function rule(raw){
  const v=raw&&typeof raw==="object"?raw:{};
  const mode=["only","except"].includes(v.mode)?v.mode:"all";
  const values=Array.isArray(v.values)?[...new Set(v.values.filter(x=>typeof x==="string").map(x=>x.trim().slice(0,120)).filter(Boolean))].slice(0,750):[];
  return {mode:mode==="except"&&!values.length?"all":mode,values};
 }
 function isIncluded(value,selection){
  const r=rule(selection);
  if(r.mode==="all")return true;
  const present=r.values.includes(txt(value).slice(0,120));
  return r.mode==="except"?!present:present;
 }
 return Object.freeze({group,matches,rule,isIncluded});
});