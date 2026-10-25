"use strict";
/**
 * Compatibility layer for the ORIGINAL, UNCHANGED webapp/Code.gs source.
 * The goal is functional parity, not a reimplementation of business logic.
 */
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {createSpreadsheetApp} = require("./sheets");

const SCRIPT = fs.readFileSync(path.resolve(__dirname,"../webapp/Code.gs"),"utf8");
// Keep Code.gs immutable while binding its two spreadsheet IDs to the
// deployment environment. Production pilot IDs remain identical; staging
// deployments use COPIES, not the hard-coded production IDs.
function sourceWithSheetIds(ids) {
  const requested={taazaId:String(ids?.taaza||""),freshId:String(ids?.fresh||"")};
  if(Object.values(requested).some(id=>!/^[A-Za-z0-9_-]{20,}$/.test(id)))
    throw new Error("Valid Taaza and Freshmaal spreadsheet IDs are required");
  const occurrences={taazaId:0,freshId:0};
  const bound=SCRIPT.replace(/\b(taazaId|freshId):\s*'[^']+'/g,(_match,key)=>{
    occurrences[key]++;
    return key+": '"+requested[key]+"'";
  });
  if(occurrences.taazaId!==1||occurrences.freshId!==1)
    throw new Error("Unable to safely bind both legacy spreadsheet IDs");
  return bound;
}
const METHODS = new Set([
  "getBootstrap", "listJobs", "getJob", "getExpenses", "setNotInterested", "setJobPreference", "bulkSetJobPreferences", "migrateJobPreferences", "addDiscovery",
  "saveDiscovery", "transferJob", "bulkTransfer", "updateFreshJD",
  "getCopyPrompt", "updateFreshControl", "updateApplicationProgress", "getStats", "runCvApiNow",
  "syncDiscoveryMaster", "gmPipelineStats", "gmListJobsFaceted"
]);
const CACHE = new Map();
function safeGithubRequest(uri, params) {
  const expected = "https://api.github.com/repos/abhisheknair607-ux/automate_cv/actions/workflows/controlled-cv-test.yml/dispatches";
  if(uri!==expected)throw new Error("This external URL is not approved");
  const args = ["--silent","--show-error","--max-time","25","-X",String(params.method||"get").toUpperCase(),
    "--write-out","\nCV_RESPONSE_STATUS=%{http_code}"];
  if(params.contentType)args.push("-H","Content-Type: "+params.contentType);
  Object.entries(params.headers||{}).forEach(([key,value])=>{
    // Only the known GitHub headers, no untrusted dynamic credential source.
    if(!/^(Authorization|Accept|X-GitHub-Api-Version)$/i.test(key))return;
    args.push("-H",key+": "+value);
  });
  if(params.payload)args.push("--data-binary",String(params.payload));
  args.push(uri);
  let raw;
  try {raw=execFileSync("curl",args,{encoding:"utf8",timeout:29000,maxBuffer:1024*1024});}
  catch(err){throw new Error("GitHub Actions request failed. Review backend connectivity.");}
  const match=raw.match(/\nCV_RESPONSE_STATUS=(\d{3})$/);
  if(!match)throw new Error("GitHub Actions response has no HTTP status");
  const status=Number(match[1]);
  return {getResponseCode:()=>status,getContentText:()=>raw.slice(0,match.index)};
}
function buildCache() {
  return {
    get(key) {
      const entry=CACHE.get(String(key));
      if(!entry)return null;
      if(entry.until<Date.now()){CACHE.delete(String(key));return null;}
      return entry.value;
    },
    put(key,value,seconds){
      const ttl=Math.max(1,Math.min(21600,Number(seconds)||1));
      CACHE.set(String(key),{value:String(value),until:Date.now()+ttl*1000});
    },
    remove(key){CACHE.delete(String(key));}
  };
}
function constructServices({token,email,ids,githubToken,allowedEmails}) {
  if(!token || !email)throw new Error("Missing authenticated account");
  return {
    SpreadsheetApp:createSpreadsheetApp(token,ids),
    Session:{getEffectiveUser:()=>({getEmail:()=>email})},
    PropertiesService:{getScriptProperties:()=>({
      getProperty(key){
        if(key==="ALLOWED_EMAILS")return allowedEmails;
        if(key==="GITHUB_WORKFLOW_TOKEN")return githubToken||"";
        return null;
      }
    })},
    LockService:{getScriptLock:()=>({
      // Cloud Run is restricted to ONE concurrent request and ONE instance.
      waitLock(ms){if(!Number.isFinite(ms))throw new Error("Invalid lock duration");},
      releaseLock(){}
    })},
    CacheService:{getScriptCache:buildCache},
    UrlFetchApp:{fetch:safeGithubRequest},
    console
  };
}
const READ_ONLY_METHODS = new Set([
  "getBootstrap", "listJobs", "getJob", "getCopyPrompt", "getStats", "getExpenses",
  "gmPipelineStats", "gmListJobsFaceted"
]);
async function invoke(method,arg,options) {
  if(!METHODS.has(method))throw new Error("Unknown application operation");
  if(options?.readOnly && !READ_ONLY_METHODS.has(method)) {
    throw Object.assign(new Error("Read-only pilot: changes are disabled until the new app is approved."),{httpCode:403});
  }
  const sandbox=constructServices(options);
  const context=vm.createContext(sandbox,{name:"legacy-cv-controller"});
  vm.runInContext(sourceWithSheetIds(options?.ids),context,{filename:"webapp/Code.gs",timeout:5000});
  if(method==="gmPipelineStats"||method==="gmListJobsFaceted") {
    vm.runInContext(require("./prototype_queries").SOURCE,context,{filename:"standalone/prototype_queries.js",timeout:5000});
  }
  if(options?.readOnly) {
    // The original read endpoints automatically call this master-sync routine,
    // which may write Jobs!P. Override ONLY in pilot mode; in production the
    // unmodified Apps Script function must execute unchanged.
    vm.runInContext("syncTaazaMaster_ = function(){return {added:0,cached:true,readOnly:true}}",context);
  }
  context.__rpcArg=arg;
  // The method name is checked against a static server-controlled allowlist.
  // VM timeout applies to pure JS, not synchronous I/O. Cloud Run timeout
  // must remain longer than the longest required Sheets operation.
  const result=vm.runInContext(method+"(__rpcArg)",context,{
    filename:"standalone/call",timeout:120000
  });
  return JSON.parse(JSON.stringify(result===undefined?null:result));
}
module.exports={invoke,METHODS,READ_ONLY_METHODS,constructServices,sourceWithSheetIds};
