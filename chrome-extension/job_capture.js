"use strict";
// Executed in the active job tab only after Capture current page is clicked.
function captureJobPage(){
  const tidy=v=>String(v||"").replace(/\s+/g," ").trim();
  const meta=(...keys)=>{for(const key of keys){const tag=document.querySelector('meta[property="'+key+'"],meta[name="'+key+'"]');if(tag?.content)return tidy(tag.content)}return ""};
  let posting=null;
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
    try{const queue=[JSON.parse(script.textContent)];
      while(queue.length){const item=queue.shift();
        if(Array.isArray(item)){queue.push(...item);continue}
        if(!item||typeof item!=="object")continue;
        if(item["@type"]==="JobPosting"||Array.isArray(item["@type"])&&item["@type"].includes("JobPosting")){posting=item;break}
        if(item["@graph"])queue.push(item["@graph"])}
    }catch(_){}
    if(posting)break;
  }
  const d=posting||{}, name=v=>tidy(typeof v==="string"?v:v?.name);
  const company=name(d.hiringOrganization)||meta("og:site_name","application-name");
  const role=name(d.title)||meta("job:title")||tidy(document.querySelector("h1")?.textContent);
  const place=name(d.jobLocation?.address?.addressLocality)||name(d.jobLocation?.address?.addressRegion)||meta("job:location");
  const section=document.querySelector('[data-testid*="description" i],[id*="job-description" i],[class*="job-description" i],article,main');
  const copy=section?.cloneNode(true);
  copy?.querySelectorAll("nav,footer,header,aside,form,button,script,style,[class*=cookie],[class*=recommend]").forEach(n=>n.remove());
  const description=String(d.description||"").replace(/<[^>]+>/g," ");
  const fullJd=tidy(description||copy?.innerText||copy?.textContent);
  const jd=fullJd.slice(0,30000);
  const pageUrl=window.location.href;
  let url="";
  for(const candidate of [d.url,document.querySelector('link[rel="canonical"]')?.href,pageUrl]){
    try{const parsed=new URL(candidate,pageUrl);if(parsed.protocol==="https:"){url=parsed.href;break}}catch(_){}
  }
  return {company,role,url,location:place,deadline:name(d.validThrough),salary:"",jd,
    pageUrl,source:posting?"JobPosting data":"Visible page",truncated:fullJd.length>jd.length};
}
