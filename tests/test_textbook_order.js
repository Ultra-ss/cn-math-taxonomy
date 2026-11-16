#!/usr/bin/env node
/* 教材顺序检测：每个知识点都真实作答，不因先修推断而跳过。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../diagnose/engine.js');
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok - ' + name);
}
function topic(id, chapter) {
  return { id, name: id, subject: 'physics', grade: chapter.startsWith('八') ? 8 : 9, chapter };
}
// A 的先修 C 位于教材后面；B 还依赖另一本书 X。拓扑序 X/B/C/A 故意不同于教材序 A/B/C。
const topics = [
  topic('X', '九全 第十五章 电流和电路 15.1'),
  topic('A', '八上 第一章 机械运动 1.1'),
  topic('B', '八上 第一章 机械运动 1.2'),
  topic('C', '八上 第二章 声现象 2.1')
];
const deps = [
  { topicId: 'A', prerequisiteId: 'C', strength: 'hard' },
  { topicId: 'C', prerequisiteId: 'B', strength: 'hard' },
  { topicId: 'B', prerequisiteId: 'X', strength: 'soft' }
];
const questions = topics.flatMap(t => [1, 2, 3].map(n => ({
  id: t.id + '_q' + n, topicId: t.id, difficulty: n === 1 ? 'standard' : 'basic',
  type: 'numeric', prompt: t.id + ' / ' + n, answer: '1'
})));
const graph = E.buildGraph(topics, deps, questions);
const expected = ['A', 'B', 'C'];
function begin(opts) {
  return E.createSession(graph, ['C', 'A', 'B', 'A'], Object.assign({ mode: 'textbook', confirm: 2, limit: 30, seed: 'book' }, opts));
}
function answer(s, result) {
  const item = E.nextItem(graph, s);
  assert.ok(item, '应该还有待测题目');
  return E.applyAnswer(graph, s, item.topicId, result);
}
function assertBook(s) {
  assert.strictEqual(s.mode, 'textbook');
  assert.strictEqual(s.orderKind, 'book');
  assert.deepStrictEqual(s.order, expected);
  assert.deepStrictEqual(new Set(s.scope), new Set(expected));
  assert.strictEqual(E.statusOf(s, 'X'), 'unknown', '跨册先修不得被本册结果推断掌握');
}

test('乱序、重复目标按教材原序开始，状态更新保留教材模式', () => {
  let s = begin();
  assertBook(s);
  assert.strictEqual(E.nextItem(graph, s).topicId, 'A');
  s = answer(s, 'correct');
  assertBook(s);
  assert.strictEqual(E.nextItem(graph, s).topicId, 'A', '同点尚未达到确认题数，继续真实作答');
  s = answer(s, 'correct');
  assertBook(s);
  assert.strictEqual(E.statusOf(s, 'A'), 'mastered');
  assert.strictEqual(s.status.A.src, 'direct');
  assert.strictEqual(E.statusOf(s, 'B'), 'unknown');
  assert.strictEqual(E.statusOf(s, 'C'), 'unknown', '后续点不能因为先修关系提前掌握');
  assert.strictEqual(E.nextItem(graph, s).topicId, 'B');
});

test('连续答对所有点仍逐点考查，所有掌握结论均来自真实作答', () => {
  let s = begin();
  const seq = [];
  while (E.nextItem(graph, s)) {
    seq.push(E.nextItem(graph, s).topicId);
    s = answer(s, 'correct');
  }
  assertBook(s);
  assert.deepStrictEqual(seq, ['A', 'A', 'B', 'B', 'C', 'C']);
  assert.deepStrictEqual(E.summarize(graph, s).mastered, expected);
  assert.deepStrictEqual(Object.keys(s.status).sort(), expected);
  assert.ok(Object.values(s.status).every(st => st.src === 'direct'));
  assert.deepStrictEqual(E.summarize(graph, s).untested, []);
});

test('薄弱点不让后面的先修插队，也不跨册回溯', () => {
  let s = begin();
  s = answer(answer(s, 'wrong'), 'wrong');
  assert.strictEqual(E.statusOf(s, 'A'), 'weak');
  assert.strictEqual(E.nextItem(graph, s).topicId, 'B', 'A 的先修 C 不能插到 B 前面');
  s = answer(answer(s, 'skip'), 'skip');
  assert.strictEqual(E.statusOf(s, 'B'), 'weak');
  assert.strictEqual(E.nextItem(graph, s).topicId, 'C', 'B 的跨册先修 X 不应加入队列');
  s = answer(answer(s, 'correct'), 'correct');
  assert.strictEqual(E.nextItem(graph, s), null);
  assert.deepStrictEqual(E.summarize(graph, s).weak, ['A', 'B']);
  assertBook(s);
});

test('答错后确认答对判不稳，随后仍按教材顺序前进', () => {
  let s = begin();
  s = answer(answer(s, 'wrong'), 'correct');
  assert.strictEqual(E.statusOf(s, 'A'), 'shaky');
  assert.strictEqual(E.nextItem(graph, s).topicId, 'B');
  s = answer(answer(s, 'correct'), 'correct');
  assert.strictEqual(E.nextItem(graph, s).topicId, 'C');
  assert.deepStrictEqual(E.summarize(graph, s).shaky, ['A']);
  assertBook(s);
});

test('题量到上限只保留真实结论，JSON 恢复、重放加题后继续下个教材点', () => {
  let s = begin({ limit: 2 });
  s = answer(answer(s, 'correct'), 'correct');
  assert.strictEqual(E.nextItem(graph, s), null);
  assert.deepStrictEqual(E.summarize(graph, s).untested, ['B', 'C']);
  assert.strictEqual(E.summarize(graph, s).limitReached, true);
  const saved = JSON.parse(JSON.stringify(s));
  assertBook(saved);
  const restored = E.replay(graph, saved.targets, saved.answers, {
    mode: saved.mode, orderKind: saved.orderKind, order: saved.order,
    limit: saved.limit, confirm: saved.confirm, seed: saved.seed, avoid: saved.avoid
  });
  assert.deepStrictEqual(restored, saved);
  const extended = E.replay(graph, saved.targets, saved.answers, {
    mode: saved.mode, orderKind: saved.orderKind, order: saved.order,
    limit: 6, confirm: saved.confirm, seed: saved.seed, avoid: saved.avoid
  });
  assertBook(extended);
  assert.strictEqual(E.nextItem(graph, extended).topicId, 'B');
  const undone = E.replay(graph, saved.targets, saved.answers.slice(0, -1), {
    mode: saved.mode, orderKind: saved.orderKind, limit: 6, confirm: saved.confirm, seed: saved.seed
  });
  assertBook(undone);
  assert.strictEqual(E.statusOf(undone, 'A'), 'unknown');
  assert.strictEqual(E.nextItem(graph, undone).topicId, 'A');
});

test('单点回溯和旧整体筛查仍保留原有推断规则', () => {
  let target = E.createSession(graph, ['A'], { mode: 'target', confirm: 1 });
  assert.strictEqual(E.nextItem(graph, target).topicId, 'A');
  target = answer(target, 'correct');
  assert.strictEqual(target.mode, 'target');
  assert.strictEqual(E.statusOf(target, 'X'), 'mastered');
  assert.strictEqual(target.status.X.src, 'inferred');
  let screen = E.createSession(graph, expected, { mode: 'screen', confirm: 1 });
  screen = answer(screen, 'correct');
  assert.strictEqual(screen.mode, 'screen');
  assert.strictEqual(E.statusOf(screen, 'B'), 'mastered');
  assert.strictEqual(screen.status.B.src, 'inferred');
  assert.strictEqual(E.statusOf(screen, 'X'), 'unknown', '筛查仍只沿 hard 先修推断');
});

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const real = E.buildGraph(readJson('data/topics.json'), readJson('data/dependencies.json'), readJson('data/questions.json'));
for (const [subject, volume, count] of [['physics', '八上', 28], ['physics', '八下', 24], ['physics', '必修一', 27], ['science', '一上', 15]]) {
  test(subject + ' ' + volume + ' 按真实教材逐点作答且全程不跨册', () => {
    const book = E.gradeTargets(real, volume, subject);
    assert.ok(book);
    assert.strictEqual(book.ids.length, count);
    let s = E.createSession(real, book.ids.slice().reverse(), { mode: 'textbook', limit: count, confirm: 1, seed: 'real-book' });
    const seq = [];
    let item;
    while ((item = E.nextItem(real, s))) {
      assert.strictEqual(real.byId[item.topicId].subject, subject);
      assert.strictEqual(E.parseChapter(real.byId[item.topicId].chapter).volume, volume);
      seq.push(item.topicId);
      s = E.applyAnswer(real, s, item.topicId, 'correct');
    }
    assert.deepStrictEqual(seq, book.ids);
    assert.deepStrictEqual(E.summarize(real, s).mastered, book.ids);
    assert.deepStrictEqual(E.summarize(real, s).untested, []);
    assert.strictEqual(Object.keys(s.status).length, count);
    assert.ok(Object.values(s.status).every(st => st.src === 'direct'));
  });
}

// 单元挑战沿用严格教材模式，范围只取本单元的目标，不能把整册先修推断成通过。
function unitIds(subject, volume, chapterNo) {
  return real.topics.filter(t => {
    const parsed = E.parseChapter(t.chapter);
    return !t.external && t.subject === subject && parsed.volume === volume && parsed.chapterNo === chapterNo;
  }).map(t => t.id);
}
function studyStore(entries = {}) {
  const storage = new Map(Object.entries(entries));
  const context = {
    window: {dispatchEvent() {}}, Event: class Event {},
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.createContext(context);
  for (const file of ['assets/progress.js', 'assets/children.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
  }
  return {progress:context.window.CnmProgress, children:context.window.CnmChildren, storage};
}
function finishUnit(session, outcomes = {}) {
  let item;
  while ((item = E.nextItem(real, session))) {
    const previous = session.attempts[item.topicId] || [];
    const result = (outcomes[item.topicId] || [])[previous.length] || 'correct';
    session = E.applyAnswer(real, session, item.topicId, result);
  }
  return session;
}
function recordUnit(progress, owner, key, subject, session) {
  assert.equal(progress.recordSession({childId:owner, key, subject, session, at:'2026-11-16T01:00:00.000Z'}), true);
}
for (const [subject, volume, chapterNo, expectedCount] of [
  ['physics', '九全', '第十三章', 3],
  ['physics', '八下', '第十一章', 4],
  ['physics', '必修一', '第一章', 4],
  ['science', '一上', '第1单元', 7]
]) {
  const ids = unitIds(subject, volume, chapterNo);
  assert.equal(ids.length, expectedCount, '真实单元范围必须匹配教材数据');
  test(subject + ' ' + volume + ' ' + chapterNo + ' 完整通关只为本单元逐点打钩并解锁', () => {
    const initial = E.createSession(real, ids.slice().reverse(), {mode:'textbook', volume, limit:100, confirm:2, seed:'unit-pass'});
    const completed = finishUnit(initial), {progress} = studyStore();
    assert.deepStrictEqual(completed.targets, ids);
    assert.deepStrictEqual(completed.order, ids);
    assert.deepStrictEqual(completed.scope, ids);
    assert.deepStrictEqual(Object.keys(completed.status).sort(), ids.slice().sort());
    assert.ok(Object.values(completed.status).every(state=>state.s==='mastered' && state.src==='direct'));
    assert.deepStrictEqual(completed.answers.map(answer=>answer.id), ids.flatMap(id=>[id,id]));
    assert.ok(completed.answers.every(answer=>answer.qid.startsWith(answer.id+'_q')));
    recordUnit(progress, 'unit-child', 'unit|'+volume+'|'+chapterNo, subject, completed);
    const statuses = progress.statuses('unit-child',subject);
    assert.deepStrictEqual(Object.keys(statuses).sort(), ids.slice().sort(), '章外知识点不打钩');
    assert.ok(ids.every(id=>statuses[id].mark==='✓'));
    const chapter = progress.chapters('unit-child', real.topics).find(row=>row.firstTopicId===ids[0]);
    assert.ok(chapter);
    assert.equal(chapter.total, ids.length);
    assert.equal(chapter.completed, ids.length);
    assert.equal(chapter.unlocked, true);
    assert.equal(progress.achievements('unit-child').total, ids.length);
    recordUnit(progress, 'unit-child', 'unit-repeat', subject, completed);
    assert.equal(progress.achievements('unit-child').total, ids.length, '整单元重测不能重复获得积分');
    assert.deepStrictEqual(Object.keys(progress.statuses('other-child',subject)), []);
    assert.deepStrictEqual(Object.keys(progress.statuses(null,subject)), []);
  });
  test(subject + ' ' + volume + ' ' + chapterNo + ' 失败与不稳均不算单元通关，不能跨单元回溯', () => {
    const initial = E.createSession(real, ids, {mode:'textbook', volume, limit:100, confirm:2, seed:'unit-mixed'});
    const completed = finishUnit(initial, {[ids[0]]:['wrong','wrong'], [ids[1]]:['wrong','correct']});
    assert.ok(completed.answers.every(answer=>ids.includes(answer.id)), '依赖本单元之外的先修也不能加入队列');
    assert.deepStrictEqual(Object.keys(completed.status).sort(), ids.slice().sort());
    assert.equal(E.statusOf(completed,ids[0]),'weak');
    assert.equal(E.statusOf(completed,ids[1]),'shaky');
    const summary = E.chapterSummary(real, completed);
    assert.equal(summary.length,1);
    assert.equal(summary[0].mastered,ids.length-2);
    const {progress} = studyStore();
    recordUnit(progress, 'unit-child', 'unit-mixed', subject, completed);
    const statuses = progress.statuses('unit-child',subject);
    assert.equal(statuses[ids[0]].mark,'×');
    assert.equal(statuses[ids[1]].mark,'×');
    const chapter = progress.chapters('unit-child',real.topics).find(row=>row.firstTopicId===ids[0]);
    assert.equal(chapter.completed,ids.length-2);
    assert.equal(chapter.unlocked,false);
    assert.equal(progress.achievements('unit-child').total,ids.length-2);
  });
}

test('单元轮次上限、刷新与加题始终保留精确单元，不将后续整册纳入目标', () => {
  const ids = unitIds('physics','九全','第十三章');
  let session = E.createSession(real, ids, {mode:'textbook',volume:'九全',limit:2,confirm:2,seed:'unit-round'});
  session = finishUnit(session);
  assert.equal(E.summarize(real,session).limitReached,true);
  assert.deepStrictEqual(E.summarize(real,session).mastered,[ids[0]]);
  const saved = JSON.parse(JSON.stringify(session));
  const replay = E.replay(real,saved.targets,saved.answers,{mode:saved.mode,order:saved.orderKind,volume:saved.volume,
    limit:saved.limit,confirm:saved.confirm,seed:saved.seed,avoid:saved.avoid});
  assert.deepStrictEqual(replay,saved);
  const continued = finishUnit(E.replay(real,saved.targets,saved.answers,{mode:saved.mode,volume:saved.volume,
    limit:6,confirm:saved.confirm,seed:saved.seed,avoid:saved.avoid}));
  assert.deepStrictEqual(continued.targets,ids);
  assert.deepStrictEqual(continued.order,ids);
  assert.deepStrictEqual(E.summarize(real,continued).mastered,ids);
  assert.ok(continued.answers.every(answer=>ids.includes(answer.id)));
  assert.equal(E.nextItem(real,continued),null);
});

test('单元检测备份恢复保留目标、归属、轮次进度与图谱钩，继续后不重复发星', () => {
  const ids = unitIds('physics','九全','第十三章');
  const profiles = {v:1,current:'unit-child',children:[{
    id:'unit-child',name:'单元学习者',grade:'九年级',textbook:'人教版',createdAt:'2026-11-01T00:00:00.000Z'
  }]};
  const source = studyStore({'cnmChildren.v1':JSON.stringify(profiles)});
  const partial = finishUnit(E.createSession(real,ids,{mode:'textbook',volume:'九全',limit:2,confirm:2,seed:'unit-backup'}));
  const saved = {v:2,mode:'textbook',order:'book',volume:'九全',targets:ids,limit:2,confirm:2,
    seed:partial.seed,avoid:partial.avoid,label:'九年级 第十三章 内能（单元挑战）',answers:partial.answers,
    progressChildId:'unit-child',returnTo:'/explore/?subject=physics&volume=%E4%B9%9D%E5%85%A8#'+ids[0],savedAt:'2026-11-16T01:00:00.000Z'};
  source.storage.set('cnpDiagnose.session.v2',JSON.stringify(saved));
  recordUnit(source.progress,'unit-child','unit-backup','physics',partial);
  const exported = source.children.exportBackup();
  const target = studyStore();
  const backup = target.children.parseBackup(JSON.stringify(exported));
  const preview = target.children.previewImport(backup);
  target.children.importBackup(backup,preview.token);
  const restored = JSON.parse(target.storage.get('cnpDiagnose.session.v2'));
  assert.deepStrictEqual(restored,saved);
  assert.equal(target.progress.statuses('unit-child','physics')[ids[0]].mark,'✓');
  assert.equal(target.progress.statuses(null,'physics')[ids[0]],undefined);
  assert.equal(target.progress.achievements('unit-child').total,1);
  const completed = finishUnit(E.replay(real,restored.targets,restored.answers,{mode:restored.mode,volume:restored.volume,
    limit:6,confirm:restored.confirm,seed:restored.seed,avoid:restored.avoid}));
  recordUnit(target.progress,restored.progressChildId,'unit-backup','physics',completed);
  assert.equal(target.progress.achievements('unit-child').total,ids.length);
  assert.ok(ids.every(id=>target.progress.statuses('unit-child','physics')[id].mark==='✓'));
  assert.deepStrictEqual(Object.keys(target.progress.statuses('unit-child','physics')).sort(),ids.slice().sort());
});

console.log('test_textbook_order: ' + passed + ' passed');
