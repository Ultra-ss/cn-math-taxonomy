#!/usr/bin/env node
/* 科学／物理专版的数据、路由与本机记录回归测试；无第三方依赖。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const json = (name) => JSON.parse(read(name));
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok - ' + name);
}
function extractFunction(source, name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('function ' + nextName + '(', start);
  assert.ok(start >= 0 && end > start, name + ' must exist');
  return source.slice(start, end);
}
function localApi(file, globalName, entries) {
  const storage = new Map(Object.entries(entries || {}));
  const context = {
    window: {},
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.runInNewContext(read(file), context, { filename: file });
  return { api: context.window[globalName], storage };
}

const topics = json('data/topics.json');
const deps = json('data/dependencies.json');
const questions = json('data/questions.json');
const standards = json('data/cn-curriculum-standards.json').items;
const aliases = json('data/id-aliases.json').aliases;

test('数据只含科学和物理，数量与首页约定一致', () => {
  assert.equal(topics.length, 538);
  assert.equal(deps.length, 974);
  assert.equal(questions.length, 2152);
  assert.equal(standards.length, 225);
  for (const subject of ['science', 'physics']) {
    assert.equal(topics.filter(t => t.subject === subject).length, 269);
    assert.equal(questions.filter(q => (q.topicId.startsWith('cns_') ? 'science' : 'physics') === subject).length, 1076);
  }
  assert.ok(topics.every(t => t.subject === (t.id.startsWith('cns_') ? 'science' : t.id.startsWith('cnp_') ? 'physics' : 'invalid')));
  assert.ok(topics.every(t => !Object.prototype.hasOwnProperty.call(t, 'mathLinks')));
  assert.deepStrictEqual(aliases, {});
});

test('所有关系、题目和课标引用都指向保留数据', () => {
  const byId = new Map(topics.map(t => [t.id, t]));
  const stdIds = new Set(standards.map(s => s.id));
  assert.equal(stdIds.size, standards.length);
  assert.ok(standards.every(s => s.id.startsWith('css-') || s.id.startsWith('cps-')));
  for (const edge of deps) {
    const target = byId.get(edge.topicId);
    const pre = byId.get(edge.prerequisiteId);
    assert.ok(target && pre && target.subject === pre.subject, JSON.stringify(edge));
    assert.ok(edge.strength === 'hard' || edge.strength === 'soft');
  }
  const questionCount = new Map();
  for (const q of questions) {
    assert.ok(byId.has(q.topicId), q.id);
    assert.ok(q.id.startsWith(q.topicId + '_q'), q.id);
    questionCount.set(q.topicId, (questionCount.get(q.topicId) || 0) + 1);
  }
  for (const topic of topics) {
    assert.equal(questionCount.get(topic.id), 4, topic.id);
    assert.ok(topic.standards.length > 0, topic.id);
    topic.standards.forEach(ref => assert.ok(stdIds.has(ref.id), topic.id + ' -> ' + ref.id));
  }
});

test('图谱与诊断的旧学科 URL 都回退科学', () => {
  const exploreSource = read('explore/app.js');
  const exploreFn = extractFunction(exploreSource, 'readSubject', 'configureSubject');
  function exploreSubject(search, hash) {
    const context = {
      location: { search, pathname: '/explore/' },
      URLSearchParams,
      history: { replaceState() {} },
      readHash() { return hash || ''; }
    };
    vm.runInNewContext(exploreFn + '\nthis.result = readSubject();', context);
    return context.result;
  }
  assert.equal(exploreSubject('', ''), 'science');
  assert.equal(exploreSubject('?subject=physics', ''), 'physics');
  assert.equal(exploreSubject('?subject=math', ''), 'science');
  assert.equal(exploreSubject('', 'cnp_071'), 'physics');

  const diagnoseSource = read('diagnose/app.js');
  const diagnoseFn = extractFunction(diagnoseSource, 'detectSubject', 'applySubjectChrome');
  function diagnoseSubject(search) {
    const context = {
      location: { search, pathname: '/diagnose/', hash: '' },
      URLSearchParams,
      history: { replaceState() {} }
    };
    vm.runInNewContext(diagnoseFn + '\nthis.result = detectSubject();', context);
    return context.result;
  }
  assert.equal(diagnoseSubject(''), 'science');
  assert.equal(diagnoseSubject('?subject=physics'), 'physics');
  assert.equal(diagnoseSubject('?subject=math&target=cnm_221'), 'science');
  assert.equal(diagnoseSubject('?target=cnp_071'), 'physics');
});

test('整册诊断按学科取数，默认科学', () => {
  const engine = require('../diagnose/engine.js');
  const graph = engine.buildGraph(topics, deps, questions);
  const science = engine.gradeTargets(graph, '一上');
  const physics = engine.gradeTargets(graph, '八上', 'physics');
  assert.ok(science && science.ids.length === 15);
  assert.ok(science.ids.every(id => id.startsWith('cns_')));
  assert.ok(physics && physics.ids.length === 28);
  assert.ok(physics.ids.every(id => id.startsWith('cnp_')));
  assert.equal(engine.gradeTargets(graph, '八上'), null);
});

test('所有 HTML 导航只含两科，公开地址指向 physicalmap', () => {
  const pages = ['index.html', 'explore/index.html', 'diagnose/index.html', 'children/index.html', 'children/history.html', 'wrongbook/index.html', 'goods/index.html'];
  for (const page of pages) {
    const html = read(page);
    const subjects = Array.from(html.matchAll(/data-subject="([^"]+)"/g), match => match[1]);
    assert.ok(subjects.every(s => s === 'science' || s === 'physics'), page);
    assert.ok(!html.includes('math.pansgo.com'), page);
    assert.ok(!/subject=(?:math|chinese|english|morality|history|geography|biology|chemistry)/.test(html), page);
  }
  assert.ok(read('index.html').includes('默认是科学'));
  assert.ok(read('diagnose/share.js').includes('https://physicalmap.pages.dev/?from=share'));
  assert.ok(read('assets/pwa.js').includes('physicalmap.pages.dev'));
});

test('本机盲区不接受旧学科，再测链接带正确学科', () => {
  const { api } = localApi('assets/blindspots.js', 'CnmBlind');
  assert.equal(api.noteResult({ subject: 'math', weak: ['cnm_221'], roots: ['cnm_221'] }), false);
  assert.equal(api.noteResult({ subject: 'science', key: 's1', weak: ['cns_p001'], roots: ['cns_p001'], answers: [{ id: 'cns_p001', result: 'wrong' }] }), true);
  assert.equal(api.list().length, 1);
  assert.equal(api.list()[0].subject, 'science');
  assert.equal(api.diagnoseHref(['cnp_071']), 'diagnose/?subject=physics&target=cnp_071');
  assert.equal(api.diagnoseHref(['cnm_221'], 'math'), 'diagnose/?subject=science');
});

test('错题本仅保存并展示两科，旧记录不会混入', () => {
  const key = 'cnmWrong.v1';
  const legacy = { guest: [
    { qid: 'cnm_221_q1', topicId: 'cnm_221', subject: 'math' },
    { qid: 'cns_p001_q1', topicId: 'cns_p001', subject: 'science', ts: 1 },
    { qid: 'bad', topicId: 'cnm_001', subject: 'science', ts: 2 }
  ] };
  const { api } = localApi('assets/wrongbook.js', 'CnmWrong', { [key]: JSON.stringify(legacy) });
  assert.equal(api.count(), 1);
  assert.equal(api.list()[0].qid, 'cns_p001_q1');
  assert.equal(api.record({ qid: 'q-old', topicId: 'cnm_001', subject: 'math' }), false);
  assert.equal(api.record({ qid: 'cnp_071_q1', topicId: 'cnp_071', subject: 'physics', prompt: '测试', answer: '测试' }), true);
  assert.equal(api.count(), 2);
});

console.log('\n' + passed + ' passed');
