/* 当前版本的页面和资源优先使用本地缓存，切页不等待网络。
 * 安装只缓存核心界面；题库、图谱数据与装扮图片访问时再缓存。
 * 更新页面、脚本、样式或数据时必须增加 VERSION，避免跨版本混用。 */
'use strict';

var VERSION = 'v91';
var CACHE = 'cnm-pwa-' + VERSION;
var SCOPE = self.registration.scope;
var GRAPH_DATA = ['data/topics.json', 'data/dependencies.json', 'data/cn-curriculum-standards.json', 'data/id-aliases.json'];
var graphWarmup = null;

var SHELL = [
  './',
  'explore/',
  'explore/app.js',
  'diagnose/',
  'diagnose/app.js',
  'diagnose/engine.js',
  'diagnose/pro-challenge.js',
  'diagnose/share.js',
  'diagnose/style.css',
  'children/',
  'children/history.html',
  'children/children.css',
  'children/avatar-center.css',
  'children/avatar-center.js',
  'children/page.js',
  'children/history.js',
  'wrongbook/',
  'wrongbook/wrongbook.js',
  'wrongbook/wrongbook.css',
  'assets/site.css',
  'assets/theme.js',
  'assets/explore.css',
  'assets/graph-motion.js',
  'assets/graph-halo.js',
  'assets/graph-springs.js',
  'assets/graph-camera.js',
  'assets/graph-layout.js',
  'assets/graph-layout-worker.js',
  'assets/fonts/physicalmap-playful.woff',
  'assets/fonts/OFL-ZCOOL-KuaiLe.txt',
  'assets/home.js',
  'assets/feedback-qr.jpg',
  'assets/last-location.js',
  'assets/book-selection.js',
  'assets/achievement-books.js',
  'assets/avatar-catalog.js',
  'assets/avatar-rewards.js',
  'assets/avatar-share.js',
  'assets/explore-viewport.js',
  'assets/stats-config.js',
  'assets/stats.js',
  'assets/stem-compat.js',
  'assets/children.js',
  'assets/progress.js',
  'assets/blindspots.js',
  'assets/local-learning.js',
  'assets/wrongbook.js',
  'assets/pwa.js',
  'assets/pwa.css',
  'assets/vendor/cytoscape.min.js',
  'assets/vendor/cytoscape-dagre.js',
  'assets/vendor/dagre.min.js',
  'assets/vendor/qrcode.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  'manifest.webmanifest'
];

function abs(path) { return new URL(path, SCOPE).href; }

function cacheable(res) {
  return res && res.status === 200 && res.type === 'basic' && !res.redirected;
}

function pageURL(raw) {
  var url = new URL(raw);
  url.search = ''; url.hash = '';
  if (/\/index\.html$/.test(url.pathname)) url.pathname = url.pathname.slice(0, -10);
  else if (/\.html$/.test(url.pathname)) url.pathname = url.pathname.slice(0, -5);
  return url.href;
}

async function precache(cache) {
  // Limited concurrency leaves bandwidth and connections available for the open page.
  var next = 0, failed = false;
  async function worker() {
    while (!failed && next < SHELL.length) {
      try {
        var path = SHELL[next++], req = new Request(abs(path), { cache: 'reload' });
        var res = await fetch(req);
        var page = /\/$|\.html$/.test(path);
        // Pages canonicalizes .html addresses. Trust only that exact, same-origin
        // canonical page, never arbitrary redirected scripts or external URLs.
        var canonicalPage = page && res && res.status === 200 && res.type === 'basic' && res.redirected &&
          res.url === pageURL(req.url) && new URL(res.url).origin === self.location.origin;
        if (!cacheable(res) && !canonicalPage) throw new Error('Core resource could not be cached: ' + path);
        await cache.put(cacheKey(req, page), res);
      } catch (error) { failed = true; throw error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, SHELL.length) }, worker));
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    await precache(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var names = await caches.keys();
    await Promise.all(names.filter(function (n) { return n.indexOf('cnm-pwa-') === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    await self.clients.claim();
  })());
});

function cacheKey(req, page) {
  var url = new URL(req.url);
  if (req.mode === 'navigate' || page) {
    // All query/hash combinations use the same static page shell.
    return new Request(pageURL(url.href));
  }
  return new Request(url.href);
}

async function cacheFirst(req, writes) {
  var cache = null, key = cacheKey(req);
  try {
    cache = await caches.open(CACHE);
    var hit = await cache.match(key);
    if (hit) return hit;
  } catch (error) { cache = null; /* Cache API availability must not gate the network. */ }
  try {
    var res = await fetch(req);
    if (cache && cacheable(res)) {
      // Keep the response path fast, while waitUntil below owns the cache write.
      try { writes.push(cache.put(key, res.clone()).catch(function () { /* Storage pressure must not block viewing. */ })); }
      catch (error) { /* The fetched response remains usable if caching is unavailable. */ }
    }
    return res;
  } catch (error) {
    if (cache && req.mode === 'navigate') {
      try {
        var home = await cache.match(abs('./'));
        if (home) return home;
      } catch (cacheError) { /* Preserve the original network failure below. */ }
    }
    throw error;
  }
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === new URL('sw.js', SCOPE).pathname) return;
  var writes = [], response = cacheFirst(req, writes);
  event.respondWith(response);
  event.waitUntil(response.then(function () { return Promise.all(writes); }, function () { return Promise.all(writes); }));
});

function warmGraphData() {
  if (graphWarmup) return graphWarmup;
  graphWarmup = (async function () {
    var cache = await caches.open(CACHE);
    // Optional, sequential work after the page is ready; never prefetch question banks or skins.
    for (var i = 0; i < GRAPH_DATA.length; i++) {
      var req = new Request(abs(GRAPH_DATA[i]));
      if (await cache.match(req)) continue;
      try {
        var res = await fetch(req);
        if (cacheable(res)) await cache.put(req, res);
      } catch (error) { /* The active page can load a missing file normally when needed. */ }
    }
  })().catch(function () { /* Optional cache reads must not create an unhandled message rejection. */ })
    .finally(function () { graphWarmup = null; });
  return graphWarmup;
}

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'CNM_WARM_GRAPH_DATA') event.waitUntil(warmGraphData());
});
