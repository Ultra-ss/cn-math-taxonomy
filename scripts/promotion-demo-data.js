#!/usr/bin/env node
/* 宣传分支专用的虚拟学习数据。纯生成器，不读取或写入浏览器存储。 */
'use strict';

const Books = require('../assets/book-selection.js');
const AchievementBooks = require('../assets/achievement-books.js');
const ACCOUNT_ID = 'promotion-demo';
const DEFAULT_NOW = '2026-11-18T12:00:00.000Z';
const LAST_KEY = 'cnmLastLocation.v1';

function build(topics, now = DEFAULT_NOW) {
  const time = Date.parse(now);
  if (!Number.isFinite(time)) throw new Error('演示数据日期无效。');
  if (!Array.isArray(topics)) throw new Error('缺少知识点数据。');
  const all = topics.filter(topic => topic && !topic.external && ['physics', 'science'].includes(topic.subject));
  const seen = new Set();
  for (const topic of all) {
    if (typeof topic.id !== 'string' || seen.has(topic.id) || !AchievementBooks.bookOf(topic)) throw new Error('知识点标识或教材信息无效。');
    seen.add(topic.id);
  }
  const at = days => new Date(time - days * 86400000).toISOString();
  const normalAt = at(14), expertAt = at(7), generatedAt = at(0);
  const runs = [], records = [], earned = { normal: {}, pro: {} }, books = [], subjects = {};
  for (const subject of ['physics', 'science']) {
    const groups = Books.allowed(subject).map(volume => ({
      subject, volume, topics: all.filter(topic => topic.subject === subject && AchievementBooks.bookOf(topic) === volume), misses: 2
    }));
    if (groups.some(group => group.topics.length < 3)) throw new Error('每册至少需要三个知识点才能展示不同状态。');
    const total = groups.reduce((sum, group) => sum + group.topics.length, 0);
    // 每科约 90% 通关；各册至少保留一个失败点和一个未开始点。
    const missTotal = Math.max(groups.length * 2, Math.round(total * 0.1));
    for (let remaining = missTotal - groups.length * 2; remaining > 0; remaining--) {
      const candidate = groups.reduce((best, group) =>
        group.topics.length * 0.1 - group.misses > best.topics.length * 0.1 - best.misses ? group : best);
      candidate.misses++;
    }
    const counts = subjects[subject] = { total, passed: 0, basic: 0, expert: 0, failed: 0, unstarted: 0 };
    groups.forEach((group, bookIndex) => {
      const total = group.topics.length, states = {}, expertStates = {}, mastered = [], weak = [], untested = [], proIds = [];
      // 九年级开头展示四种标记，方便录屏时直接看到完整的功能示例。
      const missing = group.volume === '九全' && group.misses >= 4
        ? [2, 3, ...Array.from({ length: group.misses - 2 }, (_, index) => total - group.misses + 2 + index)]
        : Array.from({ length: group.misses }, (_, index) => total - group.misses + index);
      const missState = new Map(missing.map((index, position) => [index, position % 2 === 0 ? 'weak' : 'unstarted']));
      group.topics.forEach((topic, index) => {
        const status = missState.get(index) || 'mastered';
        if (status === 'unstarted') { untested.push(topic.id); return; }
        states[topic.id] = { status, at: normalAt };
        if (status === 'weak') { weak.push(topic.id); return; }
        mastered.push(topic.id); earned.normal[topic.id] = normalAt;
        if (subject === 'physics' && [8, 9].includes(topic.grade) && index % 2 === 0) {
          expertStates[topic.id] = { status: 'mastered', at: expertAt };
          earned.pro[topic.id] = expertAt; proIds.push(topic.id);
        }
      });
      const title = AchievementBooks.titleOf(subject, group.volume), key = 'promotion-normal-' + subject + '-' + bookIndex;
      runs.push({ key, subject, at: normalAt, states });
      records.push({ key, subject, mode: 'textbook', volume: group.volume, label: title + ' · 演示记录',
        targets: group.topics.map(topic => topic.id), asked: mastered.length * 3 + weak.length * 2,
        mastered, weak, shaky: [], roots: weak.slice(),
        counts: { mastered: mastered.length, weak: weak.length, shaky: 0, untested: untested.length },
        savedAt: normalAt, updatedAt: normalAt });
      if (proIds.length) {
        const key = 'promotion-pro-' + bookIndex;
        runs.push({ key, subject, level: 'pro', at: expertAt, states: expertStates });
        records.push({ key, subject, level: 'pro', mode: 'textbook', volume: group.volume,
          label: title + ' · 专家演示记录', targets: proIds.slice(), asked: proIds.length * 3,
          mastered: proIds.slice(), weak: [], shaky: [], roots: [],
          counts: { mastered: proIds.length, weak: 0, shaky: 0, untested: 0 }, savedAt: expertAt, updatedAt: expertAt });
      }
      const row = { subject, volume: group.volume, title, total, passed: mastered.length,
        basic: mastered.length - proIds.length, expert: proIds.length, failed: weak.length, unstarted: untested.length };
      books.push(row);
      for (const field of ['passed', 'basic', 'expert', 'failed', 'unstarted']) counts[field] += row[field];
    });
    counts.completionPercent = Number((counts.passed / counts.total * 100).toFixed(2));
  }

  const profile = { id: ACCOUNT_ID, name: '图谱演示员', grade: '九年级', textbook: '人教版', catId: 'cat-blue', createdAt: at(180) };
  const selections = {};
  ['physics', 'science'].forEach(subject => { selections[subject] = { volumes: Books.allowed(subject), at: at(1) }; });
  const draws = [];
  for (let skinIndex = 1; skinIndex <= 10; skinIndex++) {
    const skinId = 'skin-' + String(skinIndex).padStart(2, '0');
    for (let piece = 0; piece < 9; piece++) draws.push({ id: 'promotion-' + skinId + '-' + piece,
      skinId, piece, cost: 1, at: new Date(time - 6 * 86400000 + draws.length * 1000).toISOString() });
  }
  const values = {
    'cnmChildren.v1': { v: 1, current: ACCOUNT_ID, children: [profile], bookSelections: { [ACCOUNT_ID]: selections } },
    'cnmChildren.records.v1': { [ACCOUNT_ID]: records.sort((a, b) => b.savedAt.localeCompare(a.savedAt)) },
    'cnmProgress.v1': { v: 1, byChild: { [ACCOUNT_ID]: { runs, earned } } },
    'cnmAvatarRewards.v1': { v: 1, byOwner: { [ACCOUNT_ID]: { draws, equipped: 'skin-01', equippedAt: at(5), catId: 'cat-blue', catAt: at(180) } } }
  };
  const focusTopic = all.find(topic => topic.id === 'cnp_053' && earned.pro[topic.id]) ||
    all.find(topic => topic.subject === 'physics' && earned.pro[topic.id]);
  const scienceFocus = all.find(topic => topic.subject === 'science' && earned.normal[topic.id]);
  if (!focusTopic || !scienceFocus) throw new Error('演示知识点缺少专家或科学通关样例。');
  ['physics', 'science'].forEach(subject => {
    const topic = subject === 'physics' ? focusTopic : scienceFocus;
    const location = { v: 1, subject, volume: '', volumes: Books.allowed(subject), topicId: topic.id,
      view: 'book', depth: 2, at: new Date(time - (subject === 'physics' ? 1 : 2) * 3600000).toISOString() };
    values[LAST_KEY + '.learning.' + ACCOUNT_ID + '.' + subject] = location;
    values[LAST_KEY + '.account.' + ACCOUNT_ID + '.' + subject] = location;
    if (subject === 'physics') {
      values[LAST_KEY + '.learning.' + ACCOUNT_ID] = location;
      values[LAST_KEY + '.account.' + ACCOUNT_ID] = location;
    }
  });
  const stars = Object.keys(earned.normal).length + Object.keys(earned.pro).length;
  return { version: 1, generatedAt, accountId: ACCOUNT_ID,
    storage: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)])),
    summary: { total: all.length, passed: subjects.physics.passed + subjects.science.passed,
      completionPercent: Number(((subjects.physics.passed + subjects.science.passed) / all.length * 100).toFixed(2)),
      subjects, books, skins: 10, stars, totalMoons: Math.floor(stars / 3), spentMoons: 90,
      availableMoons: Math.max(0, Math.floor(stars / 3) - 90), focusTopicId: focusTopic.id, focusVolume: AchievementBooks.bookOf(focusTopic), focusSubject: 'physics' }
  };
}

module.exports = { ACCOUNT_ID, DEFAULT_NOW, build };

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const output = path.resolve(process.argv[2] || path.join(__dirname, '../demo/seed.json'));
  const topics = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/topics.json'), 'utf8'));
  const data = build(topics);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
  process.stdout.write(JSON.stringify(data.summary, null, 2) + '\n');
}
