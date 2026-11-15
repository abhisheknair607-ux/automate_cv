"use strict";
const GaramaalErrorLog=(()=>{
  const LIMIT=10;
  function clean(value){
    return String(value||"")
      .replace(/https?:\/\/[^\s"'<>]+/gi,raw=>{
        try{const url=new URL(raw);return url.origin;}catch(_){return "[URL]";}
      })
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email]")
      .slice(0,500);
  }
  function append(entries,entry){
    const next=Array.isArray(entries)?entries.slice(-LIMIT+1):[];
    next.push({
      time:new Date().toISOString(),
      action:clean(entry?.action).slice(0,60),
      stage:clean(entry?.stage).slice(0,100),
      message:clean(entry?.message)
    });
    return next;
  }
  return {append,LIMIT};
})();
if(typeof module!=="undefined")module.exports=GaramaalErrorLog;
