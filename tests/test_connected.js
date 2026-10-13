const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const TARGET='https://script.google.com/macros/s/AKfycbw6krfQ8lULe84nUZd88rRnFUffndcUTirt8HQf9TGTDB5B0F6diGn5JA5W5OO5qhix/exec';
assert(!html.includes('setupCard') && !html.includes('id="appUrl"') && !html.includes('Paste the Google Apps Script'));
assert(html.includes('<title>Automate CV</title>'));
assert(html.includes('href="'+TARGET+'"'));
assert(fs.existsSync(__dirname+'/icon-512.png'));
assert(JSON.parse(fs.readFileSync(__dirname+'/manifest.webmanifest')).name==='Automate CV');
function run(installed,sourceQuery){
 const events={};let redirected='';const dom=new Map();
 function el(id){if(!dom.has(id))dom.set(id,{href:'',textContent:'',classList:{add(){},remove(){}},addEventListener(event,cb){events[id+':'+event]=cb}});return dom.get(id)}
 const context={
  document:{getElementById:el},
  window:{matchMedia(){return {matches:installed}},location:{search:sourceQuery,replace(u){redirected=u}},addEventListener(n,cb){events[n]=cb}},
  navigator:{standalone:false},URLSearchParams,console
 };
 vm.runInNewContext(source,context);
 assert.equal(el('openLive').href,TARGET);
 return {redirected,events};
}
assert.equal(run(false,'').redirected,'');
assert.equal(run(true,'').redirected,TARGET);
assert.equal(run(false,'?source=installed').redirected,TARGET);
assert(!source.includes('localStorage') && !source.includes('appUrl'));
console.log('PASS: no manual URL, linked dashboard, free-standing mode auto-navigation, URL fallback, original branding');
