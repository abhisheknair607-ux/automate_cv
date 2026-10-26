/* Garamaal /prototype Stage 1.
 * UI-only launcher. Never replace the working Jobs navigation or Social routes.
 * The original Jobs application is fully loaded underneath, with its existing
 * Cloud Run bridge, Sheet permissions, candidate selector, filters and forms.
 */
(function(){
  "use strict";
  const root=document.getElementById("gmv3-launch");
  if(!root)return;
  const subview=document.getElementById("gmv3-subview");
  const subtitle=document.getElementById("gmv3-subtitle");
  const subbody=document.getElementById("gmv3-subbody");
  const initial=document.getElementById("gmv3-initial");
  const local={weeklyTarget:8,reminders:[
    {id:1,label:"Review shortlisted jobs",done:false},
    {id:2,label:"Follow up on connections",done:false}
  ]};
  function candidate(){
    try{return typeof state!=="undefined"&&state?.candidate==="Pooja"?"Pooja":"Abhishek";}
    catch(_){return "Abhishek";}
  }
  function syncAvatar(){initial.textContent="E";}
  function syncInstall(){
    const button=document.getElementById("gmv3-install-launcher");
    if(!button)return;
    const installed=window.matchMedia?.("(display-mode: standalone)")?.matches||
      window.navigator.standalone===true;
    button.hidden=!!installed;
  }
  function showHome(){
    syncAvatar();syncInstall();
    subview.hidden=true;
    document.body.classList.add("gmv3-landing");
    document.body.classList.remove("gmv3-workspace");
  }
  function enterJobs(){
    subview.hidden=true;
    document.body.classList.remove("gmv3-landing");
    document.body.classList.add("gmv3-workspace");
    // Reuse the existing, real Dashboard. No fake menu or backend route.
    if(typeof nav==="function")nav("dashboard");
    document.getElementById("gmv3-home-button")?.focus();
  }
  function buttons(){
    return '<div class="gmv3-actions"><button class="gmv3-primary" type="button" data-gmv3="jobs">Open working Jobs dashboard</button>'+
      '<button class="gmv3-secondary" type="button" data-gmv3="network">Open existing Social Hub</button></div>';
  }
  function remindersMarkup(){
    return '<h2>Reminders</h2><p>Quick checklist for this browser tab. These are not scheduled notifications.</p>'+
      '<div class="gmv3-panel">'+local.reminders.map(item=>
        '<label><input type="checkbox" data-gmv3-check="'+item.id+'" '+(item.done?'checked':'')+'>'+
        '<span>'+escapeHtml(item.label)+'</span></label>').join("")+'</div>'+
      '<div class="gmv3-actions"><button class="gmv3-secondary" type="button" data-gmv3="add-reminder">＋ Add an example reminder</button></div>'+
      '<p class="gmv3-micro">Saved only until you reload this page. Reminders, deadlines and notifications need a later user-owned backend.</p>';
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showPanel(page){
    if(page==="profile" && window.GaramaalProfile){window.GaramaalProfile.open();return;}
    syncAvatar();
    subview.hidden=false;
    let html="";
    if(page==="profile"){
      subtitle.textContent="Your profile";
      html='<h2>My career profile</h2><p>This is the new entry point for the upcoming structured profile editor. The existing CV and Jobs functions are unchanged.</p>'+
        '<div class="gmv3-panel"><strong>Planned profile sections</strong>'+
        '<p>Work Experience · Education · Achievements · Interests · Skills</p>'+
        '<p class="gmv3-micro">Profile editing and multi-user data storage are not implemented in Stage 1. Your existing candidate records are not changed here.</p></div>'+buttons();
    }else if(page==="statistics"){
      subtitle.textContent="Statistics";
      const pending=local.reminders.filter(x=>!x.done).length;
      html='<h2>Statistics & priorities</h2><p>Small personal targets and reminders appear here. Existing live Jobs statistics are still available in the original dashboard.</p>'+
        '<div class="gmv3-panel"><strong>Weekly target</strong><p>'+local.weeklyTarget+' job interests · example goal</p>'+
        '<strong>Reminders pending</strong><p>'+pending+' of '+local.reminders.length+' unchecked</p></div>'+buttons();
    }else if(page==="targets"){
      subtitle.textContent="Targets";
      html='<h2>Set a weekly target</h2><p>Adjust a local preview goal. This does not change your Freshmaal spreadsheet or Jobs ranking.</p>'+
        '<div class="gmv3-panel"><div class="gmv3-stepper">'+
        '<button type="button" data-gmv3="target-down" aria-label="Decrease target">−</button>'+
        '<output aria-live="polite">'+local.weeklyTarget+'</output>'+
        '<button type="button" data-gmv3="target-up" aria-label="Increase target">＋</button></div>'+
        '<p class="gmv3-micro">Target number is just an example until user-specific statistics are implemented.</p></div>'+buttons();
    }else if(page==="reminders"){
      subtitle.textContent="Reminders";
      html=remindersMarkup();
    }
    subbody.innerHTML=html;
  }
  function addReminder(){
    if(local.reminders.length>=8){showPanel("reminders");return;}
    local.reminders.push({id:Math.max(0,...local.reminders.map(x=>x.id))+1,
      label:"New reminder "+(local.reminders.length+1),done:false});
    showPanel("reminders");
  }
  root.addEventListener("click",function(event){
    const control=event.target.closest("[data-gmv3]");
    if(!control)return;
    const action=control.getAttribute("data-gmv3");
    if(action==="jobs"){enterJobs();return;}
    if(action==="more"){window.GaramaalDrawer?.open();return;}
    if(action==="install"){
      if(typeof window.__cvInstall==="function")window.__cvInstall();
      else window.alert("In Chrome, open the menu (⋮) and select Install app or Add to Home screen.");
      return;
    }
    // Homepage Statistics routes to the original authenticated Jobs dashboard.
    // Never substitute browser-local example numbers for actual job statistics.
    if(action==="statistics"){enterJobs();return;}
    // The homepage target shortcut opens the real candidate-scoped dashboard goals,
    // instead of the obsolete Stage 1 example target counter.
    if(action==="targets"){enterJobs();document.getElementById("gmv3-goal-alerts")?.scrollIntoView?.({behavior:"smooth",block:"start"});return;}
    if(action==="network"){window.location.assign("/social?gmv3=1");return;}
    if(action==="home"){showHome();return;}
    if(action==="target-up"||action==="target-down"){
      local.weeklyTarget=Math.max(1,Math.min(99,local.weeklyTarget+(action==="target-up"?1:-1)));
      showPanel("targets");return;
    }
    if(action==="add-reminder"){addReminder();return;}
    if(["profile","statistics","targets","reminders"].includes(action)){showPanel(action);}
  });
  root.addEventListener("change",function(event){
    const item=event.target.closest("[data-gmv3-check]");
    if(!item)return;
    const reminder=local.reminders.find(x=>String(x.id)===item.getAttribute("data-gmv3-check"));
    if(reminder)reminder.done=!!item.checked;
  });
  // This button appears in the existing, unchanged Jobs top bar only while
  // the /prototype route is active. It never takes over feature navigation.
  const bar=document.querySelector(".shell .topbar");
  if(bar&&!document.getElementById("gmv3-home-button")){
    const homeButton=document.createElement("button");
    homeButton.id="gmv3-home-button";
    homeButton.type="button";
    homeButton.textContent="‹";
    homeButton.title="Return to Garamaal home";
    homeButton.setAttribute("aria-label","Back to the start screen");
    homeButton.addEventListener("click",showHome);
    bar.insertBefore(homeButton,bar.firstChild);
  }
  syncAvatar();syncInstall();
  window.addEventListener("appinstalled",syncInstall);
  window.GaramaalPrototypeHome=Object.freeze({showHome,enterJobs});
})();
