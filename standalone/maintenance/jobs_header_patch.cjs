"use strict";
/* Visual-only patch for the running Jobs Cloud Run image.
   Never take webapp/Index.html from GitHub as a replacement for the live version. */
const fs=require("node:fs");
const MARK="garamaal-jobs-live-overlay-v1";
function patch(html){
 if(typeof html!=="string"||html.length<1000)throw Error("SAFE STOP: live Jobs HTML missing.");
 if(html.includes(MARK))throw Error("SAFE STOP: dashboard is already patched.");
 const matches=html.match(/<header class="topbar">[\s\S]*?<\/header>/g)||[];
 if(matches.length!==1)throw Error("SAFE STOP: one legacy Jobs topbar required.");
 const before=matches[0];
 for(const id of ["candidateToggle","expenseToggle","modeBadge","avatar"])
  if(!before.includes('id="'+id+'"'))throw Error("SAFE STOP: legacy control missing: "+id);
 if(!before.includes('class="top-actions"')||before.includes('socialHeaderLink'))
  throw Error("SAFE STOP: live Jobs header differs from reviewed baseline.");
 const avatar=before.match(/<div id="avatar" class="avatar">[^<]*<\/div>/);
 if(!avatar)throw Error("SAFE STOP: avatar markup differs from live baseline.");
 const links='<a id="jobHeaderLink" class="garamaal-head-link active" href="/" aria-current="page">Job</a>'+
  '<a id="socialHeaderLink" class="garamaal-head-link" href="/social">Social</a>';
 const header=before.replace('<header class="topbar">','<header class="topbar garamaal-unified-header">')
  .replace('class="top-actions"','class="top-actions garamaal-header-controls"')
  .replace(avatar[0],links+avatar[0]);
 const css=[
 "/* garamaal-jobs-live-overlay-v1: no original button handler is changed */",
 ".topbar.garamaal-unified-header{height:58px;min-height:58px;background:#fff;border-bottom:1px solid #dce4ef;padding:0 24px}",
 ".garamaal-unified-header .garamaal-header-controls{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0;flex-wrap:nowrap}",
 ".garamaal-unified-header #candidateToggle{order:1;flex:none;padding:3px;gap:2px;border:1px solid #e0e9f5;border-radius:11px}",
 ".garamaal-unified-header #candidateToggle button{height:32px;min-width:31px;padding:6px 8px;font-size:12px;font-weight:800;border-radius:8px}",
 ".garamaal-unified-header #candidateToggle button:nth-child(2){font-size:0!important}",
 ".garamaal-unified-header #candidateToggle button:nth-child(2)::after{content:\"P\";font-size:12px}",
 ".garamaal-unified-header #expenseToggle{order:2;min-width:33px;width:33px;height:34px;min-height:34px;border:1px solid #dce4ef;border-radius:10px;background:#f2f5fa;color:#34516f;font-size:12px}",
 ".garamaal-unified-header #cv-account-switch{order:3;position:relative;min-width:33px!important;width:33px!important;height:34px!important;padding:0!important;font-size:0!important;line-height:0!important;border:1px solid #dce4ef!important;border-radius:10px!important;background:#f2f5fa!important;color:#285283!important}",
 ".garamaal-unified-header #cv-account-switch::before{content:\"G\";font-size:13px;line-height:1;font-weight:850}",
 ".garamaal-unified-header #jobHeaderLink{order:4}",
 ".garamaal-unified-header #socialHeaderLink{order:5}",
 ".garamaal-unified-header #modeBadge{order:6}",
 ".garamaal-unified-header #avatar{order:7;display:none}",
 ".garamaal-unified-header .garamaal-head-link{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 10px;font-size:12px;font-weight:800;white-space:nowrap;border-radius:10px;background:#f2f5fa;color:#34516f;border:1px solid #dce4ef;text-decoration:none}",
 ".garamaal-unified-header .garamaal-head-link.active{background:#e6efff;border-color:#b8cef6;color:#1d55a0}",
 ".garamaal-unified-header #modeBadge{display:inline-flex!important;align-items:center;justify-content:center;min-height:28px;max-width:none;padding:5px 8px;border-radius:999px;border:1px solid #dce4ef;background:#f1f4f8;color:#64748b;font-size:0!important;font-weight:850;white-space:nowrap}",
 ".garamaal-unified-header #modeBadge::before{content:\"\";display:inline-block;width:6px;height:6px;margin-right:5px;background:currentColor;border-radius:50%}",
 ".garamaal-unified-header #modeBadge::after{content:\"PREVIEW\";font-size:10px}",
 ".garamaal-unified-header #modeBadge.garamaal-connected{background:#eef8ef;color:#27714b;border-color:#d8e4d7}",
 ".garamaal-unified-header #modeBadge.garamaal-connected::after{content:\"LIVE\"}",
 ".garamaal-unified-header #modeBadge.garamaal-local-editing{background:#fff2cf!important;color:#94590c!important;border-color:#e4bf76!important;box-shadow:0 0 0 2px #f1d9a144}",
 ".garamaal-unified-header #modeBadge.garamaal-local-editing::after{content:\"EDITING\"}",
 "@media(max-width:720px){",
 " .topbar.garamaal-unified-header{height:52px;min-height:52px;padding:0 8px}",
 " .garamaal-unified-header .crumb{display:none}",
 " .garamaal-unified-header .garamaal-header-controls{width:100%;justify-content:space-between;gap:4px}",
 " .garamaal-unified-header #candidateToggle{padding:2px}",
 " .garamaal-unified-header #candidateToggle button{height:29px;min-width:27px;padding:5px 6px;font-size:11px}",
 " .garamaal-unified-header #candidateToggle button:nth-child(2)::after{font-size:11px}",
 " .garamaal-unified-header .garamaal-head-link{padding:0 7px;min-height:32px;font-size:11px}",
 " .garamaal-unified-header #expenseToggle{height:32px;min-height:32px;width:30px;min-width:30px}",
 " .garamaal-unified-header #cv-account-switch{height:32px!important;width:30px!important;min-width:30px!important}",
 " .garamaal-unified-header #modeBadge{padding:4px 6px;min-height:25px}",
 " .garamaal-unified-header #modeBadge::after{font-size:9px}",
 "}",
 "@media(max-width:365px){.garamaal-unified-header .garamaal-header-controls{gap:2px}.garamaal-unified-header .garamaal-head-link{padding:0 5px}.garamaal-unified-header #modeBadge{padding:3px 5px}.garamaal-unified-header #modeBadge::after{font-size:8px}}"
 ].join("\n");
 const passive=[
 "<script data-garamaal-jobs-live-overlay>",
 "(function(){",
 " const badge=document.getElementById(\"modeBadge\");if(!badge)return;let timer;",
 " function sync(){",
 "  const ready=/GOOGLE SHEETS LIVE|^LIVE$/i.test(String(badge.textContent||\"\").trim());",
 "  badge.classList.toggle(\"garamaal-connected\",ready);",
 "  if(!ready)badge.classList.remove(\"garamaal-local-editing\");",
 " }",
 " sync();new MutationObserver(sync).observe(badge,{subtree:true,childList:true,characterData:true});",
 " function onLocalEdit(e){",
 "  if(!badge.classList.contains(\"garamaal-connected\"))return;",
 "  const el=e.target;",
 "  if(!el||!el.matches||!el.matches(\"input,textarea,select,[contenteditable]\")||el.disabled||el.readOnly||el.matches(\"input[type=hidden]\"))return;",
 "  badge.classList.add(\"garamaal-local-editing\");",
 "  badge.title=\"Local input detected; a spreadsheet change is not confirmed until you save.\";",
 "  clearTimeout(timer);timer=setTimeout(()=>{badge.classList.remove(\"garamaal-local-editing\");badge.title=\"Google Sheets connected; other users editing are not detected.\";},2600);",
 " }",
 " document.addEventListener(\"input\",onLocalEdit,true);",
 " document.addEventListener(\"change\",onLocalEdit,true);",
 " document.addEventListener(\"keydown\",e=>{if(e.key===\"Enter\")onLocalEdit(e)},true);",
 "})();",
 "</script>"
 ].join("\n");
 if((html.match(/<\/style>/g)||[]).length!==1||(html.match(/<\/body>/g)||[]).length!==1)
  throw Error("SAFE STOP: Jobs HTML style/body layout changed.");
 return html.replace(before,header).replace("</style>",css+"\n</style>").replace("</body>",passive+"\n</body>");
}
if(require.main===module){
 const path=process.argv[2];if(!path)throw Error("Provide Jobs HTML file path");
 const original=fs.readFileSync(path,"utf8");
 const after=patch(original);
 fs.writeFileSync(path,after);
 console.log("JOBS_UI_PATCH_VERIFIED: existing candidate, cost and Google handlers retained");
}
module.exports={patch};
