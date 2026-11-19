#!/usr/bin/env node
/* 档案备份恢复测试：node tests/test_children.js（无依赖，不访问真实浏览器存储）。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/children.js'), 'utf8');
const PROFILE_KEY = 'cnmChildren.v1';
const RECORD_KEY = 'cnmChildren.records.v1';
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log('  ok   ' + name);
}

function load(entries, failKey, options = {}) {
  const storage = new Map(Object.entries(entries || {}));
  const writes = [];
  const context = {
    window: {},
    localStorage: {
      getItem(key) {
        if (key === failKey) throw new Error('Storage access denied');
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        writes.push(key);
        if (options.failWrite && options.failWrite(key, value)) throw new Error('QuotaExceededError');
        storage.set(key, value);
      },
      removeItem(key) { storage.delete(key); }
    }
  };
  vm.runInNewContext(source, context, { filename: 'assets/children.js' });
  return { api: context.window.CnmChildren, storage, writes };
}

function exported(api) { return JSON.parse(JSON.stringify(api.exportBackup())); }
const profiles = {
  v: 1, current: 'child-b', children: [
    { id: 'child-a', name: '小满', grade: '三年级', textbook: '人教版', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'child-b', name: '小禾', grade: '五年级', textbook: '教科版', createdAt: '2026-10-02T00:00:00.000Z' }
  ]
};
const records = {
  'child-a': ['science', 'physics'].map((subject, i) => ({
    key: subject + '|seed|target', subject, label: '测试范围 ' + i, mode: 'target', asked: 8,
    targets: [(subject === 'science' ? 'cns_' : 'cnp_') + 't' + i], counts: { weak: 1, shaky: 1, mastered: 1, untested: 2 },
    weak: [(subject === 'science' ? 'cns_' : 'cnp_') + 'w' + i], roots: [(subject === 'science' ? 'cns_' : 'cnp_') + 'w' + i], shaky: [(subject === 'science' ? 'cns_' : 'cnp_') + 's' + i], mastered: [(subject === 'science' ? 'cns_' : 'cnp_') + 'm' + i],
    savedAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z'
  })),
  'child-b': [{ key: 'screen|seed|targets', subject: 'science', mode: 'screen', targets: null, weak: [], savedAt: '2026-10-20T00:00:00.000Z' }]
};
function fixture() {
  return { [PROFILE_KEY]: JSON.stringify(profiles), [RECORD_KEY]: JSON.stringify(records) };
}
function fixedProfiles(value, cats = {}) {
  const out = JSON.parse(JSON.stringify(value));
  for (const child of out.children) child.catId = child.catId || cats[child.id] || 'cat-snow';
  return out;
}

test('档案仅显示科学物理，已移除学科不能写入记录', () => {
  const { api, storage } = load(fixture());
  assert.equal(api.saveRecord('child-a', { key: 'legacy', subject: 'chinese' }), false);
  assert.equal(api.recordsOf('child-a').length, 2);
  assert.equal(api.latestStatus('child-a', 'science')['cns_w0'].status, 'weak');
  assert.equal(api.latestStatus('child-a', 'physics')['cns_w0'], undefined);
});

test('导出包含全部孩子、当前孩子和科学和物理完整历史，并带备份版本和时间', () => {
  const { api } = load(fixture());
  const before = Date.now();
  const backup = exported(api);
  assert.equal(backup.format, 'cn-math-taxonomy.children');
  assert.equal(backup.version, 2);
  assert.ok(Date.parse(backup.exportedAt) >= before && Date.parse(backup.exportedAt) <= Date.now());
  assert.deepStrictEqual(backup.profiles, fixedProfiles(profiles));
  assert.deepStrictEqual(backup.records, records);
});

test('导出不改写存储、当前孩子或记录时间', () => {
  const entries = fixture();
  const { api, storage, writes } = load(entries);
  api.exportBackup();
  assert.deepStrictEqual(Object.fromEntries(storage), entries);
  assert.deepStrictEqual(writes, []);
});

test('保留未选择当前孩子、未知扩展字段和超过 40 条的已存历史', () => {
  const entries = fixture();
  const extraProfiles = { ...profiles, current: null, futureMetadata: { note: '保留' } };
  const extraRecords = { 'child-a': Array.from({ length: 45 }, (_, i) => ({ ...records['child-a'][0], key: 'record-' + i, extra: i })) };
  entries[PROFILE_KEY] = JSON.stringify(extraProfiles);
  entries[RECORD_KEY] = JSON.stringify(extraRecords);
  const backup = exported(load(entries).api);
  assert.deepStrictEqual(backup.profiles, fixedProfiles(extraProfiles));
  assert.deepStrictEqual(backup.records, extraRecords);
});

test('有孩子但没有检测记录时仍能备份资料', () => {
  const backup = exported(load({ [PROFILE_KEY]: JSON.stringify(profiles) }).api);
  assert.deepStrictEqual(backup.profiles, fixedProfiles(profiles));
  assert.deepStrictEqual(backup.records, {});
});

test('导出两科学习数据，不混入旧学科会话、统计或其他站点存储', () => {
  const entries = { ...fixture(), unrelated: 'private', 'cnmDiagnose.session.v2': '{"seed":"x"}', 'cnmStats.v1': '{}' };
  const backup = exported(load(entries).api);
  assert.deepStrictEqual(Object.keys(backup).sort(), ['exportedAt', 'format', 'learning', 'profiles', 'records', 'version']);
  assert.ok(!JSON.stringify(backup).includes('private'));
});

test('每次读取最新数据，修改导出快照不会污染已存档案', () => {
  const { api, storage } = load(fixture());
  const backup = api.exportBackup();
  backup.profiles.children[0].name = '修改快照';
  backup.records['child-a'][0].weak.push('extra');
  assert.deepStrictEqual(exported(api).profiles, fixedProfiles(profiles));
  assert.deepStrictEqual(exported(api).records, records);
  const next = { ...profiles, current: 'child-a' };
  storage.set(PROFILE_KEY, JSON.stringify(next));
  assert.deepStrictEqual(exported(api).profiles, fixedProfiles(next));
});

test('没有孩子时不生成无意义的空备份', () => {
  assert.throws(() => load().api.exportBackup(), /还没有可导出/);
  assert.throws(() => load({ [PROFILE_KEY]: '{"v":1,"current":null,"children":[]}' }).api.exportBackup(), /还没有可导出/);
});

test('读取任一存储键失败时报告错误，不使用空数据兜底', () => {
  for (const key of [PROFILE_KEY, RECORD_KEY]) {
    const { api, writes } = load(fixture(), key);
    assert.throws(() => api.exportBackup(), /无法读取本机档案或学习数据/);
    assert.deepStrictEqual(writes, []);
  }
});

test('任一 JSON 损坏时拒绝生成部分备份', () => {
  for (const key of [PROFILE_KEY, RECORD_KEY]) {
    assert.throws(() => load({ ...fixture(), [key]: '{broken' }).api.exportBackup(), /无法读取本机档案或学习数据/);
  }
});

test('拒绝异常结构，避免静默丢失档案或历史', () => {
  for (const value of [null, [], {}, { children: [null] }, { children: [{ id: '' }] }]) {
    assert.throws(() => load({ ...fixture(), [PROFILE_KEY]: JSON.stringify(value) }).api.exportBackup(), /数据格式|资料不完整|没有对应/);
  }
  for (const value of [null, [], 'bad', { 'child-a': {} }]) {
    assert.throws(() => load({ ...fixture(), [RECORD_KEY]: JSON.stringify(value) }).api.exportBackup(), /数据格式|资料不完整|没有对应/);
  }
});

function backup() { return exported(load(fixture()).api); }
function importInto(api, data) { return api.importBackup(data, api.previewImport(data).token); }
function stored(storage, key) { return JSON.parse(storage.get(key)); }

test('新浏览器完整恢复多孩子、当前孩子与科学和物理历史，弱点汇总仍可用', () => {
  const data = backup();
  const { api, storage } = load();
  const result = importInto(api, api.parseBackup(JSON.stringify(data)));
  assert.equal(result.addedChildren, 2);
  assert.equal(result.addedRecords, 3);
  assert.deepStrictEqual(stored(storage, PROFILE_KEY), fixedProfiles(profiles));
  assert.deepStrictEqual(stored(storage, RECORD_KEY), records);
  assert.equal(api.current().id, 'child-b');
  assert.equal(api.latestStatus('child-a', 'science')['cns_w0'].status, 'weak');
  assert.equal(api.latestStatus('child-a', 'science')['cns_w0'].root, true);
});

test('预览和取消前不写入本机存储', () => {
  const { api, storage, writes } = load(fixture());
  const before = Object.fromEntries(storage);
  const preview = api.previewImport(backup());
  assert.equal(preview.matchedChildren, 2);
  assert.equal(preview.addedRecords, 0);
  assert.deepStrictEqual(writes, []);
  assert.deepStrictEqual(Object.fromEntries(storage), before);
});

test('重复导入同一备份不会复制档案或历史，原始时间不变', () => {
  const { api, storage } = load(fixture());
  importInto(api, backup());
  const before = Object.fromEntries(storage);
  importInto(api, backup());
  assert.deepStrictEqual(Object.fromEntries(storage), before);
});

test('合并保留本机资料和当前选择，旧记录保留，新记录加入，同键取较新结果', () => {
  const localProfiles = { ...profiles, current: 'child-a', children: [{ ...profiles.children[0], grade: '六年级' }] };
  const localRecords = { 'child-a': [
    { ...records['child-a'][0], updatedAt: '2026-10-26T00:00:00.000Z', label: '本机较新' },
    { ...records['child-a'][1], updatedAt: '2026-10-19T00:00:00.000Z', label: '本机较旧' },
    { ...records['child-a'][0], key: 'local-only', label: '仅本机' }
  ] };
  const { api, storage } = load({ [PROFILE_KEY]: JSON.stringify(localProfiles), [RECORD_KEY]: JSON.stringify(localRecords) });
  const result = importInto(api, backup());
  const outProfiles = stored(storage, PROFILE_KEY);
  const outRecords = stored(storage, RECORD_KEY);
  assert.equal(outProfiles.current, 'child-a');
  assert.equal(outProfiles.children[0].grade, '六年级');
  assert.equal(outRecords['child-a'].length, 3);
  assert.equal(outRecords['child-a'].find(r => r.key === records['child-a'][0].key).label, '本机较新');
  assert.equal(outRecords['child-a'].find(r => r.key === records['child-a'][1].key).label, records['child-a'][1].label);
  assert.ok(outRecords['child-a'].find(r => r.key === 'local-only'));
  assert.equal(result.addedChildren, 1);
  assert.equal(result.updatedRecords, 1);
});

test('同一条记录时间相同则保留本机结果', () => {
  const data = backup();
  data.records['child-a'][0].label = '备份不同结果';
  const { api, storage } = load(fixture());
  importInto(api, data);
  assert.equal(stored(storage, RECORD_KEY)['child-a'][0].label, records['child-a'][0].label);
});

test('本机明确选择不保存到档案时，导入不改变当前选择', () => {
  const entries = fixture();
  entries[PROFILE_KEY] = JSON.stringify({ ...profiles, current: null });
  const { api, storage } = load(entries);
  importInto(api, backup());
  assert.equal(stored(storage, PROFILE_KEY).current, null);
});

test('同名不同 ID 保留两人并自动改名，反复导入仍按 ID 合并', () => {
  const data = backup();
  data.profiles.children = [{ ...profiles.children[1], name: profiles.children[0].name }];
  data.records = { 'child-b': records['child-b'] };
  const entries = { [PROFILE_KEY]: JSON.stringify({ ...profiles, current: 'child-a', children: [profiles.children[0]] }) };
  const { api, storage } = load(entries);
  const preview = api.previewImport(data);
  assert.equal(preview.renamedChildren, 1);
  assert.equal(preview.children[0].name, '小满（导入）');
  importInto(api, data);
  const first = Object.fromEntries(storage);
  importInto(api, data);
  assert.deepStrictEqual(Object.fromEntries(storage), first);
  assert.deepStrictEqual(stored(storage, PROFILE_KEY).children.map(c => c.id), ['child-a', 'child-b']);
});

test('自动改名不会占用其他待导入孩子的原名，昵称仍不超过 12 字', () => {
  const name = '一二三四五六七八九十甲乙';
  const data = backup();
  data.profiles.children[0].name = name;
  data.profiles.children[1].name = name.slice(0, 8) + '（导入）';
  const localProfiles = { ...profiles, current: 'local', children: [{ ...profiles.children[0], id: 'local', name }] };
  const { api } = load({ [PROFILE_KEY]: JSON.stringify(localProfiles) });
  const preview = api.previewImport(data);
  const names = preview.children.map(c => c.name);
  assert.ok(names[0].length <= 12);
  assert.notEqual(names[0], names[1]);
  assert.equal(names[1], data.profiles.children[1].name);
});

test('合并超过 8 个孩子时拒绝导入，原数据不变', () => {
  const children = Array.from({ length: 8 }, (_, i) => ({ ...profiles.children[0], id: 'local-' + i, name: '孩子' + i }));
  const entries = { [PROFILE_KEY]: JSON.stringify({ v: 1, current: null, children }) };
  const { api, storage, writes } = load(entries);
  assert.throws(() => api.previewImport(backup()), /超过 8/);
  assert.deepStrictEqual(Object.fromEntries(storage), entries);
  assert.deepStrictEqual(writes, []);
});

test('合并保留 80 条历史，之后保存和移动记录也不会批量截断', () => {
  const makeRecords = prefix => Array.from({ length: 40 }, (_, i) => ({ ...records['child-a'][0], key: prefix + i }));
  const data = backup();
  data.records['child-a'] = makeRecords('import-');
  const entries = { [PROFILE_KEY]: JSON.stringify(profiles), [RECORD_KEY]: JSON.stringify({ 'child-a': makeRecords('local-') }) };
  const { api, storage } = load(entries);
  importInto(api, data);
  assert.equal(stored(storage, RECORD_KEY)['child-a'].length, 80);
  api.saveRecord('child-a', { key: 'new-run', subject: 'science' });
  assert.equal(stored(storage, RECORD_KEY)['child-a'].length, 81);
  api.moveRecord(records['child-b'][0].key, 'child-b', 'child-a');
  assert.equal(stored(storage, RECORD_KEY)['child-a'].length, 82);
});

test('普通档案新增检测仍保持原有最近 40 条规则', () => {
  const { api, storage } = load({ [PROFILE_KEY]: JSON.stringify(profiles) });
  for (let i = 0; i < 41; i++) api.saveRecord('child-a', { key: 'run-' + i, subject: 'science' });
  assert.equal(stored(storage, RECORD_KEY)['child-a'].length, 40);
});

test('合并保留扩展字段，且不会写入会话、设置或统计', () => {
  const data = backup();
  data.profiles.extension = { note: '扩展资料' };
  data.profiles.children[0].custom = { data: [1, 2] };
  data.records['child-a'][0].custom = '扩展记录';
  const { api, storage, writes } = load({ 'cnmDiagnose.session.v2': '{"seed":"local"}' });
  importInto(api, data);
  assert.deepStrictEqual(stored(storage, PROFILE_KEY), data.profiles);
  assert.deepStrictEqual(stored(storage, RECORD_KEY), data.records);
  assert.equal(storage.get('cnmDiagnose.session.v2'), '{"seed":"local"}');
  assert.deepStrictEqual(writes, [RECORD_KEY, PROFILE_KEY]);
});

test('预览后其他页面改变档案时停止写入，必须重新预览', () => {
  const { api, storage, writes } = load(fixture());
  const data = backup();
  const preview = api.previewImport(data);
  storage.set(PROFILE_KEY, JSON.stringify({ ...profiles, current: 'child-a' }));
  assert.throws(() => api.importBackup(data, preview.token), /已发生变化/);
  assert.equal(stored(storage, PROFILE_KEY).current, 'child-a');
  assert.deepStrictEqual(writes, []);
  importInto(api, data);
  assert.equal(stored(storage, PROFILE_KEY).current, 'child-a');
});

test('未预览的调用不能直接写入备份', () => {
  const { api, writes } = load(fixture());
  assert.throws(() => api.importBackup(backup()), /重新预览/);
  assert.deepStrictEqual(writes, []);
});

test('本机存储读取失败或已损坏时不把它当成空浏览器', () => {
  for (const key of [PROFILE_KEY, RECORD_KEY]) {
    const { api, writes } = load(fixture(), key);
    assert.throws(() => api.previewImport(backup()), /无法读取本机档案/);
    assert.deepStrictEqual(writes, []);
    const broken = load({ ...fixture(), [key]: '{broken' });
    assert.throws(() => broken.api.previewImport(backup()), /无法读取本机档案/);
    assert.deepStrictEqual(broken.writes, []);
  }
});

test('第一步写入失败时原档案和记录不变', () => {
  const entries = fixture();
  entries[RECORD_KEY] = JSON.stringify(records, null, 2);
  const { api, storage } = load(entries, null, { failWrite: key => key === RECORD_KEY });
  assert.throws(() => importInto(api, backup()), /原有档案和学习数据未改变/);
  assert.deepStrictEqual(Object.fromEntries(storage), entries);
});

test('第二步写入失败时回滚原记录，保留原始存储字节', () => {
  const entries = fixture();
  entries[RECORD_KEY] = JSON.stringify(records, null, 2);
  entries[PROFILE_KEY] = JSON.stringify(profiles, null, 2);
  const { api, storage } = load(entries, null, { failWrite: key => key === PROFILE_KEY });
  const data = backup(); data.records['child-a'][0].updatedAt = '2026-10-28T00:00:00.000Z';
  assert.throws(() => importInto(api, data), /原有档案和学习数据未改变/);
  assert.deepStrictEqual(Object.fromEntries(storage), entries);
});

test('空浏览器写入失败时回滚到没有存储键的状态', () => {
  const { api, storage } = load({}, null, { failWrite: key => key === PROFILE_KEY });
  assert.throws(() => importInto(api, backup()), /原有档案和学习数据未改变/);
  assert.equal(storage.size, 0);
});

test('回滚也失败时明确提示恢复失败，不报告成功或数据未改变', () => {
  let calls = 0;
  const entries = { [PROFILE_KEY]: JSON.stringify(profiles, null, 2), [RECORD_KEY]: JSON.stringify(records, null, 2) };
  const { api } = load(entries, null, { failWrite: () => ++calls > 1 });
  assert.throws(() => importInto(api, backup()), /原数据恢复失败/);
});

test('拒绝错误文件、未知版本、重复 ID 和无归属记录', () => {
  const cases = [
    data => { data.format = 'diagnosis'; },
    data => { data.version = 3; },
    data => { data.profiles.v = 2; },
    data => { data.exportedAt = 'bad'; },
    data => { data.profiles.children[1].id = data.profiles.children[0].id; },
    data => { data.profiles.current = 'missing'; },
    data => { data.records.orphan = []; },
    data => { data.records['child-a'].push(data.records['child-a'][0]); },
    data => { data.records['child-a'][0].weak = 'wrong'; },
    data => { data.records['child-a'][0].counts.weak = -1; },
    data => { data.records['child-a'][0].savedAt = 'bad'; },
    data => { data.profiles.children[0].grade = '不存在的年级'; }
  ];
  for (const mutate of cases) {
    const data = backup(); mutate(data);
    const { api, writes } = load(fixture());
    assert.throws(() => api.parseBackup(JSON.stringify(data)));
    assert.deepStrictEqual(writes, []);
  }
});

test('拒绝危险对象键与超大文件，支持 UTF-8 BOM', () => {
  const { api } = load();
  const data = backup();
  const json = JSON.stringify(data);
  assert.equal(api.parseBackup('\uFEFF' + json).format, data.format);
  assert.throws(() => api.parseBackup('{broken'), /有效的 JSON/);
  assert.throws(() => api.parseBackup(' '.repeat(api.MAX_BACKUP_BYTES + 1)), /10 MB/);
  const unsafe = json.replace('"profiles":{', '"profiles":{"__proto__":{"polluted":true},');
  assert.throws(() => api.parseBackup(unsafe), /不允许/);
  assert.equal({}.polluted, undefined);
});

test('科学学科的检测记录可以备份和恢复', () => {
  const data = backup();
  data.records['child-b'] = data.records['child-b'].concat([{ key: 'science|seed|target', subject: 'science', mode: 'target', targets: ['cns_p001'], weak: [], savedAt: '2026-10-22T00:00:00.000Z' }]);
  const { api, storage } = load();
  importInto(api, api.parseBackup(JSON.stringify(data)));
  assert.ok(stored(storage, RECORD_KEY)['child-b'].some((r) => r.subject === 'science'));
});

const WRONG_KEY = 'cnmWrong.v1';
const BLIND_KEY = 'cnmBlind.local.v1';
const ARCHIVE_KEY = 'cnmDiagnose.archived.v1';
const PROGRESS_KEY = 'cnmProgress.v1';
const SCI_SESSION = 'cnsDiagnose.session.v1';
const PHY_SESSION = 'cnpDiagnose.session.v2';
function session(subject = 'science', seed = 'run-a') {
  const topic = subject === 'science' ? 'cns_p001' : 'cnp_001';
  return {
    v: 2, mode: 'target', targets: [topic], limit: 20, confirm: 3, label: '测试进度', seed,
    answers: [{ id: topic, qid: topic + '_q1', result: 'wrong', prompt: '测试题干', text: 'B' }],
    excluded: [], avoid: [], savedAt: '2026-11-15T00:00:00.000Z'
  };
}
function wrong(topic = 'cns_p001', ts = 1762000000000, count = 2) {
  return { qid: topic + '_q1', topicId: topic, subject: topic.startsWith('cns_') ? 'science' : 'physics',
    topic: '测试知识点', prompt: '测试题干', answer: 'A', choices: [{ key: 'A', text: '正确答案' }],
    chosen: 'B', explanation: '解析', kind: 'wrong', ts, count };
}
function blind(id = 'cns_p001', status = 'weak', lastAt = '2026-11-14T00:00:00.000Z', wrongs = 3) {
  return { id, subject: id.startsWith('cns_') ? 'science' : 'physics', status, root: status === 'weak',
    hits: 2, wrongs, lastAt, lastLabel: '测试检测', lastKey: 'science|run-a|cns_p001' };
}
function progressRun(key = 'science|run-a|cns_p001', status = 'mastered', at = '2026-11-15T00:00:00.000Z') {
  return { key, subject: 'science', at, states: { cns_p001: { status, at } } };
}
function learningFixture(withProfiles = true) {
  return { ...(withProfiles ? fixture() : {}),
    [WRONG_KEY]: JSON.stringify({ guest: [wrong()], 'child-a': [wrong('cnp_001')] }),
    [BLIND_KEY]: JSON.stringify({ v: 1, byId: { cns_p001: blind() } }),
    [SCI_SESSION]: JSON.stringify(session()), [PHY_SESSION]: JSON.stringify(session('physics')),
    [ARCHIVE_KEY]: JSON.stringify([{ subject: 'science', session: session('science', 'earlier-run') }]),
    [PROGRESS_KEY]: JSON.stringify({ v: 1, byChild: { 'child-a': { runs: [progressRun()] }, guest: { runs: [progressRun('guest-run', 'weak')] } } })
  };
}
function learningBackup(withProfiles = true) { return exported(load(learningFixture(withProfiles)).api); }

test('真实串行作答存储：科学完成后物理排重包含科学题号，仍可完整迁移', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/two_subject_learning_storage.json'), 'utf8'));
  const data = exported(load(entries).api);
  const physics = data.learning.sessions.physics;
  assert.deepStrictEqual(physics.avoid, ['cns_p001_q3', 'cns_p001_q1']);
  assert.equal(physics.answers[0].id, 'cnp_071');
  assert.equal(data.learning.sessions.science.answers.length, 2);
  assert.ok(!JSON.stringify(data).includes('cnmStats'));
  const { api, storage } = load();
  importInto(api, api.parseBackup(JSON.stringify(data)));
  for (const key of [PROFILE_KEY, RECORD_KEY, WRONG_KEY, BLIND_KEY, SCI_SESSION, PHY_SESSION]) {
    const original = JSON.parse(entries[key]);
    assert.deepStrictEqual(stored(storage, key), key === PROFILE_KEY ? fixedProfiles(original) : original);
  }
  assert.deepStrictEqual(exported(api).learning, data.learning);
});

test('进行中会话排重兼容全局历史各学科题号，但不接受损坏题号', () => {
  const data = learningBackup();
  data.learning.sessions.physics.avoid = ['cns_p001_q1', 'cnm_p001_q2', 'cnc_j001_q1', 'cne_p001_q4', 'cnk_j001_q1'];
  const { api, storage } = load();
  importInto(api, data);
  assert.deepStrictEqual(stored(storage, PHY_SESSION).avoid, data.learning.sessions.physics.avoid);
  for (const invalid of ['cns_p001', 'cns_p001_q0', 'https://example.com/q1', {}, null]) {
    data.learning.sessions.physics.avoid = [invalid];
    assert.throws(() => api.previewImport(data), /范围、设置或时间不正确/);
  }
});

test('v2完整恢复错题、访客错题、两科进行中会话、盲区和会话归档', () => {
  const entries = learningFixture();
  const data = learningBackup();
  const { api, storage } = load();
  const preview = api.previewImport(data);
  assert.equal(preview.addedWrongs, 2);
  assert.equal(preview.addedBlindspots, 1);
  assert.equal(preview.restoredSessions, 2);
  assert.equal(preview.archivedSessions, 1);
  api.importBackup(data, preview.token);
  for (const [key, value] of Object.entries(entries)) {
    const original = JSON.parse(value);
    assert.deepStrictEqual(stored(storage, key), key === PROFILE_KEY ? fixedProfiles(original) : original);
  }
  const first = Object.fromEntries(storage);
  importInto(api, data);
  assert.deepStrictEqual(Object.fromEntries(storage), first);
});

test('没有孩子档案也能导出并恢复访客学习记录', () => {
  const data = learningBackup(false);
  assert.equal(data.profiles.children.length, 0);
  const { api, storage } = load();
  importInto(api, data);
  assert.equal(api.current(), null);
  assert.equal(stored(storage, WRONG_KEY).guest.length, 1);
  assert.equal(stored(storage, SCI_SESSION).seed, 'run-a');
});

test('旧版v1备份兼容导入，已有错题、会话和盲区保持不变', () => {
  const data = backup(); data.version = 1; delete data.learning;
  const entries = learningFixture(false);
  const { api, storage } = load(entries);
  assert.equal(api.previewImport(data).legacy, true);
  importInto(api, api.parseBackup(JSON.stringify(data)));
  for (const [key, value] of Object.entries(entries)) assert.equal(storage.get(key), value);
  assert.equal(api.list().length, 2);
});

test('错题与盲区联合保留，冲突取较新状态，计数取max且重复导入不累加', () => {
  const data = learningBackup();
  data.learning.wrongbook.guest.push(wrong('cns_p002'));
  data.learning.wrongbook.guest[0] = { ...wrong(), ts: 1763000000000, count: 3, chosen: 'C' };
  data.learning.blindspots.byId.cns_p001 = blind('cns_p001', 'mastered', '2026-11-16T00:00:00.000Z', 1);
  data.learning.blindspots.byId.cns_p002 = blind('cns_p002');
  const entries = learningFixture();
  const initialWrongs = JSON.parse(entries[WRONG_KEY]); initialWrongs.guest[0].count = 5;
  entries[WRONG_KEY] = JSON.stringify(initialWrongs);
  const { api, storage } = load(entries);
  const result = importInto(api, data);
  assert.equal(result.addedWrongs, 1);
  const updatedWrong = stored(storage, WRONG_KEY).guest.find(w => w.qid === 'cns_p001_q1');
  assert.equal(updatedWrong.count, 5); assert.equal(updatedWrong.chosen, 'C');
  const updatedBlind = stored(storage, BLIND_KEY).byId.cns_p001;
  assert.equal(updatedBlind.status, 'mastered'); assert.equal(updatedBlind.wrongs, 3);
  assert.equal(Object.keys(stored(storage, BLIND_KEY).byId).length, 2);
  const first = Object.fromEntries(storage); importInto(api, data);
  assert.deepStrictEqual(Object.fromEntries(storage), first);
});

test('同学科冲突保留本机活动会话，导入会话归档且恢复时交换保留双方', () => {
  const data = learningBackup();
  data.learning.archivedSessions = [];
  data.learning.sessions.science = session('science', 'import-run');
  const entries = learningFixture();
  const { api, storage } = load(entries);
  const result = importInto(api, data);
  assert.equal(result.archivedSessions, 1);
  assert.equal(stored(storage, SCI_SESSION).seed, 'run-a');
  const list = api.archivedSessions();
  assert.equal(list.items.length, 2);
  api.restoreArchivedSession(1, list.token);
  assert.equal(stored(storage, SCI_SESSION).seed, 'import-run');
  assert.ok(stored(storage, ARCHIVE_KEY).some(e => e.session.seed === 'run-a'));
  assert.ok(stored(storage, ARCHIVE_KEY).some(e => e.session.seed === 'earlier-run'));
  assert.equal(stored(storage, PHY_SESSION).seed, 'run-a');
  const again = api.archivedSessions();
  const index = stored(storage, ARCHIVE_KEY).findIndex(e => e.session.seed === 'run-a');
  api.restoreArchivedSession(index, again.token);
  assert.equal(stored(storage, SCI_SESSION).seed, 'run-a');
  assert.ok(stored(storage, ARCHIVE_KEY).some(e => e.session.seed === 'import-run'));
});

test('相同进度仅保存时间不同不重复归档，对象字段顺序也不影响去重', () => {
  const data = learningBackup();
  const original = data.learning.sessions.science;
  data.learning.sessions.science = Object.fromEntries(Object.entries(original).reverse());
  data.learning.sessions.science.savedAt = '2026-11-16T00:00:00.000Z';
  const { api, storage } = load(learningFixture());
  assert.equal(importInto(api, data).archivedSessions, 0);
  assert.equal(stored(storage, ARCHIVE_KEY).length, 1);
});

test('归档恢复在活动会话不存在时直接恢复；旧token和非法索引拒绝写入', () => {
  const entries = learningFixture(false); delete entries[SCI_SESSION];
  const { api, storage } = load(entries);
  const list = api.archivedSessions();
  assert.throws(() => api.restoreArchivedSession(-1, list.token), /找不到/);
  assert.throws(() => api.restoreArchivedSession(0, 'stale'), /已发生变化/);
  assert.equal(api.restoreArchivedSession(0, list.token), 'science');
  assert.equal(stored(storage, SCI_SESSION).seed, 'earlier-run');
  assert.deepStrictEqual(stored(storage, ARCHIVE_KEY), []);
});

test('预览后任一学习存储键改变，导入停止且不会写入', () => {
  for (const key of [WRONG_KEY, BLIND_KEY, SCI_SESSION, PHY_SESSION, ARCHIVE_KEY, PROGRESS_KEY]) {
    const { api, storage, writes } = load(learningFixture());
    const data = learningBackup(), preview = api.previewImport(data);
    storage.set(key, storage.get(key) + ' ');
    assert.throws(() => api.importBackup(data, preview.token), /已发生变化/);
    assert.deepStrictEqual(writes, []);
  }
});

test('每个学习键读取失败或JSON损坏都停止导出，避免部分备份', () => {
  for (const key of [WRONG_KEY, BLIND_KEY, SCI_SESSION, PHY_SESSION, ARCHIVE_KEY, PROGRESS_KEY]) {
    const { api, writes } = load(learningFixture(), key);
    assert.throws(() => api.exportBackup(), /无法读取/);
    assert.deepStrictEqual(writes, []);
    assert.throws(() => load({ ...learningFixture(), [key]: '{broken' }).api.exportBackup(), /无法读取/);
  }
});

test('任一学习键写入失败，所有已写入键回滚到导入前原字节', () => {
  const data = learningBackup();
  for (const fail of [WRONG_KEY, BLIND_KEY, SCI_SESSION, PHY_SESSION, ARCHIVE_KEY, PROGRESS_KEY]) {
    const entries = { [PROFILE_KEY]: JSON.stringify({ ...profiles, current: null }, null, 2), [RECORD_KEY]: '{}' };
    const { api, storage } = load(entries, null, { failWrite: key => key === fail });
    assert.throws(() => importInto(api, data), /原有档案和学习数据未改变/);
    assert.deepStrictEqual(Object.fromEntries(storage), entries);
  }
});

test('归档恢复存储失败时保留原活动会话和全部归档', () => {
  const entries = learningFixture();
  const { api, storage } = load(entries, null, { failWrite: key => key === ARCHIVE_KEY });
  const archive = api.archivedSessions();
  assert.throws(() => api.restoreArchivedSession(0, archive.token), /未改变/);
  assert.deepStrictEqual(Object.fromEntries(storage), entries);
});

test('拒绝不匹配学科、非法题号、错误状态、危险键和错误学习结构', () => {
  const cases = [
    d => { d.learning = {}; },
    d => { d.learning.sessions.math = session(); },
    d => { d.learning.sessions.science.targets = ['cnp_001']; },
    d => { d.learning.sessions.science.answers[0].qid = 'cns_p002_q1'; },
    d => { d.learning.sessions.science.answers[0].result = 'unknown'; },
    d => { d.learning.sessions.science.savedAt = 'bad'; },
    d => { d.learning.sessions.science.limit = -1; },
    d => { d.learning.wrongbook.guest[0].subject = 'physics'; },
    d => { d.learning.wrongbook.guest[0].ts = -1; },
    d => { d.learning.wrongbook.guest[0].choices = {}; },
    d => { d.learning.wrongbook.guest.push(d.learning.wrongbook.guest[0]); },
    d => { d.learning.blindspots.byId.cns_p001.id = 'cns_other'; },
    d => { d.learning.blindspots.byId.cns_p001.status = 'anything'; },
    d => { d.learning.blindspots.byId.cns_p001.wrongs = -1; },
    d => { d.learning.archivedSessions[0].subject = 'chinese'; },
    d => { d.records['child-a'][0].weak = ['cnp_001']; }
  ];
  for (const mutate of cases) {
    const data = learningBackup(); mutate(data);
    const { api, storage, writes } = load(fixture());
    assert.throws(() => api.parseBackup(JSON.stringify(data)));
    assert.throws(() => api.previewImport(data));
    assert.deepStrictEqual(Object.fromEntries(storage), fixture()); assert.deepStrictEqual(writes, []);
  }
  const json = JSON.stringify(learningBackup());
  assert.throws(() => load().api.parseBackup(json.replace('"learning":{', '"learning":{"constructor":{},')), /不允许/);
});

test('10MB限制按UTF-8字节计算，导出和直接导入对象也不能绕过', () => {
  const { api } = load();
  assert.throws(() => api.parseBackup('中'.repeat(Math.floor(api.MAX_BACKUP_BYTES / 3) + 1)), /10 MB/);
  const data = learningBackup(); data.profiles.extra = '中'.repeat(Math.floor(api.MAX_BACKUP_BYTES / 3));
  assert.throws(() => api.previewImport(data), /10 MB/);
  const entries = fixture(); const p = JSON.parse(entries[PROFILE_KEY]); p.extra = data.profiles.extra;
  entries[PROFILE_KEY] = JSON.stringify(p);
  assert.throws(() => load(entries).api.exportBackup(), /10 MB/);
});


test('旧v2缺少progress字段仍能导入，保留本机检测进度', () => {
  const data = learningBackup(); delete data.learning.progress;
  const entries = learningFixture();
  const { api, storage } = load(entries);
  importInto(api, data);
  assert.equal(storage.get(PROGRESS_KEY), entries[PROGRESS_KEY]);
});

test('进度按孩子和run合并，取新版完整快照，撤销空快照不被旧备份复活', () => {
  const data = learningBackup();
  const later = '2026-11-17T00:00:00.000Z';
  const entries = learningFixture();
  const local = JSON.parse(entries[PROGRESS_KEY]);
  local.byChild['child-a'].runs[0] = { ...progressRun(), at: later, states: {} };
  local.byChild['child-b'] = { runs: [progressRun('local-only')] };
  entries[PROGRESS_KEY] = JSON.stringify(local);
  data.learning.progress.byChild['child-a'].runs.push(progressRun('import-only','weak'));
  const { api, storage } = load(entries);
  const result = importInto(api, data);
  const merged = stored(storage, PROGRESS_KEY);
  assert.equal(result.addedProgress, 1);
  assert.equal(merged.byChild['child-a'].runs.length, 2);
  assert.deepStrictEqual(merged.byChild['child-a'].runs[0].states, {});
  assert.equal(merged.byChild['child-b'].runs[0].key, 'local-only');
  assert.equal(merged.byChild.guest.runs.length, 1);
  const before = Object.fromEntries(storage); importInto(api,data);
  assert.deepStrictEqual(Object.fromEntries(storage), before);
  const newest = learningBackup();
  newest.learning.progress.byChild['child-a'].runs[0] = progressRun(undefined,'shaky','2026-11-18T00:00:00.000Z');
  assert.equal(importInto(api,newest).updatedProgress,1);
  assert.equal(stored(storage,PROGRESS_KEY).byChild['child-a'].runs[0].states.cns_p001.status,'shaky');
});

test('只有访客检测进度也能备份，恢复后保留全部run和状态', () => {
  const progress = { v:1, byChild:{ guest:{ runs:[progressRun()] } } };
  const data = exported(load({[PROGRESS_KEY]:JSON.stringify(progress)}).api);
  const { api, storage } = load(); importInto(api,data);
  assert.deepStrictEqual(stored(storage,PROGRESS_KEY),progress);
});

test('删除孩子同时删除其图谱进度，其他孩子和访客保留，无需progress模块', () => {
  const entries = learningFixture(), progress = JSON.parse(entries[PROGRESS_KEY]);
  progress.byChild['child-b'] = {runs:[progressRun('child-b')]};
  entries[PROGRESS_KEY]=JSON.stringify(progress);
  const { api, storage }=load(entries);
  assert.equal(api.remove('child-a'),true);
  const remaining=stored(storage,PROGRESS_KEY);
  assert.equal(remaining.byChild['child-a'],undefined);
  assert.equal(remaining.byChild['child-b'].runs.length,1);
  assert.equal(remaining.byChild.guest.runs.length,1);
});

test('教材检测会话与记录可备份，包括教材顺序、册次和明确归属', () => {
  const data=learningBackup();
  data.learning.sessions.science={...data.learning.sessions.science,mode:'textbook',order:'book',volume:'一上',progressChildId:'child-a'};
  data.learning.sessions.physics={...data.learning.sessions.physics,mode:'textbook',order:'book',volume:'八上',progressChildId:null};
  data.records['child-a'][0].mode='textbook';
  const {api,storage}=load();importInto(api,api.parseBackup(JSON.stringify(data)));
  assert.equal(stored(storage,SCI_SESSION).progressChildId,'child-a');
  assert.equal(stored(storage,PHY_SESSION).progressChildId,null);
  assert.equal(stored(storage,RECORD_KEY)['child-a'][0].mode,'textbook');
});

test('会话备份保留站内图谱返回位置，旧会话没有该字段也能恢复', () => {
  const data=learningBackup();
  const source='/explore/?subject=physics&volume=%E5%85%AB%E4%B8%8B&view=local#cnp_029';
  data.learning.sessions.physics.returnTo=source;
  data.learning.archivedSessions.push({subject:'science',session:{...data.learning.sessions.science,
    returnTo:'/school/explore/?subject=science&volume=%E4%B8%80%E4%B8%8A#cns_p001'}});
  const {api,storage}=load();
  importInto(api,api.parseBackup(JSON.stringify(data)));
  assert.equal(stored(storage,PHY_SESSION).returnTo,source);
  assert.ok(stored(storage,ARCHIVE_KEY).some(x=>x.session.returnTo && x.session.returnTo.includes('/school/explore/')));
  assert.equal(api.exportBackup().learning.sessions.physics.returnTo,source);
});

test('会话返回位置拒绝外站、非图谱路径、控制字符和超长值，失败不改本机数据', () => {
  for(const value of ['https://evil.example/explore/','//evil.example/explore/','javascript:alert(1)',
    '/other/','/explore/\\evil','/explore/\n?subject=physics',42,null,'/explore/?q='+ 'a'.repeat(4096)]) {
    const data=learningBackup();data.learning.sessions.physics.returnTo=value;
    const {api,storage,writes}=load(fixture());
    assert.throws(()=>api.parseBackup(JSON.stringify(data)));
    assert.deepStrictEqual(Object.fromEntries(storage),fixture());
    assert.deepStrictEqual(writes,[]);
  }
});

test('图谱进度拒绝错误学科、状态、时间、重复run、非法签名与危险对象键', () => {
  const cases=[
    d=>{d.learning.progress.v=2;},
    d=>{d.learning.progress.byChild['child-a'].runs[0].subject='physics';},
    d=>{d.learning.progress.byChild['child-a'].runs[0].states.cns_p001.status='inferred';},
    d=>{d.learning.progress.byChild['child-a'].runs[0].states.cns_p001.at='bad';},
    d=>{d.learning.progress.byChild['child-a'].runs[0].states.cns_p001.signature='unsafe';},
    d=>{d.learning.progress.byChild['child-a'].runs.push(d.learning.progress.byChild['child-a'].runs[0]);},
    d=>{d.learning.sessions.science.progressChildId={};},
    d=>{d.learning.sessions.science.order='random';}
  ];
  for(const mutate of cases){const data=learningBackup();mutate(data);assert.throws(()=>load().api.parseBackup(JSON.stringify(data)));}
});

test('专家会话、历史与成就完整备份，普通和专家同key进度保持独立', () => {
  const data=learningBackup();
  data.learning.sessions.physics={...data.learning.sessions.physics,level:'pro',mode:'target',targets:['cnp_001'],progressChildId:'child-a'};
  data.records['child-a'][0].level='pro';data.records['child-a'][0].subject='physics';
  for(const key of ['weak','roots','shaky','mastered','targets']) if(data.records['child-a'][0][key]) data.records['child-a'][0][key]=['cnp_001'];
  const at='2026-11-15T00:00:00.000Z', later='2026-11-16T00:00:00.000Z';
  data.learning.progress.byChild['child-a']={runs:[{key:'shared',subject:'physics',at,states:{cnp_001:{status:'mastered',at}}},
    {key:'shared',subject:'physics',level:'pro',at:later,states:{cnp_001:{status:'mastered',at:later}}}],earned:{normal:{cnp_001:at},pro:{cnp_001:later}}};
  const {api,storage}=load();importInto(api,api.parseBackup(JSON.stringify(data)));
  assert.equal(stored(storage,PHY_SESSION).level,'pro');
  assert.equal(stored(storage,PROGRESS_KEY).byChild['child-a'].runs.length,2);
  assert.equal(api.exportBackup().learning.progress.byChild['child-a'].earned.pro.cnp_001,later);
  const before=Object.fromEntries(storage);importInto(api,data);assert.deepStrictEqual(Object.fromEntries(storage),before);
});

test('小学科学专家会话、历史及成就可完整备份恢复，重复导入不重复积分', () => {
  const data=learningBackup(), at='2026-11-15T00:00:00.000Z',later='2026-11-16T00:00:00.000Z';
  data.learning.sessions.science={...data.learning.sessions.science,level:'pro',mode:'target',targets:['cns_p001'],progressChildId:'child-a',
    answers:[{id:'cns_p001',qid:'cns_p001_q101',result:'correct',text:'A'}]};
  const rec={...data.records['child-a'][0],key:'science-expert',level:'pro',subject:'science',weak:[],shaky:[],roots:[],mastered:['cns_p001'],targets:['cns_p001']};
  data.records['child-a'].push(rec);
  data.learning.progress.byChild['child-a']={runs:[
    {key:'same',subject:'science',at,states:{cns_p001:{status:'mastered',at}}},
    {key:'same',subject:'science',level:'pro',at:later,states:{cns_p001:{status:'mastered',at:later}}}],
    earned:{normal:{cns_p001:at},pro:{cns_p001:later}}};
  const {api,storage}=load();importInto(api,api.parseBackup(JSON.stringify(data)));
  const exported=api.exportBackup();
  assert.equal(exported.learning.sessions.science.level,'pro');
  assert.equal(exported.learning.sessions.science.answers[0].qid,'cns_p001_q101');
  assert.equal(exported.learning.progress.byChild['child-a'].earned.pro.cns_p001,later);
  assert.equal(api.latestStatus('child-a','science','pro').cns_p001.status,'mastered');
  const before=Object.fromEntries(storage);importInto(api,data);
  assert.deepStrictEqual(Object.fromEntries(storage),before);
});

test('积分合并按知识点首次时间去重，状态取新版但不扣首次积分', () => {
  const at='2026-11-10T00:00:00.000Z', later='2026-11-16T00:00:00.000Z';
  const data=learningBackup(),entries=learningFixture();
  const local=JSON.parse(entries[PROGRESS_KEY]);
  local.byChild['child-a'].earned={normal:{cns_p001:at},pro:{}};
  local.byChild['child-a'].runs[0]={...local.byChild['child-a'].runs[0],at:later,states:{cns_p001:{status:'weak',at:later}}};
  entries[PROGRESS_KEY]=JSON.stringify(local);
  data.learning.progress.byChild['child-a'].earned={normal:{cns_p001:'2026-11-12T00:00:00.000Z',cnp_001:at},pro:{cnp_001:later}};
  const {api,storage}=load(entries);importInto(api,data);
  const box=stored(storage,PROGRESS_KEY).byChild['child-a'];
  assert.equal(box.earned.normal.cns_p001,at);assert.equal(box.earned.normal.cnp_001,at);assert.equal(box.earned.pro.cnp_001,later);
  assert.equal(box.runs[0].states.cns_p001.status,'weak');
  const before=Object.fromEntries(storage);importInto(api,data);assert.deepStrictEqual(Object.fromEntries(storage),before);
});

test('专家记录不混入普通弱点汇总，非法等级及积分数据拒绝导入', () => {
  const entries=fixture();const history=JSON.parse(entries[RECORD_KEY]);
  history['child-a'].push({...history['child-a'][0],key:'pro-record',subject:'physics',level:'pro',savedAt:'2026-11-18T00:00:00.000Z',weak:['cnp_001'],shaky:[],mastered:[],roots:[]});
  entries[RECORD_KEY]=JSON.stringify(history);const {api}=load(entries);
  assert.equal(api.latestStatus('child-a','physics').cnp_001,undefined);
  assert.equal(api.latestStatus('child-a','physics','pro').cnp_001.status,'weak');
  const cases=[d=>{d.learning.sessions.physics.level='elite';},d=>{d.learning.sessions.science.level='pro';d.learning.sessions.science.mode='screen';},
    d=>{d.learning.progress.byChild['child-a'].runs[0].level='elite';},
    d=>{d.learning.progress.byChild['child-a'].earned={normal:{cnp_001:'bad'}};},
    d=>{d.learning.progress.byChild['child-a'].earned={pro:{cnx_p001:'2026-11-18T00:00:00.000Z'}};}];
  for(const mutate of cases){const data=learningBackup();mutate(data);assert.throws(()=>load().api.parseBackup(JSON.stringify(data)));}
});


const AVATAR_KEY = 'cnmAvatarRewards.v1';
const AVATAR_EPOCH = '1970-01-01T00:00:00.000Z';
const AVATAR_AT = '2026-11-17T10:00:00.000Z';
function avatarDraw(id, piece=0, skinId='skin-01', at=AVATAR_AT) {
  return {id, skinId, piece, cost:1, at};
}
function avatarBox(draws=[], equipped='default', equippedAt=AVATAR_EPOCH) {
  return {draws, equipped, equippedAt};
}
function avatarFixture() {
  return {v:1,byOwner:{
    'child-a':avatarBox(Array.from({length:9},(_,n)=>avatarDraw('draw-a-'+n,n)),'skin-01',AVATAR_AT),
    'child-b':avatarBox([avatarDraw('draw-b-0',2,'skin-02')]),
    guest:avatarBox([avatarDraw('draw-g-0',5,'skin-10'),avatarDraw('draw-g-1',6,'skin-10'),avatarDraw('draw-g-2',6,'skin-10')])
  }};
}
function avatarBackup() {
  return exported(load({...learningFixture(),[AVATAR_KEY]:JSON.stringify(avatarFixture())}).api);
}

test('备份头像schema与实际兑换模块交叉兼容，合并后仍可由模块正常读取',()=>{
  const AR=require('../assets/avatar-rewards.js'),data=avatarBackup();
  assert.equal(AR.validateStore(data.learning.avatarRewards),true);
  const local=avatarFixture();local.byOwner.guest.draws.push(avatarDraw('cross-local',1,'skin-10'));
  const {api,storage}=load({...learningFixture(),[AVATAR_KEY]:JSON.stringify(local)});
  importInto(api,data);assert.equal(AR.validateStore(stored(storage,AVATAR_KEY)),true);
});

test('头像拼图备份完整保留账号和访客、重复消耗与已穿戴装扮，往返不发放新资源',()=>{
  const source=avatarFixture(),data=avatarBackup();
  assert.deepStrictEqual(data.learning.avatarRewards,source);
  const {api,storage}=load();const preview=api.previewImport(data);
  assert.equal(preview.addedAvatarDraws,13);assert.equal(preview.updatedAvatarEquipment,1);
  api.importBackup(data,preview.token);
  assert.deepStrictEqual(stored(storage,AVATAR_KEY),source);
  assert.equal(stored(storage,AVATAR_KEY).byOwner.guest.draws.length,3,'第三次抽中重复片仍保留三笔月亮支出');
  const once=Object.fromEntries(storage);const second=importInto(api,data);
  assert.equal(second.addedAvatarDraws,0);assert.equal(second.updatedAvatarEquipment,0);
  assert.deepStrictEqual(Object.fromEntries(storage),once);
});

test('旧版v1及缺少装扮字段的v2备份均保留本机拼图和所有月亮支出',()=>{
  for(const version of [1,2]) {
    const data=learningBackup();data.version=version;
    if(version===1)delete data.learning;else delete data.learning.avatarRewards;
    const entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(avatarFixture(),null,2)};
    const {api,storage}=load(entries);importInto(api,data);
    assert.deepStrictEqual(stored(storage,AVATAR_KEY),avatarFixture());
  }
});

test('跨设备拼图事件按id并集，不同事件抽到同一片也分别计入支出，导入幂等',()=>{
  const original=avatarFixture(),local=JSON.parse(JSON.stringify(original)),data=avatarBackup();
  local.byOwner['child-a'].draws.push(avatarDraw('offline-local',0));
  data.learning.avatarRewards.byOwner['child-a'].draws.push(avatarDraw('offline-incoming',0));
  const {api,storage}=load({...learningFixture(),[AVATAR_KEY]:JSON.stringify(local)});
  const summary=importInto(api,data);assert.equal(summary.addedAvatarDraws,1);
  const box=stored(storage,AVATAR_KEY).byOwner['child-a'];
  assert.equal(box.draws.length,11);assert.equal(new Set(box.draws.map(draw=>draw.piece)).size,9);
  const once=Object.fromEntries(storage);importInto(api,data);assert.deepStrictEqual(Object.fromEntries(storage),once);
  const old=avatarBackup();old.learning.avatarRewards.byOwner['child-a'].draws=old.learning.avatarRewards.byOwner['child-a'].draws.slice(0,9);
  importInto(api,old);assert.equal(stored(storage,AVATAR_KEY).byOwner['child-a'].draws.length,11,'恢复旧备份不返还任何已消耗月亮');
});

test('同一兑换事件id内容冲突拒绝整份导入，不能凭新备份替换碎片或消耗',()=>{
  const data=avatarBackup(),entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(avatarFixture())};
  data.learning.avatarRewards.byOwner.guest.draws[0].piece=7;
  const {api,storage,writes}=load(entries);
  assert.throws(()=>api.previewImport(data),/拼图兑换记录存在冲突/);
  assert.deepStrictEqual(Object.fromEntries(storage),entries);assert.deepStrictEqual(writes,[]);
});

test('穿戴按较新的明确时间合并，相同时间保留本机；未解锁装扮不能穿戴',()=>{
  const local=avatarFixture();local.byOwner['child-a'].equipped='default';
  local.byOwner['child-a'].equippedAt='2026-11-18T00:00:00.000Z';
  const {api,storage}=load({...learningFixture(),[AVATAR_KEY]:JSON.stringify(local)});
  const data=avatarBackup();data.learning.avatarRewards.byOwner['child-a'].equippedAt=local.byOwner['child-a'].equippedAt;
  importInto(api,data);assert.equal(stored(storage,AVATAR_KEY).byOwner['child-a'].equipped,'default');
  data.learning.avatarRewards.byOwner['child-a'].equippedAt='2026-11-19T00:00:00.000Z';
  const summary=importInto(api,data);assert.equal(summary.updatedAvatarEquipment,1);
  assert.equal(stored(storage,AVATAR_KEY).byOwner['child-a'].equipped,'skin-01');
  data.learning.avatarRewards.byOwner.guest.equipped='skin-10';
  assert.throws(()=>api.previewImport(data),/尚未集齐/);
});

test('拼图单独存在时可以导出访客装扮，并拒绝损坏schema和危险对象键',()=>{
  const store={v:1,byOwner:{guest:avatarBox([avatarDraw('guest-only',4)])}};
  const backup=exported(load({[AVATAR_KEY]:JSON.stringify(store)}).api);
  assert.equal(backup.profiles.children.length,0);assert.deepStrictEqual(backup.learning.avatarRewards,store);
  const mutations=[
    x=>{x.v=2;},x=>{x.byOwner=[];},x=>{x.byOwner.guest.equippedAt='bad';},
    x=>{x.byOwner.guest.draws[0].skinId='skin-11';},x=>{x.byOwner.guest.draws[0].cost=0;},
    x=>{x.byOwner.guest.draws[0].piece=9;},x=>{x.byOwner.guest.draws[0].piece=.5;},
    x=>{x.byOwner.guest.draws[0].id='';},x=>{x.byOwner.guest.draws[0].at='bad';},
    x=>{x.byOwner.guest.draws.push({...x.byOwner.guest.draws[0]});},
    x=>{x.byOwner.guest.equipped='skin-01';}
  ];
  for(const mutate of mutations) {
    const data=avatarBackup();mutate(data.learning.avatarRewards);
    assert.throws(()=>load().api.parseBackup(JSON.stringify(data)));
  }
  const unsafe=JSON.stringify(backup).replace('"byOwner":{','"byOwner":{"__proto__":{},');
  assert.throws(()=>load().api.parseBackup(unsafe),/不允许/);
});

test('拼图存储读取失败或损坏不会导出不完整备份，也不写入任何数据',()=>{
  for(const entries of [{...fixture(),[AVATAR_KEY]:'{broken'},{...fixture(),[AVATAR_KEY]:'[]'}]) {
    const {api,writes}=load(entries);assert.throws(()=>api.exportBackup(),/无法读取|头像装扮/);assert.deepStrictEqual(writes,[]);
  }
  const {api,writes}=load(fixture(),AVATAR_KEY);assert.throws(()=>api.exportBackup(),/无法读取/);assert.deepStrictEqual(writes,[]);
});

test('预览后抽取或更换装扮会使导入token过期，保护新兑换记录不被覆盖',()=>{
  const entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(avatarFixture())};
  const {api,storage,writes}=load(entries),data=avatarBackup(),preview=api.previewImport(data);
  const newer=avatarFixture();newer.byOwner.guest.draws.push(avatarDraw('after-preview',3));
  storage.set(AVATAR_KEY,JSON.stringify(newer));
  assert.throws(()=>api.importBackup(data,preview.token),/已发生变化/);assert.deepStrictEqual(writes,[]);
  assert.equal(stored(storage,AVATAR_KEY).byOwner.guest.draws.length,4);
});

test('拼图键写入失败回滚全部学习数据，后续积分键失败也回滚已写入拼图键',()=>{
  const data=avatarBackup();
  for(const key of [AVATAR_KEY,PROGRESS_KEY]) {
    const entries={[PROFILE_KEY]:JSON.stringify({...profiles,current:null},null,2),[RECORD_KEY]:'{}'};
    const {api,storage}=load(entries,null,{failWrite:k=>k===key});
    assert.throws(()=>importInto(api,data),/原有档案和学习数据未改变/);
    assert.deepStrictEqual(Object.fromEntries(storage),entries);
  }
});

test('删除账号只清理该账号拼图与消费，其他账号和访客均保留，不依赖装扮模块',()=>{
  const source=avatarFixture(),{api,storage}=load({...fixture(),[AVATAR_KEY]:JSON.stringify(source)});
  assert.equal(api.remove('child-a'),true);
  const after=stored(storage,AVATAR_KEY);assert.equal(after.byOwner['child-a'],undefined);
  assert.deepStrictEqual(after.byOwner['child-b'],source.byOwner['child-b']);assert.deepStrictEqual(after.byOwner.guest,source.byOwner.guest);
});


function catAvatarFixture() {
  const store=avatarFixture();
  for(const [owner,catId] of [['child-a','cat-ginger'],['child-b','cat-tuxedo'],['guest','cat-snow']]) {
    store.byOwner[owner].catId=catId;store.byOwner[owner].catAt=AVATAR_AT;
  }
  return store;
}
function catAvatarBackup() {
  return exported(load({...learningFixture(),[AVATAR_KEY]:JSON.stringify(catAvatarFixture())}).api);
}

test('三只猫咪按账号和访客完整备份恢复，不改变旧拼图消费、皮肤或账号注册时间',()=>{
  const data=catAvatarBackup(),source=catAvatarFixture(),{api,storage}=load();
  const AR=require('../assets/avatar-rewards.js');assert.equal(AR.validateStore(data.learning.avatarRewards),true);
  importInto(api,data);assert.deepStrictEqual(stored(storage,AVATAR_KEY),source);
  assert.equal(AR.validateStore(stored(storage,AVATAR_KEY)),true);
  assert.deepStrictEqual(exported(api).profiles.children.map(child=>child.createdAt),profiles.children.map(child=>child.createdAt));
  for(const owner of ['child-a','child-b','guest']) {
    assert.deepStrictEqual(stored(storage,AVATAR_KEY).byOwner[owner].draws,avatarFixture().byOwner[owner].draws);
    assert.equal(stored(storage,AVATAR_KEY).byOwner[owner].equipped,avatarFixture().byOwner[owner].equipped);
    assert.ok(stored(storage,AVATAR_KEY).byOwner[owner].draws.every(draw=>draw.cost===1),'旧记录每次仍消耗一个月亮');
  }
  const once=Object.fromEntries(storage);importInto(api,data);assert.deepStrictEqual(Object.fromEntries(storage),once);
});

test('旧v2猫咪字段缺省或整个装扮字段缺省及v1导入，不回退本机较新的猫咪选择',()=>{
  for(const kind of ['old-avatar','no-avatar','v1']) {
    const data=avatarBackup();
    if(kind==='no-avatar')delete data.learning.avatarRewards;
    if(kind==='v1'){data.version=1;delete data.learning;}
    const entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(catAvatarFixture())};
    const {api,storage}=load(entries);importInto(api,data);
    assert.deepStrictEqual(stored(storage,AVATAR_KEY),catAvatarFixture());
    const first=Object.fromEntries(storage);importInto(api,data);assert.deepStrictEqual(Object.fromEntries(storage),first);
  }
});

test('同ID档案固定本机猫咪，备份中较新的catAt不能更换身份，也不改变拼图消费',()=>{
  const local=catAvatarFixture(),data=catAvatarBackup();
  data.learning.avatarRewards.byOwner['child-a'].catId='cat-tuxedo';
  data.learning.avatarRewards.byOwner['child-b'].catId='cat-snow';
  data.learning.avatarRewards.byOwner['child-b'].catAt='2026-11-18T10:00:00.000Z';
  data.learning.avatarRewards.byOwner.guest.catId='cat-ginger';
  data.learning.avatarRewards.byOwner.guest.catAt='2026-11-16T10:00:00.000Z';
  const {api,storage}=load({...learningFixture(),[AVATAR_KEY]:JSON.stringify(local)});
  const summary=importInto(api,data),after=stored(storage,AVATAR_KEY);
  assert.equal(summary.updatedAvatarCats,0);
  assert.equal(after.byOwner['child-a'].catId,'cat-ginger','同时间保留本机');
  assert.equal(after.byOwner['child-b'].catId,'cat-tuxedo','较新的备份不能改变固定猫咪');
  assert.equal(after.byOwner['child-b'].catAt,AVATAR_AT);
  assert.equal(api.get('child-b').catId,'cat-tuxedo');
  assert.equal(after.byOwner.guest.catId,'cat-snow','较旧猫咪备份不会覆盖本机');
  for(const owner of Object.keys(after.byOwner)) {
    assert.deepStrictEqual(after.byOwner[owner].draws,local.byOwner[owner].draws);
    assert.equal(after.byOwner[owner].equipped,local.byOwner[owner].equipped);
  }
  const repeated=importInto(api,data);assert.equal(repeated.updatedAvatarCats,0);
  assert.deepStrictEqual(stored(storage,AVATAR_KEY),after);
});

test('没有兑换记录的免费猫咪选择可以独立备份，旧账本缺猫字段仍原样保留',()=>{
  const store={v:1,byOwner:{guest:{...avatarBox(),catId:'cat-tuxedo',catAt:AVATAR_AT}}};
  const data=exported(load({[AVATAR_KEY]:JSON.stringify(store)}).api),{api,storage}=load();
  const summary=importInto(api,data);assert.equal(summary.addedAvatarDraws,0);assert.equal(summary.updatedAvatarCats,1);
  assert.deepStrictEqual(stored(storage,AVATAR_KEY),store);
  assert.equal(stored(storage,AVATAR_KEY).byOwner.guest.draws.length,0);
  const old=avatarBackup(),legacy=load();importInto(legacy.api,old);
  assert.ok(!Object.prototype.hasOwnProperty.call(stored(legacy.storage,AVATAR_KEY).byOwner['child-a'],'catId'));
});

test('备份拒绝缺一项的猫咪字段、未知猫咪和无效选择时间，失败不写入或污染其他账号',()=>{
  const mutations=[
    box=>{delete box.catId;},box=>{delete box.catAt;},box=>{box.catId='cat-unknown';},
    box=>{box.catId=null;},box=>{box.catId={};},box=>{box.catAt='not-a-date';},box=>{box.catAt=null;}
  ];
  for(const mutate of mutations) {
    const data=catAvatarBackup();mutate(data.learning.avatarRewards.byOwner['child-a']);
    assert.equal(require('../assets/avatar-rewards.js').validateStore(data.learning.avatarRewards),false);
    const entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(catAvatarFixture())};
    const {api,storage,writes}=load(entries);
    assert.throws(()=>api.parseBackup(JSON.stringify(data)),/猫咪形象/);
    assert.throws(()=>api.previewImport(data),/猫咪形象/);
    assert.deepStrictEqual(Object.fromEntries(storage),entries);assert.deepStrictEqual(writes,[]);
  }
});

test('导入预览后免费切猫也令token失效，猫咪写入失败保留本机原字节和消费账本',()=>{
  const entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(catAvatarFixture(),null,2)},data=catAvatarBackup();
  const {api,storage,writes}=load(entries),preview=api.previewImport(data);
  const next=catAvatarFixture();next.byOwner['child-a'].catId='cat-snow';next.byOwner['child-a'].catAt='2026-11-18T00:00:00.000Z';
  storage.set(AVATAR_KEY,JSON.stringify(next));
  assert.throws(()=>api.importBackup(data,preview.token),/已发生变化/);assert.deepStrictEqual(writes,[]);
  const failing=load(entries,null,{failWrite:key=>key===AVATAR_KEY});
  data.learning.avatarRewards.byOwner['child-a'].catAt='2026-11-19T00:00:00.000Z';
  data.learning.avatarRewards.byOwner['child-a'].catId='cat-snow';
  assert.throws(()=>importInto(failing.api,data),/原有档案和学习数据未改变/);
  assert.deepStrictEqual(Object.fromEntries(failing.storage),entries);
});

test('注册时新旧五种有效猫身份均可保存，每个账号只写一次档案，失败和非法猫不留下半份账号',()=>{
  for(const [index,catId] of ['cat-snow','cat-ginger','cat-tuxedo','cat-blue','cat-mocha'].entries()) {
    const {api,storage,writes}=load({[PROGRESS_KEY]:'old-progress',[AVATAR_KEY]:'old-ledger'});
    const result=api.add({name:'新账号'+index,grade:'八年级',textbook:'人教版',catId});
    assert.equal(result.ok,true);assert.equal(result.child.catId,catId);
    assert.equal(stored(storage,PROFILE_KEY).children[0].catId,catId);
    assert.equal(api.get(result.child.id).catId,catId);
    assert.deepStrictEqual(writes,[PROFILE_KEY]);
    assert.equal(storage.get(PROGRESS_KEY),'old-progress');assert.equal(storage.get(AVATAR_KEY),'old-ledger');
  }
  for(const catId of ['',null,undefined,'unknown','__proto__',{},0]) {
    const {api,storage,writes}=load(fixture());
    const result=api.add({name:'无效形象',grade:'八年级',catId});
    assert.equal(result.ok,false);assert.match(result.error,/猫咪/);assert.deepStrictEqual(writes,[]);
    assert.deepStrictEqual(Object.fromEntries(storage),fixture());
  }
  const prior=fixture(),f=load(prior,null,{failWrite:key=>key===PROFILE_KEY});
  assert.equal(f.api.add({name:'保存失败',grade:'八年级',catId:'cat-tuxedo'}).ok,false);
  assert.deepStrictEqual(Object.fromEntries(f.storage),prior);assert.deepStrictEqual(f.writes,[PROFILE_KEY]);
});

test('蓝灰猫与奶咖狸花猫注册后身份锁定，完整备份往返和重复导入保留服装消费',()=>{
  for(const catId of ['cat-blue','cat-mocha']) {
    const {api,storage}=load();
    const child=api.add({name:'少年猫同学',grade:'八年级',catId}).child;
    assert.equal(api.update(child.id,{name:'改名同学',grade:'九年级',catId:'cat-tuxedo'}).child.catId,catId);
    assert.equal(load(Object.fromEntries(storage)).api.get(child.id).catId,catId);
  }
  const data=catAvatarBackup();
  for(const [i,catId] of ['cat-blue','cat-mocha'].entries()) {
    data.profiles.children[i].catId=catId;
    data.learning.avatarRewards.byOwner[data.profiles.children[i].id].catId=catId;
  }
  const {api,storage,writes}=load();
  const parsed=api.parseBackup(JSON.stringify(data));api.previewImport(parsed);
  assert.deepStrictEqual(writes,[]);
  importInto(api,parsed);
  const restored=exported(api);
  assert.deepStrictEqual(restored.profiles.children.map(c=>c.catId),['cat-blue','cat-mocha']);
  assert.deepStrictEqual(restored.learning.avatarRewards,data.learning.avatarRewards);
  assert.equal(require('../assets/avatar-rewards.js').validateStore(restored.learning.avatarRewards),true);
  const once=Object.fromEntries(storage);importInto(api,parsed);
  assert.deepStrictEqual(Object.fromEntries(storage),once);
  const other=load();importInto(other.api,restored);
  assert.deepStrictEqual(exported(other.api).profiles.children.map(c=>c.catId),['cat-blue','cat-mocha']);
  const local={...learningFixture(),[AVATAR_KEY]:JSON.stringify(catAvatarFixture()),
    [PROFILE_KEY]:JSON.stringify(fixedProfiles(profiles,{'child-a':'cat-blue','child-b':'cat-snow'}))};
  const conflict=load(local);importInto(conflict.api,data);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(conflict.api.list())).map(c=>c.catId),['cat-blue','cat-snow']);
  assert.deepStrictEqual(stored(conflict.storage,AVATAR_KEY).byOwner['child-b'].draws,catAvatarFixture().byOwner['child-b'].draws);
});

test('兼容旧注册调用默认白猫，编辑资料和切换账号都不能改变猫咪身份',()=>{
  const {api,storage}=load();
  const a=api.add({name:'白猫同学',grade:'八年级'}).child;
  const b=api.add({name:'橘猫同学',grade:'九年级',catId:'cat-ginger'}).child;
  assert.equal(a.catId,'cat-snow');assert.equal(b.catId,'cat-ginger');
  const change=api.update(b.id,{name:'改名同学',grade:'高一',textbook:'其他',catId:'cat-tuxedo'});
  assert.equal(change.ok,true);assert.equal(change.child.catId,'cat-ginger');assert.equal(change.child.grade,'高一');
  assert.equal(api.setCurrent(b.id),true);assert.equal(api.current().catId,'cat-ginger');
  api.setCurrent(a.id);assert.equal(api.current().catId,'cat-snow');
  const reloaded=load(Object.fromEntries(storage)).api;
  assert.equal(reloaded.get(b.id).catId,'cat-ginger');assert.equal(reloaded.get(a.id).catId,'cat-snow');
});

test('旧账号继承已经选择的猫且只冻结一次，后续旧标签页账本改猫不影响身份',()=>{
  const source=catAvatarFixture(),entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(source)};
  const {api,storage,writes}=load(entries);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.list())).map(c=>c.catId),['cat-ginger','cat-tuxedo']);
  assert.deepStrictEqual(writes,[PROFILE_KEY]);assert.equal(storage.get(AVATAR_KEY),entries[AVATAR_KEY]);
  source.byOwner['child-a'].catId='cat-snow';source.byOwner['child-a'].catAt='2026-12-01T00:00:00.000Z';
  storage.set(AVATAR_KEY,JSON.stringify(source));
  assert.equal(api.get('child-a').catId,'cat-ginger');assert.equal(api.current().catId,'cat-tuxedo');
  assert.deepStrictEqual(writes,[PROFILE_KEY]);
  assert.equal(load(Object.fromEntries(storage)).api.get('child-a').catId,'cat-ginger');
  assert.equal(storage.get(PROGRESS_KEY),entries[PROGRESS_KEY]);
});

test('新导入旧档案从该备份账本继承猫；无猫的旧v1默认白猫，新备份携带固定身份',()=>{
  const data=catAvatarBackup();data.profiles.children.forEach(child=>delete child.catId);
  const {api,storage,writes}=load();
  api.previewImport(data);assert.deepStrictEqual(writes,[]);
  importInto(api,data);
  assert.deepStrictEqual(stored(storage,PROFILE_KEY).children.map(c=>c.catId),['cat-ginger','cat-tuxedo']);
  assert.deepStrictEqual(exported(api).profiles.children.map(c=>c.catId),['cat-ginger','cat-tuxedo']);
  const old=backup();old.version=1;delete old.learning;old.profiles.children.forEach(c=>delete c.catId);
  const target=load();importInto(target.api,old);
  assert.deepStrictEqual(stored(target.storage,PROFILE_KEY).children.map(c=>c.catId),['cat-snow','cat-snow']);
});

test('固定profile身份优先于冲突的旧账本和备份，非法新备份身份拒绝且无写入',()=>{
  const data=catAvatarBackup();data.profiles.children[0].catId='cat-tuxedo';
  data.learning.avatarRewards.byOwner['child-a'].catId='cat-tuxedo';
  data.learning.avatarRewards.byOwner['child-a'].catAt='2026-12-01T00:00:00.000Z';
  const entries={...learningFixture(),[AVATAR_KEY]:JSON.stringify(catAvatarFixture())};
  entries[PROFILE_KEY]=JSON.stringify(fixedProfiles(profiles,{'child-a':'cat-snow','child-b':'cat-tuxedo'}));
  const {api,storage}=load(entries);importInto(api,data);
  assert.equal(api.get('child-a').catId,'cat-snow');
  assert.equal(stored(storage,AVATAR_KEY).byOwner['child-a'].catId,'cat-ginger','历史账本原样保留');
  const reloaded=load(Object.fromEntries(storage)).api;assert.equal(reloaded.get('child-a').catId,'cat-snow');
  for(const catId of [null,'unknown',{},'']) {
    const bad=catAvatarBackup();bad.profiles.children[0].catId=catId;
    const target=load(entries);assert.throws(()=>target.api.parseBackup(JSON.stringify(bad)),/资料不完整/);
    assert.throws(()=>target.api.previewImport(bad),/资料不完整/);assert.deepStrictEqual(target.writes,[]);
    assert.deepStrictEqual(Object.fromEntries(target.storage),entries);
  }
});

const BOOK_AT = '2026-11-18T00:00:00.000Z';
function bookPrefs(volumes, at = BOOK_AT) { return { volumes, at }; }
function selectionEntries(selections) {
  return { ...fixture(), [PROFILE_KEY]: JSON.stringify({ ...fixedProfiles(profiles), bookSelections: selections }) };
}

test('教材选择按账号、访客和学科隔离，规范去重并允许明确选空，返回值不能改写存储', () => {
  const entries = { ...fixture(), [PROGRESS_KEY]: 'untouched-progress', [AVATAR_KEY]: 'untouched-avatar' };
  const { api, storage, writes } = load(entries);
  assert.equal(api.bookSelection('physics'), null);
  const b = api.setBookSelection('physics', ['九全', '八上', '九全']);
  assert.equal(b.ok, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(b.selection.volumes)), ['八上', '九全']);
  api.setBookSelection('science', ['三下', '一上'], 'child-a');
  api.setBookSelection('physics', [], 'child-a');
  api.setBookSelection('physics', ['必修一'], 'guest');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('physics', 'child-a').volumes)), []);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('science', 'child-a').volumes)), ['一上', '三下']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('physics').volumes)), ['八上', '九全']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('physics', null).volumes)), ['必修一']);
  assert.equal(api.bookSelection('science', 'child-b'), null);
  const selection = api.bookSelection('physics'); selection.volumes.push('八下');
  b.selection.volumes.push('选必一'); b.selections.physics.volumes.push('选必二');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('physics').volumes)), ['八上', '九全']);
  assert.equal(storage.get(PROGRESS_KEY), entries[PROGRESS_KEY]); assert.equal(storage.get(AVATAR_KEY), entries[AVATAR_KEY]);
  assert.deepStrictEqual(writes, [PROFILE_KEY, PROFILE_KEY, PROFILE_KEY, PROFILE_KEY]);
  assert.deepStrictEqual(stored(storage, PROFILE_KEY).children, profiles.children, '保存教材不触发旧猫咪身份迁移');
  const reloaded = load(Object.fromEntries(storage)).api;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reloaded.bookSelection('physics', 'child-a').volumes)), []);
  api.setCurrent('child-a'); assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('physics').volumes)), []);
  api.setCurrent(null); assert.deepStrictEqual(JSON.parse(JSON.stringify(api.bookSelection('physics').volumes)), ['必修一']);
});

test('两科教材批量保存只写一次且同一时间，非法科目或册次使整批完全不写入', () => {
  const entries = selectionEntries({ 'child-b': { physics: bookPrefs(['九全']) } });
  const { api, storage, writes } = load(entries);
  const result = api.setBookSelections({ science: ['六下', '一上'], physics: ['八下'] });
  assert.equal(result.ok, true); assert.equal(result.selections.science.at, result.selections.physics.at);
  assert.deepStrictEqual(writes, [PROFILE_KEY]);
  assert.deepStrictEqual(stored(storage, PROFILE_KEY).bookSelections['child-b'].science.volumes, ['一上', '六下']);
  const after = Object.fromEntries(storage); writes.length = 0;
  const sparse = []; sparse[1] = '八上';
  const invalids = [{}, [], null, { physics: ['八上'], science: ['八上'] }, { english: [] }, { physics: sparse },
    { physics: [null] }, { physics: '八上' }, JSON.parse('{"__proto__":[]}')];
  for (const changes of invalids) assert.equal(api.setBookSelections(changes).ok, false);
  for (const owner of ['missing', '__proto__', {}, 1]) assert.equal(api.setBookSelection('physics', ['八上'], owner).ok, false);
  for (const subject of ['english', '__proto__', '', null]) assert.equal(api.setBookSelection(subject, []).ok, false);
  assert.deepStrictEqual(Object.fromEntries(storage), after); assert.deepStrictEqual(writes, []);
  assert.equal(api.bookSelection('physics', 'missing'), null); assert.equal(api.bookSelection('english'), null);
});

test('教材保存的配额/读取失败保留原始字节，两科不会只保存一科，空档案默认访客', () => {
  const entries = selectionEntries({ 'child-b': { physics: bookPrefs(['九全']), science: bookPrefs(['三上']) } });
  const failing = load(entries, null, { failWrite: key => key === PROFILE_KEY });
  const result = failing.api.setBookSelections({ physics: [], science: ['一上'] });
  assert.equal(result.ok, false); assert.deepStrictEqual(Object.fromEntries(failing.storage), entries);
  assert.deepStrictEqual(failing.writes, [PROFILE_KEY]);
  const unreadable = load(entries, PROFILE_KEY);
  assert.equal(unreadable.api.setBookSelection('physics', []).ok, false);
  assert.equal(unreadable.api.bookSelection('physics'), null); assert.deepStrictEqual(unreadable.writes, []);
  assert.deepStrictEqual(Object.fromEntries(unreadable.storage), entries);
  const guest = load(); assert.equal(guest.api.setBookSelections({ physics: [], science: ['六下'] }).ok, true);
  assert.deepStrictEqual(stored(guest.storage, PROFILE_KEY).bookSelections.guest.physics.volumes, []);
  assert.equal(guest.api.current(), null);
});

test('移除账号只清除该账号教材偏好，其他账号和访客保留', () => {
  const entries = selectionEntries({ 'child-a': { physics: bookPrefs(['八上']) }, 'child-b': { physics: bookPrefs([]) }, guest: { science: bookPrefs(['一上']) } });
  const { api, storage } = load(entries); assert.equal(api.remove('child-a'), true);
  const remaining = stored(storage, PROFILE_KEY).bookSelections;
  assert.equal(remaining['child-a'], undefined); assert.deepStrictEqual(remaining['child-b'], { physics: bookPrefs([]) });
  assert.deepStrictEqual(remaining.guest, { science: bookPrefs(['一上']) });
  assert.equal(api.bookSelection('physics', 'child-a'), null);
});

test('教材选择随完整备份往返且预览不写入，空选择和访客保留，旧备份不覆盖本机选择', () => {
  const selections = { 'child-a': { physics: bookPrefs([]), science: bookPrefs(['一上', '六下']) }, guest: { physics: bookPrefs(['九全']) } };
  const source = load(selectionEntries(selections)), data = exported(source.api), target = load();
  assert.deepStrictEqual(data.profiles.bookSelections, selections);
  const parsed = target.api.parseBackup(JSON.stringify(data)); target.api.previewImport(parsed);
  assert.deepStrictEqual(target.writes, []); importInto(target.api, parsed);
  assert.deepStrictEqual(exported(target.api).profiles.bookSelections, selections);
  const after = Object.fromEntries(target.storage); target.writes.length = 0; importInto(target.api, parsed);
  assert.deepStrictEqual(Object.fromEntries(target.storage), after); assert.deepStrictEqual(target.writes, []);
  const old = backup(); delete old.profiles.bookSelections; importInto(target.api, old);
  assert.deepStrictEqual(exported(target.api).profiles.bookSelections, selections);
  old.version = 1; delete old.learning; importInto(target.api, old);
  assert.deepStrictEqual(exported(target.api).profiles.bookSelections, selections);
  const guest = load(); guest.api.setBookSelection('physics', []); const guestBackup = exported(guest.api);
  const restored = load(); importInto(restored.api, guestBackup);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(restored.api.bookSelection('physics').volumes)), []);
});

test('备份教材按账号和学科较新时间合并，同时间本机优先，身份和学习账本不被教材合并改写', () => {
  const selections = { 'child-a': { physics: bookPrefs([]), science: bookPrefs(['三上']) }, guest: { physics: bookPrefs(['八上']) } };
  const entries = { ...learningFixture(), [PROFILE_KEY]: JSON.stringify({ ...fixedProfiles(profiles, { 'child-a': 'cat-blue' }), bookSelections: selections }) };
  const target = load(entries), data = exported(target.api);
  data.profiles.children[0].catId = 'cat-tuxedo';
  data.profiles.bookSelections['child-a'].physics = bookPrefs(['九全'], '2026-11-17T00:00:00.000Z');
  data.profiles.bookSelections['child-a'].science = bookPrefs(['六下']);
  data.profiles.bookSelections.guest.physics = bookPrefs([], '2026-11-19T00:00:00.000Z');
  data.profiles.bookSelections['child-b'] = { physics: bookPrefs(['必修二']) };
  importInto(target.api, data);
  assert.deepStrictEqual(exported(target.api).profiles.bookSelections, {
    ...selections, guest: { physics: bookPrefs([], '2026-11-19T00:00:00.000Z') }, 'child-b': { physics: bookPrefs(['必修二']) }
  });
  assert.equal(target.api.get('child-a').catId, 'cat-blue');
  assert.equal(target.storage.get(PROGRESS_KEY), entries[PROGRESS_KEY]);
  const after = Object.fromEntries(target.storage); target.writes.length = 0; importInto(target.api, data);
  assert.deepStrictEqual(Object.fromEntries(target.storage), after); assert.deepStrictEqual(target.writes, []);
});

test('备份拒绝非法教材owner/学科/册次/时间/毒字段，解析和预览失败均不改写', () => {
  const invalids = [null, [], { missing: { physics: bookPrefs(['八上']) } }, { 'child-a': [] },
    { guest: { english: bookPrefs([]) } }, { guest: { physics: bookPrefs(['三上']) } },
    { guest: { science: bookPrefs(['九全']) } }, { guest: { physics: bookPrefs([null]) } },
    { guest: { physics: { volumes: [], at: 'bad-date' } } }, { guest: { physics: { volumes: [] } } },
    { guest: { physics: { at: BOOK_AT } } }, { guest: { physics: { ...bookPrefs([]), extra: true } } },
    JSON.parse('{"__proto__":{}}'), JSON.parse('{"guest":{"constructor":{}}}')];
  for (const invalid of invalids) {
    const data = backup(); data.profiles.bookSelections = invalid;
    const entries = selectionEntries({ 'child-b': { physics: bookPrefs([]) } });
    const target = load(entries);
    assert.throws(() => target.api.parseBackup(JSON.stringify(data)), /教材|不允许/);
    assert.throws(() => target.api.previewImport(data), /教材|不允许/);
    assert.deepStrictEqual(Object.fromEntries(target.storage), entries); assert.deepStrictEqual(target.writes, []);
  }
  const data = backup(), sparse = []; sparse[1] = '八上';
  data.profiles.bookSelections = { guest: { physics: bookPrefs(sparse) } };
  assert.throws(() => load().api.previewImport(data), /教材/);
});

test('编辑教材令已预览导入token失效，损坏的本机教材偏好不能被表单静默覆盖', () => {
  const entries = selectionEntries({ 'child-b': { physics: bookPrefs(['九全']) } }), target = load(entries), data = backup();
  const preview = target.api.previewImport(data);
  assert.equal(target.api.setBookSelection('physics', []).ok, true);
  const after = Object.fromEntries(target.storage); target.writes.length = 0;
  assert.throws(() => target.api.importBackup(data, preview.token), /已发生变化/);
  assert.deepStrictEqual(Object.fromEntries(target.storage), after); assert.deepStrictEqual(target.writes, []);
  const bad = selectionEntries({ 'child-b': { physics: bookPrefs(['invalid']) } }), corrupted = load(bad);
  assert.equal(corrupted.api.setBookSelection('physics', ['八上']).ok, false);
  assert.equal(corrupted.api.bookSelection('physics'), null);
  assert.deepStrictEqual(Object.fromEntries(corrupted.storage), bad); assert.deepStrictEqual(corrupted.writes, []);
});

console.log('\n' + passed + ' passed, 0 failed');
