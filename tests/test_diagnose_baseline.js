#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../diagnose/engine.js');
const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'diagnose/app.js'), 'utf8');

assert.deepStrictEqual(E.CONFIRM_CHOICES, [2, 3, 4]);
assert.strictEqual(E.clampConfirm(5), 4, '旧界面设置迁移为四题');
assert.strictEqual(E.clampConfirm('5'), 4, '旧 URL 参数迁移为四题');
assert.strictEqual(E.clampConfirm(4), 4);
assert.strictEqual(E.clampConfirm('invalid'), 3);

// 用当前两科题库真正作答：选择四题后不应三题就掌握，也不应索要不存在的第五题。
const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/topics.json')));
const deps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dependencies.json')));
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json')));
const graph = E.buildGraph(topics, deps, questions);
for (const id of ['cns_p001', 'cnp_071']) {
  assert.strictEqual(graph.bank[id].length, 4);
  let session = E.createSession(graph, [id], { confirm: E.clampConfirm(5), seed: 'four-confirm' });
  const asked = new Set();
  for (let i = 0; i < 4; i++) {
    const item = E.nextItem(graph, session);
    assert.ok(item, '必须出满四题');
    assert.strictEqual(item.topicId, id);
    assert.ok(!asked.has(item.question.id), '不得重复题目凑确认数');
    asked.add(item.question.id);
    session = E.applyAnswer(graph, session, id, 'correct');
    assert.strictEqual(E.statusOf(session, id) === 'mastered', i === 3);
  }
  assert.strictEqual(E.nextItem(graph, session), null);
}

// 隔离执行 app 中的真实设置/恢复函数，检查旧 localStorage 和 URL 覆盖；不复制逻辑。
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
const entries = new Map([['settings', JSON.stringify({ confirm: 5 })]]);
const ctx = {
  E, LS_SETTINGS: 'settings', LIMIT_MIN: 8, LIMIT_MAX: 30, SCREEN_MIN: 20, SCREEN_MAX: 60,
  confirmParam: null,
  localStorage: {
    getItem(k) { return entries.has(k) ? entries.get(k) : null; },
    setItem(k, v) { entries.set(k, v); }
  }
};
vm.createContext(ctx);
vm.runInContext(section('function lsGet(k)', 'function lsDel(k)') + section('function getSettings()', 'function seenList()'), ctx);
assert.strictEqual(ctx.getSettings().confirm, 4);
assert.strictEqual(JSON.parse(entries.get('settings')).confirm, 5, '读取不应写入，演示模式也不改设置');
ctx.confirmParam = E.clampConfirm('5');
assert.strictEqual(ctx.getSettings().confirm, 4);
ctx.setSetting('confirm', 2);
assert.strictEqual(ctx.getSettings().confirm, 2, '界面改动应取代 URL 初始值');
assert.strictEqual(ctx.confirmParam, null);
assert.strictEqual(JSON.parse(entries.get('settings')).confirm, 2);
ctx.D = { graph }; ctx.window = {}; ctx.session = null; ctx.sessionMeta = null;
ctx.syncProgress = function () {};
ctx.URL = URL; ctx.URLSearchParams = URLSearchParams;
ctx.location = { pathname: '/diagnose/', origin: 'https://physicalmap.pages.dev' };
ctx.subject = 'physics'; ctx.returnToParam = null;
vm.runInContext(section('function explorePath()', 'function selectSessionOwner()'), ctx);
vm.runInContext(section('function restoreSession(saved)', 'function restart()'), ctx);
assert.strictEqual(ctx.restoreSession({ targets: ['cnp_071'], answers: [], confirm: 5, label: '欧姆定律' }), true);
assert.strictEqual(ctx.session.confirm, 4);
assert.ok(ctx.sessionMeta.returnTo.includes('volume=%E4%B9%9D%E5%85%A8#cnp_071'));
const savedReturn = '/explore/?subject=physics&volume=%E5%85%AB%E4%B8%8B#cnp_029';
const urlReturn = '/explore/?subject=physics&volume=%E5%85%AB%E4%B8%8A#cnp_001';
ctx.returnToParam = urlReturn;
assert.strictEqual(ctx.restoreSession({ targets: ['cnp_071'], answers: [], label: '欧姆定律', returnTo: savedReturn }), true);
assert.strictEqual(ctx.sessionMeta.returnTo, urlReturn, '显式 URL 来源优先于旧存档');
ctx.returnToParam = null;
assert.strictEqual(ctx.restoreSession({ targets: ['cnp_071'], answers: [], label: '欧姆定律', returnTo: savedReturn }), true);
assert.strictEqual(ctx.sessionMeta.returnTo, savedReturn, '无显式来源时恢复存档上下文');

