#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { build, ACCOUNT_ID } = require('../scripts/promotion-demo-data.js');
const Books = require('../assets/book-selection.js');
const AchievementBooks = require('../assets/achievement-books.js');
const topics = require('../data/topics.json');
const ROOT = path.resolve(__dirname, '..');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
function runtime(entries = {}) {
  const map = new Map(Object.entries(entries)), writes = [];
  const localStorage = {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { writes.push(key); map.set(key, value); },
    removeItem(key) { writes.push(key); map.delete(key); }
  };
  const window = { localStorage, navigator: {}, dispatchEvent() {} };
  const context = { window, localStorage, URLSearchParams, Date, Event: class Event {}, setTimeout, clearTimeout };
  for (const name of ['children', 'progress', 'avatar-rewards', 'last-location']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/' + name + '.js'), 'utf8'), context, { filename: name + '.js' });
  }
  return { map, writes, ...window };
}
const seed = build(topics);

test('纯生成器对两科给出确定的约90%通关数据，不修改输入，不生成浏览器全局', () => {
  const before = JSON.stringify(topics), priorStorage = global.localStorage;
  assert.deepStrictEqual(build(topics), seed);
  assert.equal(JSON.stringify(topics), before);
  assert.equal(global.localStorage, priorStorage);
  assert.equal(seed.version, 1);
  assert.equal(seed.accountId, ACCOUNT_ID);
  assert.equal(seed.summary.total, 538);
  assert.equal(seed.summary.passed, 484);
  assert.equal(seed.summary.completionPercent, 89.96);
  for (const subject of ['physics', 'science']) {
    assert.equal(seed.summary.subjects[subject].total, 269);
    assert.equal(seed.summary.subjects[subject].passed, 242);
  }
  assert.throws(() => build(topics, 'invalid-date'), /日期/);
  assert.throws(() => build([]), /每册/);
  assert.throws(() => build(topics.concat(topics[0])), /标识/);
});

test('现行档案、图谱进度和装扮模块接受数据，各册失败和未开始不混入完成度', () => {
  const app = runtime(seed.storage), P = app.CnmProgress;
  assert.ok(P.validateStore(JSON.parse(seed.storage[P.KEY])));
  assert.ok(app.CnmAvatarRewards.validateStore(JSON.parse(seed.storage[app.CnmAvatarRewards.KEY])));
  const child = app.CnmChildren.current();
  assert.equal(child.name, '图谱演示员');
  assert.equal(child.catId, 'cat-blue');
  assert.equal(child.id, ACCOUNT_ID);
  for (const subject of ['physics', 'science']) {
    const normal = P.statuses(ACCOUNT_ID, subject), pro = P.statuses(ACCOUNT_ID, subject, 'pro');
    assert.equal(Object.values(normal).filter(row => row.status === 'mastered').length, 242);
    const model = AchievementBooks.build({ topics, selection: app.CnmLastLocation.resume(topics, subject), normal, pro });
    assert.equal(model.books.length, Books.allowed(subject).length);
    assert.equal(model.completed, 242);
    for (const book of model.books) {
      const fixture = seed.summary.books.find(row => row.subject === subject && row.volume === book.volume);
      const bookTopics = topics.filter(topic => topic.subject === subject && AchievementBooks.bookOf(topic) === book.volume);
      assert.equal(book.completed, fixture.passed);
      assert.ok(bookTopics.some(topic => normal[topic.id] && normal[topic.id].status === 'weak'));
      assert.ok(bookTopics.some(topic => !normal[topic.id]));
      assert.equal(book.completed + fixture.failed + fixture.unstarted, book.total);
    }
  }
  assert.deepStrictEqual(app.writes, []);
});

