#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'explore/app.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
const standards = JSON.parse(fs.readFileSync(path.join(root, 'data/cn-curriculum-standards.json'), 'utf8'));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {}; this.open = false; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = nodes; }
}
function descendants(node, predicate) {
  return node.children.flatMap(child => child.nodeType === 1 ? [...(predicate(child) ? [child] : []), ...descendants(child, predicate)] : []);
}
function tag(node, name) { return descendants(node, child => child.tagName === name.toUpperCase()); }
function klass(node, name) { return descendants(node, child => (child.className || '').split(' ').includes(name)); }
function load(topic, state) {
  const detail = new Element('aside');
  const context = {
    selected: topic && topic.id, byId: new Map(topic ? [[topic.id, topic]] : []), subject: topic ? topic.subject : 'physics', currentAlias: null,
    stdById: new Map(standards.items.map(item => [item.id, item])),
    document: { title: '', createElement: name => new Element(name), createTextNode: text => ({nodeType:3,textContent:String(text)}) },
    $: () => detail, stageKind: () => 'junior', stageLabel: () => '初中', gradeLabel: () => '九年级全一册',
    progressOf: () => state || null,
    progressMark: row => !row ? '' : row.expert ? '⭐' : row.status === 'mastered' ? '✓' : '×',
    canChallengeExpert: () => !!(topic && topic.subject === 'physics' && topic.grade >= 8 && topic.grade <= 9 && state && state.status === 'mastered'), progressClass: row => row ? row.status === 'mastered' ? 'test-passed' : 'test-failed' : '',
    progressLabel: row => row ? row.status === 'mastered' ? '已通过检测' : '未通过检测，建议巩固后再测' : '尚未完成检测',
    withReturn: href => href + '&returnTo=%2Fexplore%2F%3Fsubject%3Dphysics%26volume%3D%E4%B9%9D%E5%85%A8%23cnp_053',
    refreshDiagnosisLinks() {}
  };
  vm.runInNewContext(section('function el(tag, attrs)', 'function stageKind(grade)') + section('function metaItem(label, value, wide)', 'function upstream(id, depth)'), context);
  context.renderDetail();
  return {context, detail};
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
const topic = topics.find(item => item.id === 'cnp_053');
assert.ok(topic && topic.description && topic.mastery_criteria.length && topic.standards.length);
test('右侧元数据仅保留年级册次和章节，检测入口与返回上下文仍在', () => {
  const {detail} = load(topic);
  assert.deepEqual(tag(detail, 'dt').map(node => node.textContent), ['年级册次', '章节']);
  assert.deepEqual(tag(detail, 'dd').map(node => node.textContent), ['九年级全一册', topic.chapter]);
  const button = klass(detail, 'diag-btn')[0];
  assert.equal(button.getAttribute('data-diagnose-return'), '../diagnose/?subject=physics&target=cnp_053&retry=1');
  const link = new URL(button.getAttribute('href'), 'https://physicalmap.pages.dev/explore/');
  assert.equal(link.searchParams.get('target'), topic.id);
  assert.equal(link.searchParams.get('retry'), '1', '已完成后点击重新检测直接开始新题，进行中仍可续答');
  assert.equal(new URL(link.searchParams.get('returnTo'), link.origin).hash, '#' + topic.id);
});
test('章节之后依次展示学习目标、掌握标准和折叠课标，目标与标准原文完整保留', () => {
  const {detail} = load(topic);
  assert.deepEqual(tag(detail, 'h2').map(node => node.textContent), ['学习目标', '掌握标准']);
  const groups = detail.children.filter(node => ['DL', 'SECTION', 'DETAILS'].includes(node.tagName));
  assert.deepEqual(groups.map(node => node.tagName === 'DL' ? '元数据' : node.tagName === 'DETAILS' ? tag(node, 'summary')[0].textContent : tag(node, 'h2')[0].textContent), ['元数据', '学习目标', '掌握标准', '课标条目']);
  assert.equal(klass(detail, 'desc')[0].textContent, topic.description);
  assert.deepEqual(tag(klass(detail, 'mastery-criteria')[0], 'li').map(node => node.textContent), topic.mastery_criteria);
});
test('课标正文默认收起，编号、内容与说明仍完整包含在原生details内', () => {
  const {detail} = load({...topic, standards:[{...topic.standards[0], note:'保留课标说明'}]});
  const disclosure = klass(detail, 'standards-disclosure')[0];
  assert.equal(disclosure.tagName, 'DETAILS');
  assert.equal(disclosure.open, false);
  assert.equal(disclosure.getAttribute('open'), undefined);
  assert.equal(disclosure.children[0].tagName, 'SUMMARY');
  assert.equal(disclosure.children[0].textContent, '课标条目');
  const entry = standards.items.find(item => item.id === topic.standards[0].id);
  assert.ok(disclosure.textContent.includes(entry.text));
  assert.ok(disclosure.textContent.includes(entry.id));
  assert.ok(disclosure.textContent.includes('保留课标说明'));
});
test('删除样题、答案和前后依赖详情，不从这些数据生成额外面板', () => {
  const {detail} = load(topic);
  assert.equal(klass(detail, 'sample-q').length, 0);
  assert.equal(klass(detail, 'rel-row').length, 0);
  assert.equal(klass(detail, 'ans').length, 0);
  assert.ok(!detail.textContent.includes(topic.diagnostic_question.question));
  assert.ok(!tag(detail, 'h2').some(node => ['样题', '先修', '被哪些知识点依赖'].includes(node.textContent)));
});
test('检测通过和未通过状态继续显示，仍可重新检测', () => {
  for (const status of ['mastered', 'weak', 'shaky']) {
    const {detail} = load(topic, {status});
    const state = klass(detail, 'detail-test-state')[0];
    assert.ok(state.textContent.startsWith(status === 'mastered' ? '✓ ' : '× '));
    assert.equal(klass(detail, 'diag-btn')[0].textContent, status === 'mastered' ? '挑战专家水平' : '重新检测这个知识点');
    assert.equal(new URL(klass(detail, 'diag-btn')[0].getAttribute('href'), 'https://physicalmap.pages.dev').searchParams.get('level'), status === 'mastered' ? 'pro' : null);
  }
});
test('切换知识点后课标重新收起，空课标和起点说明均有正常呈现', () => {
  const {context, detail} = load(topic);
  klass(detail, 'standards-disclosure')[0].open = true;
  context.byId.set(topic.id, {...topic, root_reason:'这是起点说明', standards:[]});
  context.renderDetail();
  const disclosure = klass(detail, 'standards-disclosure')[0];
  assert.equal(disclosure.open, false);
  assert.ok(disclosure.textContent.includes('没有对应的课标条目'));
  assert.ok(klass(detail, 'learning-goals')[0].textContent.includes('这是起点说明'));
});
test('未选择知识点时保留选择提示，不渲染虚假的目标或课标', () => {
  const {detail} = load(null);
  assert.equal(tag(detail, 'h1')[0].textContent, '选择一个知识点');
  assert.equal(klass(detail, 'learning-goals').length, 0);
  assert.equal(klass(detail, 'standards-disclosure').length, 0);
});
console.log('test_explore_detail: ' + passed + ' passed');
