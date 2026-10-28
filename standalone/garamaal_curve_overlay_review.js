/* Stage 3B photographic layer only. Exactly the original V9 guide and sphere code remain. */
(()=>{'use strict';
const assets=window.GaramaalCurveArt;if(!assets)return;
const sets={profile:{index:'01',name:'Update Profile',sub:'Build your career story'},jobs:{index:'02',name:'Apply Jobs',sub:'Discovery, Make CV, Add Job'},network:{index:'03',name:'Network',sub:'Research, Swipe & Connect'},stats:{index:'04',name:'Statistics',sub:'Track progress and priorities'}};
for(const id of ['overview','jobs','network','stats']){
 const section=document.getElementById(id),visual=section?.querySelector('.visual');if(!section||!visual)continue;
 const edge=document.createElement('div');edge.className='gm11-edge';edge.setAttribute('aria-hidden','true');edge.style.setProperty('--gm11-image',`url("${assets.edges[id]}")`);section.prepend(edge);
 const panel=document.createElement('div');panel.className='gm11-card-panel';panel.setAttribute('aria-label','Career actions');
 const actions=id==='overview'?['profile','jobs','network','stats']:[id];
 for(const action of actions){const item=sets[action],button=document.createElement('button');button.type='button';button.className='gm11-card';button.dataset.entry=action;button.setAttribute('aria-label',item.name);button.style.setProperty('--gm11-thumb',`url("${assets.thumbs[action]}")`);
  button.innerHTML=`<span class="gm11-photo" aria-hidden="true"></span><span class="gm11-card-info"><small>${item.index} · YOUR NEXT MOVE</small><strong>${item.name}</strong><em>${item.sub}</em></span><span class="gm11-arrow" aria-hidden="true">↗</span><span class="gm11-spark first" aria-hidden="true">✦</span><span class="gm11-spark second" aria-hidden="true">✧</span>`;
  button.addEventListener('click',()=>{if(window.parent!==window)return;const modal=document.getElementById('modal-shell');if(!modal)return;const title=document.getElementById('modal-title'),desc=document.getElementById('modal-desc');if(title)title.textContent=item.name;if(desc)desc.textContent='This standalone prototype preserves the existing Garamaal navigation destination. No backend changes.';modal.classList.add('open')});panel.append(button);
 }
 section.append(panel);
}
const ball=document.getElementById('global-ball'),sections=[...document.querySelectorAll('section.story')];
let frame=0;const reduced=matchMedia('(prefers-reduced-motion:reduce)');
function animate(){frame=0;if(reduced.matches||!ball)return;const b=ball.getBoundingClientRect();const centerY=b.top+b.height/2;sections.forEach(s=>{const rect=s.getBoundingClientRect();const distance=(centerY-(rect.top+rect.height*.5))/Math.max(1,rect.height*.55);const near=Math.max(0,1-Math.abs(distance));s.style.setProperty('--gm11-ball-move',(near*-4).toFixed(1)+'px');});}
function schedule(){if(!frame)frame=requestAnimationFrame(animate)}
addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});schedule();
})();
