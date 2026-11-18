#!/usr/bin/env node
/* 首页教材加载：假 DOM + 可控 fetch，不请求已删除的统计数据。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/home.js'), 'utf8');
const bookScope = require('../assets/book-selection.js');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('  ok   ' + name); }
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
function element(tag = 'div') {
  const attrs = {};
  const listeners = new Map();
  const el = {
    tagName:tag.toUpperCase(), textContent: '', hidden: true, children: [], className: '', href: '',
    classList: { toggle(value, force) { const set=new Set(el.className.split(' ').filter(Boolean));const on=force===undefined?!set.has(value):force;if(on)set.add(value);else set.delete(value);el.className=[...set].join(' ');return on; }, add(value){this.toggle(value,true);},remove(value){this.toggle(value,false);},contains(value){return el.className.split(' ').includes(value);} },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    fire(type, event = {}) { const value={target:el,currentTarget:el,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...event};(listeners.get(type) || []).forEach(fn => fn(value));return value; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k];if(k==='href')el.href=''; },
    hasAttribute(k) { return k in attrs; },
    replaceChildren() { el.children = []; },
    append(...nodes) { nodes.forEach(node=>{node.parentElement=el;el.children.push(node);}); },
    appendChild(node) { node.parentElement=el;el.children.push(node); return node; },
    querySelector(selector) { const matches=node=>selector[0]==='.'?node.classList.contains(selector.slice(1)):node.tagName===selector.toUpperCase();for(const child of el.children){if(matches(child))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null; },
    closest(selector) { return selector[0]==='.'&&el.classList.contains(selector.slice(1))?el:el.parentElement?el.parentElement.closest(selector):null; },
    focus(options) { el.focused=options || true; }
  };
  Object.defineProperty(el,'firstElementChild',{get:()=>el.children[0] || null});
  return el;
}
const actual = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/topics.json'), 'utf8'));
function load(search, options = {}) {
  const ids = {};
  ['load-error', 'textbook-grid', 'textbook-subject', 'textbook-title', 'textbook-description', 'card-motion-toggle',
    'book-multiselect-toggle','book-selection-cancel','book-selection-enter'].forEach(id => { ids[id] = element(); });
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
    window: {__cnmHomeResume: options.resume,matchMedia:()=>motionPreference,CnmBookSelection:bookScope,CnmChildren:options.profiles},
    location: {hash:options.hash || '', search:search || ''}, URLSearchParams, fetch,
    document: { title:'', body:{classList:{toggle(){}}}, querySelectorAll(){return [];},
      getElementById(id){return ids[id] || null;}, createElement(tag){return element(tag);} }
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
  await test('普通模式保留单册直达，多选模式使用可切换按钮且零选择不能进入',async()=>{
    const {ids}=load('');const grid=ids['textbook-grid'],enter=ids['book-selection-enter'];
    assert.ok(grid.children.every(card=>card.tagName==='A'&&card.href));
    assert.equal(ids['book-multiselect-toggle'].hidden,false);
    ids['book-multiselect-toggle'].fire('click');
    assert.ok(grid.children.every(card=>card.tagName==='BUTTON'&&card.getAttribute('aria-pressed')==='false'));
    assert.equal(grid.getAttribute('data-multi-select'),'true');assert.ok(grid.children[0].focused);
    assert.equal(enter.hidden,false);assert.equal(enter.getAttribute('aria-disabled'),'true');
    assert.equal(enter.href,'');assert.equal(enter.fire('click').defaultPrevented,true);
  });
  await test('点击切换多选状态，组合URL使用固定教材顺序，单册仍使用volume',async()=>{
    const {ids}=load('');ids['book-multiselect-toggle'].fire('click');
    const grid=ids['textbook-grid'],enter=ids['book-selection-enter'],first=grid.children[0];
    grid.fire('click',{target:grid.children[8]});grid.fire('click',{target:first});
    assert.equal(grid.children[0],first,'选点不重建卡片');assert.equal(first.getAttribute('aria-pressed'),'true');
    assert.ok(first.classList.contains('is-selected'));assert.equal(ids['textbook-title'].textContent,'已选 2 本教材');
    let url=new URL(enter.href,'https://physicalmap.pages.dev');
    assert.equal(url.searchParams.get('volumes'),'八上,选必三');assert.equal(url.searchParams.has('volume'),false);
    assert.equal(enter.getAttribute('aria-disabled'),'false');assert.equal(enter.fire('click').defaultPrevented,false);
    grid.fire('click',{target:grid.children[8]});url=new URL(enter.href,'https://physicalmap.pages.dev');
    assert.equal(url.searchParams.get('volume'),'八上');assert.equal(url.searchParams.has('volumes'),false);
    grid.fire('click',{target:first});assert.equal(enter.href,'');assert.equal(enter.getAttribute('aria-disabled'),'true');
  });
  await test('计数请求返回只更新数字，保留早选状态、卡片实例与焦点',async()=>{
    const {ids,respond}=load('');ids['book-multiselect-toggle'].fire('click');const grid=ids['textbook-grid'],card=grid.children[0];
    grid.fire('click',{target:card});grid.fire('click',{target:grid.children[1]});card.focus();
    respond();await flush();
    assert.equal(grid.children[0],card);assert.equal(card.focused,true);assert.equal(card.getAttribute('aria-pressed'),'true');
    assert.equal(card.querySelector('.textbook-count').textContent,'28 个知识点');
    assert.equal(new URL(ids['book-selection-enter'].href,'https://physicalmap.pages.dev').searchParams.get('volumes'),'八上,八下');
  });
  await test('取消多选恢复单册入口与焦点，再次进入从空选择开始',async()=>{
    const {ids}=load('');ids['book-multiselect-toggle'].fire('click');const grid=ids['textbook-grid'];
    grid.fire('click',{target:grid.children[0]});ids['book-selection-cancel'].fire('click');
    assert.equal(grid.getAttribute('data-multi-select'),'false');assert.ok(grid.children.every(card=>card.tagName==='A'&&card.href));
    assert.equal(ids['book-selection-enter'].hidden,true);assert.equal(ids['book-selection-cancel'].hidden,true);
    assert.ok(ids['book-multiselect-toggle'].focused);ids['book-multiselect-toggle'].fire('click');
    assert.equal(ids['textbook-title'].textContent,'请选择教材');assert.equal(ids['book-selection-enter'].href,'');
  });
  await test('只有明确进入单册或多选教材才保存选择，切换、取消和数据加载均不写',async()=>{
    const writes=[];
    const profiles={setBookSelection(subject,volumes){writes.push([subject,Array.from(volumes)]);return {ok:true};}};
    const {ids,respond}=load('',{profiles});const grid=ids['textbook-grid'];
    respond();await flush();assert.deepEqual(writes,[]);
    grid.fire('click',{target:grid.children[1]});assert.deepEqual(writes,[['physics',['八下']]]);
    ids['book-multiselect-toggle'].fire('click');grid.fire('click',{target:grid.children[0]});
    ids['book-selection-cancel'].fire('click');assert.equal(writes.length,1);
    ids['book-multiselect-toggle'].fire('click');grid.fire('click',{target:grid.children[2]});grid.fire('click',{target:grid.children[0]});
    assert.equal(writes.length,1);ids['book-selection-enter'].fire('click');
    assert.deepEqual(writes[1],['physics',['八上','九全']]);
    const science=load('?subject=science',{profiles});science.ids['textbook-grid'].fire('click',{target:science.ids['textbook-grid'].children[11]});
    assert.deepEqual(writes[2],['science',['六下']]);
  });
  await test('小学科学也可组合首尾教材，读取失败仍可保留选择进入',async()=>{
    const {ids,calls}=load('?subject=science');ids['book-multiselect-toggle'].fire('click');const grid=ids['textbook-grid'];
    grid.fire('click',{target:grid.children[11]});grid.fire('click',{target:grid.children[0]});
    calls[0].reject(new Error('offline'));await flush();
    const url=new URL(ids['book-selection-enter'].href,'https://physicalmap.pages.dev');
    assert.equal(url.searchParams.get('subject'),'science');assert.equal(url.searchParams.get('volumes'),'一上,六下');
    assert.equal(ids['load-error'].hidden,false);assert.equal(grid.children[11].getAttribute('aria-pressed'),'true');
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
    assert.deepEqual(cards.map(card=>card.children[0].textContent), ['初中','初中','初中','高中','高中','高中','高中','高中','高中']);
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
    assert.doesNotMatch(html,/assets\/(?:blindspots|stem-compat)\.js/);
    assert.match(html,/<script src="assets\/children\.js"[^>]*><\/script>[\s\S]*<script src="assets\/home\.js"[^>]*>/, '明确选教材使用同一个档案存储API');
    assert.doesNotMatch(source,/renderBlindHome|data\/(?:questions|dependencies|cn-curriculum-standards)\.json/);
    assert.equal((main.match(/class="textbook-card /g)||[]).length,9);
    assert.match(html,/home-feedback/); assert.match(html,/continue-learning-dialog/);
  });
  console.log(passed+' passed');
})().catch(error=>{console.error(error);process.exit(1);});