// 个人中心的显式继续入口恢复原题目/归属；坏数据只提示，不能删掉或重放为新随机会话。
const previousSession=ctx.session,previousMeta=ctx.sessionMeta;
// 与页面 loadData 一致，只为当前学科建图。
const physicsTopics=topics.filter(topic=>E.subjectOf(topic)==='physics');
const physicsIds=new Set(physicsTopics.map(topic=>topic.id));
ctx.D.graph=E.buildGraph(physicsTopics,deps.filter(edge=>physicsIds.has(edge.topicId)&&physicsIds.has(edge.prerequisiteId)),questions.filter(q=>physicsIds.has(q.topicId)));
ctx.sessionKey = () => 'center-resume';
let resumedOwner, ownerChanges = 0;
ctx.selectSessionOwner = () => { resumedOwner = ctx.sessionMeta.progressChildId; ownerChanges++; };
assert.strictEqual(ctx.resumeStoredSession(), 'missing');
let run = E.createSession(graph, ['cnp_071'], {confirm:3,seed:'center-resume'});
const first = E.nextItem(graph, run);
run = E.applyAnswer(graph, run, first.topicId, 'correct');
const saved = {v:2,mode:run.mode,targets:run.targets,answers:run.answers,limit:run.limit,confirm:run.confirm,
  seed:run.seed,avoid:run.avoid,progressChildId:'child-a',label:'继续欧姆定律',savedAt:'2026-11-16T09:00:00.000Z',returnTo:savedReturn};
entries.set('center-resume',JSON.stringify(saved));
assert.strictEqual(ctx.resumeStoredSession(),'restored');
assert.strictEqual(resumedOwner,'child-a');assert.strictEqual(ownerChanges,1);
assert.strictEqual(ctx.session.answers.length,run.answers.length);
assert.strictEqual(E.nextItem(graph,ctx.session).question.id,E.nextItem(graph,run).question.id);
assert.strictEqual(ctx.sessionMeta.returnTo,savedReturn);
for(const patch of [{v:9},{seed:{}},{confirm:'3'},{progressChildId:{}},{progressChildId:'__proto__'},
  {limit:'16'},{targets:['cns_p001']},{answers:[{id:'cnp_071',qid:'cns_p001_q1',result:'correct'}]}]){
  const raw=JSON.stringify({...saved,...patch});entries.set('center-resume',raw);
  assert.strictEqual(ctx.resumeStoredSession(),'invalid',JSON.stringify(patch));
  assert.strictEqual(entries.get('center-resume'),raw,'无法恢复时保留存档');
  assert.strictEqual(ctx.session,null);assert.strictEqual(ctx.sessionMeta,null);assert.strictEqual(ownerChanges,1);
}
ctx.D.graph=graph;ctx.session=previousSession;ctx.sessionMeta=previousMeta;

// 新默认学科和按册入口直接进入教材模式，八上 / 八下不能合并。
const routeContext = {
  URLSearchParams, E, D: { graph, aliases: {} }, subject: 'physics',
  location: { search: '', hash: '', pathname: '/diagnose/' },
  history: { replaceState() {} }
};
vm.createContext(routeContext);
vm.runInContext(section('function detectSubject()', 'function applySubjectChrome()') +
  section('function resolveTargets(params)', 'async function init()'), routeContext);
