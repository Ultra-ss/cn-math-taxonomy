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
  assert.deepStrictEqual(backup.profiles, profiles);
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
  assert.deepStrictEqual(backup.profiles, extraProfiles);
  assert.deepStrictEqual(backup.records, extraRecords);
});

test('有孩子但没有检测记录时仍能备份资料', () => {
  const backup = exported(load({ [PROFILE_KEY]: JSON.stringify(profiles) }).api);
  assert.deepStrictEqual(backup.profiles, profiles);
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
  assert.deepStrictEqual(exported(api).profiles, profiles);
  assert.deepStrictEqual(exported(api).records, records);
  const next = { ...profiles, current: 'child-a' };
  storage.set(PROFILE_KEY, JSON.stringify(next));
  assert.deepStrictEqual(exported(api).profiles, next);
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
  assert.deepStrictEqual(stored(storage, PROFILE_KEY), profiles);
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
    assert.deepStrictEqual(stored(storage, key), JSON.parse(entries[key]));
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
  for (const [key, value] of Object.entries(entries)) assert.deepStrictEqual(stored(storage, key), JSON.parse(value));
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

console.log('\n' + passed + ' passed, 0 failed');
