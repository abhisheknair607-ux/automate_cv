/* Garamaal QA tactile response: visible on real touchscreens, no default action blocked.
 * Scoped to existing Discovery/Make CV jobs and Dashboard statistic tiles.
 */
(function(){
 "use strict";
 if(typeof document==="undefined"||!document.body.classList.contains("gmv3-landing"))return;
 const doc=document,targets="#content .jobs > .job,#content button.gmv3-pipeline-kpi,#gmv3-goal-alerts .gmv3-followup-stats > div";
 const active=new Map();
 function stop(node){
  if(!node)return;
  const prior=active.get(node);
  if(prior?.timer)clearTimeout(prior.timer);
  node.classList.remove("gmv3-tactile-pulse");
  active.delete(node);
 }
 function start(e){
  if(e.pointerType!=="touch"&&e.pointerType!=="pen")return;
  const node=e.target.closest?.(targets);
  if(!node||e.isPrimary===false||doc.body.classList.contains("gmv3-profile-open"))return;
  if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)return;
  stop(node);
  // Restart the short lift even on consecutive taps; native click/navigation
  // and checkbox handling are never cancelled or delayed.
  void node.offsetWidth;
  node.classList.add("gmv3-tactile-pulse");
  const event={id:e.pointerId,x:e.clientX,y:e.clientY,timer:null};
  event.timer=setTimeout(()=>stop(node),440);
  active.set(node,event);
 }
 function move(e){
  const node=e.target.closest?.(targets);
  const data=node&&active.get(node);
  if(data&&data.id===e.pointerId&&Math.hypot(e.clientX-data.x,e.clientY-data.y)>16)stop(node);
 }
 doc.addEventListener("pointerdown",start,{passive:true});
 doc.addEventListener("pointermove",move,{passive:true});
 doc.addEventListener("pointercancel",e=>{
  for(const [node,data] of active)if(data.id===e.pointerId)stop(node);
 },{passive:true});
 doc.addEventListener("scroll",()=>{
  for(const node of active.keys())stop(node);
 },{passive:true,capture:true});
})();