assert.strictEqual(routeContext.detectSubject(), 'physics');
routeContext.location.search = '?subject=removed';
assert.strictEqual(routeContext.detectSubject(), 'physics');
routeContext.location.search = '?target=cns_p001';
assert.strictEqual(routeContext.detectSubject(), 'science');
routeContext.location.search = '?subject=science';
assert.strictEqual(routeContext.detectSubject(), 'science');
for (const [volume, count, first] of [['八上', 28, 'cnp_001'], ['八下', 24, 'cnp_029'], ['必修一', 27, 'cnp_h001']]) {
  const resolved = routeContext.resolveTargets(new URLSearchParams({ volume }));
  assert.strictEqual(resolved.mode, 'textbook');
  assert.strictEqual(resolved.volume, volume);
  assert.strictEqual(resolved.ids.length, count);
  assert.strictEqual(resolved.ids[0], first);
}
assert.strictEqual(routeContext.resolveTargets(new URLSearchParams({ grade: '八年级' })).mode, 'screen');
assert.throws(() => routeContext.resolveTargets(new URLSearchParams({ grade: '八年级', order: 'book' })), /不合并上下册/);

// 真实进度同步入口排除演示和旧归属未知存档，已绑定会话保持原孩子。
const syncCalls = [];
const syncContext = {
  demo: null, session: ctx.session, sessionMeta: {}, subject: 'physics',
  recordKey() { return 'physics|seed|cnp_071'; },
  window: { CnmProgress: { recordSession(payload) { syncCalls.push(payload); } } }
};
vm.createContext(syncContext);
vm.runInContext(section('function syncProgress()', 'function save()'), syncContext);
syncContext.syncProgress();
assert.strictEqual(syncCalls.length, 0, '旧归属未知不能自动写给当前孩子');
syncContext.sessionMeta.progressChildId = null;
syncContext.syncProgress();
assert.strictEqual(syncCalls[0].childId, null, '显式访客可以保存');
syncContext.sessionMeta.progressChildId = 'child-a';
syncContext.syncProgress();
assert.strictEqual(syncCalls[1].childId, 'child-a');
syncContext.demo = {};
syncContext.syncProgress();
assert.strictEqual(syncCalls.length, 2, '演示绝不写学习进度');

// 空值过滤 helper 不会把可选内容渲染成 "null"；档案只在开始和结果页展示。
const appendCode = section('function append(el, c)', 'function figureEl(svg)');
const appended = [];
const domContext = {
  displayText(value) { return String(value); },
  document: { createTextNode(text) { return { nodeType: 3, text }; } }
};
vm.createContext(domContext);
vm.runInContext(appendCode, domContext);
const node = { nodeType: 1 };
domContext.append({ append(child) { appended.push(child); } }, [null, false, node]);
assert.deepStrictEqual(appended, [node]);
for (const mode of ['start']) {
  assert.ok(source.includes("append(page, childBar('" + mode + "'))"));
  assert.ok(!source.includes("page.append(childBar('" + mode + "'))"));
}
assert.ok(!source.includes("append(page, childBar('question'))"), '答题期间不展示档案条');
assert.ok(source.includes("append(morePanel, childBar('result'))"));
assert.ok(!source.includes("page.append(childBar('result'))"));

// “我要试试”的重测意图只消费一次，刷新仍可以恢复刚开始的新进度。
const retryChanges = [];
const retryContext = {
  location: { pathname: '/diagnose/', hash: '#question' },
  history: { replaceState(_state, _title, url) { retryChanges.push(url); } }
};
vm.createContext(retryContext);
vm.runInContext(section('function consumeRetry(params)', 'async function init()'), retryContext);
const retryParams = new URLSearchParams({ target: 'cnp_001', retry: '1', returnTo: '/explore/?volume=八上#cnp_001' });
assert.strictEqual(retryContext.consumeRetry(retryParams), true);
assert.strictEqual(retryParams.has('retry'), false);
const refreshed = new URL(retryChanges[0], 'https://physicalmap.pages.dev');
assert.strictEqual(refreshed.searchParams.get('target'), 'cnp_001');
assert.strictEqual(refreshed.searchParams.get('returnTo'), '/explore/?volume=八上#cnp_001');
assert.strictEqual(refreshed.hash, '#question');
assert.strictEqual(retryContext.consumeRetry(refreshed.searchParams), false);
assert.strictEqual(retryChanges.length, 1);
console.log('test_diagnose_baseline: ok');
