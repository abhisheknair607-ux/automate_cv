"use strict";
/*
 * Transport adapter for the unchanged Index.html UI. Replaces only the
 * google.script.run connection using authenticated Cloud Run JSON endpoints.
 * Firebase keeps a normal long-lived browser session in IndexedDB.
 */
(function() {
  let authInstance=null, currentUser=null, firebaseReady=false, oauthProvider=null;
  let callbacks=[],sdkError=null;
  const listenerReady=new Promise(resolve=>{window.__cvAuthReady=resolve;});

  function errorText(message) {
    const target=document.querySelector("#cv-login-error");
    if(target)target.textContent=message||"";
  }
  function renderLogin(show) {
    let overlay=document.getElementById("cv-login-overlay");
    if(!overlay) {
      overlay=document.createElement("div");
      overlay.id="cv-login-overlay";
      overlay.style.cssText="position:fixed;inset:0;z-index:1000;background:#f4f8fc;display:flex;align-items:center;justify-content:center;padding:18px;font:14px system-ui";
      overlay.innerHTML='<div style="width:min(380px,100%);border-radius:16px;background:#fff;box-shadow:0 12px 38px #192d4d25;padding:28px;color:#18385c">'
        +'<h2 style="font-size:21px;margin:0 0 12px">Automate CV</h2>'
        +'<p style="font-size:13px;line-height:1.6;color:#596f83">Use an approved Google account. Your sign-in is remembered between browser sessions.</p>'
        +'<button type="button" id="cv-google-login" style="width:100%;border:0;border-radius:9px;background:#2563c8;color:#fff;padding:12px;font-weight:750;cursor:pointer">Continue with Google</button>'
        +'<p id="cv-login-error" role="alert" style="font-size:12px;color:#aa2531;line-height:1.5"></p>'
        +'<small style="display:block;margin-top:12px;color:#72889a">Only authorised accounts can open job or CV data.</small></div>';
      document.body.appendChild(overlay);
      overlay.querySelector("#cv-google-login").addEventListener("click",async()=>{
        const btn=document.getElementById("cv-google-login");
        btn.disabled=true;btn.textContent="Signing in…";errorText("");
        try {
          if(sdkError)throw sdkError;
          if(!firebaseReady||!authInstance)throw Error("Google login is still loading. Try again.");
          oauthProvider.setCustomParameters({prompt:"select_account"});
          try {await authInstance.signInWithPopup(oauthProvider);}
          catch(e) {
            if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(e.code)) {
              await authInstance.signInWithRedirect(oauthProvider);
              return;
            }
            throw e;
          }
        } catch(e) {
          errorText(e&&e.message||"Could not sign in. Please retry.");
        } finally {
          btn.disabled=false;btn.textContent="Continue with Google";
        }
      });
    }
    overlay.style.display=show?"flex":"none";
  }
  function installAccountSwitch() {
    const actions=document.querySelector(".top-actions");
    if(!actions||document.getElementById("cv-account-switch"))return;
    const button=document.createElement("button");
    button.id="cv-account-switch";
    button.type="button";
    button.textContent="Switch Google";
    button.title="Sign out and choose a different approved Google account";
    button.style.cssText="padding:7px 9px;border:1px solid #c6d3e8;border-radius:8px;background:#fff;color:#23466e;cursor:pointer;font-size:11px;font-weight:650;white-space:nowrap";
    button.addEventListener("click",async()=>{
      try {
        if(authInstance)await authInstance.signOut();
        emitUser(null);
      } catch(e) { errorText(e.message||"Sign-out failed."); }
    });
    actions.appendChild(button);
  }
  function waitForUser() {
    if(currentUser)return Promise.resolve(currentUser);
    renderLogin(true);
    return new Promise(resolve=>callbacks.push(resolve));
  }
  function emitUser(user) {
    currentUser=user;
    renderLogin(!user);
    if(user) {
      const pending=callbacks;callbacks=[];
      pending.forEach(fn=>fn(user));
    }
  }
  function chain(success,failure) {
    return new Proxy({}, {
      get(_target,name) {
        if(name==="withSuccessHandler")return fn=>chain(fn,failure);
        if(name==="withFailureHandler")return fn=>chain(success,fn);
        if(name==="then")return undefined;
        return arg=>{
          request(String(name),arg).then(
            result=>{if(typeof success==="function")success(result);},
            err=>{if(typeof failure==="function")failure({message:err.message});}
          );
        };
      }
    });
  }
  async function request(method,arg) {
    const user=await waitForUser();
    async function send(force=false) {
      const token=await user.getIdToken(force);
      return fetch("/api/"+encodeURIComponent(method),{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
        body:JSON.stringify({arg:arg===undefined?null:arg})
      });
    }
    let response=await send();
    if(response.status===401)response=await send(true);
    let json;
    try {json=await response.json();}
    catch {throw Error("The dashboard server did not return a valid response.");}
    if(!response.ok) {
      if(response.status===403 && /not authorised for Garamaal/i.test(String(json.error||""))) {
        emitUser(null);
        errorText(json.error||"This Google account is not authorised. Select another account.");
        try {await authInstance.signOut();}catch{}
      }
      throw Error(json.error||"Request failed.");
    }
    return json.data;
  }
  async function requestSpecial(endpoint,body){
    if(!["connections/preview","connections/research","repair-ranks"].includes(endpoint))
      throw Error("Unsupported operation.");
    const user=await waitForUser();
    async function send(force=false){
      return fetch("/api/"+endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+await user.getIdToken(force)},
        body:JSON.stringify(body||{})
      });
    }
    let response=await send();
    if(response.status===401)response=await send(true);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Operation failed.");
    return data.data;
  }
  async function loadTokenUsage(candidate,row){
    const user=await waitForUser();
    async function send(force=false){
      return fetch("/api/usage",{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+await user.getIdToken(force)},
        body:JSON.stringify({candidate,row})
      });
    }
    let response=await send();
    if(response.status===401)response=await send(true);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Usage verification unavailable.");
    return data.data;
  }
  async function downloadDocument(candidate,row,kind) {
    const user=await waitForUser();
    async function send(force=false) {
      return fetch("/api/download",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+await user.getIdToken(force)},
        body:JSON.stringify({candidate,row,kind})
      });
    }
    let response=await send();
    if(response.status===401)response=await send(true);
    if(!response.ok) {
      const body=await response.json().catch(()=>({}));
      throw Error(body.error||"Could not download the document.");
    }
    const disposition=response.headers.get("Content-Disposition")||"";
    const name=disposition.match(/filename="([^"\r\n]+)"/i)?.[1]||((kind==="cl"?"CL":"CV")+".docx");
    const blob=await response.blob();
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=name;anchor.style.display="none";
    document.body.appendChild(anchor);
    anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function loadScript(src) {
    return new Promise((resolve,reject)=>{
      const el=document.createElement("script");
      el.src=src;el.async=true;el.onload=resolve;
      el.onerror=()=>reject(Error("Cannot load secure Google authentication library."));
      document.head.appendChild(el);
    });
  }
  async function initAuth() {
    renderLogin(true);
    installAccountSwitch();
    try {
      const response=await fetch("/config",{cache:"no-store"});
      if(!response.ok)throw Error("Dashboard authentication settings are unavailable.");
      const config=await response.json();
      if(!config.apiKey||!config.authDomain||!config.projectId||!config.appId)
        throw Error("Firebase sign-in needs its one-time deployment configuration.");
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js");
      firebase.initializeApp(config);
      authInstance=firebase.auth();
      await authInstance.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      oauthProvider=new firebase.auth.GoogleAuthProvider();
      firebaseReady=true;
      authInstance.onAuthStateChanged(emitUser,err=>{
        sdkError=err;
        renderLogin(true);
        errorText(err.message||"Google authentication failed.");
      });
    }catch(e) {
      sdkError=e;
      renderLogin(true);
      errorText(e.message||"Could not initialise Google sign-in.");
    }
  }
  // Deliberately preserve the original Apps Script-like front-end call chain.
  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=chain(null,null);
  window.__cvStandalone={switchAccount:async()=>{if(authInstance)await authInstance.signOut();emitUser(null);},downloadDocument,loadTokenUsage,requestSpecial};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initAuth,{once:true});
  else initAuth();
})();
