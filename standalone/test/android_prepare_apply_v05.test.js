"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const app=path.resolve(__dirname,"../../mobile/android/app");
const get=p=>fs.readFileSync(path.join(app,p),"utf8");
const main=get("src/main/java/app/garamaal/browser/MainActivity.java");
const prep=get("src/main/java/app/garamaal/browser/PreparationActivity.java");
const chrome=get("src/main/java/app/garamaal/browser/SecureBrowser.java");
const xml=get("src/main/AndroidManifest.xml");
const gradle=get("build.gradle.kts");
test("Capture launches a separate Garamaal preparation task, not CLEAR_TOP of Chrome",()=>{
  assert.match(chrome,/new Intent\(activity, PreparationActivity\.class\)/);
  assert.match(chrome,/FLAG_ACTIVITY_NEW_TASK/);
  assert.match(chrome,/FLAG_ACTIVITY_MULTIPLE_TASK/);
  assert.doesNotMatch(chrome,/callback\.addFlags\(Intent\.FLAG_ACTIVITY_CLEAR_TOP/);
  assert.match(prep,/class PreparationActivity extends MainActivity/);
  assert.match(prep,/android\.R\.anim\.fade_in/);
  assert.match(xml,/android:name="\.PreparationActivity"/);
  assert.match(xml,/android:exported="false"/);
  assert.match(xml,/android:taskAffinity="app\.garamaal\.browser\.prepare"/);
});
test("Preparation renders the public employer page in a visible WebView with matching navy Garamaal chrome",()=>{
  assert.match(main,/toolbar\.setBackgroundColor\(NAVY\)/);
  assert.match(main,/addressBackground\.setColor\(Color\.WHITE\)/);
  assert.match(main,/assistant\.setBackgroundColor\(NAVY\)/);
  assert.match(main,/browserStack\.addView\(browser,/);
  assert.match(main,/if \(this instanceof PreparationActivity\) \{\s*\/\/ Unlike the previous v0\.4 hidden extractor/);
  assert.match(main,/prepareAutoCapture = true;\s*navigate\(url\);/);
  assert.match(main,/if \(url\.equals\(view\.getUrl\(\)\)\) captureJob\(\)/);
  assert.match(main,/applyCaptureResult\(data,/);
  assert.match(main,/new LinearLayout\.LayoutParams\(-1, 0, 1\)/);
});
test("Prep has Make CV and Apply, and Apply closes only prep task",()=>{
  assert.match(main,/button\("Make CV"\)/);
  assert.match(main,/button\("Apply ↗"\)/);
  assert.match(main,/button\("Save Job to Garamaal"\)/);
  assert.match(main,/button\("Save & Make CV"\)/);
  assert.match(main,/finishAndRemoveTask\(\)/);
  assert.match(main,/this instanceof PreparationActivity/);
  assert.match(main,/handOffCapture\(true\)/);
  assert.match(gradle,/versionName = "0\.5\.0"/);
});
test("Preparation does not load logged-in LinkedIn pages into WebView and never submits forms",()=>{
  assert.match(main,/!JobCaptureEngine\.eligible\(url\)/);
  assert.match(main,/LinkedIn stays in Secure Browser/);
  assert.doesNotMatch(main,/\\.submit\\(|click\\(.*Submit|CookieManager|getCookie\\(/);
});