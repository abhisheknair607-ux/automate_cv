"use strict";
/* Local, zero-API-cost extraction of ONLY explicit JD evidence.
 * Avoid interpreting 'no sponsorship' as sponsorship support.
 */
function clean(s){return String(s||"").replace(/\s+/g," ").trim()}
function jdClues(jd){
 const body=String(jd||"");
 const lines=body.split(/\n+/).map(clean).filter(Boolean);
 const salary=[],sponsor=[],people=[];
 const money=/(?:€|£|\bEUR\b|\bGBP\b)\s*([\d][\d,.]*)(\s*k\b)?/gi;
 const explicitVisa=/(?:visa sponsorship|sponsor(?:ing|ship)?\s+(?:work\s+)?visas?|work permit sponsorship|employment permit sponsorship|critical skills permit)/i;
 const positive=/(?:provide|offer|available|eligible|support|will sponsor|can sponsor|sponsorship provided)/i;
 const negative=/(?:no |not |don't |do not |unable |cannot |without |does not |won't )/i;
 for(const line of lines){
   if(line.length>450)continue;
   if(explicitVisa.test(line)){
     if(negative.test(line))sponsor.push({status:"no",evidence:line.slice(0,300)});
     else if(positive.test(line))sponsor.push({status:"yes",evidence:line.slice(0,300)});
     else sponsor.push({status:"mentioned",evidence:line.slice(0,300)});
   }
   for(const match of line.matchAll(money)){
     let n=Number(match[1].replace(/,/g,""));
     if(match[2])n*=1000;
     const currency=/^\s*€|EUR/i.test(match[0])?"EUR":"GBP";
     if(n>=50000&&n<=1000000)salary.push({currency,annualValue:n,evidence:line.slice(0,300)});
   }
   // A named person's involvement is only a clue if explicitly described
   // as a job contact. A generic HR team is not an identified individual.
   if(/(?:contact|reach out to|reporting to|hiring manager|recruiter|for enquiries)/i.test(line)){
     if(/(?:[A-Z][a-z'-]+\s+[A-Z][a-z'-]+)/.test(line)||/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(line))
       people.push({evidence:line.slice(0,300)});
   }
 }
 const visa=sponsor.find(x=>x.status==="yes")||sponsor.find(x=>x.status==="no")||sponsor[0]||null;
 return {contact:people[0]||null,visa,salary:salary[0]||null,
   highlight:!!(people.length||visa?.status==="yes"||salary.length)};
}
module.exports={jdClues};