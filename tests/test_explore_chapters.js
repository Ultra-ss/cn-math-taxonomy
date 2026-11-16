#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'explore/app.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function element(tag, attrs, ...children) {
  return {
    tag, attrs: attrs || {}, children: children.flat(Infinity).filter(x => x != null),
    open: false,
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    get textContent() { return (this.attrs.text || '') + this.children.map(x => typeof x === 'string' ? x : x.textContent).join(''); },
    set textContent(value) { this.attrs.text = value; this.children = []; }
  };
}
function find(node, predicate) {
  if (!node || typeof node === 'string') return [];
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => find(child, predicate))];
}
const list = element('div'), count = element('p');
let states = {};
const context = {
  topics: topics.filter(t => t.subject === 'physics'),
  subject: 'physics', volume: '九全', stage: '', grade: '', domain: '', query: '', selected: 'cnp_053', aliasHitIds: new Set(),
  el: element, $: id => id === 'list' ? list : count,
  progressOf: id => states[id] || null,
  progressLabel: row => row ? row.status : '尚未完成检测', progressBadge: () => null,
  gradeLabel: topic => topic.grade + '年级' + topic.semester,
  volumeOf: topic => topic.grade === 9 ? '九全' : topic.grade + topic.semester,
  recomputeAliasHits() {}, refreshDiagnosisLinks() {}
};
vm.createContext(context);
vm.runInContext(section('function chapterOf(topic)', 'function readHash()') +
  section('function passFilter(topic)', 'function sideVisible()'), context);
const first = topics.find(t => t.id === 'cnp_053');
const chapter = context.chapterOf(first);
assert.equal(chapter, '第十三章 内能');
function counter() {
  context.renderList();
  const entry = find(list, node => node.attrs.class === 'chap').find(node =>
    find(node, child => child.attrs.class === 'chapter-name')[0].textContent === chapter);
  assert.ok(entry, chapter);
  return find(entry, node => (node.attrs.class || '').split(' ').includes('chapter-progress'))[0];
}
assert.equal(counter().textContent, '0/3', '未诊断章从0开始，使用真实九全三个知识点');
states = { cnp_053: {status:'mastered'} };
assert.equal(counter().textContent, '1/3');
states.cnp_054 = {status:'weak'};
states.cnp_055 = {status:'shaky'};
assert.equal(counter().textContent, '3/3', '通过、薄弱、不稳均属于已完成诊断');
assert.ok(counter().attrs.class.includes('is-complete'));
assert.equal(counter().attrs['aria-label'], '已完成诊断 3 个，共 3 个知识点');
context.query = 'cnp_053';
assert.equal(counter().textContent, '3/3', '搜索只剩一个可见知识点时，仍按整章统计');
assert.equal(find(list, node => (node.attrs.class || '').split(' ').includes('topic-item')).length, 1);
context.query = ''; context.domain = first.domain;
assert.equal(counter().textContent, '3/3', '领域筛选不改变章节分母');
states = {cnp_053:{status:'probing'},cnp_054:{status:'unknown'}};
assert.equal(counter().textContent, '0/3', '进行中且未形成有效结论的状态不计完成');
states = {};
assert.equal(counter().textContent, '0/3', '刷新使用当前人的状态，不保留其他人的计数');
context.topics = [
  {...first, id:'a', grade:8, semester:'上'},
  {...first, id:'b', grade:8, semester:'下'},
  {...first, id:'c', grade:9, semester:'全'}
];
assert.equal(context.chapterProgress().size, 3, '同名章节按年级和册次分别统计');
context.topics = topics.filter(t => t.subject === 'science');
const science = context.chapterProgress();
assert.equal(Array.from(science.values()).reduce((sum, row) => sum + row.total, 0), 269);
assert.ok(Array.from(science.values()).every(row => row.completed === 0));
assert.ok(!source.includes("fetch('../data/questions.json')"), '删除样题后，图谱不再加载完整题库');
console.log('test_explore_chapters: real chapter totals, completed states, unfiltered denominator and independent books passed');
