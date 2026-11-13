const test=require('node:test');const assert=require('node:assert/strict');
const {suggest}=require('../extension/matcher.js');const profile=require('../examples/sample-profile.json');
const f=(label,type='text',extra={})=>({id:'x',label,type,hasValue:false,...extra});
test('safe fields',()=>{assert.equal(suggest(f('First Name'),profile).value,'Alex');assert.equal(suggest(f('Email Address','email'),profile).value,'alex@example.com');});
test('protected and unknown fields',()=>{for(const s of ['Salary Expectation','Visa sponsorship','Passport Number','Security Email','Reference First Name','Date of Birth'])assert.equal(suggest(f(s),profile),null,s);assert.equal(suggest(f('First Name','password'),profile),null);assert.equal(suggest(f('First Name','text',{hasValue:true}),profile),null);});
