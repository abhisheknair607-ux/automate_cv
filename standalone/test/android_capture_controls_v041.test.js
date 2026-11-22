"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../../mobile/android/app");
const secure=fs.readFileSync(path.join(root,"src/main/java/app/garamaal/browser/SecureBrowser.java"),"utf8");
const activity=fs.readFileSync(path.join(root,"src/main/java/app/garamaal/browser/MainActivity.java"),"utf8");
const manifest=fs.readFileSync(path.join(root,"src/main/AndroidManifest.xml"),"utf8");
test("Prefer Chrome Custom Tabs so Brave does not silently drop Garamaal toolbar",()=>{
  assert.match(secure,/customTab\.intent\.setPackage\("com\.android\.chrome"\)/);
  assert.match(secure,/customTab\.intent\.setPackage\(null\)/);
  assert.match(secure,/catch \(ActivityNotFoundException chromeMissing\)/);
  assert.match(secure,/setSecondaryToolbarViews\(bar, new int\[\]\{R\.id\.secure_capture_action\}, pendingCapture\)/);
});
test("Capture Job appears in top toolbar, bottom toolbar and menu where browser supports it",()=>{
  assert.match(secure,/setActionButton\(captureIcon\(\), "Capture Job in Garamaal",/);
  assert.match(secure,/addMenuItem\("Capture job in Garamaal", pendingCapture\)/);
  assert.match(secure,/PendingIntent\.FLAG_UPDATE_CURRENT \| PendingIntent\.FLAG_MUTABLE/);
  assert.match(secure,/callback\.setAction\(ACTION_CAPTURE\)/);
  assert.match(activity,/SecureBrowser\.isCaptureIntent\(intent\)/);
  assert.match(activity,/captureFromSecureTab\(intent\.getData\(\)\)/);
});
test("Native Android Share sheet offers explicit employer-job capture fallback",()=>{
  assert.match(manifest,/android\.intent\.action\.SEND/);
  assert.match(manifest,/android:mimeType="text\/plain"/);
  assert.match(activity,/String sharedUrl = matcher\.group\(\)\.replaceAll/);
  assert.match(activity,/JobCaptureEngine\.eligible\(sharedUrl\)/);
  assert.match(activity,/captureFromSecureTab\(Uri\.parse\(sharedUrl\)\)/);
  assert.match(activity,/openSecureBrowser\(sharedUrl\)/);
  assert.doesNotMatch(secure,/CookieManager|getCookie\(|setUserAgentString/);
});