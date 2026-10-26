"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const dir=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(dir,name),"utf8");
test("Social theme restores exact tested neon style without replacing Social app",()=>{
 const html=read("social.html"),server=read("social_server.js"),css=read("social_theme_collage.css");
 assert.match(html,/id="app"/);
 assert.match(html,/id="bottomNav"/);
 assert.match(html,/loadReviewQueue/);
 assert.match(html,/saveResearchTarget/);
 assert.match(html,/saveTemplateEditor/);
 assert.match(html,/updateStatus/);
 assert.match(html,/saveConversationDraft/);
 assert.match(server,/html\.replace\("<\/head>",theme\+"<\/head>"\)/);
 assert.match(server,/html\.replace\("<\/body>"/);
 assert.match(server,/app\.post\("\/api\/social\/\*"/);
 assert.match(css,/body\.gmv3-social-workspace/);
 assert.match(css,/#gmv3-social-tabs/);
});
test("restored shell preserves native Social handlers including Verify Contacts",()=>{
 const shell=read("mobile_social_hub.js"),overrides=read("social_theme_restore.css");
 new vm.Script(shell);
 for(const label of ["Targets","Research","Swipe","Follow-ups","Verify","Stats"])
  assert.ok(shell.includes('"'+label+'"'),label);
 assert.match(shell,/original\.click\(\)/);
 assert.match(shell,/loadReviewQueue\(\)/);
 assert.match(shell,/window\.GaramaalSocialHub/);
 assert.match(overrides,/overflow-x:auto/);
 assert.doesNotMatch(shell,/fetch\(|setValue\(|request\(|localStorage/);
});
test("only approved sprite routes and static theme files are exposed",()=>{
 const server=read("social_server.js"),docker=read("../Dockerfile.social");
 const pwa=["social_theme_hubs.css","social_theme_collage.css","social_theme_restore.css","mobile_social_hub.js"];
 for(const file of pwa){assert.ok(server.includes(file));assert.ok(docker.includes(file));}
 assert.match(server,/SOCIAL_ART=new Set/);
 assert.match(server,/prototype\/assets\//);
 assert.match(server,/SOCIAL_READ_ONLY/);
 assert.doesNotMatch(server,/runCvApiNow|\/api\/swipe\/|GITHUB_WORKFLOW_TOKEN/);
});
