const CACHE="sideway-radar-v2";
const ASSETS=["./","./index.html","./app.js","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.url.includes("api.binance.com")) return;
  e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request)));
});