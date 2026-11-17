#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const BookSelection = require('../assets/book-selection.js');
const source = fs.readFileSync(path.join(root, 'explore/app.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json')));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
function subject(search, hash = '', rememberedSubject) {
  const memory=require('../assets/last-location.js');
  const ctx = { URLSearchParams, location: { search, hash:hash?'#'+hash:'', pathname: '/explore/' }, history: { replaceState() {} }, readHash: () => hash,
    window:rememberedSubject?{CnmLastLocation:{shouldResume:memory.shouldResume,currentSubject:()=>rememberedSubject}}:{}};
  vm.runInNewContext(section('function readSubject()', 'function configureSubject()') + ';this.value=readSubject();', ctx);
  return ctx.value;
}
assert.equal(subject(''), 'physics');
assert.equal(subject('?subject=invalid'), 'physics');
assert.equal(subject('?subject=science'), 'science');
assert.equal(subject('', 'cns_p001'), 'science');
assert.equal(subject('', 'cnp_001'), 'physics');
assert.equal(subject('', '', 'science'), 'science', '裸图谱继承当前标签页学科');
assert.equal(subject('?subject=physics', '', 'science'), 'physics', '显式学科覆盖标签页偏好');
assert.equal(subject('?volume=八下', '', 'science'), 'physics', '显式旧物理教材链接保持原含义');
assert.equal(subject('', 'cnp_001', 'science'), 'physics', '物理分享知识点不被科学偏好覆盖');

const context = {
  CN: ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
  EN_BOOK: {10:['必修一'],11:['必修二'],12:['必修三'],13:['选必一'],14:['选必二'],15:['选必三']},
  window:{CnmBookSelection:BookSelection}, selectedVolumes:['八上'],
  subject: 'physics', volume: '八上', stage: '', grade: '', domain: '', query: '', aliasHitIds: new Set()
};
vm.createContext(context);
vm.runInContext(section('function booksForSubject()', 'function currentChild()') + section('function passFilter(topic)', 'function renderList()'), context);
assert.equal(context.booksForSubject().length, 9);
assert.deepEqual(Array.from(context.booksForSubject().slice(0, 3), x => x[0]), ['八上', '八下', '九全']);
const physics = topics.filter(t => t.subject === 'physics');
for (const [book, count, first] of [['八上',28,'cnp_001'], ['八下',24,'cnp_029'], ['九全',40,'cnp_053'], ['必修一',27,'cnp_h001']]) {
  context.setBookScope([book]);
  const list = physics.filter(t => context.passFilter(t));
  assert.equal(list.length, count, book);
  assert.equal(list[0].id, first, book + ' 应从教材第一个知识点进入');
  assert.ok(list.every(t => context.volumeOf(t) === book));
}
context.subject = 'science';
assert.equal(context.booksForSubject().length, 12);
context.setBookScope(['一上']);
assert.equal(topics.filter(t => t.subject === 'science' && context.passFilter(t)).length, 15);

// 角标独立于名称、标签；传给 Cytoscape 的状态类不改变知识点内容。
const marker = {
  subject: 'physics', byId: new Map([[physics[0].id, physics[0]]]), selected: physics[0].id,
  progressOf: () => ({status:'mastered'}), progressClass: () => 'test-passed',
  progressLabel: () => '已通过检测', clipLabel: x => x, paint: () => ({bg:'white',border:'black',cls:'junior'})
};
vm.runInNewContext(section('function canChallengeExpert(id)', 'function nodeDiagnosisHref(id)') + section('function topicElement(id, colors)', 'function edgeElement(') + ';this.result=topicElement("cnp_001",{currentBg:"orange",currentBorder:"red",text:"black"});', marker);
assert.equal(marker.result.data.name, physics[0].name);
assert.equal(marker.result.data.label, physics[0].name);
assert.equal(marker.result.data.testStatus, 'mastered');
assert.ok(marker.result.classes.includes('test-passed'));
assert.ok(marker.result.classes.includes('expert-unlocked'));
assert.ok(source.includes("'background-position-x': '100%'"));
assert.ok(source.includes("'background-position-y': '0%'"));

