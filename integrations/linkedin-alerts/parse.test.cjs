"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8");
const context = { Object, Set, String, RegExp, Number };
vm.createContext(context);
vm.runInContext(source, context);

test("LinkedIn digest parses multiple unique job-posting links, not company logos", () => {
  const html = '<a href="https://www.linkedin.com/comm/jobs/view/4428148635/?trk=company_logo">JPMorganChase</a>' +
    '<a href="https://www.linkedin.com/comm/jobs/view/4428148635/?trk=email_job_posting_0">' +
    'Tax Manager - Associate<br>JPMorganChase &middot; Dublin (Hybrid)<br>9 connections</a>' +
    '<a href="https://www.linkedin.com/comm/jobs/view/4353074161/?trk=email_job_posting_1">' +
    'Manager, BizOps<br>Mastercard &middot; London (Hybrid)</a>';
  const result = context.parseLinkedInAlertHtml_(html);
  assert.equal(result.uncertain, false);
  assert.equal(result.jobs.length, 2);
  const first=result.jobs.find(x=>x.id==="4428148635");
  assert.equal(first.role,"Tax Manager - Associate");
  assert.equal(first.company,"JPMorganChase");
  assert.equal(first.location,"Dublin (Hybrid)");
  assert.equal(first.url,"https://www.linkedin.com/jobs/view/4428148635/");
});

test("Rejects a company-logo-only anchor rather than inventing a vacancy", () => {
  const result = context.parseLinkedInAlertHtml_(
    '<a href="https://www.linkedin.com/comm/jobs/view/4428148635/">JPMorganChase</a>'
  );
  assert.equal(result.jobs.length, 0);
  assert.equal(result.uncertain, true);
});

test("Ignores search links, footer links, and job alert confirmations", () => {
  const result = context.parseLinkedInAlertHtml_(
    '<a href="https://www.linkedin.com/comm/jobs/search?keywords=Finance">See jobs</a>' +
    '<a href="https://www.linkedin.com/help/linkedin/answer/4788">Help</a>'
  );
  assert.equal(result.jobs.length,0);
  assert.equal(result.uncertain,false);
  assert.equal(context.isLinkedInAlert_({
    getFrom:()=> "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
    getSubject:()=> "Abhishek: your job alert for finance has been created"
  }),false);
});

test("Unrelated senders cannot masquerade as LinkedIn job-alert emails", () => {
  assert.equal(context.isLinkedInAlert_({
    getFrom:()=> "person@example.com",
    getSubject:()=> "Job for you"
  }), false);
});

test("Recipient is retained separately for Abhishek and Pooja",()=>{
  assert.equal(context.alertOwner_({getTo:()=> "Abhishek <itsabhisheknnair@gmail.com>"}),"Abhishek");
  assert.equal(context.alertOwner_({getTo:()=> "Pooja <poojaktirupati@gmail.com>"}),"Pooja");
  assert.equal(context.alertOwner_({getTo:()=> "shared@example.com"}),"Unassigned");
});

test("Job ID normalization strips LinkedIn tracking parameters",()=>{
  assert.equal(context.linkedinId_("https://www.linkedin.com/comm/jobs/view/4428148635/?trk=stuff"),"4428148635");
  assert.equal(context.linkedinId_("https://www.linkedin.com/jobs/view/4428148635/"),"4428148635");
});
