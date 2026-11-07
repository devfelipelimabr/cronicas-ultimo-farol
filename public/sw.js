const C='farol-v4';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['/','/index.html','/icon-192.png','/icon-512.png','/manifest.webmanifest','/bench-assets/phaser.min.js'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return; // backend nunca entra em cache
  const isDoc=e.request.mode==='navigate'||/\.html?$/.test(url.pathname)||url.pathname==='/'||url.pathname.endsWith('.webmanifest');
  if(isDoc){
    // network-first: HTML sempre fresco; cache só como fallback offline
    e.respondWith(fetch(e.request).then(resp=>{
      const cp=resp.clone();caches.open(C).then(c=>c.put(e.request,cp));return resp
    }).catch(()=>caches.match(e.request)))
  } else {
    // cache-first para assets pesados (lib Phaser, ícones)
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      const cp=resp.clone();caches.open(C).then(c=>c.put(e.request,cp));return resp})))
  }
});
