const CACHE_NAME = "efootligue-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico"
];

// Installation : pré-mise en cache des assets statiques essentiels
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Erreur pré-cache partielle:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : Stratégie hybride
// - Navigation & HTML & API: Network-First avec fallback Cache
// - Images & Fonts & Scripts CDN: Stale-While-Revalidate ou Cache-First
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorer les requêtes non-GET ou SSE (Server-Sent Events) ou Firebase RTDB WebSocket
  if (req.method !== "GET" || url.pathname.includes("/api/sync/stream")) {
    return;
  }

  // 1. Requêtes API ou Navigation HTML : Network-First
  if (req.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            if (req.mode === "navigate") {
              return caches.match("/index.html") || caches.match("/");
            }
            return new Response(
              JSON.stringify({ ok: false, offline: true, error: "Mode hors ligne actif" }),
              { headers: { "Content-Type": "application/json" } }
            );
          });
        })
    );
    return;
  }

  // 2. Assets statiques, Fonts, CDNs : Cache-First avec mise à jour en tâche de fond
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Rafraîchissement en arrière-plan
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200 && (url.origin === self.location.origin || url.hostname.includes("fonts.gstatic.com") || url.hostname.includes("cdn.jsdelivr.net"))) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      });
    })
  );
});
