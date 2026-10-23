// 3x Hunter service worker: makes the site installable and opens the app shell instantly or offline.
// Never caches /api (signed-in data, prices) or other origins (Supabase auth, fonts). Each build gets a new VERSION, so a deploy reinstalls the worker and drops old caches.
const VERSION = '__BUILD_ID__'; // replaced with a hash of the build's file list by vite.config.ts
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

// Cache the shell plus every built JS/CSS file (listed by the build in precache-manifest.json), so the app
// opens offline on any page, not only ones visited before. A missing list just means fewer files cached.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(SHELL)).addAll(PRECACHE);
      try {
        const files = await (await fetch('/precache-manifest.json', { cache: 'no-store' })).json();
        await (await caches.open(ASSETS)).addAll(files);
      } catch {
        /* lazy chunks still get cached as they're used */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: always try the network so a deploy shows up right away; fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Hashed build files never change under the same name, so cache-first is safe.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
  }
});
