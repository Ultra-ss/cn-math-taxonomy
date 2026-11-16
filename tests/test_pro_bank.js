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
assert.ok(Pro.validateBank(topics, base, bank), '实际专家题库必须满足运行时校验');
const junior = topics.filter(Pro.isJunior), graph = E.buildGraph(junior, [], bank);
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
