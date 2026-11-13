"use strict";
(function(root){
const clean=v=>String(v??"").trim();
const normal=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function profile(p){const b=p?.basics||{}; const n=clean(b.fullName);return {
firstName:clean(b.firstName)||n.split(/\s+/)[0]||"",lastName:clean(b.lastName)||n.split(/\s+/).slice(1).join(" "),
fullName:n,email:clean(b.email),phone:clean(b.phone),city:clean(b.city),country:clean(b.country),
linkedin:clean(b.linkedin||b.linkedinUrl),university:clean(p?.education?.[0]?.institution),
employer:clean(p?.work?.[0]?.employer),title:clean(p?.work?.[0]?.title)};}
const rules=[["email",/(?:^| )e ?mail(?: address)?(?:$| )/],["phone",/(?:^| )(?:phone|mobile|telephone)(?: number)?(?:$| )/],["linkedin",/(?:^| )linkedin(?: profile| url| link)?(?:$| )/],["firstName",/(?:^| )(?:first|given) name(?:$| )/],["lastName",/(?:^| )(?:last|family|sur) name(?:$| )/],["fullName",/(?:^| )(?:full|legal) name(?:$| )/],["city",/(?:^| )(?:city|town)(?:$| )/],["country",/(?:^| )country(?: of residence)?(?:$| )/],["university",/(?:^| )(?:university|college|school name)(?:$| )/],["employer",/(?:^| )(?:current|most recent) (?:company|employer)(?:$| )/],["title",/(?:^| )(?:current|most recent) (?:job title|position title)(?:$| )/]];
const unsafe=/password|passcode|verification|captcha|security|national id|passport|birth|age|gender|race|ethnic|disab|veteran|medical|health|criminal|salary|compensation|sponsorship|visa|work authori|signature|consent|reference|referee|emergency|ssn|tax id|social security/;
function suggest(field,p){
 if(!field||field.hasValue||field.disabled||field.readOnly)return null;
 if(!["text","email","tel","url","search","textarea"].includes(field.type))return null;
 const label=normal(field.label);if(!label||unsafe.test(label))return null;
 const hit=rules.find(([,re])=>re.test(label)); if(!hit)return null;
 const value=profile(p)[hit[0]]; if(!value)return null;
 if(field.type==="email"&&hit[0]!=="email")return null;
 if(field.type==="tel"&&hit[0]!=="phone")return null;
 return {id:field.id,label:field.label,key:hit[0],value};
}
const api={profile,suggest};
if(typeof module!=="undefined"&&module.exports)module.exports=api;
root.GaramaalMatcher=api;
})(globalThis);
