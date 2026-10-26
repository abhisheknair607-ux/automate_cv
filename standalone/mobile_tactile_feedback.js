/* Garamaal QA touch feedback: mobile press state remains lifted until release.
 * Scoped to existing Discovery/Make CV jobs and Dashboard statistic tiles.
 * Does not block native click, scrolling, navigation, or candidate workflows.
 */
(function(){
 "use strict";
 if(typeof document==="undefined"||!document.body.classList.contains("gmv3-landing"))return;
 const doc=document;
 const targets="#content .jobs > .job,#content button.gmv3-pipeline-kpi,#gmv3-goal-alerts .gmv3-followup-stats > div";
 const active=new Map();
 function stop(node){
  if(!node)return;
  node.classList.remove("gmv3-tactile-held");
  active.delete(node);
 }
 function release(pointerId){
  for(const [node,data] of active)if(data.id===pointerId)stop(node);
 }
 function start(e){
  if(e.pointerType!=="touch"&&e.pointerType!=="pen")return;
  if(e.isPrimary===false||doc.body.classList.contains("gmv3-profile-open"))return;
  if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;
  const node=e.target.closest?.(targets);
  if(!node)return;
  // A hold is a STATE, not a 440ms animation. It stays lifted until pointerup,
  // pointercancel, leaving the tile or native scrolling begins.
  release(e.pointerId);
  node.classList.add("gmv3-tactile-held");
  active.set(node,{id:e.pointerId,x:e.clientX,y:e.clientY});
 }
 function move(e){
  for(const [node,data] of active){
   if(data.id!==e.pointerId)continue;
   // Small finger movements inside the card don't end the visual hold.
   // Let the browser's native pan trigger pointercancel/scroll as usual.
   const rect=node.getBoundingClientRect();
   const margin=7;
   if(e.clientX<rect.left-margin||e.clientX>rect.right+margin||
      e.clientY<rect.top-margin||e.clientY>rect.bottom+margin)stop(node);
  }
 }
 doc.addEventListener("pointerdown",start,{passive:true});
 doc.addEventListener("pointermove",move,{passive:true});
 doc.addEventListener("pointerup",e=>release(e.pointerId),{passive:true});
 doc.addEventListener("pointercancel",e=>release(e.pointerId),{passive:true});
 doc.addEventListener("scroll",()=>{
  for(const node of [...active.keys()])stop(node);
 },{passive:true,capture:true});
 window.addEventListener("blur",()=>{for(const node of [...active.keys()])stop(node)});
})();
