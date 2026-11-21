"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const java=fs.readFileSync(path.join(__dirname,"../../mobile/android/app/src/main/java/app/garamaal/browser/MainActivity.java"),"utf8");
const manifest=fs.readFileSync(path.join(__dirname,"../../mobile/android/app/src/main/AndroidManifest.xml"),"utf8");
const gradle=fs.readFileSync(path.join(__dirname,"../../mobile/android/app/build.gradle.kts"),"utf8");

test("Android 15 reserves safe area above the phone's system navigation controls",()=>{
  assert.match(java,/applySafeAreaInsets\(root\)/);
  assert.match(java,/setOnApplyWindowInsetsListener/);
  assert.match(java,/WindowInsets\.Type\.systemBars\(\)/);
  assert.match(java,/WindowInsets\.Type\.displayCutout\(\)/);
  assert.match(java,/WindowInsets\.Type\.ime\(\)/);
  assert.match(java,/view\.setPadding\(bars\.left, bars\.top, bars\.right,/);
  assert.match(java,/Math\.max\(bars\.bottom, ime\.bottom\)/);
  assert.match(java,/getWindow\(\)\.setNavigationBarContrastEnforced\(false\)/);
  assert.match(java,/root\.addView\(nav\)/);
});

test("LinkedIn and Google OAuth are sent to a trusted browser rather than WebView",()=>{
  assert.match(java,/isTrustedBrowserOnly\(uri\)/);
  assert.match(java,/host\.equals\("linkedin\.com"\)/);
  assert.match(java,/host\.endsWith\("\.linkedin\.com"\)/);
  assert.match(java,/host\.equals\("accounts\.google\.com"\)/);
  assert.match(java,/openTrustedBrowser\(uri\.toString\(\)\)/);
  assert.match(java,/intent\.addCategory\(Intent\.CATEGORY_BROWSABLE\)/); // existing Garamaal route
  assert.match(java,/browserIntent\.setPackage\("com\.android\.chrome"\)/);
  assert.doesNotMatch(java,/setUserAgentString|CookieManager|getCookie\(/);
});

test("Mobile app keeps employer DOM capture, share support and improved address bar",()=>{
  assert.match(java,/browser\.evaluateJavascript\(script,/);
  assert.match(java,/if \(isTrustedBrowserOnly\(uri\)\) \{/);
  assert.match(java,/Intent\.ACTION_SEND/);
  assert.match(java,/Button external = button\("Chrome ↗"\)/);
  assert.match(java,/loadDataWithBaseURL\(null,/);
  assert.match(manifest,/android\.intent\.action\.SEND/);
  assert.match(gradle,/versionName = "0\.2\.1"/);
});
