/*
 * Garamaal mobile DOM job capture. Runs ONLY on explicit user action.
 * This script does not inspect inputs, cookies, storage, or form answers.
 * LinkedIn extraction is intentionally excluded.
 */
(function () {
  "use strict";
  const MAX_DESCRIPTION = 49000;
  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const cleanJD = value => String(value ?? "")
    .replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  function richText(node) {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll("script,style,input,textarea,select,button,form").forEach(n => n.remove());
    copy.querySelectorAll("br,li,p,h1,h2,h3,h4,section,div").forEach(n => {
      if (n.tagName === "BR") n.replaceWith(document.createTextNode("\n"));
      else n.append(document.createTextNode("\n"));
    });
    return cleanJD(copy.textContent || "");
  }
  const host = location.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return JSON.stringify({ error: "LinkedIn extraction is disabled. Open the external employer application page." });
  }
  if (location.protocol !== "https:") {
    return JSON.stringify({ error: "Only HTTPS employer pages can be captured." });
  }
  function text(selector) {
    const node = document.querySelector(selector);
    return node ? clean(node.innerText || node.textContent || "") : "";
  }
  function flatten(input) {
    if (Array.isArray(input)) return input.flatMap(flatten);
    if (!input || typeof input !== "object") return [];
    return [input, ...flatten(input["@graph"] || [])];
  }
  const structured = [];
  for (const item of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      structured.push(...flatten(JSON.parse(item.textContent || "")));
    } catch (_) { /* Malformed structured data does not break capture. */ }
  }
  const job = structured.find(item => {
    const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
    return types.includes("JobPosting");
  }) || {};
  const title = clean(job.title || text("h1") || document.title);
  const company = clean(
    (typeof job.hiringOrganization === "object" && job.hiringOrganization?.name) ||
    text('[data-testid="company-name"]') ||
    text('[data-qa="company-name"]') ||
    text(".company-name")
  );
  const place = job.jobLocation;
  const firstPlace = Array.isArray(place) ? place[0] : place;
  const address = firstPlace?.address;
  const locationValue = typeof address === "string" ? address :
    [address?.addressLocality, address?.addressRegion, address?.addressCountry]
      .filter(Boolean).join(", ");
  const locationText = clean(locationValue ||
    text('[data-testid="job-location"]') ||
    text('[data-qa="job-location"]') ||
    text(".job-location") ||
    text(".location"));
  const selectors = [
    '[data-testid="job-description"]',
    '[data-testid="job-posting-description"]',
    '[data-automation-id="jobPostingDescription"]',
    '[data-qa="job-description"]',
    '[data-qa="job-description-text"]',
    '[data-qa="job-description"]',
    '[data-automation-id="jobPostingDescription"]',
    "#job-description",
    "#jobDescription",
    ".job-description",
    ".jobDescription",
    '[class*="JobDescription"]',
    'article[itemprop="description"]'
  ];
  let description = "";
  let extractionMethod = "dom";
  if (job.description) {
    const holder = document.createElement("div");
    holder.innerHTML = String(job.description).slice(0, MAX_DESCRIPTION * 2);
    description = richText(holder);
    extractionMethod = "jsonld";
  }
  if (!description) {
    for (const selector of selectors) {
      const candidate = richText(document.querySelector(selector));
      if (candidate.length > description.length) description = candidate;
    }
  }
  return JSON.stringify({
    url: location.href,
    title: title.slice(0, 250),
    company: company.slice(0, 250),
    location: locationText.slice(0, 300),
    description: cleanJD(description).slice(0, MAX_DESCRIPTION),
    method: extractionMethod,
    missingDescription: description.length < 80
  });
})()
