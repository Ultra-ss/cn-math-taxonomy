#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../explore/app.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function element() {
  const listeners = new Map(), attrs = new Map(), classes = new Set();
  return {
    hidden: false, open: false, textContent: '', focused: false,
    classList: {
      contains(c) { return classes.has(c); },
      toggle(c, force) { if (force === undefined) force = !classes.has(c); if (force) classes.add(c); else classes.delete(c); return force; }
    },
    setAttribute(key, value) { attrs.set(key, String(value)); },
    getAttribute(key) { return attrs.get(key); },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    fire(type, event = {}) { (listeners.get(type) || []).forEach(fn => fn({target:this, currentTarget:this, preventDefault() {}, ...event})); },
    showModal() { this.open = true; this.opens = (this.opens || 0) + 1; },
    close() { if (!this.open) return; this.open = false; this.fire('close'); },
    focus(options) { this.focused = options; },
    getBoundingClientRect() { return {left:100,right:300,top:100,bottom:200}; },
    listenerCount(type) { return (listeners.get(type) || []).length; }
  };
}
const ids = Object.fromEntries(['node-diagnose-dialog', 'node-dialog-title', 'node-dialog-question', 'node-dialog-try', 'node-dialog-no', 'cy', 'detail', 'main-nav', 'graph-options', 'mobile-menu-toggle', 'mobile-options-toggle'].map(x=>[x,element()]));
const header = element(), explore = element();
let mobile = true;
const ctx = {
  URL, URLSearchParams,
  location: {origin:'https://physicalmap.pages.dev',href:'https://physicalmap.pages.dev/explore/?subject=physics&volume=八下',pathname:'/explore/',search:'?subject=physics&volume=八下'},
  byId: new Map([['cnp_029',{name:'力',grade:8,semester:'下'}],['cnp_030',{name:'弹力',grade:8,semester:'下'}]]),
  CN:['','一','二','三','四','五','六','七','八','九'],EN_BOOK:{},selectedVolumes:['八下'],
  selected:'cnp_029', explicitNodeSelection:null, currentAlias:null, volume:'八下', subject:'physics', stage:'', domain:'', query:'', showWholeBook:true, upDepth:2,
  ancestorsOpen:false, nodeDialogId:null, nodeDialogScroll:null, cy:null, mobileScroll:{detail:0}, graphNeedsRender:false,
  $: id => ids[id],
  progressOf: () => null,
  document: {querySelector: s=>s==='.site-header'?header:explore, querySelectorAll:()=>[]},
  window: {scrollX:0,scrollY:23,matchMedia:()=>({matches:mobile}),scrollTo(x,y){this.scrollX=x;this.scrollY=y;}},
  requestAnimationFrame: fn=>fn(),
  resolveId: id=>ctx.byId.has(id)?{id,alias:null}:null,
  volumeOf:()=> '八下', highlight() {}, renderDetail() {}, writeHash() {}, closeDrawerIfMobile() {}, rememberLocation() {},
  rememberViewport() {}, syncMobileTopic() {}, syncMobilePanels() {}, resizeGraphViewport() {},
  rebuilds:0
};
ctx.renderGraph = () => {ctx.rebuilds++;ctx.explicitNodeSelection=null;};
vm.createContext(ctx);
vm.runInContext(section('function booksForSubject()', 'function currentChild()')+section('function graphReturnTo()', 'function syncBook()')+
  section('function syncMobileChrome()', 'function recomputeAliasHits()')+
  section('function select(raw, source)', 'function zoomBy('),ctx);
ctx.bindNodeConfirmation();
const dialog=ids['node-diagnose-dialog'], yes=ids['node-dialog-try'];

// 自动预选不算真实点击；同一点第一次点击不重绘，第二次才询问。
assert.equal(ctx.activateGraphNode('cnp_029'),false);
assert.equal(dialog.open,false);
assert.equal(ctx.rebuilds,0);
assert.equal(ctx.activateGraphNode('cnp_029'),true);
assert.equal(dialog.open,true);
assert.equal(dialog.opens,1);
assert.equal(ctx.rebuilds,0);
assert.ok(ids['node-dialog-question'].textContent.includes('力'));
let link = new URL(yes.getAttribute('href'),ctx.location.origin);
assert.equal(link.searchParams.get('target'),'cnp_029');
assert.equal(link.searchParams.get('retry'),'1');
assert.equal(new URL(link.searchParams.get('returnTo'),ctx.location.origin).hash,'#cnp_029');
ctx.activateGraphNode('cnp_029');
assert.equal(dialog.opens,1,'同一个已打开弹窗不再次showModal');

// “不”只关闭，保留当前点、滚动和已经真实点选的armed状态。
ids['node-dialog-no'].fire('click');
assert.equal(dialog.open,false);
assert.equal(ctx.selected,'cnp_029');
assert.equal(ctx.explicitNodeSelection,'cnp_029');
assert.deepEqual(ids.cy.focused,{preventScroll:true});
assert.equal(ctx.window.scrollY,23);
ctx.activateGraphNode('cnp_029');
assert.equal(dialog.opens,2);
let cancelled=false;
dialog.fire('cancel',{preventDefault(){cancelled=true;}});
assert.equal(cancelled,true);
assert.equal(dialog.open,false);

