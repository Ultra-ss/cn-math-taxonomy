#!/usr/bin/env node
/* cnc_p124_q3/q4 同 ID 题干改写后的历史兼容测试。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const StemCompat = require(path.join(ROOT, 'assets/stem-compat.js'));
const Engine = require(path.join(ROOT, 'diagnose/engine.js'));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cnc_p124_pre_b.json'), 'utf8'));
const siteQuestions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));
// 已移除学科使用独立夹具覆盖历史兼容，不依赖线上题库仍有语文题。
const liveQuestions = fixture.questions.map(q => ({ ...q, prompt: StemCompat.CURRENT[q.id] || q.prompt }));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok   ' + name);
}

function loadChildren(entries) {
  const storage = new Map(Object.entries(entries || {}));
  const context = {
    window: { StemCompat },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/children.js'), 'utf8'), context, { filename: 'assets/children.js' });
  return { api: context.window.CnmChildren, storage };
}

function loadBlind(entries) {
  const storage = new Map(Object.entries(entries || {}));
  const context = {
    window: { StemCompat },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/blindspots.js'), 'utf8'), context, { filename: 'assets/blindspots.js' });
  return { api: context.window.CnmBlind, storage };
}

function tinyGraph(questions) {
  const topics = [{
    id: 'cnc_p124', name: '语文园地一·注意说话的语气', grade: '二下',
    chapter: '第1单元', domain: '习作基础', subject: 'chinese'
  }];
  return Engine.buildGraph(topics, [], questions);
}

test('历史夹具与 StemCompat.RETIRED / CURRENT 对齐，科学物理题库不含已移除题目', () => {
  assert.ok(siteQuestions.every(q => /^cn[ps]_/.test(q.topicId)));
  assert.ok(!siteQuestions.some(q => q.id.startsWith('cnc_')));
  const byId = Object.fromEntries(fixture.questions.map((q) => [q.id, q]));
  assert.equal(byId.cnc_p124_q3.prompt, StemCompat.RETIRED.cnc_p124_q3);
  assert.equal(byId.cnc_p124_q4.prompt, StemCompat.RETIRED.cnc_p124_q4);
  const live = Object.fromEntries(liveQuestions.map((q) => [q.id, q]));
  assert.equal(live.cnc_p124_q3.prompt, StemCompat.CURRENT.cnc_p124_q3);
  assert.equal(live.cnc_p124_q4.prompt, StemCompat.CURRENT.cnc_p124_q4);
  assert.notEqual(live.cnc_p124_q3.prompt, StemCompat.RETIRED.cnc_p124_q3);
  assert.notEqual(live.cnc_p124_q4.prompt, StemCompat.RETIRED.cnc_p124_q4);
  assert.equal(live.cnc_p124_q1.prompt, byId.cnc_p124_q1.prompt);
  assert.equal(live.cnc_p124_q2.prompt, byId.cnc_p124_q2.prompt);
});

test('无 prompt 的旧 session：排除 q3/q4，q1/q2 保留；过滤回放不成语气掌握', () => {
  const answers = [
    { id: 'cnc_p124', qid: 'cnc_p124_q1', result: 'correct' },
    { id: 'cnc_p124', qid: 'cnc_p124_q3', result: 'correct' },
    { id: 'cnc_p124', qid: 'cnc_p124_q2', result: 'correct' }
  ];
  const effect = StemCompat.sessionEffect(answers);
  assert.deepEqual(effect.answers.map((a) => a.qid), ['cnc_p124_q1', 'cnc_p124_q2']);
  assert.deepEqual(effect.retestTopicIds, ['cnc_p124']);
  const prepared = StemCompat.prepareReplayAnswers(answers);
  assert.equal(prepared.excluded.length, 1);
  assert.equal(prepared.excluded[0].qid, 'cnc_p124_q3');
  assert.equal(prepared.excluded[0].prompt, StemCompat.RETIRED.cnc_p124_q3);

  const graph = tinyGraph(liveQuestions);
  const raw = Engine.replay(graph, ['cnc_p124'], answers, { confirm: 3, limit: 10, seed: 1 });
  assert.equal(Engine.statusOf(raw, 'cnc_p124'), 'mastered');

  const filtered = Engine.replay(graph, ['cnc_p124'], prepared.answers, { confirm: 3, limit: 10, seed: 1 });
  assert.notEqual(Engine.statusOf(filtered, 'cnc_p124'), 'mastered');
  assert.deepEqual(filtered.answers.map((a) => a.qid), ['cnc_p124_q1', 'cnc_p124_q2']);
});

test('旧语文记录的纯兼容展示保留原对象；两科档案不受旧题干标记影响', () => {
  const old = { mastered: ['cnc_p124'], counts: { mastered: 1 }, targets: ['cnc_p124'] };
  const view = StemCompat.presentRecord(old);
  assert.deepEqual(view.mastered, []);
  assert.deepEqual(view.needsRetest, ['cnc_p124']);
  assert.equal(view.counts.mastered, 0);
  assert.deepEqual(old.mastered, ['cnc_p124']);
  const profiles = { v: 1, current: 'c1', children: [{ id: 'c1', name: '小测', grade: '二年级', textbook: '教科版', createdAt: '2026-11-01T00:00:00.000Z' }] };
  const recs = ['science', 'physics'].map((subject, i) => {
    const id = i ? 'cnp_001' : 'cns_p001';
    return { key: subject + '|run|' + id, subject, mastered: [id], weak: [], shaky: [], roots: [], targets: [id], savedAt: '2026-11-01T00:00:00.000Z' };
  });
  const { api, storage } = loadChildren({ 'cnmChildren.v1': JSON.stringify(profiles), 'cnmChildren.records.v1': JSON.stringify({ c1: recs }) });
  for (const [i, subject] of ['science', 'physics'].entries()) {
    const id = recs[i].targets[0];
    assert.equal(api.latestStatus('c1', subject)[id].status, 'mastered');
    assert.deepEqual(api.presentRecord(recs[i]).mastered, [id]);
  }
  const backup = api.exportBackup();
  assert.equal(JSON.stringify(backup.records.c1), JSON.stringify(recs));
  assert.equal(storage.get('cnmChildren.records.v1'), JSON.stringify({ c1: recs }));
});

test('盲区隐藏已移除学科，科学物理作答不会被旧语文题干规则排除', () => {
  const old = { id: 'cnc_p124', subject: 'chinese', status: 'weak', root: true, hits: 2, wrongs: 3, lastAt: '2026-11-01T00:00:00.000Z' };
  const { api, storage } = loadBlind({ 'cnmBlind.local.v1': JSON.stringify({ v: 1, byId: { cnc_p124: old } }) });
  assert.equal(api.list({ subject: 'chinese' }).length, 0);
  assert.equal(api.noteResult({ subject: 'chinese', weak: ['cnc_p124'] }), false);
  for (const subject of ['science', 'physics']) {
    const id = subject === 'science' ? 'cns_p001' : 'cnp_001';
    const answers = [{ id, qid: id + '_q1', result: 'wrong' }];
    assert.equal(StemCompat.sessionEffect(answers).answers.length, 1);
    assert.equal(api.noteResult({ subject, key: subject + '|run', label: '两科诊断', weak: [id], roots: [id], answers }), true);
    const rows = api.list({ subject });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'weak');
    assert.equal(rows[0].wrongs, 1);
  }
  assert.equal(JSON.parse(storage.get('cnmBlind.local.v1')).byId.cnc_p124.subject, 'chinese');
});

console.log('\n' + passed + ' passed');
