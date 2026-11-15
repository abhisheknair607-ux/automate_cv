"use strict";
(function(root){
  const clean=s=>String(s||"").replace(/\s+/g," ").trim();
  function summarize(fields,extras=[]){
    const groups=new Map();
    for(const item of [...(fields||[]),...(extras||[])]){
      const section=clean(item.section||item.context)||"Application details";
      const entry=groups.get(section)||{name:section,total:0,filled:0,required:0,requiredFilled:0,pending:[]};
      entry.total++;
      if(item.required)entry.required++;
      if(item.hasValue){entry.filled++;if(item.required)entry.requiredFilled++;}
      else entry.pending.push({label:clean(item.label).split(" | ")[0]||"Unlabelled field",type:item.type||"unknown",required:!!item.required,reason:item.reason||""});
      groups.set(section,entry);
    }
    const sections=[...groups.values()];
    const total=sections.reduce((n,s)=>n+s.total,0);
    const filled=sections.reduce((n,s)=>n+s.filled,0);
    const required=sections.reduce((n,s)=>n+s.required,0);
    const requiredFilled=sections.reduce((n,s)=>n+s.requiredFilled,0);
    return {sections,total,filled,required,requiredFilled,percent:total?Math.round(100*filled/total):0};
  }
  const batches=(items,size=20)=>{
    const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));
    return out;
  };
  const api={summarize,batches};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalProgress=api;
})(globalThis);
