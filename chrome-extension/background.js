"use strict";
importScripts("error_log.js");
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
let errorLogQueue=Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id)return false;
  if(message?.type==="gm-log-error"){
    errorLogQueue=errorLogQueue.catch(()=>{}).then(async()=>{
      const saved=await chrome.storage.local.get("recentErrors");
      const recentErrors=GaramaalErrorLog.append(saved.recentErrors,message.entry);
      await chrome.storage.local.set({recentErrors});
    });
    errorLogQueue.then(()=>sendResponse({ok:true}),()=>sendResponse({ok:false}));
    return true;
  }
  if(message?.type==="gm-get-errors"){
    errorLogQueue.then(async()=>{
      const saved=await chrome.storage.local.get("recentErrors");
      sendResponse({errors:saved.recentErrors||[]});
    },()=>sendResponse({errors:[]}));
    return true;
  }
  return false;
});
