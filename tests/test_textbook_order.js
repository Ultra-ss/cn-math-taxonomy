#!/usr/bin/env node
/* 教材顺序检测：每个知识点都真实作答，不因先修推断而跳过。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

console.log('test_textbook_order: ' + passed + ' passed');
