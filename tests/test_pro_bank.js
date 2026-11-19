#!/usr/bin/env node
/* 用真正的独立题库逐点答题与回放，防止专家题缺题、混用普通题或错误判题。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../diagnose/engine.js');
const Pro = require('../diagnose/pro-challenge.js');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', name), 'utf8'));
const topics = read('topics.json'), base = read('questions.json'), bank = read('questions-pro.json');
const junior = topics.filter(Pro.isJunior), graph = E.buildGraph(junior, [], bank);
assert.ok(Pro.validateBank(junior, base, bank), '原初中专家题库必须满足运行时校验');
const used = new Set();
for (const topic of junior) {
  let run = E.createSession(graph, [topic.id], {mode:'target', confirm:4, seed:'pro-bank-coverage'});
  for (let i=0; i<4; i++) {
    const item = E.nextItem(graph, run);
    assert.ok(item, topic.id+' 第 '+(i+1)+' 题缺失');
    const q = item.question;
    assert.equal(q.topicId, topic.id, '不跳到其他知识点');
    assert.ok(Number(q.id.split('_q')[1])>=101, '只用专家题号');
    assert.equal(E.judgeQuestion(q, q.answer).verdict, 'correct', q.id+' 参考答案应可直接自动判对');
    assert.ok(!used.has(q.id), q.id+' 不重复出题'); used.add(q.id);
    run = E.applyAnswer(graph, run, topic.id, 'correct', {pin:true,qid:q.id,text:q.answer});
  }
  assert.equal(E.nextItem(graph, run), null);
  assert.equal(E.statusOf(run, topic.id), 'mastered');
  assert.deepEqual(Object.keys(run.status), [topic.id], '专家通过不推断其他点');
  assert.ok(run.answers.every(answer=>bank.some(q=>q.id===answer.qid && q.topicId===topic.id)), '记录保留真实专家题号');
  const replayed = E.replay(graph, [topic.id], run.answers, {mode:'target',confirm:4,seed:run.seed});
  assert.equal(E.statusOf(replayed, topic.id), 'mastered', '专家题号应支持刷新回放');
  assert.deepEqual(replayed.answers.map(answer=>answer.qid), run.answers.map(answer=>answer.qid));
  let failed = E.createSession(graph, [topic.id], {mode:'target',confirm:4,seed:'pro-bank-failure'});
  failed = E.applyAnswer(graph, failed, topic.id, 'wrong');
  failed = E.applyAnswer(graph, failed, topic.id, 'wrong');
  assert.equal(E.statusOf(failed, topic.id), 'weak', '连续错题不应通过');
  assert.equal(E.nextItem(graph, failed), null, '专家失败不调用普通关联点题库');
}
assert.equal(used.size, bank.length, '全部专家题在每点四题检测中均可实际使用');
console.log('test_pro_bank: '+junior.length+' topics, '+used.size+' actual questions: judging, pass, failure and replay passed');

// 编译后的实际按点题包必须覆盖小学、初中、高中；缺失文件直接失败，不绕过新增题库。
const crypto = require('crypto');
const manifest = read('pro-manifest.json');
const supported = topics.filter(Pro.isSupported), ordinaryIds = new Set(base.map(q=>q.id));
assert.equal(manifest.v, 1); assert.equal(manifest.level, 'pro');
assert.equal(manifest.topics, supported.length); assert.equal(supported.length, 538);
assert.equal(manifest.minimumPerTopic, 3);
assert.deepEqual(Object.keys(manifest.chunks).sort(), supported.map(t=>t.id).sort());
let total = 0, bytes = 0, smallest = Infinity;
const allIds = new Set();
for (const topic of supported) {
  const entry = manifest.chunks[topic.id], expectedPath = 'pro/'+topic.id+'.json';
  assert.equal(entry.file, expectedPath);
  const raw = fs.readFileSync(path.join(__dirname, '../data', expectedPath));
  assert.equal(raw.length, entry.bytes); assert.ok(raw.length <= 32768, '每次题包限制在32KiB内');
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), entry.sha256);
  const questions = JSON.parse(raw), need = Pro.isJunior(topic) ? 4 : 3;
  assert.equal(entry.questions, questions.length);
  assert.ok(Pro.validateBank([topic], null, questions), topic.id+' 实际题包未通过严格校验');
  assert.ok(questions.length >= need, topic.id+' 缺专家题');
  const graph = E.buildGraph([topic], [], questions);
  assert.deepEqual(Object.keys(graph.bank), [topic.id], '当前挑战不能生成其他点的普通fallback题');
  for (const q of questions) {
    assert.ok(!ordinaryIds.has(q.id), q.id+' 与普通题隔离');
    assert.ok(!allIds.has(q.id), q.id+' 跨题包ID唯一'); allIds.add(q.id);
    assert.equal(E.judgeQuestion(q, q.answer).verdict, 'correct', q.id+' 参考答案可自动判对');
    if (q.type==='choice') {
      const distractor=q.choices.find(choice=>choice.key!==q.answer);
      assert.equal(E.judgeQuestion(q,distractor.key).verdict,'wrong',q.id+' 干扰选项不能判对');
    }
  }
  let run=E.createSession(graph,[topic.id],{mode:'target',confirm:4,seed:'all-stage-pro-pass'});
  while(E.nextItem(graph,run)) {
    const item=E.nextItem(graph,run);
    assert.equal(item.topicId,topic.id); assert.ok(questions.some(q=>q.id===item.question.id));
    run=E.applyAnswer(graph,run,topic.id,'correct',{pin:true,qid:item.question.id,text:item.question.answer});
    assert.ok(run.answers.length<=4,'不可借普通题补足专家题数');
  }
  assert.equal(run.answers.length,Math.min(4,questions.length));
  assert.equal(E.statusOf(run,topic.id),'mastered');
  assert.deepEqual(Object.keys(run.status),[topic.id]);
  assert.ok(Pro.validAnswers(graph,{targets:[topic.id],answers:run.answers}));
  const replay=E.replay(graph,[topic.id],run.answers,{mode:'target',confirm:4,seed:run.seed});
  assert.equal(E.statusOf(replay,topic.id),'mastered');
  assert.deepEqual(replay.answers.map(a=>a.qid),run.answers.map(a=>a.qid));
  let failed=E.createSession(graph,[topic.id],{mode:'target',confirm:4,seed:'all-stage-pro-fail'});
  failed=E.applyAnswer(graph,failed,topic.id,'wrong'); failed=E.applyAnswer(graph,failed,topic.id,'wrong');
  assert.equal(E.statusOf(failed,topic.id),'weak'); assert.equal(E.nextItem(graph,failed),null);
  total+=questions.length; bytes+=raw.length; smallest=Math.min(smallest,questions.length);
}
assert.equal(total, manifest.questions); assert.equal(bytes, manifest.bytes); assert.ok(smallest>=3);
assert.equal(total, allIds.size);
console.log('test_pro_bank: '+supported.length+' compiled topic chunks, '+total+' actual expert questions: coverage, isolation, judging, 3/4-question pass, failure and replay passed');
