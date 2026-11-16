#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../diagnose/engine.js');
const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'diagnose/app.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/topics.json')));
const dependencies = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dependencies.json')));
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json')));
const byId = Object.fromEntries(topics.map(t => [t.id, t]));
const graph = E.buildGraph(topics, dependencies, questions);
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log('ok - ' + name);
}
function productionFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name + ' must exist');
  const rest = source.slice(start + 2);
  const end = /\n  \}/.exec(rest);
  assert.ok(end, name + ' must have a closing brace');
  return rest.slice(0, end.index + 4);
}
function context(pathname = '/diagnose/') {
  const state = {
    URL, URLSearchParams, E, subject: 'physics',
    location: { pathname, origin: 'https://physicalmap.pages.dev', href: 'https://physicalmap.pages.dev' + pathname },
    session: { targets: ['cnp_071'], volume: null }, sessionMeta: {},
    D: { graph: { byId } }
  };
  vm.createContext(state);
  vm.runInContext(productionFunction('explorePath') + '\n' + productionFunction('safeReturnTo') + '\n' + productionFunction('returnPath'), state);
  return state;
}

test('同源图谱返回路径保留原册、原节点及已编码查询参数', () => {
  const state = context();
  const input = '/explore/?subject=physics&volume=%E5%85%AB%E4%B8%8A#cnp_001';
  const returned = new URL(state.safeReturnTo(input), state.location.origin);
  assert.strictEqual(returned.origin, state.location.origin);
  assert.strictEqual(returned.pathname, '/explore/');
  assert.strictEqual(returned.searchParams.get('subject'), 'physics');
  assert.strictEqual(returned.searchParams.get('volume'), '八上');
  assert.strictEqual(returned.hash, '#cnp_001');
  // 查询字符串中的网址只是数据，不应被当成外站导航。
  assert.ok(state.safeReturnTo('/explore/?q=https%3A%2F%2Fexample.org%2F#cnp_001'));
  assert.strictEqual(state.safeReturnTo('/explore/index.html?subject=physics#cnp_001'), '/explore/index.html?subject=physics#cnp_001');
});

test('外站、协议相对路径、脚本、反斜杠、控制字符和非图谱路径被拒绝', () => {
  const state = context();
  for (const input of [
    'https://example.org/explore/', 'https://physicalmap.pages.dev/explore/',
    '//example.org/explore/', '///example.org/explore/', 'javascript:alert(1)',
    '/\\example.org/explore/', '\\explore\\', '/explore/\n', '/explore/\r', '/explore/\t',
    '/diagnose/', '/children/', '/explore-other/', '/explore/../../children/',
    '/explore/%2e%2e/children/', '/explore/nested/', '', null, {}, 1
  ]) assert.strictEqual(state.safeReturnTo(input), '', JSON.stringify(input));
});

test('子目录部署只返回同一站点前缀下的图谱', () => {
  const state = context('/school/diagnose/');
  assert.strictEqual(state.safeReturnTo('/school/explore/?subject=physics#cnp_001'), '/school/explore/?subject=physics#cnp_001');
  assert.strictEqual(state.safeReturnTo('/explore/?subject=physics#cnp_001'), '');
  assert.strictEqual(state.safeReturnTo('/other/explore/'), '');
});

test('已保存的合法返回上下文优先，失效上下文回退到原目标所属教材', () => {
  const state = context();
  state.sessionMeta.returnTo = '/explore/?subject=physics&volume=%E5%85%AB%E4%B8%8B#cnp_030';
  assert.strictEqual(state.returnPath(), state.sessionMeta.returnTo);
  state.sessionMeta.returnTo = 'https://example.org/explore/';
  const fallback = new URL(state.returnPath(), state.location.origin);
  assert.strictEqual(fallback.pathname, '/explore/');
  assert.strictEqual(fallback.searchParams.get('subject'), 'physics');
  assert.strictEqual(fallback.searchParams.get('volume'), '九全');
  assert.strictEqual(fallback.hash, '#cnp_071');
});

test('直接访问、教材检测和科学检测都有准确的默认返回册次', () => {
  const state = context();
  for (const spec of [
    { subject: 'physics', id: 'cnp_001', volume: '八上' },
    { subject: 'physics', id: 'cnp_029', volume: '八下', savedVolume: '八下' },
    { subject: 'physics', id: 'cnp_h001', volume: '必修一' },
    { subject: 'science', id: 'cns_p001', volume: '一上' }
  ]) {
    state.subject = spec.subject;
    state.session = { targets: [spec.id], volume: spec.savedVolume || null };
    const returned = new URL(state.returnPath(), state.location.origin);
    assert.strictEqual(returned.searchParams.get('subject'), spec.subject);
    assert.strictEqual(returned.searchParams.get('volume'), spec.volume);
    assert.strictEqual(returned.hash, '#' + spec.id);
  }
});

test('子目录、多目标和旧存档回退仍定位最初目标，而非后续知识点', () => {
  const state = context('/school/diagnose/');
  state.session.targets = ['cnp_071', 'cnp_072'];
  state.session.stack = ['cnp_073'];
  const returned = new URL(state.returnPath(), state.location.origin);
  assert.strictEqual(returned.pathname, '/school/explore/');
  assert.strictEqual(returned.hash, '#cnp_071');
});

function conclusion(session, label) {
  const state = { E, subject:'physics', session, sessionMeta: { label }, D: { graph } };
  vm.createContext(state);
  vm.runInContext(productionFunction('buildTree') + '\n' + productionFunction('nameOf') + '\n' +
    productionFunction('textbookScopeLabel') + '\n' + productionFunction('compactConclusion'), state);
  state.D.tree = state.buildTree(topics);
  return state.compactConclusion(E.summarize(graph, session));
}
function applySequence(session, results) {
  for (const result of results) {
    const item = E.nextItem(graph, session);
    assert.ok(item, 'engine must have a real question for this answer');
    session = E.applyAnswer(graph, session, item.topicId, result);
  }
  return session;
}

