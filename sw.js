// Calls to Cass: keeps the app working offline. Your log itself lives in on-device storage, not here.
const CACHE="cass-v12";
const FILES=["./","index.html","local-store.js","lib/jspdf.umd.min.js","lib/jspdf.plugin.autotable.min.js","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // network first so updates arrive, cache as fallback for offline
    e.respondWith(fetch(req,{cache:"no-cache"}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r}).catch(()=>caches.match(req).then(r=>r||caches.match("index.html"))));
  } else if(url.hostname.endsWith("googleapis.com")||url.hostname.endsWith("gstatic.com")){
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res})));
  }
});
