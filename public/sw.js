const VERSION='edge-news-v1.0.1';
const SHELL=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./icons/edge-news.svg','./icons/edge-news-192.png','./icons/edge-news-512.png','./data/news.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('edge-news-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put('./index.html',copy));return response;}).catch(async()=>await caches.match('./index.html')||Response.error()));
  return;
 }
 if(url.pathname.endsWith('/data/news.json')){
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok)caches.open(VERSION).then(cache=>cache.put(request,response.clone()));return response;}).catch(async()=>{const cached=await caches.match(request)||await caches.match('./data/news.json');if(!cached)return Response.error();const headers=new Headers(cached.headers);headers.set('X-EDGE-STALE','true');return new Response(await cached.arrayBuffer(),{status:cached.status,statusText:cached.statusText,headers});}));
  return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(VERSION).then(cache=>cache.put(request,response.clone()));return response;})));
});
