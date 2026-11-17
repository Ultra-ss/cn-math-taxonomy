#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Theme = require('../assets/theme.js');
const KEY = 'cnmTheme.v1';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
function target(extra = {}) {
  const listeners = new Map();
  return { ...extra,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { if (listeners.has(type)) listeners.get(type).delete(fn); },
    fire(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    listenerCount() { return [...listeners.values()].reduce((total, set) => total + set.size, 0); }
  };
}
function element(attrs = {}) {
  const values = new Map(Object.entries(attrs));
  return target({ style: {}, getAttribute: key => values.get(key) || null, setAttribute: (key, value) => values.set(key, String(value)) });
}
function fixture(options = {}) {
  const entries = options.entries || new Map(), reads = [], writes = [], events = [];
  const storage = {
    getItem(key) { reads.push(key); if (options.failRead) throw new Error('read blocked'); return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { if (options.failWrite) throw new Error('quota'); writes.push([key, value]); entries.set(key, value); }
  };
  const light = element({ 'data-theme-choice': 'light' }), dark = element({ 'data-theme-choice': 'dark' });
  const invalid = element({ 'data-theme-choice': 'unknown' }), html = element();
  const buttons = options.loading ? [] : [light, dark, invalid];
  const metas = options.loading ? [] : [element({ media: '(prefers-color-scheme: light)' }), element({ media: '(prefers-color-scheme: dark)' })];
  const doc = target({ documentElement: html, readyState: options.loading ? 'loading' : 'complete',
    querySelectorAll(selector) { return selector === '[data-theme-choice]' ? buttons : selector === 'meta[name="theme-color"]' ? metas : []; }
  });
  const media = target({ matches: !!options.dark });
  if (options.legacyMedia) {
    const add = media.addEventListener, remove = media.removeEventListener;
    media.addListener = fn => add('change', fn); media.removeListener = fn => remove('change', fn);
    delete media.addEventListener; delete media.removeEventListener;
  }
  const win = target({ document: doc, localStorage: storage,
    matchMedia: options.noMedia ? undefined : () => media,
    CustomEvent: function (type, fields) { this.type = type; this.detail = fields.detail; },
    dispatchEvent(event) { events.push(event); this.fire(event.type, event); }
  });
  if (options.denied) Object.defineProperty(win, 'localStorage', { get() { throw new Error('storage denied'); } });
  if (options.legacyEvent) {
    delete win.CustomEvent;
    doc.createEvent = () => ({ initCustomEvent(type, _bubbles, _cancelable, detail) { this.type = type; this.detail = detail; } });
  }
  const api = Theme.create(win);
  function system(darkValue) { media.matches = darkValue; media.fire('change', { matches: darkValue }); }
  function ready() {
    buttons.push(light, dark, invalid);
    metas.push(element({ media: '(prefers-color-scheme: light)' }), element({ media: '(prefers-color-scheme: dark)' }));
    doc.readyState = 'interactive'; doc.fire('DOMContentLoaded');
  }
  function pressed(mode) { return (mode === 'light' ? light : dark).getAttribute('aria-pressed'); }
  return { api, win, doc, html, media, entries, reads, writes, events, metas, light, dark, invalid, system, ready, pressed, storage };
}

test('CommonJS导出独立工厂，head加载时立即设主题且不写inline打印样式', () => {
  assert.equal(Theme.KEY, KEY); assert.equal(typeof Theme.create, 'function');
  const f = fixture({ loading: true, dark: true });
  assert.equal(f.api.get(), 'dark'); assert.equal(f.html.getAttribute('data-theme'), 'dark');
  assert.deepEqual(f.html.style, {}); assert.deepEqual(f.events, []); assert.deepEqual(f.writes, []);
  f.api.destroy();
});
test('DOMContentLoaded绑定两个原生按钮及媒体色，重复ready不叠加点击', () => {
  const f = fixture({ loading: true }); f.ready();
  assert.equal(f.pressed('light'), 'true'); assert.equal(f.pressed('dark'), 'false');
  assert.equal(f.light.getAttribute('aria-label'), '日间模式'); assert.equal(f.dark.getAttribute('aria-label'), '深夜模式');
  f.doc.fire('DOMContentLoaded'); f.dark.fire('click');
  assert.equal(f.api.get(), 'dark'); assert.equal(f.entries.get(KEY), 'dark'); assert.equal(f.events.length, 1);
  assert.deepEqual(f.events[0].detail, { theme: 'dark' }); assert.equal(f.writes.length, 1);
  assert.ok(f.metas.every(meta => meta.getAttribute('content') === '#2d2d39'));
  assert.deepEqual(f.metas.map(meta => meta.getAttribute('media')), ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']);
  assert.equal(f.invalid.listenerCount(), 0); f.api.destroy();
});
test('保存的手动日间可覆盖系统深夜并跨页面恢复', () => {
  const entries = new Map([[KEY, 'light'], ['cnmProgress.v1', 'untouched']]);
  const f = fixture({ entries, dark: true });
  assert.equal(f.api.get(), 'light'); assert.equal(f.pressed('light'), 'true');
  f.system(false); f.system(true); assert.equal(f.api.get(), 'light'); assert.equal(f.events.length, 0);
  f.dark.fire('click'); assert.equal(f.entries.get(KEY), 'dark');
  const next = fixture({ entries, dark: false }); assert.equal(next.api.get(), 'dark');
  assert.equal(entries.get('cnmProgress.v1'), 'untouched'); assert.ok(f.reads.every(key => key === KEY));
  f.api.destroy(); next.api.destroy();
});
test('没有手动选择时实时跟随系统，点击当前模式也能固定选择', () => {
  const f = fixture(); f.system(true); assert.equal(f.api.get(), 'dark');
  assert.equal(f.events.length, 1); assert.equal(f.pressed('dark'), 'true');
  f.dark.fire('click'); assert.equal(f.events.length, 1, '重复当前主题不触发图谱重画');
  f.system(false); assert.equal(f.api.get(), 'dark'); assert.equal(f.entries.get(KEY), 'dark');
  f.api.destroy();
});
test('storage事件同步其他窗口的选择，不写回或响应其他学习键', () => {
  const f = fixture({ dark: true });
  f.win.fire('storage', { key: KEY, newValue: 'light', storageArea: f.storage });
  assert.equal(f.api.get(), 'light'); assert.equal(f.events.length, 1); assert.equal(f.writes.length, 0);
  f.system(false); f.system(true); assert.equal(f.api.get(), 'light');
  f.win.fire('storage', { key: 'cnmProgress.v1', newValue: 'dark', storageArea: f.storage });
  f.win.fire('storage', { key: KEY, newValue: 'dark', storageArea: {} });
  assert.equal(f.api.get(), 'light'); assert.equal(f.events.length, 1);
  f.win.fire('storage', { key: KEY, newValue: null, storageArea: f.storage });
  assert.equal(f.api.get(), 'dark'); f.system(false); assert.equal(f.api.get(), 'light');
  f.win.fire('storage', { key: KEY, newValue: 'dark', storageArea: f.storage });
  f.win.fire('storage', { key: null, newValue: null, storageArea: f.storage });
  assert.equal(f.api.get(), 'light'); f.api.destroy();
});
test('损坏或旧格式偏好安全忽略，非法set完全不改现有状态', () => {
  for (const value of ['bad', '{"theme":"dark"}', '"dark"', '', 'null']) {
    const f = fixture({ entries: new Map([[KEY, value]]) });
    assert.equal(f.api.get(), 'light');
    for (const invalid of [null, undefined, {}, 'system', 'LIGHT', 0]) assert.equal(f.api.set(invalid), false);
    assert.equal(f.entries.get(KEY), value); assert.equal(f.events.length, 0); assert.equal(f.writes.length, 0);
    f.api.destroy();
  }
});
test('localStorage访问或写入被拒绝时，本页选择仍可用且不受系统覆盖', () => {
  for (const options of [{ denied: true }, { failRead: true }, { failWrite: true }]) {
    const f = fixture({ ...options, dark: true });
    assert.equal(f.api.get(), 'dark'); assert.equal(f.api.set('light'), true);
    assert.equal(f.html.getAttribute('data-theme'), 'light'); assert.equal(f.pressed('light'), 'true');
    f.system(true); assert.equal(f.api.get(), 'light'); f.api.destroy();
  }
});
test('无matchMedia回退日间，旧媒体监听与CustomEvent兼容路径可切换', () => {
  const plain = fixture({ noMedia: true }); assert.equal(plain.api.get(), 'light'); plain.api.destroy();
  const f = fixture({ legacyMedia: true, legacyEvent: true }); f.system(true);
  assert.equal(f.api.get(), 'dark'); assert.equal(f.events[0].type, 'cnm:theme');
  assert.deepEqual(f.events[0].detail, { theme: 'dark' }); f.api.destroy(); assert.equal(f.media.listenerCount(), 0);
});
test('销毁解绑按钮、storage和系统监听，未ready的控制也不会再绑定', () => {
  const f = fixture(); f.api.destroy();
  assert.equal(f.light.listenerCount() + f.dark.listenerCount() + f.win.listenerCount() + f.media.listenerCount(), 0);
  assert.equal(f.api.set('dark'), false); f.system(true); f.dark.fire('click'); assert.equal(f.api.get(), 'light');
  const early = fixture({ loading: true }); early.api.destroy(); early.ready();
  assert.equal(early.light.listenerCount() + early.dark.listenerCount() + early.doc.listenerCount(), 0);
});
test('浏览器head脚本提供全局get/set并在CSS加载前应用保存偏好', () => {
  const f = fixture({ loading: true, dark: true, entries: new Map([[KEY, 'light']]) }); f.api.destroy();
  const source = fs.readFileSync(path.join(__dirname, '../assets/theme.js'), 'utf8');
  vm.runInNewContext(source, { window: f.win });
  assert.equal(f.win.CnmTheme.get(), 'light'); assert.equal(f.html.getAttribute('data-theme'), 'light');
  assert.equal(f.win.CnmTheme.set('dark'), true); assert.equal(f.html.getAttribute('data-theme'), 'dark');
  f.win.CnmTheme.destroy();
});
console.log('test_theme: ' + passed + ' passed');
