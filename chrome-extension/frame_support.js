"use strict";
// Frame-local locator IDs are not unique across documents. Keep the DOM ID
// untouched and expose a numeric globally unique surrogate for the AI API.
(function(root){
  const LIMIT=1000000;
  const localNumber=id=>Number(String(id||"").match(/^gm-autofill-(\d+)$/)?.[1]);
  const globalId=(id,frameId)=>{
    const local=localNumber(id);
    if(!Number.isInteger(local)||local<0||local>=LIMIT||!Number.isSafeInteger(frameId*LIMIT+local))
      return null;
    return "gm-autofill-"+(frameId*LIMIT+local);
  };
  function merge(results){
    const usable=(Array.isArray(results)?results:[]).filter(x=>x&&x.result&&
      Number.isInteger(x.frameId||0)&&((x.frameId||0)>=0));
    const main=usable.find(x=>(x.frameId||0)===0)||usable[0];
    const totalFrames=usable.reduce((n,x)=>n+Number(x.result.embeddedFrames||0),0);
    const blockedFrames=Math.max(0,totalFrames-Math.max(0,usable.length-1));
    const fields=[],extras=[],seen=new Set(),failures=[];
    for(const result of usable){
      const frameId=result.frameId||0,frame=result.result;
      for(const item of frame.fields||[]){
        const id=globalId(item.id,frameId);
        if(!id||seen.has(id)){failures.push("Duplicate or invalid frame field ID");continue;}
        seen.add(id);
        fields.push({...item,id,localId:item.id,frameId,
          section:frameId?("Embedded form · "+(item.section||"Application details")):item.section});
      }
      for(const item of frame.extras||[]){
        extras.push({...item,frameId,section:frameId?
          "Embedded form · "+(item.section||"Application details"):item.section});
      }
    }
    // Keep non-field diagnostics when consolidating frames: the sidebar relies
    // on these to display employer privacy/consent blockers and pending inputs.
    const unsupported={
      privacyConsentDialog:usable.some(x=>x.result.unsupported?.privacyConsentDialog===true),
      customDropdowns:usable.reduce((n,x)=>n+Number(x.result.unsupported?.customDropdowns||0),0),
      checkboxes:usable.reduce((n,x)=>n+Number(x.result.unsupported?.checkboxes||0),0),
      fileInputs:usable.reduce((n,x)=>n+Number(x.result.unsupported?.fileInputs||0),0)
    };
    return {fields,extras,job:main?.result?.job||{},unsupported,
      embeddedFrames:totalFrames,accessibleFrames:usable.length,
      blockedFrames,truncated:usable.some(x=>x.result.truncated)||failures.length>0,
      failures,openShadowRoots:usable.reduce((n,x)=>n+Number(x.result.openShadowRoots||0),0)};
  }
  const target=(tabId,frameId)=>frameId>0?{tabId,frameIds:[frameId]}:{tabId};
  const originalId=field=>field?.localId||field?.id;
  const api={merge,target,originalId,globalId};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalFrames=api;
})(globalThis);
