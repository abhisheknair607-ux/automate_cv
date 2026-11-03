"use strict";
/* Local, zero-API-cost extraction of ONLY explicit JD evidence.
 * Avoid interpreting 'no sponsorship' as sponsorship support.
 */
function clean(s){return String(s||"").replace(/\s+/g," ").trim()}
function namedPerson(text){
 const cleaned=String(text||"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
  .replace(/\b(?:please\s+)?contact\s+(?=[A-Z])/gi," ")
  .replace(/\b(?:hiring manager|job poster|recruiter|reporting to|for enquiries)\s*[:–-]?\s*/gi," ");
 const names=cleaned.match(/\b[A-Z][a-zA-ZÀ-ÿ’'-]+\s+(?:[A-Z][a-zA-ZÀ-ÿ’'-]+|[A-Z]\.?)\b/g)||[];
 const skip=/^(?:Human Resources|Talent Acquisition|Hiring Team|Recruitment Team|Finance Team|Job Description|Contact Information|Financial Analyst|Senior Associate|Director Founder)$/i;
 return names.find(name=>!skip.test(name))||null;
}
function jdClues(jd){
 const body=String(jd||"");
 const lines=body.split(/\n+/).map(clean).filter(Boolean);
 const salary=[],sponsor=[],people=[];
 const money=/(?:€|£|\bEUR\b|\bGBP\b)\s*([\d][\d,.]*)(\s*k\b)?/gi;
 const explicitVisa=/(?:visa sponsorship|sponsor(?:ing|ship)?\s+(?:work\s+)?visas?|work permit sponsorship|employment permit sponsorship|critical skills permit)/i;
 const positive=/(?:we\s+(?:provide|offer|support|can sponsor|will sponsor)|(?:visa|work permit|employment permit)\s+sponsorship\s+(?:is\s+)?(?:available|provided|offered)|sponsorship\s+(?:provided|offered|available))/i;
 const negative=/(?:no |not |don't |do not |unable |cannot |without |does not |won't )/i;
 for(const [i,line] of lines.entries()){
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
     if(n>50000&&n<=1000000&&!/(?:signing bonus|sign-on bonus|annual bonus only|per day|daily rate|per hour|hourly rate)/i.test(line))
       salary.push({currency,annualValue:n,evidence:line.slice(0,300)});
   }
   // Only identify a person where the JD explicitly links their name to
   // recruitment, enquiries, a reporting line or a 'Job poster' label.
   if(/(?:contact|reach out to|reporting to|hiring manager|recruiter|for enquiries|job poster)/i.test(line)){
     const preceding=/job poster/i.test(line)?lines.slice(Math.max(0,i-5),i).reverse()
       .map(x=>x.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")).find(x=>x.length<80&&
         /^\s*[A-Z][a-zA-ZÀ-ÿ’'-]+\s+(?:[A-Z][a-zA-ZÀ-ÿ’'-]+|[A-Z]\.?)\s*$/.test(x)):"";
     const name=namedPerson(line)||namedPerson(preceding);
     if(name)people.push({evidence:(/job poster/i.test(line)?"Job poster: "+name:line).slice(0,300)});
   }
 }
 const visa=sponsor.find(x=>x.status==="yes")||sponsor.find(x=>x.status==="no")||sponsor[0]||null;
 return {contact:people[0]||null,visa,salary:salary[0]||null,
   highlight:!!(people.length||visa?.status==="yes"||salary.length)};
}
module.exports={jdClues};