// 从当前界面生成可恢复的同源返回目标，包含没有写进地址栏的筛选和视图状态。
const returnContext = {
  URL, URLSearchParams,
  CN:context.CN,EN_BOOK:context.EN_BOOK,window:{CnmBookSelection:BookSelection},selectedVolumes:['八下'],
  location: {
    origin: 'https://physicalmap.pages.dev',
    href: 'https://physicalmap.pages.dev/explore/?grade=8&returnTo=https%3A%2F%2Fevil.example%2F',
    pathname: '/explore/', search: '?grade=8&returnTo=https%3A%2F%2Fevil.example%2F'
  },
  subject: 'physics', volume: '八下', stage: 'j', domain: '运动和相互作用', query: '力',
  showWholeBook: false, upDepth: 3, selected: 'cnp_029'
};
vm.createContext(returnContext);
vm.runInContext(section('function booksForSubject()', 'function currentChild()')+section('function graphReturnTo()', 'function syncBook()'), returnContext);
const base = 'https://physicalmap.pages.dev';
let bookLink = new URL(returnContext.bookHref(), base);
assert.equal(bookLink.pathname, '/diagnose/');
assert.equal(bookLink.searchParams.get('volume'), '八下');
assert.equal(bookLink.searchParams.get('order'), 'book');
let back = new URL(bookLink.searchParams.get('returnTo'), base);
assert.equal(back.origin, base);
assert.equal(back.pathname, '/explore/');
assert.equal(back.searchParams.get('subject'), 'physics');
assert.equal(back.searchParams.get('volume'), '八下');
assert.equal(back.searchParams.get('stage'), 'j');
assert.equal(back.searchParams.get('domain'), '运动和相互作用');
assert.equal(back.searchParams.get('q'), '力');
assert.equal(back.searchParams.get('view'), 'local');
assert.equal(back.searchParams.get('depth'), '3');
assert.equal(back.hash, '#cnp_029');
assert.ok(!back.searchParams.has('returnTo'), '不把其他地址传来的 returnTo 当作目的地');
assert.ok(!back.searchParams.has('grade'), '已选册次优先于旧的整年级参数');
let pointLink = new URL(returnContext.withReturn('../diagnose/?subject=physics&target=cnp_029'), base);
assert.equal(pointLink.searchParams.get('returnTo'), bookLink.searchParams.get('returnTo'));
for (const unsafe of ['https://evil.example/diagnose/', '//evil.example/diagnose/', 'javascript:alert(1)']) {
  const safe = new URL(returnContext.withReturn(unsafe), base);
  assert.equal(safe.origin, base);
  assert.equal(safe.pathname, '/diagnose/');
  assert.equal(new URL(safe.searchParams.get('returnTo'), base).origin, base);
}
returnContext.location.pathname = '//example.invalid/explore/';
assert.equal(new URL(returnContext.graphReturnTo(), base).origin, base, '返回路径不能变为协议相对外站地址');

// 高中、科学与子目录部署都保留当前教材和知识点。
for (const [subjectName, book, id, prefix] of [
  ['physics', '必修二', 'cnp_h028', ''], ['science', '三下', 'cns_p086', '/school']
]) {
  Object.assign(returnContext, {subject: subjectName, volume: book, selected: id, stage:'', domain:'', query:'', showWholeBook:true, upDepth:2});
  returnContext.setBookScope([book]);
  Object.assign(returnContext.location, {pathname: prefix+'/explore/', href: base+prefix+'/explore/', search:''});
  const link = new URL(returnContext.bookHref(), base);
  const target = new URL(link.searchParams.get('returnTo'), base);
  assert.equal(link.pathname, prefix+'/diagnose/');
  assert.equal(target.pathname, prefix+'/explore/');
  assert.equal(target.searchParams.get('subject'), subjectName);
  assert.equal(target.searchParams.get('volume'), book);
  assert.equal(target.hash, '#'+id);
  assert.equal(target.searchParams.get('view'), 'book');
}

// 返回后 applyQuery 使用相同的真实查询解析函数恢复筛选、视图与层数。
const qInput = {value:''};
context.URLSearchParams = URLSearchParams;
context.location = {search: '?subject=science&volume=三下&stage=p&domain=物质科学&q=声音&view=local&depth=all'};
context.$ = () => qInput;
vm.runInContext(section('function applyQuery()', 'function bootSelection()')+';applyQuery();',context);
assert.equal(context.volume,'三下');
assert.equal(context.stage,'p');
assert.equal(context.domain,'物质科学');
assert.equal(context.query,'声音');
assert.equal(qInput.value,'声音');
assert.equal(context.showWholeBook,false);
assert.equal(context.upDepth,'all');
console.log('test_explore_books: textbook filters, corner status and restorable diagnosis return links passed');
