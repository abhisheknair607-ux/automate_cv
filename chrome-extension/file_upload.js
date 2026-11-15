"use strict";
/* Explicit user-action only. Never presses Next, Continue, Submit or file-picker buttons. */
(function(root){
  const DOCX="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const DOC="application/msword";
  const PDF="application/pdf";
  const clean=s=>String(s||"").replace(/\s+/g," ").trim();
  const suffix=s=>String(s||"").toLowerCase().match(/\.[a-z0-9]+$/)?.[0]||"";
  function fileType(filename){return ({".docx":DOCX,".doc":DOC,".pdf":PDF})[suffix(filename)]||"";}
  function allowed(input,filename,mime){
    const entries=String(input.accept||input.getAttribute?.("accept")||"").split(",")
      .map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(!entries.length||entries.includes("*/*"))return true;
    const ext=suffix(filename),type=String(mime||"").toLowerCase();
    return entries.includes(ext)||entries.includes(type)||entries.some(x=>x.endsWith("/*")&&
      type.startsWith(x.slice(0,-1)))||entries.includes("application/octet-stream")&&ext===".docx";
  }
  function labelFor(input){
    const labels=[...(input.labels||[])].map(e=>e.textContent||e.innerText||"");
    const parent=input.closest?.("label");if(parent)labels.push(parent.textContent||"");
    const container=input.closest?.("[data-testid],fieldset,.form-group,[class*='field'],[class*='upload']");
    if(container)labels.push(String(container.getAttribute?.("aria-label")||""),
      String(container.querySelector?.("label,legend,[data-testid*=label]")?.textContent||""));
    return clean([input.name,input.id,input.getAttribute?.("aria-label"),
      input.getAttribute?.("data-testid"),...labels].filter(Boolean).join(" ")).toLowerCase();
  }
  const resume=/(?:^|[^a-z0-9])(resume|résumé|cv|curriculum[\s_-]*vitae)(?=$|[^a-z0-9])/i;
  const cover=/(cover[\s_-]*letter|motivation[\s_-]*letter|covering[\s_-]*letter)/i;
  const other=/(passport|transcript|portfolio|identit|photo|reference|work\s*sample|certificat|avatar|signature)/i;
  function chooseInput(doc,kind,filename){
    if(kind!=="cv"&&kind!=="cl")return {status:"invalid-kind"};
    const inputs=[...(doc.querySelectorAll?.('input[type="file"]')||[])];
    const usable=inputs.map((input,index)=>({input,index,label:labelFor(input)}))
      .filter(x=>!x.input.disabled);
    if(!usable.length)return {status:"no-input"};
    const priority=usable.filter(x=>kind==="cv"?resume.test(x.label)&&!cover.test(x.label):cover.test(x.label));
    const candidates=priority.length?priority:(usable.length===1&&!other.test(usable[0].label)&&
      (kind==="cv"||cover.test(usable[0].label))?usable:[]);
    if(candidates.length!==1)return {status:"ambiguous",count:candidates.length||usable.length};
    const item=candidates[0];
    if(item.input.files?.length)return {status:"already-selected"};
    const mime=fileType(filename);
    if(!mime||!allowed(item.input,filename,mime))return {status:"unsupported-format",accept:item.input.accept||""};
    return {status:"ready",index:item.index};
  }
  function probeUploadTargets(){
    /* Chrome injection: intentionally standalone and reads no document bytes. */
    const roots=[document],seen=new Set();
    for(let p=0;p<roots.length&&p<75;p++){
      for(const node of roots[p].querySelectorAll?.("*")||[])
        if(node.shadowRoot&&!seen.has(node.shadowRoot)){seen.add(node.shadowRoot);roots.push(node.shadowRoot);}
    }
    const inputs=roots.flatMap(r=>[...(r.querySelectorAll?.('input[type="file"]')||[])]);
    return {inputs:inputs.map((input,index)=>{
      const group=input.closest?.("label,fieldset,[class*='upload'],[class*='field']");
      return {index,label:[input.name,input.id,input.getAttribute("aria-label"),
        input.getAttribute("data-testid"),...(input.labels||[]).length?
        [...input.labels].map(e=>e.textContent):[],group?.querySelector?.("label,legend")?.textContent]
        .flat().filter(Boolean).join(" ").replace(/\s+/g," ").toLowerCase().slice(0,350),
        accept:input.accept||"",disabled:!!input.disabled,hasFile:!!input.files?.length,
        hasExistingAttachment:(()=>{
          const text=String(group?.innerText||group?.textContent||"").slice(0,1200);
          return /\b[^\s\\/<>]+\.(?:docx|pdf)\b/i.test(text)&&
            /\b(uploaded|attached|remove file|replace file|download attachment)\b/i.test(text);
        })()};
    }),blockedShadow:0};
  }
  function chooseFrameTarget(results,kind,filename){
    if(!Array.isArray(results)||!["cv","cl"].includes(kind))return {status:"invalid-request"};
    const candidates=[],all=[];
    for(const frame of results){
      if(!Number.isInteger(frame?.frameId)||!Array.isArray(frame?.result?.inputs))continue;
      for(const row of frame.result.inputs){
        if(row.disabled)continue;
        const item={frameId:frame.frameId,index:row.index,label:row.label||"",accept:row.accept||"",
          hasFile:row.hasFile,hasExistingAttachment:row.hasExistingAttachment};
        all.push(item);
        if(kind==="cv"?resume.test(item.label)&&!cover.test(item.label):cover.test(item.label))candidates.push(item);
      }
    }
    const chosen=candidates.length?candidates:(all.length===1&&kind==="cv"&&!other.test(all[0].label)&&
      !cover.test(all[0].label)?all:[]);
    if(chosen.length!==1)return {status:all.length?"ambiguous":"no-input",count:all.length};
    const item=chosen[0];
    if(item.hasFile||item.hasExistingAttachment)return {status:"already-selected"};
    if(!allowed({accept:item.accept},filename,fileType(filename)))
      return {status:"unsupported-format",accept:item.accept};
    return {status:"ready",...item};
  }
  function attachOnCurrentPage(payload){
    /* Standalone Chrome injection; target locked to user-reviewed frame/index and metadata. */
    const name=String(payload?.filename||"").split(/[\\/]/).pop();
    const ext=name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
    const mime=ext===".docx"?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ext===".pdf"?"application/pdf":"";
    if(!mime||!payload?.base64||payload.base64.length>7_500_000||
      (payload?.kind!=="cv"&&payload?.kind!=="cl"))return {status:"invalid-document"};
    const roots=[document],seen=new Set();
    for(let p=0;p<roots.length&&p<75;p++){
      for(const node of roots[p].querySelectorAll?.("*")||[])
        if(node.shadowRoot&&!seen.has(node.shadowRoot)){seen.add(node.shadowRoot);roots.push(node.shadowRoot);}
    }
    const inputs=roots.flatMap(r=>[...(r.querySelectorAll?.('input[type="file"]')||[])]);
    let chosen=null;
    if(Number.isInteger(payload?.targetIndex)){
      chosen=inputs[payload.targetIndex];
      if(!chosen)return {status:"target-changed"};
      const label=[chosen.name,chosen.id,chosen.getAttribute("aria-label"),
        chosen.getAttribute("data-testid"),...(chosen.labels||[]).length?
        [...chosen.labels].map(e=>e.textContent):[],
        chosen.closest?.("label,fieldset,[class*='upload'],[class*='field']")?.querySelector?.("label,legend")?.textContent]
        .flat().filter(Boolean).join(" ").replace(/\s+/g," ").toLowerCase().slice(0,350);
      if(label!==payload.targetLabel||String(chosen.accept||"")!==String(payload.targetAccept||""))
        return {status:"target-changed"};
    }else{
      const label=e=>[e.name,e.id,e.getAttribute("aria-label"),e.getAttribute("data-testid"),
        ...[...(e.labels||[])].map(n=>n.textContent||""),e.closest("label")?.textContent||""]
        .filter(Boolean).join(" ").toLowerCase();
      const usable=inputs.filter(e=>!e.disabled);
      const cv=/(?:^|[^a-z0-9])(resume|résumé|cv|curriculum[\s_-]*vitae)(?=$|[^a-z0-9])/i;
      const cl=/cover[\s_-]*letter|motivation[\s_-]*letter/i;
      const other=/passport|transcript|portfolio|identit|photo|reference|work\s*sample|certificat/i;
      const preferred=usable.filter(e=>payload.kind==="cv"?cv.test(label(e))&&!cl.test(label(e)):cl.test(label(e)));
      const picked=preferred.length?preferred:(usable.length===1&&payload.kind==="cv"&&
        !other.test(label(usable[0]))&&!cl.test(label(usable[0]))?usable:[]);
      if(picked.length!==1)return {status:"ambiguous",count:picked.length||usable.length};
      chosen=picked[0];
    }
    if(chosen.disabled)return {status:"disabled"};
    if(chosen.files?.length)return {status:"already-selected"};
    const accept=String(chosen.accept||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(accept.length&&!accept.includes("*/*")&&!accept.includes(mime)&&!accept.includes(ext)&&
      !accept.some(x=>x.endsWith("/*")&&mime.startsWith(x.slice(0,-1))))
      return {status:"unsupported-format",accept:chosen.accept};
    try{
      const raw=atob(payload.base64);
      if(raw.length<8||raw.length>5_000_000)return {status:"too-large"};
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      if((ext===".pdf"&&String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")||
         (ext===".docx"&&(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)))
        return {status:"bad-file-signature"};
      const file=new File([bytes],name,{type:mime,lastModified:Date.now()});
      const dt=new DataTransfer();dt.items.add(file);
      chosen.files=dt.files;
      chosen.dispatchEvent(new Event("input",{bubbles:true}));
      chosen.dispatchEvent(new Event("change",{bubbles:true}));
      const saved=chosen.files?.[0];
      if(!saved||saved.name!==name||saved.size!==bytes.length)
        return {status:"not-retained"};
      return {status:"selected",filename:saved.name,size:saved.size,targetIndex:inputs.indexOf(chosen),
        note:"File selected locally. Employer acceptance has not been confirmed."};
    }catch(e){return {status:"blocked",reason:String(e?.message||e).slice(0,130)};}
  }
  function verifyAttachment(payload){
    /* Standalone injected read-back; a controlled widget may clear input.files
     * after accepting the file. Inspect the attachment chip before declaring failure. */
    const roots=[document],seen=new Set();
    for(let p=0;p<roots.length&&p<75;p++)for(const n of roots[p].querySelectorAll?.("*")||[])
      if(n.shadowRoot&&!seen.has(n.shadowRoot)){seen.add(n.shadowRoot);roots.push(n.shadowRoot);}
    const inputs=roots.flatMap(r=>[...(r.querySelectorAll?.('input[type="file"]')||[])]);
    const field=inputs[payload.targetIndex];
    if(!field)return {status:"lost-field"};
    const found=[...(field.files||[])].find(f=>f.name===payload.filename&&f.size===payload.size);
    const parent=field.closest?.("[class*='upload'],[class*='file'],[class*='field'],fieldset")||field.parentElement;
    const near=String(parent?.innerText||parent?.textContent||"").toLowerCase().slice(0,2500);
    const shown=near.includes(String(payload.filename||"").toLowerCase());
    const explicit=shown&&/(upload(?:ed)?\s*(?:success|complete|finished)|successfully\s*upload|file\s*attached)/i.test(near);
    if(explicit)return {status:"site-indicates-success",filename:payload.filename,
      size:payload.size,siteDisplay:true,localFileRetained:!!found};
    if(shown)return {status:"site-shows-filename",filename:payload.filename,
      size:payload.size,siteDisplay:true,localFileRetained:!!found};
    if(!found)return {status:"not-retained"};
    return {status:"selected-locally",filename:found.name,size:found.size,siteDisplay:false};
  }
  const api={fileType,allowed,labelFor,chooseInput,probeUploadTargets,chooseFrameTarget,attachOnCurrentPage,verifyAttachment};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalFileUpload=api;
})(globalThis);
