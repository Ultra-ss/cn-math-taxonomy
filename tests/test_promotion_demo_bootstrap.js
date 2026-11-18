'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Demo = require('../demo/bootstrap.js');
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../demo/seed.json'), 'utf8'));
function storage(entries, fail) {
  const data = new Map(Object.entries(entries || {}));
  return {
    data, get length() { return data.size; }, key(i) { return Array.from(data.keys())[i] || null; },
    getItem(key) { if (fail) fail('get', key); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { if (fail) fail('set', key); data.set(key, value); },
    removeItem(key) { if (fail) fail('remove', key); data.delete(key); }
  };
}
function env(local, session) {
  return { location: { protocol: 'https:', hostname: 'promotion-demo.physicalmap.pages.dev', port: '' },
    localStorage: local || storage(), sessionStorage: session || storage(),
    document: { readyState: 'loading', addEventListener() {} }, addEventListener() {} };
}
let count = 0;
function test(label, fn) { fn(); count++; console.log('ok - ' + label); }
test('production, arbitrary previews and other localhost ports cannot read or write storage', () => {
  for (const location of [
    { protocol: 'https:', hostname: 'physicalmap.pages.dev', port: '' },
    { protocol: 'https:', hostname: 'other.physicalmap.pages.dev', port: '' },
    { protocol: 'https:', hostname: 'promotion-demo.physicalmap.pages.dev.evil.example', port: '' },
    { protocol: 'http:', hostname: '127.0.0.1', port: '8773' }
  ]) {
    const instance = { location };
    Object.defineProperty(instance, 'localStorage', { get() { throw new Error('Must not access formal storage'); } });
    assert.deepEqual(Demo.install(instance, seed), { active: false });
    assert.equal(Demo.replacePreset(instance, seed).ok, false);
  }
  assert.equal(Demo.allowedHost({ protocol:'http:', hostname:'127.0.0.1', port:'8774' }), true);
});
test('first visit installs actual valid preset and commits marker only after all data', () => {
  const instance = env();
  assert.deepEqual(Demo.install(instance, seed), { active:true, ok:true });
  for (const [key, value] of Object.entries(seed.storage)) assert.equal(instance.localStorage.getItem(key), value);
  assert.equal(JSON.parse(instance.localStorage.getItem(Demo.MARKER)).version, 1);
});
test('ordinary reload preserves outfits, progress and account edits without re-seeding', () => {
  const instance = env(); Demo.install(instance, seed);
  instance.localStorage.setItem('cnmAvatarRewards.v1', 'edited');
  instance.localStorage.setItem('cnmChildren.v1', 'changed profile');
  instance.localStorage.setItem('cnpDiagnose.session.v2', 'ongoing');
  const before = Object.fromEntries(instance.localStorage.data);
  assert.equal(Demo.install(instance, seed).ok, true);
  assert.deepEqual(Object.fromEntries(instance.localStorage.data), before);
});
test('explicit reset replaces only managed demo keys and clears stale viewport and in-progress answers', () => {
  const instance = env(storage({ unrelated:'sentinel', 'cnmTheme.v1':'dark',
    'cnpDiagnose.session.v2':'answers', 'cnmLastLocation.v1.account.extra':'old position' }),
    storage({ unrelated:'tab sentinel', 'cnmExplore.viewport.v1.account.extra.physics':'old camera', 'cnmNavigation.subject.v1':'science' }));
  assert.equal(Demo.replacePreset(instance, seed).ok, true);
  assert.equal(instance.localStorage.getItem('unrelated'), 'sentinel');
  assert.equal(instance.localStorage.getItem('cnmTheme.v1'), 'dark');
  assert.equal(instance.localStorage.getItem('cnpDiagnose.session.v2'), null);
  assert.equal(instance.localStorage.getItem('cnmLastLocation.v1.account.extra'), null);
  assert.deepEqual(Object.fromEntries(instance.sessionStorage.data), {unrelated:'tab sentinel'});
  for (const [key, value] of Object.entries(seed.storage)) assert.equal(instance.localStorage.getItem(key), value);
});
test('partial write and session cleanup failures roll back original bytes and do not commit marker', () => {
  for (const failure of ['local', 'session', 'marker', 'pending']) {
    let failed = false;
    const fail = (operation, key) => {
      if (!failed && (failure === 'local' && operation === 'set' && key === 'cnmProgress.v1' ||
          failure === 'session' && operation === 'remove' && key === 'cnmNavigation.subject.v1' ||
          failure === 'pending' && operation === 'set' && key === 'cnmPromotionDemo.navigationReset.v1' ||
          failure === 'marker' && operation === 'set' && key === Demo.MARKER)) {
        failed = true; throw new Error('Simulated quota error');
      }
    };
    const instance = env(storage({ unrelated:'sentinel', 'cnmChildren.v1':'original bytes' }, fail),
      storage({'cnmNavigation.subject.v1':'science'}, fail));
    const before = Object.fromEntries(instance.localStorage.data), beforeTab = Object.fromEntries(instance.sessionStorage.data);
    assert.equal(Demo.replacePreset(instance, seed, true).ok, false);
    assert.deepEqual(Object.fromEntries(instance.localStorage.data), before);
    assert.deepEqual(Object.fromEntries(instance.sessionStorage.data), beforeTab);
    assert.equal(instance.localStorage.getItem(Demo.MARKER), null);
  }
});
test('next document removes a camera written back by graph pagehide after explicit reset', () => {
  const instance = env();
  assert.equal(Demo.replacePreset(instance, seed, true).ok, true);
  instance.sessionStorage.setItem('cnmExplore.viewport.v1.account.promotion-demo.physics', 'stale pagehide camera');
  instance.sessionStorage.setItem('unrelated', 'keep');
  const localBefore = Object.fromEntries(instance.localStorage.data);
  assert.equal(Demo.install(instance, seed).ok, true);
  assert.deepEqual(Object.fromEntries(instance.sessionStorage.data), {unrelated:'keep'});
  assert.deepEqual(Object.fromEntries(instance.localStorage.data), localBefore);
});
test('invalid or unexpected seed keys are rejected before any mutations', () => {
  const instance = env(storage({unrelated:'sentinel'}));
  assert.equal(Demo.replacePreset(instance, {...seed, storage:{...seed.storage, unrelated:'overwrite'}}).ok, false);
  assert.equal(Demo.replacePreset(instance, {...seed, version:2}).ok, false);
  assert.deepEqual(Object.fromEntries(instance.localStorage.data), {unrelated:'sentinel'});
});
console.log(count + ' promotion demo bootstrap tests passed');
