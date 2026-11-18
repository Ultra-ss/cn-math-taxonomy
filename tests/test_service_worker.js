#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
function response(body, options = {}) {
  return { body, status: options.status === undefined ? 200 : options.status,
    type: options.type || 'basic', redirected: !!options.redirected, url: options.url || '',
    clone() { return response(body, options); }, async text() { return body; } };
}
function key(req) { return typeof req === 'string' ? req : req.url; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(options = {}) {
  const stores = new Map(), calls = [], deleted = [], handlers = {}, base = options.scope || 'https://physicalmap.pages.dev/';
  let skipped = 0, claimed = 0;
  function store(name) {
    if (!stores.has(name)) {
      const rows = new Map();
      stores.set(name, { rows,
        async match(req) {
          if (options.beforeMatch) await options.beforeMatch(req);
          const found = rows.get(key(req)); return found ? found.clone() : undefined;
        },
        async put(req, res) {
          if (options.beforePut) await options.beforePut(req, res);
          rows.set(key(req), res.clone());
        } });
    }
    return stores.get(name);
  }
  const context = { URL, Request, Promise, Set, Map,
    self: { registration: { scope:base }, location:{ origin:new URL(base).origin },
      addEventListener(type, fn) { handlers[type] = fn; },
      async skipWaiting() { skipped++; }, clients:{ async claim() { claimed++; } } },
    caches: { async open(name) { if (options.beforeOpen) await options.beforeOpen(name); return store(name); }, async keys() { return Array.from(stores.keys()); },
      async delete(name) { deleted.push(name); return stores.delete(name); },
      async match() { throw new Error('Never read arbitrary old-version caches'); } },
    async fetch(req) {
      calls.push(req);
      return options.fetch ? options.fetch(req) : response('network: ' + key(req));
    } };
  vm.createContext(context); vm.runInContext(source, context, { filename:'sw.js' });
  function dispatch(type, request) {
    const jobs = [];
    const event = { request, data:type === 'message' ? request : undefined, respondWith(promise) { this.response = Promise.resolve(promise); },
      waitUntil(promise) { jobs.push(Promise.resolve(promise)); } };
    handlers[type](event);
    return { event, done:() => Promise.all(jobs), get lifetimeCount() { return jobs.length; } };
  }
  return { context, stores, store, calls, deleted, dispatch, base,
    current:() => store(context.CACHE), skipped:() => skipped, claimed:() => claimed };
}
function request(url, options = {}) { return { url, method:options.method || 'GET', mode:options.mode || 'cors' }; }
let passed = 0;
async function test(label, fn) { await fn(); passed++; console.log('  ok   ' + label); }
(async function () {
  await test('installation downloads only the bounded core, with at most four concurrent requests', async () => {
    let active = 0, peak = 0;
    const app = fixture({ async fetch(req) {
      active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
      assert.equal(req.cache, 'reload'); return response('core');
    } });
    const run = app.dispatch('install'); await run.done();
    assert.equal(app.skipped(), 1); assert.ok(peak <= 4 && peak > 1);
    assert.ok(app.calls.every(req => !/\/assets\/avatars\/|\/data\//.test(req.url)), 'Skin and question downloads are demand-driven');
    assert.equal(app.current().rows.size, app.context.SHELL.length);
    const bytes = Array.from(app.context.SHELL).reduce((sum, item) => {
      let file = path.join(ROOT, item); if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      return sum + fs.statSync(file).size;
    }, 0);
    assert.ok(bytes < 2 * 1024 * 1024, 'Installation must not return to the 11.8 MB bulk download');
  });
  await test('warm navigation and scripts return cached bytes without making any network request', async () => {
    const app = fixture({ fetch() { throw new Error('Network must not be needed'); } });
    app.current().rows.set(app.base + 'explore/', response('cached graph page'));
    app.current().rows.set(app.base + 'explore/app.js', response('cached graph script'));
    const nav = app.dispatch('fetch', request(app.base + 'explore/?subject=physics&stage=j#cnp_053', {mode:'navigate'}));
    const js = app.dispatch('fetch', request(app.base + 'explore/app.js'));
    assert.equal(await (await nav.event.response).text(), 'cached graph page');
    assert.equal(await (await js.event.response).text(), 'cached graph script');
    await Promise.all([nav.done(), js.done()]); assert.equal(app.calls.length, 0);
  });
  await test('Cloudflare canonical HTML redirects install and both URL forms work offline without trusting other redirects', async () => {
    const base = 'https://physicalmap.pages.dev/';
    const app = fixture({fetch(req) { return req.url.endsWith('/children/history.html') ?
      response('history page', {redirected:true,url:base+'children/history'}) : response('core'); }});
    await app.dispatch('install').done(); assert.equal(app.skipped(),1);
    assert.equal(app.calls.some(req=>req.url===base+'index.html'),false,'Root index alias must not trigger a redundant canonical redirect');
    for (const suffix of ['children/history','children/history.html?subject=physics']) {
      const before=app.calls.length, run=app.dispatch('fetch',request(base+suffix,{mode:'navigate'}));
      assert.equal(await(await run.event.response).text(),'history page'); await run.done(); assert.equal(app.calls.length,before);
    }
    for (const url of [base+'unexpected-page','https://other.test/children/history']) {
      const unsafe = fixture({fetch(req) {return req.url.endsWith('/children/history.html') ?
        response('wrong destination',{redirected:true,url}) : response('core'); }});
      await assert.rejects(unsafe.dispatch('install').done(),/Core resource/); assert.equal(unsafe.skipped(),0);
    }
  });
  await test('index.html navigation aliases and query combinations reuse the same shell under subdirectory hosting', async () => {
    const app = fixture({scope:'https://example.test/school/'});
    app.current().rows.set(app.base + 'children/', response('center'));
    const run = app.dispatch('fetch', request(app.base + 'children/index.html?subject=science', {mode:'navigate'}));
    assert.equal(await (await run.event.response).text(), 'center'); await run.done(); assert.equal(app.calls.length, 0);
  });
  await test('a cold data or image request fetches once and remains available offline in this version', async () => {
    let offline = false;
    const app = fixture({ fetch(req) { if (offline) throw new Error('offline'); return response('resource: ' + req.url); } });
    for (const item of ['data/questions.json','assets/avatars/blue/skin-10.svg']) {
      const req = request(app.base + item), first = app.dispatch('fetch', req);
      assert.ok((await (await first.event.response).text()).includes(item)); await first.done();
    }
    const calls = app.calls.length; offline = true;
    for (const item of ['data/questions.json','assets/avatars/blue/skin-10.svg']) {
      const run = app.dispatch('fetch', request(app.base + item));
      assert.ok((await (await run.event.response).text()).includes(item)); await run.done();
    }
    assert.equal(app.calls.length, calls);
  });
  await test('cache writes extend the worker lifetime without delaying the fetched response', async () => {
    const gate = deferred(), app = fixture({beforePut:() => gate.promise});
    const run = app.dispatch('fetch', request(app.base + 'data/topics.json'));
    assert.equal(run.lifetimeCount, 1);
    assert.ok((await (await run.event.response).text()).startsWith('network:'));
    assert.equal(app.current().rows.size, 0);
    let completed = false; const waiting = run.done().then(() => { completed = true; });
    await Promise.resolve(); assert.equal(completed, false);
    gate.resolve(); await waiting; assert.equal(app.current().rows.size, 1);
  });
  await test('other versions never satisfy a current request and failed core installation leaves the old cache intact', async () => {
    const app = fixture({fetch(req) { return req.url.endsWith('/assets/theme.js') ? response('bad',{status:503}) : response('new'); }});
    app.store('cnm-pwa-v85').rows.set(app.base + 'explore/app.js', response('old script'));
    const current = app.dispatch('fetch', request(app.base + 'explore/app.js'));
    assert.equal(await (await current.event.response).text(), 'new'); await current.done();
    assert.equal(app.calls.length, 1);
    await assert.rejects(app.dispatch('install').done(), /Core resource/);
    assert.equal(app.skipped(), 0); assert.equal(app.deleted.length, 0);
    assert.equal(await (await app.store('cnm-pwa-v85').match(app.base + 'explore/app.js')).text(), 'old script');
  });
  await test('activation removes old app versions only after installation succeeds and preserves unrelated caches', async () => {
    const app = fixture(); app.store('cnm-pwa-v85'); app.store('another-application');
    await app.dispatch('install').done(); await app.dispatch('activate').done();
    assert.deepEqual(app.deleted, ['cnm-pwa-v85']);
    assert.ok(app.stores.has('another-application')); assert.ok(app.stores.has(app.context.CACHE)); assert.equal(app.claimed(), 1);
  });
  await test('HTTP errors, redirects and opaque responses cannot poison runtime cache entries', async () => {
    for (const options of [{status:500}, {redirected:true}, {type:'opaque'}]) {
      const app = fixture({fetch:() => response('bad response',options)});
      const run = app.dispatch('fetch', request(app.base + 'data/topics.json'));
      assert.equal(await (await run.event.response).text(), 'bad response'); await run.done();
      assert.equal(app.current().rows.size, 0);
    }
    const app = fixture({fetch() { throw new Error('offline'); }});
    app.current().rows.set(app.base, response('offline home'));
    const run = app.dispatch('fetch', request(app.base + 'unknown-page/',{mode:'navigate'}));
    assert.equal(await (await run.event.response).text(), 'offline home'); await run.done();
  });
  await test('foreign origins, non-GET methods and the service worker update bypass interception', async () => {
    const app = fixture();
    for (const req of [request('https://other.test/assets/app.js'), request(app.base + 'data/topics.json',{method:'POST'}), request(app.base + 'sw.js?update=1')]) {
      const run = app.dispatch('fetch', req); assert.equal(run.event.response, undefined); assert.equal(run.lifetimeCount, 0);
    }
    assert.equal(app.calls.length, 0);
  });
  await test('idle graph warmup accepts only its fixed data list, deduplicates concurrent messages and skips cached files', async () => {
    const gate = deferred(); let active = 0, peak = 0;
    const app = fixture({async fetch(req) {
      active++; peak = Math.max(peak, active); await gate.promise; active--; return response('graph: ' + req.url);
    }});
    app.current().rows.set(app.base + 'data/topics.json', response('already cached'));
    const ignored = app.dispatch('message', {type:'OTHER', urls:['data/questions.json']});
    assert.equal(ignored.lifetimeCount, 0);
    const first = app.dispatch('message', {type:'CNM_WARM_GRAPH_DATA', urls:['data/questions.json','assets/avatars/skin-01.svg']});
    const duplicate = app.dispatch('message', {type:'CNM_WARM_GRAPH_DATA'});
    assert.equal(first.lifetimeCount, 1); assert.equal(duplicate.lifetimeCount, 1);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(app.calls.length, 1);
    gate.resolve(); await Promise.all([first.done(), duplicate.done()]);
    assert.equal(peak, 1);
    assert.deepEqual(app.calls.map(req => new URL(req.url).pathname), [
      '/data/dependencies.json','/data/cn-curriculum-standards.json','/data/id-aliases.json'
    ]);
    await app.dispatch('message', {type:'CNM_WARM_GRAPH_DATA'}).done(); assert.equal(app.calls.length, 3);
  });
  await test('optional warmup tolerates failures and later retries only the missing graph data', async () => {
    let fail = true;
    const app = fixture({fetch(req) {
      if (fail && req.url.endsWith('dependencies.json')) throw new Error('temporary network failure');
      return response('graph data');
    }});
    await app.dispatch('message', {type:'CNM_WARM_GRAPH_DATA'}).done(); assert.equal(app.calls.length, 4);
    assert.equal(app.current().rows.size, 3); fail = false;
    await app.dispatch('message', {type:'CNM_WARM_GRAPH_DATA'}).done();
    assert.equal(app.calls.length, 5); assert.equal(app.calls.at(-1).url, app.base + 'data/dependencies.json');
    assert.equal(app.current().rows.size, 4);
  });
  await test('runtime cache open or match failures still return the network page and script', async () => {
    for (const fault of ['beforeOpen', 'beforeMatch']) {
      const app = fixture({[fault]() { throw new Error('Cache API unavailable'); }});
      for (const [item, mode] of [['explore/?stage=j','navigate'], ['explore/app.js','cors']]) {
        const run = app.dispatch('fetch', request(app.base + item,{mode}));
        assert.equal(await (await run.event.response).text(), 'network: ' + app.base + item);
        await run.done();
      }
      assert.equal(app.calls.length, 2); assert.equal(app.current().rows.size, 0);
    }
  });
  await test('unavailable offline fallback preserves the original network error', async () => {
    const networkError = new Error('Original network failure');
    for (const fault of ['open', 'home']) {
      const app = fixture({fetch() { throw networkError; },
        beforeOpen() { if (fault === 'open') throw new Error('Cache open failed'); },
        beforeMatch(req) { if (fault === 'home' && key(req) === 'https://physicalmap.pages.dev/') throw new Error('Cache fallback failed'); }
      });
      const run = app.dispatch('fetch', request(app.base + 'unvisited/',{mode:'navigate'}));
      await assert.rejects(run.event.response, error => error === networkError); await run.done();
    }
  });
  await test('cache API failures reject core installation but remain harmless for optional warm messages', async () => {
    for (const fault of ['beforeOpen', 'beforeMatch']) {
      const app = fixture({[fault]() { throw new Error('Cache API unavailable'); }});
      app.store('cnm-pwa-v85').rows.set(app.base, response('old home'));
      await app.dispatch('message', {type:'CNM_WARM_GRAPH_DATA'}).done();
      assert.equal(app.calls.length, 0);
      if (fault === 'beforeOpen') {
        await assert.rejects(app.dispatch('install').done(), /Cache API unavailable/);
        assert.equal(app.skipped(), 0); assert.equal(app.deleted.length, 0);
      }
      assert.equal(app.store('cnm-pwa-v85').rows.get(app.base).body, 'old home');
    }
  });
  console.log('test_service_worker: ' + passed + ' passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
