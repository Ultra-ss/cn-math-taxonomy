#!/usr/bin/env node
/* 首页教材加载：假 DOM + 可控 fetch，不请求已删除的统计数据。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/home.js'), 'utf8');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('  ok   ' + name); }
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
function element() {
  const attrs = {};
  const listeners = new Map();
  const el = {
    textContent: '', hidden: true, children: [], className: '', href: '',
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    fire(type, event) { (listeners.get(type) || []).forEach(fn => fn(event)); },
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
const actual = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/topics.json'), 'utf8'));
function load(search, options = {}) {
  const ids = {};
  ['load-error', 'textbook-grid', 'textbook-subject', 'textbook-title', 'textbook-description', 'card-motion-toggle'].forEach(id => { ids[id] = element(); });
  ids['textbook-grid'].setAttribute('aria-busy', 'true');
  const calls = [];
  function fetch(url) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    calls.push({url, resolve, reject}); return promise;
  }
  let motionChange;
  const motionPreference={matches:!!options.reducedMotion,addEventListener(type,fn){if(type==='change')motionChange=fn;}};
  vm.runInNewContext(source, {
    window: {__cnmHomeResume: options.resume,matchMedia:()=>motionPreference},
    location: {hash:options.hash || '', search:search || ''}, URLSearchParams, fetch,
    document: { title:'', body:{classList:{toggle(){}}}, querySelectorAll(){return [];},
      getElementById(id){return ids[id] || null;}, createElement(){return element();} }
  }, {filename:'assets/home.js'});
  function respond(data = actual, status = 200) {
    calls[0].resolve({ok:status>=200 && status<300,status,json:()=>Promise.resolve(data)});
  }
  return {ids,calls,respond,setReducedMotion(value){motionPreference.matches=value;if(motionChange)motionChange();}};
}
(async () => {
  await test('首页先显示全部教材入口，只请求知识点文件', async () => {
    const {ids,calls,respond} = load('');
    assert.equal(ids['textbook-grid'].children.length, 9);
    assert.deepEqual(calls.map(c=>c.url), ['data/topics.json']);
    respond(); await flush();
    assert.equal(calls.length,1);
    assert.equal(ids['textbook-grid'].hasAttribute('aria-busy'), false);
  });
  await test('卡片动效可暂停和恢复，教材数据加载不重置暂停状态', async () => {
    const {ids,respond}=load('');const grid=ids['textbook-grid'],toggle=ids['card-motion-toggle'];
    assert.equal(toggle.hidden,false);assert.equal(toggle.textContent,'暂停晃动');
    toggle.fire('click');assert.equal(grid.getAttribute('data-motion-paused'),'true');assert.equal(toggle.textContent,'继续晃动');
    respond();await flush();assert.equal(grid.getAttribute('data-motion-paused'),'true');assert.equal(grid.children.length,9);
    toggle.fire('click');assert.equal(grid.getAttribute('data-motion-paused'),'false');assert.equal(toggle.textContent,'暂停晃动');
  });
  await test('减少动态效果时隐藏控制，并响应系统设置变化且保留暂停选择', async () => {
    const {ids,setReducedMotion}=load('',{reducedMotion:true});
    const toggle=ids['card-motion-toggle'];assert.equal(toggle.hidden,true);
    setReducedMotion(false);assert.equal(toggle.hidden,false);toggle.fire('click');
    setReducedMotion(true);assert.equal(toggle.hidden,true);
    setReducedMotion(false);assert.equal(toggle.textContent,'继续晃动');assert.equal(ids['textbook-grid'].getAttribute('data-motion-paused'),'true');
  });
  await test('上次位置校验或用户选择继续不阻塞首页教材', async () => {
    let resolve; const resume = new Promise(done => {resolve=done;});
    const {ids,calls,respond} = load('',{resume});
    assert.equal(ids['textbook-grid'].children.length,9);
    assert.equal(calls.length,1);
    resolve(true); respond(); await flush();
    assert.equal(ids['textbook-grid'].children.length,9);
  });
  await test('默认与旧学科链接进入物理，只有显式科学切换小学科学', async () => {
    for (const search of ['', '?subject=math', '?subject=physics', '?subject=science']) {
      const {ids,respond} = load(search); respond(); await flush();
      const science=search==='?subject=science';
      assert.equal(ids['textbook-grid'].children.length,science?12:9);
      assert.ok(ids['textbook-grid'].children.every(card=>card.href.includes('subject='+(science?'science':'physics'))));
    }
  });
  await test('八上八下独立，高中按册链接，并保留每册真实知识点数', async () => {
    const {ids,respond} = load(''); respond(); await flush();
    const cards=ids['textbook-grid'].children;
    assert.deepEqual(cards.map(card=>card.getAttribute('data-volume')), ['八上','八下','九全','必修一','必修二','必修三','选必一','选必二','选必三']);
    assert.deepEqual(cards.map(card=>parseInt(card.children[2].textContent,10)), [28,24,40,27,25,37,28,26,34]);
    for (const card of cards) {
      const url=new URL(card.href,'https://physicalmap.pages.dev/');
      assert.equal(url.pathname,'/explore/');
      assert.equal(url.searchParams.get('volume'),card.getAttribute('data-volume'));
      assert.equal(url.searchParams.get('grade'),null);
    }
  });
  await test('小学科学十二册完整显示，知识点数量合计269', async () => {
    const {ids,respond}=load('?subject=science'); respond(); await flush();
    const cards=ids['textbook-grid'].children;
    assert.deepEqual(cards.map(card=>card.getAttribute('data-volume')), ['一上','一下','二上','二下','三上','三下','四上','四下','五上','五下','六上','六下']);
    assert.equal(cards.reduce((sum,card)=>sum+parseInt(card.children[2].textContent,10),0),269);
  });
  await test('数据读取失败或格式错误时仍保留可点教材并显示错误', async () => {
    for (const kind of ['http','network','format']) {
      const {ids,calls,respond}=load('');
      if (kind==='network') calls[0].reject(new Error('offline'));
      else respond(kind==='format'?{}:actual,kind==='http'?404:200);
      await flush();
      assert.equal(ids['load-error'].hidden,false);
      assert.equal(ids['textbook-grid'].children.length,9);
      assert.ok(ids['textbook-grid'].children.every(card=>card.href));
      assert.equal(ids['textbook-grid'].hasAttribute('aria-busy'),false);
    }
  });
  await test('明确知识点分享链接仍交由图谱处理，不加载首页数据', async () => {
    const {calls}=load('',{hash:'#cnp_053'}); assert.equal(calls.length,0);
  });
  await test('首页删除图谱统计与本机盲区，保留教材、反馈与继续学习弹窗', async () => {
    const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
    const main=html.slice(html.indexOf('<main'),html.indexOf('</main>'));
    assert.match(main, /<main[^>]*>\s*<section class="textbooks"/);
    assert.doesNotMatch(html,/图谱里?有什么|本机盲区|id="stats"|id="blind-home"/);
    assert.doesNotMatch(html,/assets\/(?:blindspots|children|stem-compat)\.js/);
    assert.doesNotMatch(source,/renderBlindHome|data\/(?:questions|dependencies|cn-curriculum-standards)\.json/);
    assert.equal((main.match(/class="textbook-card /g)||[]).length,9);
    assert.match(html,/home-feedback/); assert.match(html,/continue-learning-dialog/);
  });
  console.log(passed+' passed');
})().catch(error=>{console.error(error);process.exit(1);});