// 浏览器延迟派发上次的close时，新弹窗已经打开，不能清空新一轮检测目标。
ctx.activateGraphNode('cnp_029');
dialog.fire('close');
assert.equal(dialog.open,true);
assert.equal(ctx.nodeDialogId,'cnp_029');
let staleClosePrevented=false;
yes.fire('click',{preventDefault(){staleClosePrevented=true;}});
assert.equal(staleClosePrevented,false,'快速关闭、重开仍可进入当前知识点检测');
assert.equal(dialog.open,false);

// 不同点第一次只选择、重绘一次；第二次询问新点，不沿用旧点URL。
ctx.activateGraphNode('cnp_030');
assert.equal(ctx.selected,'cnp_030');
assert.equal(ctx.rebuilds,1);
assert.equal(dialog.open,false);
assert.equal(ctx.explicitNodeSelection,'cnp_030');
ctx.activateGraphNode('cnp_030');
assert.equal(dialog.open,true);
link = new URL(yes.getAttribute('href'),ctx.location.origin);
assert.equal(link.searchParams.get('target'),'cnp_030');
assert.equal(new URL(link.searchParams.get('returnTo'),ctx.location.origin).hash,'#cnp_030');
dialog.fire('click',{clientX:150,clientY:150});
assert.equal(dialog.open,true,'点弹窗自身内部空白不关闭');
dialog.fire('click',{clientX:0,clientY:0});
assert.equal(dialog.open,false,'点弹窗外侧关闭');

// 列表/自动选择清除armed；grade折叠节点不参与检测。
ctx.select('cnp_029','user');
assert.equal(ctx.explicitNodeSelection,null);
assert.equal(ctx.activateGraphNode('grade-8'),false);
assert.equal(ctx.activateGraphNode('unknown'),false);
ctx.activateGraphNode('cnp_029');
assert.equal(dialog.open,false);
ctx.activateGraphNode('cnp_029');
assert.equal(dialog.open,true);
ctx.selected='cnp_030'; // 即使弹窗期间外部状态发生异常变化，也不能跳去旧点。
let prevented=false;
yes.fire('click',{preventDefault(){prevented=true;}});
assert.equal(prevented,true);
assert.equal(dialog.open,false);
assert.equal(ids['node-dialog-no'].listenerCount('click'),1);

// 普通通过的初中物理点仍须先选中，再确认专家挑战；保留原图谱返回位置。
ctx.selected = 'cnp_029'; ctx.explicitNodeSelection = null;
ctx.progressOf = id => id === 'cnp_029' ? {status:'mastered'} : null;
assert.equal(ctx.activateGraphNode('cnp_029'), false);
assert.equal(dialog.open, false);
assert.equal(ctx.activateGraphNode('cnp_029'), true);
assert.equal(ids['node-dialog-title'].textContent, '是否挑战专家水平');
assert.equal(yes.textContent, '我要挑战');
link = new URL(yes.getAttribute('href'), ctx.location.origin);
assert.equal(link.searchParams.get('level'), 'pro');
assert.equal(new URL(link.searchParams.get('returnTo'), ctx.location.origin).hash, '#cnp_029');
ids['node-dialog-no'].fire('click');
ctx.progressOf = () => ({status:'weak'});
ctx.activateGraphNode('cnp_029');
assert.equal(ids['node-dialog-title'].textContent, '检测这个知识点');
assert.equal(yes.textContent, '我要试试');
assert.equal(new URL(yes.getAttribute('href'),ctx.location.origin).searchParams.has('level'),false);
ids['node-dialog-no'].fire('click');
ctx.progressOf = () => ({status:'mastered'});
ctx.byId.set('cnp_h001',{name:'高中点',grade:10});
assert.equal(ctx.canChallengeExpert('cnp_h001'),false,'高中不进入初中 Pro 题库');
ctx.subject = 'science';
assert.equal(ctx.canChallengeExpert('cnp_029'),false,'科学不进入初中 Pro 题库');
ctx.subject = 'physics';

// 移动默认收起菜单和选项，桌面自动显示，不依赖CSS暴露已隐藏的内容。
ctx.syncMobileChrome();
assert.equal(ids['main-nav'].hidden,true);
assert.equal(ids['graph-options'].hidden,true);
ctx.setMobileMenu(true);
assert.equal(ids['main-nav'].hidden,false);
assert.equal(ids['mobile-menu-toggle'].getAttribute('aria-expanded'),'true');
ctx.setMobileOptions(true);
assert.equal(ids['graph-options'].hidden,false);
ctx.setMobileMenu(false);ctx.setMobileOptions(false);mobile=false;ctx.syncMobileChrome();
assert.equal(ids['main-nav'].hidden,false);
assert.equal(ids['graph-options'].hidden,false);
console.log('test_graph_node_confirmation: deliberate node clicks, safe retry link, dismiss/focus and mobile disclosures passed');
