"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../../mobile/android/app");
const get=file=>fs.readFileSync(path.join(root,file),"utf8");

const secure=get("src/main/java/app/garamaal/browser/SecureBrowser.java");
const engine=get("src/main/java/app/garamaal/browser/JobCaptureEngine.java");
const main=get("src/main/java/app/garamaal/browser/MainActivity.java");
const bottom=get("src/main/res/layout/secure_capture_toolbar.xml");
const gradle=get("build.gradle.kts");

test("Default browser uses Chrome Custom Tabs, with an explicit bottom Capture Job action",()=>{
  assert.match(secure,/androidx\.browser\.customtabs\.CustomTabsIntent/);
  assert.match(secure,/SecureBrowser|class SecureBrowser/);
  assert.match(secure,/setSecondaryToolbarViews\(bar, new int\[\]\{R\.id\.secure_capture_action\}, pendingCapture\)/);
  assert.match(secure,/addMenuItem\("Capture job in Garamaal", pendingCapture\)/);
  assert.match(secure,/getActivity\(\s*activity, 419, callback, PendingIntent\.FLAG_UPDATE_CURRENT \| PendingIntent\.FLAG_MUTABLE\)/);
  assert.match(secure,/FLAG_ACTIVITY_SINGLE_TOP/);
  assert.match(bottom,/android:id="@\+id\/secure_capture_action"/);
  assert.match(bottom,/Capture Job/);
  assert.match(gradle,/androidx\.browser:browser:1\.10\.0/);
  assert.match(gradle,/versionName = "0\.5\.0"/);
});

test("Chrome sends only current page URL to native activity, not OAuth tokens",()=>{
  assert.match(main,/SecureBrowser\.isCaptureIntent\(intent\)/);
  assert.match(main,/captureFromSecureTab\(intent\.getData\(\)\)/);
  assert.match(main,/backgroundCapture\.capture\(url,/);
  assert.match(main,/openSecureBrowser\(SecureBrowser\.INITIAL_URL\)/);
  assert.match(main,/openSecureBrowser\(target\)/);
  assert.doesNotMatch(secure,/CookieManager|document\.cookie|getCookie|setUserAgentString|evaluateJavascript/);
  assert.doesNotMatch(engine,/CookieManager|document\.cookie|getCookie|setUserAgentString/);
});

test("Existing editable review and Save Job / Make CV pipeline are preserved",()=>{
  assert.match(main,/applyCaptureResult\(job, note\)/);
  assert.match(main,/jobDescription\.setText\(data\.optString\("description"\)\)/);
  assert.match(main,/applicationUrl\.setText\(data\.optString\("url"\)\)/);
  assert.match(main,/handOffCapture\(false\)/);
  assert.match(main,/handOffCapture\(true\)/);
  assert.match(main,/backgroundCapture\.dispose\(\)/);
  assert.match(engine,/WebSettings\.MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(engine,/TIMEOUT_MS = 16000/);
  assert.match(engine,/h\.equals\("linkedin\.com"\)/);
  assert.match(engine,/h\.equals\("accounts\.google\.com"\)/);
  assert.match(engine,/webView\.evaluateJavascript\(script,/);
  assert.match(engine,/container\.addView\(view, 0,/);
});
