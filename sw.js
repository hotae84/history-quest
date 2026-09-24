// 코드든 문제 JSON이든 바뀌면 APP_VERSION을 올린다(설계 §9)
const APP_VERSION = '0.1.0';
const CACHE = `hq-${APP_VERSION}`;
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/content.js',
  'js/dom.js',
  'js/game.js',
  'js/loader.js',
  'js/sound.js',
  'js/store.js',
  'js/sw-client.js',
  'js/util.js',
  'js/views/cards.js',
  'js/views/common.js',
  'js/views/fatal.js',
  'js/views/home.js',
  'js/views/play.js',
  'js/views/result.js',
  'js/views/settings.js',
  'js/views/welcome.js',
  'js/views/world.js',
  'js/views/wrong.js',
  'js/questions/choice.js',
  'js/questions/match.js',
  'js/questions/order.js',
  'js/questions/ox.js',
  'data/content.json',
  'data/world-1.json',
  'data/world-2.json',
  'data/world-3.json',
  'data/world-4.json',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

// 하나라도 실패하면 설치 실패 → 기존 버전 유지. skipWaiting은 앱이 요청할 때만.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('hq-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});

const windowCount = async () => (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).length;

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'COUNT_WINDOWS' && event.ports[0]) {
    event.waitUntil(windowCount().then((windows) => event.ports[0].postMessage({ windows })));
  }
  // 다른 창이 열려 있으면 활성화하지 않는다(풀이 중인 탭의 버전 혼재 방지)
  if (type === 'SKIP_WAITING') event.waitUntil(windowCount().then((n) => { if (n <= 1) self.skipWaiting(); }));
  if (type === 'STATUS' && event.ports[0]) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const keys = await cache.keys();
      event.ports[0].postMessage({ version: APP_VERSION, ready: keys.length >= PRECACHE.length });
    })());
  }
});