test('单点实际答对显示通过，薄弱和不稳均显示未通过', () => {
  for (const [results, status, label, tone] of [
    [['correct', 'correct'], 'mastered', '✓ 通过', 'passed'],
    [['wrong', 'wrong'], 'weak', '× 未通过', 'failed'],
    [['wrong', 'correct'], 'shaky', '× 未通过', 'failed']
  ]) {
    const session = applySequence(E.createSession(graph, ['cnp_071'], { confirm: 2 }), results);
    assert.strictEqual(E.statusOf(session, 'cnp_071'), status);
    const card = conclusion(session, '欧姆定律');
    assert.strictEqual(card.title, '欧姆定律');
    assert.strictEqual(card.label, label);
    assert.strictEqual(card.tone, tone);
    assert.ok(card.note.length > 0);
  }
});

test('单点尚未满足确认题数时显示尚未完成，避免冒充通过', () => {
  const session = applySequence(E.createSession(graph, ['cnp_071'], { confirm: 3, limit: 1 }), ['correct']);
  assert.strictEqual(E.statusOf(session, 'cnp_071'), 'unknown');
  const card = conclusion(session, '欧姆定律');
  assert.strictEqual(card.label, '尚未完成');
  assert.strictEqual(card.tone, 'pending');
});

test('多点推断掌握不能冒充实际检测通过', () => {
  const session = applySequence(E.createSession(graph, ['cnp_070', 'cnp_071'], { confirm: 2 }), ['correct', 'correct']);
  assert.strictEqual(session.status.cnp_071.src, 'direct');
  assert.strictEqual(session.status.cnp_070.src, 'inferred');
  const card = conclusion(session, '欧姆定律两点');
  assert.strictEqual(card.title, '欧姆定律两点');
  assert.strictEqual(card.label, '✓ 1 个通过 · × 0 个未通过');
  assert.strictEqual(card.tone, 'pending');
  assert.ok(card.note.includes('1'));
});

test('教材多点汇总按直接判定计数，薄弱与不稳都计入未通过', () => {
  const session = applySequence(E.createSession(graph, ['cnp_070', 'cnp_071'], { mode: 'textbook', confirm: 2 }),
    ['wrong', 'wrong', 'wrong', 'correct']);
  assert.strictEqual(E.statusOf(session, 'cnp_070'), 'weak');
  assert.strictEqual(E.statusOf(session, 'cnp_071'), 'shaky');
  const card = conclusion(session, '第十七章');
  assert.strictEqual(card.title, '第十七章');
  assert.strictEqual(card.label, '× 所选范围挑战未通过');
  assert.strictEqual(card.tone, 'failed');
  assert.ok(card.note.includes('已通过 0 / 2'));
});

test('整单元全部直接通过才显示单元挑战通过，失败和未测不能冒充通关', () => {
  const ids = ['cnp_053','cnp_054','cnp_055'];
  const start = opts => E.createSession(graph, ids, {mode:'textbook',volume:'九全',confirm:2,...opts});
  const good = applySequence(start(), Array(6).fill('correct'));
  const success = conclusion(good, '第十三章 内能');
  assert.strictEqual(success.label, '✓ 单元挑战通过');
  assert.strictEqual(success.tone, 'passed');
  assert.ok(success.note.includes('3 个知识点均已通过'));
  const bad = applySequence(start(), ['wrong','wrong','correct','correct','correct','correct']);
  const failed = conclusion(bad, '第十三章 内能');
  assert.strictEqual(failed.label, '× 单元挑战未通过');
  assert.strictEqual(failed.tone, 'failed');
  assert.ok(failed.note.includes('已通过 2 / 3'));
  const partial = applySequence(start({limit:2}), ['correct','correct']);
  const pending = conclusion(partial, '第十三章 内能');
  assert.strictEqual(pending.label, '单元挑战待完成');
  assert.strictEqual(pending.tone, 'pending');
  assert.ok(pending.note.includes('已通过 1 / 3'));
});

test('整册未测完显示待完成，全部逐点通过才显示整册挑战通过', () => {
  const ids = E.gradeTargets(graph, '九全', 'physics').ids;
  const partial = applySequence(E.createSession(graph,ids,{mode:'textbook',volume:'九全',confirm:2,limit:2}), ['correct','correct']);
  assert.strictEqual(conclusion(partial,'九全').label,'整册挑战待完成');
  const complete = applySequence(E.createSession(graph,ids,{mode:'textbook',volume:'九全',confirm:2,limit:ids.length*2}), Array(ids.length*2).fill('correct'));
  assert.strictEqual(conclusion(complete,'九全').label,'✓ 整册挑战通过');
});

test('从结果继续真实答题后，下一次结果默认恢复三个折叠面板', () => {
  const stopped = new Error('stop before DOM rendering');
  const state = {
    resultPanelState: { analysis: true, log: true, more: true },
    D: { graph: { byId } }, session: { answers: [] }, ui: { key: null },
    h() { throw stopped; }
  };
  vm.createContext(state);
  vm.runInContext(productionFunction('renderQuestion'), state);
  assert.throws(() => state.renderQuestion({ topicId: 'cnp_071', attempt: 1, question: {} }), error => error === stopped);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state.resultPanelState)), { analysis: false, log: false, more: false });
});

console.log('test_compact_result: ' + passed + ' passed');