test('初中具备专家/基础/失败/未开始四种示例，专家有先前普通通关与积分佐证', () => {
  const app = runtime(seed.storage), P = app.CnmProgress;
  const normal = P.statuses(ACCOUNT_ID, 'physics'), pro = P.statuses(ACCOUNT_ID, 'physics', 'pro');
  assert.equal(normal.cnp_053.status, 'mastered');
  assert.equal(pro.cnp_053.status, 'mastered');
  assert.equal(normal.cnp_054.status, 'mastered');
  assert.equal(pro.cnp_054, undefined);
  assert.equal(normal.cnp_055.status, 'weak');
  assert.equal(normal.cnp_056, undefined);
  assert.equal(seed.summary.focusTopicId, 'cnp_053');
  const achievement = P.achievements(ACCOUNT_ID);
  assert.equal(achievement.total, seed.summary.stars);
  assert.equal(achievement.normal, 484);
  assert.equal(achievement.pro, 42);
  for (const id of Object.keys(pro)) {
    const topic = topics.find(topic => topic.id === id);
    assert.ok([8, 9].includes(topic.grade));
    assert.equal(normal[id].status, 'mastered');
    assert.ok(Date.parse(achievement.earned.normal[id]) < Date.parse(achievement.earned.pro[id]));
  }
  assert.equal(Object.keys(P.statuses(ACCOUNT_ID, 'science', 'pro')).length, 0);
});

test('十套装扮各有完整9片，90次真实成本扣除后仍有余额，账号与访客不串数据', () => {
  const app = runtime(seed.storage), summary = app.CnmAvatarRewards.summary(ACCOUNT_ID);
  assert.equal(summary.ok, true);
  assert.equal(summary.equipped, 'skin-01');
  assert.equal(summary.catId, 'cat-blue');
  assert.equal(summary.totalStars, 526);
  assert.equal(summary.spentMoons, 90);
  assert.equal(summary.availableMoons, 85);
  for (const skin of Object.values(summary.collections)) {
    assert.equal(skin.unlocked, true);
    assert.deepEqual(Array.from(skin.pieces), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(skin.draws, 9);
  }
  assert.equal(app.CnmAvatarRewards.summary(null).spentMoons, 0);
  assert.equal(app.CnmAvatarRewards.summary('another-account').totalStars, 0);
  assert.equal(app.CnmProgress.achievements(null).total, 0);
  assert.deepStrictEqual(app.writes, []);
});

test('最近位置按学科指向合法通关点，完整教材范围和未开始语义与线上相同', () => {
  const app = runtime(seed.storage);
  for (const subject of ['physics', 'science']) {
    const record = app.CnmLastLocation.resume(topics, subject);
    assert.equal(record.subject, subject);
    assert.deepEqual(Array.from(record.volumes), Books.allowed(subject));
    assert.equal(app.CnmProgress.statuses(ACCOUNT_ID, subject)[record.topicId].status, 'mastered');
  }
  assert.equal(app.CnmLastLocation.resume(topics, 'physics').topicId, 'cnp_053');
  assert.equal(app.CnmChildren.latestStatus(ACCOUNT_ID, 'physics').cnp_055.status, 'weak');
  assert.equal(app.CnmChildren.latestStatus(ACCOUNT_ID, 'physics').cnp_056, undefined);
  assert.deepStrictEqual(app.writes, []);
});

test('虚拟记录可经现行完整备份真实往返，不改写生成器样本或增加积分/皮肤', () => {
  const app = runtime(seed.storage), before = Object.fromEntries(app.map);
  const backup = app.CnmChildren.exportBackup();
  assert.equal(backup.version, 2);
  assert.equal(backup.profiles.current, ACCOUNT_ID);
  assert.deepStrictEqual(Object.fromEntries(app.map), before);
  const fresh = runtime();
  const preview = fresh.CnmChildren.previewImport(backup);
  assert.deepStrictEqual(Object.fromEntries(fresh.map), {});
  fresh.CnmChildren.importBackup(backup, preview.token);
  assert.equal(fresh.CnmProgress.achievements(ACCOUNT_ID).total, 526);
  assert.equal(fresh.CnmAvatarRewards.summary(ACCOUNT_ID).availableMoons, 85);
  assert.equal(Object.values(fresh.CnmAvatarRewards.summary(ACCOUNT_ID).collections).filter(row => row.unlocked).length, 10);
  assert.deepEqual(Array.from(fresh.CnmChildren.bookSelection('physics').volumes), Books.allowed('physics'));
  const second = fresh.CnmChildren.exportBackup();
  assert.equal(JSON.stringify(second.learning.progress), JSON.stringify(backup.learning.progress));
  assert.equal(JSON.stringify(second.learning.avatarRewards), JSON.stringify(backup.learning.avatarRewards));
  assert.equal(JSON.stringify(second.records), JSON.stringify(backup.records));
  assert.deepStrictEqual(seed, build(topics));
});

console.log('test_promotion_demo_data: ' + passed + ' passed');
