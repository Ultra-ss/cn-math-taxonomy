#!/usr/bin/env node
/* 本机盲区汇总测试：node tests/test_blindspots.js（无依赖，不访问真实浏览器存储）。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../assets/blindspots.js'), 'utf8');
const KEY = 'cnmBlind.local.v1';
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log('  ok   ' + name);
}

function load(entries) {
  const storage = new Map(Object.entries(entries || {}));
  const context = {
    window: {},
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.runInNewContext(SOURCE, context, { filename: 'assets/blindspots.js' });
  return { api: context.window.CnmBlind, storage };
}

test('空库时 list 为空', () => {
  const { api } = load();
  assert.equal(api.list().length, 0);
  assert.equal(api.count(), 0);
});

test('noteResult 写入薄弱 / 不稳，并累计答错次数', () => {
  const { api, storage } = load();
  api.noteResult({
    subject: 'science', key: 'science|s1|t', label: '观察物体',
    weak: ['cns_p221'], shaky: ['cns_p100'], mastered: ['cns_p050'],
    roots: ['cns_p221'],
    answers: [
      { id: 'cns_p221', result: 'wrong' },
      { id: 'cns_p221', result: 'wrong' },
      { id: 'cns_p100', result: 'wrong' },
      { id: 'cns_p100', result: 'correct' },
      { id: 'cns_p050', result: 'correct' }
    ]
  });
  const rows = api.list();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'cns_p221');
  assert.equal(rows[0].status, 'weak');
  assert.equal(rows[0].root, true);
  assert.equal(rows[0].wrongs, 2);
  assert.equal(rows[1].id, 'cns_p100');
  assert.equal(rows[1].status, 'shaky');
  assert.equal(rows[1].wrongs, 1);
  const raw = JSON.parse(storage.get(KEY));
  assert.equal(raw.byId.cns_p050.status, 'mastered');
  assert.ok(!rows.some(r => r.id === 'cns_p050'));
});

test('再次掌握后从盲区列表消失（以最近一次为准）', () => {
  const { api } = load();
  api.noteResult({
    subject: 'science', key: 'a', label: '一', weak: ['cns_p221'], shaky: [], mastered: [], roots: ['cns_p221'],
    answers: [{ id: 'cns_p221', result: 'wrong' }]
  });
  assert.equal(api.count(), 1);
  api.noteResult({
    subject: 'science', key: 'b', label: '二', weak: [], shaky: [], mastered: ['cns_p221'], roots: [],
    answers: [{ id: 'cns_p221', result: 'correct' }]
  });
  assert.equal(api.count(), 0);
});

test('diagnoseHref 根据科学物理知识点生成链接，拒绝旧学科', () => {
  const { api } = load();
  assert.equal(api.diagnoseHref(['cns_p001'], 'science', '../diagnose/'),
    '../diagnose/?subject=science&target=cns_p001');
  assert.equal(api.diagnoseHref(['cnp_001'], 'physics', './'), './?subject=physics&target=cnp_001');
  assert.equal(api.diagnoseHref(['cnp_001', 'cnp_h001']),
    'diagnose/?subject=physics&target=cnp_001,cnp_h001');
  assert.equal(api.diagnoseHref(['cnm_001']), 'diagnose/?subject=physics');
  assert.equal(api.diagnoseHref(['cns_p001'], 'physics'), 'diagnose/?subject=physics');
  assert.equal(api.subjectOfId('cns_p001'), 'science');
  assert.equal(api.subjectOfId('cnp_h001'), 'physics');
  assert.equal(api.subjectOfId('cnm_001'), '');
});

test('旧学科会话与账本保持原存储且不进入两科盲区', () => {
  const legacy = JSON.stringify({ v: 1, byId: {
    cnm_001: { id: 'cnm_001', subject: 'math', status: 'weak' }
  } });
  const { api, storage } = load({
    [KEY]: legacy,
    'cncDiagnose.session.v2': JSON.stringify({ answers: [{ id: 'cnc_j001', result: 'wrong' }] })
  });
  assert.equal(api.count(), 0);
  assert.equal(api.noteResult({ subject: 'math', weak: ['cnm_001'] }), false);
  assert.equal(storage.get(KEY), legacy);
});

test('subject 过滤与未完成会话答错合并', () => {
  const { api } = load({
    'cnpDiagnose.session.v2': JSON.stringify({
      label: '八上 机械运动', savedAt: '2026-10-30T01:00:00.000Z',
      answers: [
        { id: 'cnp_010', result: 'wrong' },
        { id: 'cnp_011', result: 'correct' }
      ]
    })
  });
  api.noteResult({
    subject: 'science', key: 'm', label: '数学', weak: ['cns_p221'], shaky: [], mastered: [], roots: ['cns_p221'],
    answers: [{ id: 'cns_p221', result: 'wrong' }]
  });
  const en = api.list({ subject: 'physics' });
  assert.equal(en.length, 1);
  assert.equal(en[0].id, 'cnp_010');
  assert.equal(en[0].source, 'session');
  assert.equal(en[0].wrongs, 1);
  assert.equal(api.list({ subject: 'science' }).length, 1);
});

test('demo 标记不写入', () => {
  const { api } = load();
  api.noteResult({
    demo: true, subject: 'science', weak: ['cns_p221'], shaky: [], mastered: [], roots: ['cns_p221'],
    answers: [{ id: 'cns_p221', result: 'wrong' }]
  });
  assert.equal(api.count(), 0);
});

test('孩子档案 latestStatus 可并入列表', () => {
  const { api } = load();
  const contextWindow = { CnmChildren: {
    current() { return { id: 'c1', name: '小禾' }; },
    latestStatus() {
      return {
        cns_p300: { status: 'weak', root: true, at: '2026-10-30T08:00:00.000Z', label: '整体', subject: 'science' },
        cns_p301: { status: 'mastered', at: '2026-10-30T08:00:00.000Z', subject: 'science' }
      };
    }
  }};
  // reload with CnmChildren present
  const storage = new Map();
  const ctx = {
    window: contextWindow,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.runInNewContext(SOURCE, ctx, { filename: 'assets/blindspots.js' });
  const rows = ctx.window.CnmBlind.list({ subject: 'science' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'cns_p300');
  assert.equal(rows[0].source, 'child');
});

test('未完成会话不会将其他学科知识点作为当前学科盲区', () => {
  const { api } = load({ 'cnpDiagnose.session.v2': JSON.stringify({ answers: [
    { id: 'cnm_001', result: 'wrong' }, { id: 'cns_p001', result: 'wrong' },
    { id: 'cnp_001', result: 'wrong' }
  ] }) });
  assert.equal(api.count(), 1);
  assert.equal(api.list()[0].id, 'cnp_001');
});

test('普通账本仍限制 200 点，合并导入的大账本新增后保留完整', () => {
  const { api } = load();
  for (let i = 1; i <= 205; i++) {
    api.noteResult({ subject: 'science', weak: ['cns_p' + i], answers: [] });
  }
  assert.equal(api.count(), 200);
  const byId = {};
  for (let i = 1; i <= 205; i++) {
    const id = 'cns_p' + i;
    byId[id] = { id, subject: 'science', status: 'weak', lastAt: '2026-01-01', wrongs: 1 };
  }
  const imported = load({ [KEY]: JSON.stringify({ v: 1, byId }) });
  imported.api.noteResult({ subject: 'science', weak: ['cns_p999'], answers: [] });
  assert.equal(imported.api.count(), 206);
  assert.ok(imported.api.list().some(row => row.id === 'cns_p1'));
});

console.log('\n' + passed + ' passed');
