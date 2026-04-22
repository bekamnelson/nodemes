// PixiChat Service Worker — v2
const CACHE = "pixichat-v2";
const STATIC = [
  "/",
  "/index.html",
  "/chat.html",
  "/login.html",
  "/signup.html",
  "/profile.html",
  "/Settings.html",
  "/css/base.css",
  "/css/chat.css",
  "/js/config.js",
  "/js/chat.js",
  "/js/dexie.js",
  "/js/socket.io.js",
  "/images/noprofil.png",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for API, cache-first for static assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin API calls
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/socket.io")) return;

  // API calls: network first
  if (url.hostname.includes("onrender.com") || url.pathname.startsWith("/api")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets: cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match("/index.html"));
    })
  );
});
