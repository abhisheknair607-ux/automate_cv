"use strict";
// Never cache authenticated pages, Google account data, or /api/* responses.
// Offline visits receive only a public, non-sensitive connectivity notice.
self.addEventListener("install",event=>{
  event.waitUntil(caches.open("garamaal-static-v2").then(cache=>cache.add("/offline.html")));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("freshmaal-static-")).map(key=>caches.delete(key))))]));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||event.request.mode!=="navigate")return;
  event.respondWith(fetch(event.request).catch(async()=>{
    const cached=await caches.match("/offline.html");
    return cached||new Response("Connect to the internet to open Garamaal.",{status:503});
  }));
});
