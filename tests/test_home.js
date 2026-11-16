#!/usr/bin/env node
/* 首页题库异步：假 DOM + 可控 fetch。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/home.js'), 'utf8');
let passed = 0;

async function test(name, fn) {
  await fn();
  passed++;
  console.log('  ok   ' + name);
}

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };

function element() {
  const attrs = {};
  const el = {
    textContent: '', hidden: true, children: [], className: '', href: '',
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    replaceChildren() { el.children = []; },
    append(...nodes) { el.children.push(...nodes); },
    appendChild(node) { el.children.push(node); return node; }
  };
  return el;
}

const topics = [
  { id: 'cns_p001', subject: 'science', grade: 1, semester: '上' },
  { id: 'cns_p002', subject: 'science', grade: 2, semester: '下' },
  { id: 'cnm_a', subject: 'math', grade: 3, semester: '上' },
  { id: 'cnp_a', subject: 'physics', grade: 8, semester: '上' }
];
const deps = [{ topicId: 'cns_p002', prerequisiteId: 'cns_p001' }];
const standards = { items: [{ id: 'css-1' }, { id: 'cms-1' }, { id: 'cps-1' }] };
const questions = [
  { topicId: 'cns_p001' }, { topicId: 'cns_p002' }, { topicId: 'cns_p001' },
  { topicId: 'cnm_a' }, { topicId: 'cnp_a' }
];

function load(search, options = {}) {
  const ids = {};
  ['n-topics', 'n-edges', 'n-questions', 'n-standards', 'load-error', 'textbook-grid', 'textbook-subject', 'textbook-title', 'textbook-description'].forEach(id => { ids[id] = element(); });
  ids['textbook-grid'].setAttribute('aria-busy', 'true');
  const calls = [];
  function fetch(url) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({ url, resolve, reject, promise });
    return promise;
  }
  const context = {
    window: options.resume ? {__cnmHomeResume: options.resume} : {},
    location: { hash: '', search: search || '' },
    URLSearchParams,
    fetch,
    document: {
      title: '',
      body: { classList: { toggle() {} } },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById(id) { return ids[id] || null; },
      createElement() { return element(); }
    }
  };
  vm.runInNewContext(source, context, { filename: 'assets/home.js' });
  const all = url => calls.filter(c => c.url === url);
  const call = url => all(url)[0];
  const respond = (url, data, status) => {
    const c = call(url);
    assert.ok(c, 'expected fetch of ' + url);
    const ok = status === undefined || (status >= 200 && status < 300);
    c.resolve({ ok, status: status || 200, json: () => Promise.resolve(data) });
  };
  const failNet = (url) => {
    const c = call(url);
    assert.ok(c, 'expected fetch of ' + url);
    c.reject(new Error('network'));
  };
  async function baseMeta() {
    respond('data/topics.json', topics);
    respond('data/dependencies.json', deps);
    respond('data/cn-curriculum-standards.json', standards);
    await flush();
  }
  return { ids, calls, all, call, respond, failNet, baseMeta };
}

(async () => {
  await test('等待首页位置恢复，成功跳转时不再加载首页数据', async () => {
    let resolve;
    const resume = new Promise(done => {resolve = done;});
    const {calls} = load('', {resume});
    assert.strictEqual(calls.length, 0);
    resolve(true);
    await flush();
    assert.strictEqual(calls.length, 0);
  });

  await test('位置失效或恢复失败后仍正常加载教材首页', async () => {
    let resolve;
    const resume = new Promise(done => {resolve = done;});
    const {calls, ids, baseMeta} = load('', {resume});
    assert.strictEqual(calls.length, 0);
    resolve(false);
    await flush();
    await baseMeta();
    assert.strictEqual(ids['textbook-grid'].children.length, 9);
  });

  await test('元数据到后可渲染，题库先显示 …', async () => {
    const { ids, baseMeta, respond } = load('?subject=science');
    await baseMeta();
    assert.strictEqual(ids['n-topics'].textContent, '2');
    assert.strictEqual(ids['n-questions'].textContent, '…');
    assert.ok(ids['textbook-grid'].children.length > 0, 'textbook cards rendered');
    respond('data/questions.json', questions);
    await flush();
    assert.strictEqual(ids['n-questions'].textContent, '3');
  });

  await test('题库 404 显示 — 且不整页 fail', async () => {
    const { ids, baseMeta, respond } = load('');
    await baseMeta();
    respond('data/questions.json', null, 404);
    await flush();
    assert.strictEqual(ids['n-questions'].textContent, '—');
    assert.strictEqual(ids['load-error'].hidden, true);
  });

  await test('题库非数组显示 —', async () => {
    const { ids, baseMeta, respond } = load('');
    await baseMeta();
    respond('data/questions.json', { nope: true });
    await flush();
    assert.strictEqual(ids['n-questions'].textContent, '—');
  });

  await test('题库网络错误会重试至多 2 次', async () => {
    const { ids, all, baseMeta, failNet, respond } = load('?subject=science');
    await baseMeta();
    assert.strictEqual(all('data/questions.json').length, 1);
    failNet('data/questions.json');
    await flush();
    assert.ok(all('data/questions.json').length >= 2, 'retried');
    // second attempt succeeds
    const second = all('data/questions.json')[1];
    second.resolve({ ok: true, status: 200, json: () => Promise.resolve(questions) });
    await flush();
    assert.strictEqual(ids['n-questions'].textContent, '3');
  });

  await test('进行中 Promise 去重', async () => {
    assert.ok(source.includes('fetchInflight'), 'inflight map present');
    assert.ok(source.includes('fetchJsonWithRetry'), 'retry helper present');
  });

  await test('topics 无效仍 fail', async () => {
    const { ids, respond } = load('');
    respond('data/topics.json', { bad: true });
    respond('data/dependencies.json', deps);
    respond('data/cn-curriculum-standards.json', standards);
    await flush();
    assert.strictEqual(ids['load-error'].hidden, false);
  });

  await test('物理学科计数过滤', async () => {
    const { ids, baseMeta, respond } = load('?subject=physics');
    await baseMeta();
    respond('data/questions.json', questions);
    await flush();
    assert.strictEqual(ids['n-topics'].textContent, '1');
    assert.strictEqual(ids['n-questions'].textContent, '1');
  });

  await test('默认与旧学科链接均进入物理，只有显式科学切换科学', async () => {
    for (const search of ['', '?subject=math', '?subject=physics']) {
      const { ids, baseMeta } = load(search);
      await baseMeta();
      assert.strictEqual(ids['n-topics'].textContent, '1');
      assert.strictEqual(ids['textbook-grid'].children.length, 9);
      assert.ok(ids['textbook-grid'].children.every(card => card.href.includes('subject=physics')));
    }
    const { ids, baseMeta } = load('?subject=science');
    await baseMeta();
    assert.strictEqual(ids['textbook-grid'].children.length, 12);
    assert.ok(ids['textbook-grid'].children.every(card => card.href.includes('subject=science')));
  });

  await test('八上八下独立链接，高中按册进入，不使用年级合并', async () => {
    const { ids, baseMeta } = load('');
    await baseMeta();
    const cards = ids['textbook-grid'].children;
    assert.deepStrictEqual(cards.map(card => card.getAttribute('data-volume')),
      ['八上', '八下', '九全', '必修一', '必修二', '必修三', '选必一', '选必二', '选必三']);
    for (const card of cards) {
      const url = new URL(card.href, 'https://physicalmap.pages.dev/');
      assert.strictEqual(url.searchParams.get('volume'), card.getAttribute('data-volume'));
      assert.strictEqual(url.searchParams.get('grade'), null);
      assert.strictEqual(url.pathname, '/explore/');
    }
  });

  await test('教材入口先于统计和题库完成，统计失败仍保留入口', async () => {
    const { ids, respond } = load('');
    respond('data/topics.json', topics);
    await flush();
    assert.strictEqual(ids['textbook-grid'].children.length, 9);
    assert.ok(!ids['textbook-grid'].hasAttribute('aria-busy'));
    assert.strictEqual(ids['textbook-grid'].children[0].children[2].textContent, '1 个知识点');
    respond('data/dependencies.json', null, 404);
    respond('data/cn-curriculum-standards.json', standards);
    await flush();
    assert.strictEqual(ids['load-error'].hidden, false);
    assert.strictEqual(ids['textbook-grid'].children.length, 9);
  });

  await test('真实数据的每册数量与入口对应，物理九册覆盖269点', async () => {
    const { ids, respond } = load('');
    const actual = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/topics.json'), 'utf8'));
    respond('data/topics.json', actual);
    await flush();
    const counts = ids['textbook-grid'].children.map(card => parseInt(card.children[2].textContent, 10));
    assert.deepStrictEqual(counts, [28, 24, 40, 27, 25, 37, 28, 26, 34]);
    assert.strictEqual(counts.reduce((a, b) => a + b, 0), 269);
    const science = load('?subject=science');
    science.respond('data/topics.json', actual);
    await flush();
    assert.deepStrictEqual(science.ids['textbook-grid'].children.map(card => card.getAttribute('data-volume')),
      ['一上', '一下', '二上', '二下', '三上', '三下', '四上', '四下', '五上', '五下', '六上', '六下']);
    assert.strictEqual(science.ids['textbook-grid'].children.reduce((sum, card) => sum + parseInt(card.children[2].textContent, 10), 0), 269);
  });

  await test('静态首页先展示教材，诊断与统计不抢占教材首屏', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    assert.match(main, /<main[^>]*>\s*<section class="textbooks"/);
    assert.ok(main.indexOf('id="textbook-grid"') < main.indexOf('id="stats"'));
    assert.ok(main.indexOf('id="textbook-grid"') < main.indexOf('id="blind-home"'));
    assert.doesNotMatch(main, /hero-actions|开始诊断|先看一遍演示/);
    assert.strictEqual((main.match(/class="textbook-card /g) || []).length, 9);
  });

  console.log(passed + ' passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
