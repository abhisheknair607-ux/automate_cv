"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"android_browser_launcher.js"),"utf8");
const landing=fs.readFileSync(path.join(root,"mobile_home_shell.js"),"utf8");
const manifest=fs.readFileSync(path.join(root,"../mobile/android/app/src/main/AndroidManifest.xml"),"utf8");
const activity=fs.readFileSync(path.join(root,"../mobile/android/app/src/main/java/app/garamaal/browser/MainActivity.java"),"utf8");
const server=fs.readFileSync(path.join(root,"server.js"),"utf8");

function harness({android=true,standalone=true}={}){
  const redirects=[];
  const clickCallbacks=[];
  const location={origin:"https://garamaal.web.app",assign(url){redirects.push(url)}};
  const context={
    navigator:{userAgent:android?"Mozilla/5.0 (Linux; Android 15) Chrome/132":"Mozilla/5.0 (Windows NT 10.0) Chrome/132"},
    window:{matchMedia:()=>({matches:standalone}),location},
    location,URL,encodeURIComponent,
    document:{addEventListener(event,callback,capture){if(event==="click")clickCallbacks.push({callback,capture});}}
  };
  vm.runInNewContext(source,context);
  function click(el){
    let prevented=false,stopped=false;
    const event={
      target:{closest(){return el}},
      defaultPrevented:false,button:0,metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,
      preventDefault(){prevented=true},
      stopImmediatePropagation(){stopped=true}
    };
    clickCallbacks[0].callback(event);
    return {prevented,stopped};
  }
  return{bridge:context.window.GaramaalAndroidBrowser,redirects,click};
}

test("Only the installed Android PWA routes job links into native app",()=>{
  const h=harness();
  assert.equal(h.bridge.isInstalledAndroid(),true);
  assert.equal(h.bridge.openJob("https://job-boards.greenhouse.io/example/jobs/123"),true);
  assert.match(h.redirects[0],/^intent:\/\/open\?url=https%3A%2F%2Fjob-boards\.greenhouse\.io%2Fexample%2Fjobs%2F123#Intent;/);
  assert.match(h.redirects[0],/scheme=garamaal-browser;package=app\.garamaal\.browser;/);
  assert.match(h.redirects[0],/S\.browser_fallback_url=https%3A%2F%2Fjob-boards\.greenhouse\.io/);
  const h2=harness({standalone:false});
  assert.equal(h2.bridge.openJob("https://jobs.example.com/1"),false);
  assert.deepEqual(h2.redirects,[]);
  const desktop=harness({android:false});
  assert.equal(desktop.bridge.openHome(),false);
  assert.deepEqual(desktop.redirects,[]);
});

test("Installed PWA home Open Browser works and missing app goes to help",()=>{
  const h=harness();
  assert.equal(h.bridge.openHome(),true);
  assert.match(h.redirects[0],/^intent:\/\/open#Intent;scheme=garamaal-browser;/);
  assert.match(h.redirects[0],/android-browser-help/);
  assert.match(landing,/Open Browser/);
  assert.match(landing,/GaramaalAndroidBrowser\?\.openHome/);
});

test("Only employer job links are intercepted; never LinkedIn or Drive documents",()=>{
  const h=harness();
  assert.equal(h.bridge.openJob("https://www.linkedin.com/jobs/view/123"),false);
  assert.equal(h.bridge.openJob("https://drive.google.com/file/d/some-doc"),false);
  assert.equal(h.bridge.openJob("javascript:alert(1)"),false);
  assert.equal(h.bridge.openJob("http://jobs.example.com/job/5"),false);
  assert.equal(h.bridge.openJob("https://garamaal.web.app/prototype"),false);
  assert.deepEqual(h.redirects,[]);
  const evt=h.click({tagName:"A",getAttribute(){return "https://jobs.lever.co/sample/678";}});
  assert.equal(evt.prevented,true);
  assert.equal(evt.stopped,true);
  assert.equal(h.redirects.length,1);
  const h3=harness({standalone:false});
  const uninstalledClick=h3.click({tagName:"A",getAttribute(){return "https://jobs.lever.co/sample/678";}});
  assert.equal(uninstalledClick.prevented,false);
  assert.deepEqual(h3.redirects,[]);
});

test("Android app registers and validates deep links; PWA injects integration only in prototype",()=>{
  assert.match(manifest,/android:scheme="garamaal-browser" android:host="open"/);
  assert.match(manifest,/android.intent.action.VIEW/);
  assert.match(manifest,/android.intent.category.BROWSABLE/);
  assert.match(manifest,/android:launchMode="singleTop"/);
  assert.match(activity,/private boolean openIncomingLink\(Intent intent\)/);
  assert.match(activity,/uri.getQueryParameter\("url"\)/);
  assert.match(activity,/!"https"\.equalsIgnoreCase\(vacancy\.getScheme\(\)\)/);
  assert.match(activity,/if \(!openIncomingLink\(getIntent\(\)\) && state == null\) showBrowserHome\(\)/);
  assert.match(activity,/openIncomingLink\(intent\)/);
  assert.match(server,/android-browser-launcher\.js\?v=android-pwa-bridge-1/);
  assert.match(server,/app.get\("\/prototype\/android-browser-help"/);
  new vm.Script(source);
});
