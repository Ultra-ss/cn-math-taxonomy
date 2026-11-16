#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'explore/app.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json')));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
function subject(search, hash = '') {
  const ctx = { URLSearchParams, location: { search, pathname: '/explore/' }, history: { replaceState() {} }, readHash: () => hash };
  vm.runInNewContext(section('function readSubject()', 'function configureSubject()') + ';this.value=readSubject();', ctx);
  return ctx.value;
}
assert.equal(subject(''), 'physics');
assert.equal(subject('?subject=invalid'), 'physics');
assert.equal(subject('?subject=science'), 'science');
assert.equal(subject('', 'cns_p001'), 'science');
assert.equal(subject('', 'cnp_001'), 'physics');

const context = {
  CN: ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
  EN_BOOK: {10:['必修一'],11:['必修二'],12:['必修三'],13:['选必一'],14:['选必二'],15:['选必三']},
  subject: 'physics', volume: '八上', stage: '', grade: '', domain: '', query: '', aliasHitIds: new Set()
};
vm.createContext(context);
vm.runInContext(section('function booksForSubject()', 'function currentChild()') + section('function passFilter(topic)', 'function renderList()'), context);
assert.equal(context.booksForSubject().length, 9);
assert.deepEqual(Array.from(context.booksForSubject().slice(0, 3), x => x[0]), ['八上', '八下', '九全']);
const physics = topics.filter(t => t.subject === 'physics');
for (const [book, count, first] of [['八上',28,'cnp_001'], ['八下',24,'cnp_029'], ['九全',40,'cnp_053'], ['必修一',27,'cnp_h001']]) {
  context.volume = book;
  const list = physics.filter(t => context.passFilter(t));
  assert.equal(list.length, count, book);
  assert.equal(list[0].id, first, book + ' 应从教材第一个知识点进入');
  assert.ok(list.every(t => context.volumeOf(t) === book));
}
context.subject = 'science';
assert.equal(context.booksForSubject().length, 12);
context.volume = '一上';
assert.equal(topics.filter(t => t.subject === 'science' && context.passFilter(t)).length, 15);

// 角标独立于名称、标签；传给 Cytoscape 的状态类不改变知识点内容。
const marker = {
  byId: new Map([[physics[0].id, physics[0]]]), selected: physics[0].id,
  progressOf: () => ({status:'mastered'}), progressClass: () => 'test-passed',
  progressLabel: () => '已通过检测', clipLabel: x => x, paint: () => ({bg:'white',border:'black',cls:'junior'})
};
vm.runInNewContext(section('function topicElement(id, colors)', 'function edgeElement(') + ';this.result=topicElement("cnp_001",{currentBg:"orange",currentBorder:"red",text:"black"});', marker);
assert.equal(marker.result.data.name, physics[0].name);
assert.equal(marker.result.data.label, physics[0].name);
assert.equal(marker.result.data.testStatus, 'mastered');
assert.ok(marker.result.classes.includes('test-passed'));
assert.ok(source.includes("'background-position-x': '100%'"));
assert.ok(source.includes("'background-position-y': '0%'"));
console.log('test_explore_books: subject, textbook filters, first topics and independent corner status passed');
