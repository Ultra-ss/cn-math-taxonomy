#!/usr/bin/env node
/* 直接检测结论、归属、重测、撤销与持久化：node tests/test_progress.js。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Engine = require('../diagnose/engine.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/progress.js'), 'utf8');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
function load(entries = {}, options = {}) {
  const storage = new Map(Object.entries(entries)), events = [], writes = [];
  const context = { window: { dispatchEvent(event) { events.push(event.type); } }, Event: class Event { constructor(type) { this.type = type; } },
    localStorage: {
      getItem(key) { if (options.failRead) throw Error('denied'); return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { if (options.failWrite) throw Error('quota'); storage.set(key, value); writes.push(key); }
    } };
  vm.runInNewContext(source, context, { filename: 'assets/progress.js' });
  return { api: context.window.CnmProgress, storage, events, writes };
}
const topics = ['cns_a', 'cns_b', 'cnp_a'].map((id, i) => ({ id, name: id, subject: i === 2 ? 'physics' : 'science', grade: 1, chapter: '第一章' }));
const questions = topics.flatMap(t => [1,2,3,4].map(i => ({ id: t.id + '_q' + i, topicId: t.id, difficulty: i === 1 ? 'basic' : 'standard', type: 'choice', prompt: '题', answer: 'A', choices: [{key:'A',text:'答'}] })));
const graph = Engine.buildGraph(topics, [{ topicId: 'cns_b', prerequisiteId: 'cns_a', strength: 'hard' }], questions);
const t1 = '2026-11-01T00:00:00.000Z', t2 = '2026-11-02T00:00:00.000Z', t3 = '2026-11-03T00:00:00.000Z', t4 = '2026-11-04T00:00:00.000Z';
function run(id, results, mode = 'target') {
  let s = Engine.createSession(graph, [id], { confirm: 3, seed: 'unit-run', limit: 20, mode });
  for (const result of results) {
    const item = Engine.nextItem(graph, s);
    assert.ok(item);
    s = Engine.applyAnswer(graph, s, item.topicId, result);
  }
  return s;
}
function record(api, key, session, at = t1, extra = {}) {
  return api.recordSession({ childId: 'child-a', subject: 'science', key, session, at, ...extra });
}

test('连续答对形成直接✓，同次推断的先修不标记', () => {
  const { api } = load();
  const s = run('cns_b', ['correct','correct','correct']);
  assert.equal(s.status.cns_a.src, 'inferred');
  assert.equal(record(api, 'master', s), true);
  assert.equal(api.statuses('child-a', 'science').cns_b.mark, '✓');
  assert.equal(api.statuses('child-a', 'science').cns_a, undefined);
});

test('单次答错与进行中尚无结论不标记；两次错/错后对分别显示weak/shaky×', () => {
  const { api } = load();
  record(api, 'pending', run('cns_a',['wrong']));
  assert.deepStrictEqual(Object.keys(api.statuses('child-a','science')), []);
  record(api, 'weak', run('cns_a',['wrong','wrong']),t2);
  assert.equal(api.statuses('child-a','science').cns_a.status, 'weak');
  assert.equal(api.statuses('child-a','science').cns_a.mark, '×');
  record(api, 'shaky', run('cns_a',['wrong','correct']),t3);
  assert.equal(api.statuses('child-a','science').cns_a.status, 'shaky');
  assert.equal(api.statuses('child-a','science').cns_a.mark, '×');
});

test('孩子/访客及学科隔离，刷新后按最新已完成结论读取', () => {
  const { api, storage } = load();
  record(api, 'a', run('cns_a',['correct','correct','correct']));
  record(api, 'b', run('cns_a',['wrong','wrong']),t2,{childId:'child-b'});
  record(api, 'guest', run('cns_a',['wrong','correct']),t3,{childId:null});
  record(api, 'phy', run('cnp_a',['correct','correct','correct']),t1,{subject:'physics'});
  const refreshed = load(Object.fromEntries(storage)).api;
  assert.equal(refreshed.statuses('child-a','science').cns_a.mark,'✓');
  assert.equal(refreshed.statuses('child-b','science').cns_a.status,'weak');
  assert.equal(refreshed.statuses(null,'science').cns_a.status,'shaky');
  assert.equal(refreshed.statuses('guest','science').cns_a.status,'shaky');
  assert.equal(refreshed.statuses('child-a','physics').cnp_a.mark,'✓');
  assert.equal(refreshed.statuses('child-b','physics').cnp_a,undefined);
});

test('重测中的未知状态保留先前有效结果；完成后取新结论', () => {
  const { api } = load();
  record(api,'old',run('cns_a',['correct','correct','correct']));
  record(api,'retest',run('cns_a',['wrong']),t2);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'✓');
  record(api,'retest',run('cns_a',['wrong','wrong']),t3);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'×');
});

test('同次诊断撤销已结束结论时回落前次有效结果；全新点撤销后标记消失', () => {
  const { api } = load();
  record(api,'old',run('cns_a',['correct','correct','correct']));
  record(api,'new',run('cns_a',['wrong','wrong']),t2);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'×');
  record(api,'new',run('cns_a',['wrong']),t3);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'✓');
  record(api,'only-b',run('cns_b',['correct','correct','correct']),t2);
  record(api,'only-b',run('cns_b',['correct','correct']),t3);
  assert.equal(api.statuses('child-a','science').cns_b,undefined);
});

test('恢复旧失败A不覆盖独立重测通过B；A实际更改作答才更新时间', () => {
  const { api, storage, writes } = load();
  const failed = run('cns_a',['wrong','wrong']);
  record(api,'A',failed,t1);
  record(api,'B',run('cns_a',['correct','correct','correct']),t2);
  const before = storage.get(api.KEY), n = writes.length;
  record(api,'A',failed,t3);
  assert.equal(storage.get(api.KEY),before);
  assert.equal(writes.length,n);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'✓');
  const changed = JSON.parse(JSON.stringify(failed)); changed.answers[0].text = '实际更正后的回答';
  record(api,'A',changed,t4);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'×');
  assert.equal(api.statuses('child-a','science').cns_a.at,t4);
});

test('同run后续测其他点不会重打先前点时间，避免覆盖后来的独立重测', () => {
  const { api } = load();
  const aFailed = run('cns_a',['wrong','wrong']);
  record(api,'long',aFailed,t1);
  record(api,'retest-a',run('cns_a',['correct','correct','correct']),t2);
  const later = JSON.parse(JSON.stringify(aFailed));
  later.status.cns_b = {s:'weak',src:'direct'};
  later.answers.push({id:'cns_b',qid:'cns_b_q1',result:'wrong'},{id:'cns_b',qid:'cns_b_q2',result:'wrong'});
  record(api,'long',later,t3);
  assert.equal(api.statuses('child-a','science').cns_a.mark,'✓');
  assert.equal(api.statuses('child-a','science').cns_b.at,t3);
});

test('demo完全不写入，也不发进度更新事件', () => {
  const { api, storage, events } = load();
  assert.equal(record(api,'demo',run('cns_a',['wrong','wrong']),t1,{demo:true}),false);
  assert.equal(storage.size,0); assert.deepStrictEqual(events,[]);
});

test('新数据和删除孩子发cnm:progress；删除一个孩子保留其余孩子与访客', () => {
  const { api, events } = load();
  record(api,'a',run('cns_a',['wrong','wrong']));
  record(api,'b',run('cns_a',['correct','correct','correct']),t1,{childId:'child-b'});
  record(api,'g',run('cns_a',['wrong','correct']),t1,{childId:null});
  assert.equal(api.eraseChild('child-a'),true);
  assert.deepStrictEqual(Object.keys(api.statuses('child-a','science')),[]);
  assert.equal(api.statuses('child-b','science').cns_a.mark,'✓');
  assert.equal(api.statuses(null,'science').cns_a.mark,'×');
  assert.equal(events.length,4); assert.ok(events.every(t=>t==='cnm:progress'));
});

test('无实际作答佐证/推断状态不产生标记；未知学科、危险桶ID拒绝写入', () => {
  const { api, storage } = load();
  record(api,'unproven',{status:{cns_a:{s:'mastered',src:'direct'}},answers:[]});
  assert.deepStrictEqual(Object.keys(api.statuses('child-a','science')),[]);
  const s = run('cns_a',['wrong','wrong']);
  assert.equal(record(api,'x',s,t1,{childId:'__proto__'}),false);
  assert.equal(record(api,'x',s,t1,{subject:'math'}),false);
  assert.equal({}.polluted,undefined);
  assert.equal(api.statuses('constructor','science').cns_a,undefined);
});

test('损坏数据/读取失败不覆盖已有存储，quota失败保留原数据', () => {
  const broken = {[ 'cnmProgress.v1' ]:'{broken'};
  const { api, storage } = load(broken);
  assert.equal(record(api,'x',run('cns_a',['wrong','wrong'])),false);
  assert.equal(storage.get(api.KEY),'{broken');
  assert.deepStrictEqual(Object.keys(api.statuses('child-a','science')),[]);
  const denied = load({}, {failRead:true});
  assert.equal(record(denied.api,'x',run('cns_a',['wrong','wrong'])),false);
  const quota = load({}, {failWrite:true});
  assert.equal(record(quota.api,'x',run('cns_a',['wrong','wrong'])),false);
  assert.equal(quota.storage.size,0);
});

test('较长历史不会按run数量截断唯一较早点的标记', () => {
  const { api, storage } = load();
  record(api,'first',run('cns_b',['correct','correct','correct']));
  for (let i=0;i<160;i++) record(api,'a-'+i,run('cns_a',['wrong','wrong']),t2);
  assert.equal(JSON.parse(storage.get(api.KEY)).byChild['child-a'].runs.length,161);
  assert.equal(api.statuses('child-a','science').cns_b.mark,'✓');
});

test('历史迁移必须显式提供归属，records.mastered汇总不能直接变成✓', () => {
  const { api } = load();
  const s = run('cns_a',['correct','correct','correct']);
  assert.equal(api.migrateSession({subject:'science',key:'old',session:s,at:t1}),false);
  assert.equal(api.migrateSession({childId:null,subject:'science',key:'old',session:s,at:t1}),true);
  assert.equal(api.statuses(null,'science').cns_a.mark,'✓');
  assert.equal(api.recordSession({childId:'child-a',subject:'science',key:'summary',session:{mastered:['cns_a']}}),false);
});
console.log('\n'+passed+' passed, 0 failed');
