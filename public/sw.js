// Lumina service worker: lets the app be installed and open quickly.
//
// It only ever caches this site's own files. Supabase, payments and every
// other API go straight to the network, so business numbers are always live.
//   * Pages: network first; the last good copy of the app shell is the
//     fallback when offline. Every route serves the same index.html.
//   * /assets/*: cache first. Their names change with every build, so a
//     cached file is never stale.

const VERSION = 'v1';
const PAGES = `lumina-pages-${VERSION}`;
const ASSETS = `lumina-assets-${VERSION}`;
const MAX_ASSETS = 150;
const SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [PAGES, ASSETS];
    for (const key of await caches.keys()) {
      if (!keep.includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(asset(request));
  }
});

const isHtml = (response) => (response.headers.get('content-type') || '').includes('text/html');

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok && isHtml(response)) await cache.put(SHELL, response.clone());
    return response;
  } catch {
    return (await cache.match(SHELL)) || offline();
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // A file from an older build is answered with index.html; never keep that.
  if (response.ok && !isHtml(response)) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

function offline() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumina Insights</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07110D;color:#E2E8F0;font-family:system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#94A3B8}button{background:#10B981;color:#04140D;border:0;border-radius:10px;padding:12px 22px;font-weight:700;font-size:15px}</style></head>
<body><div><h1>You're offline</h1><p>Lumina needs the internet to load your business numbers.</p><button onclick="location.reload()">Try again</button></div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
