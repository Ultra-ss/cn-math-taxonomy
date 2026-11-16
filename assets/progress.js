/* 图谱检测进度：按孩子 / 访客保存各次诊断的直接结论。
 * 不从档案的汇总掌握项推断完成；撤销或更正用同一 key 替换整次快照。
 * 只保存状态与时间，不复制题干。达到存储限制时保留原数据，不截断旧历史。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CnmProgress = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmProgress.v1';
  var GUEST = 'guest';
  var BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
  function object(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function bucketId(id) {
    if (id === null || id === undefined || id === '') return GUEST;
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id) && BAD_KEYS.indexOf(id) < 0 ? id : '';
  }
  function subjectOf(id) {
    if (typeof id !== 'string') return '';
    if (/^cns_[A-Za-z0-9]+$/.test(id)) return 'science';
    if (/^cnp_[A-Za-z0-9]+$/.test(id)) return 'physics';
    return '';
  }
  function validDate(at) { return typeof at === 'string' && Number.isFinite(Date.parse(at)); }
  function answerSignature(answers, id) {
    // 两个独立的 32 位摘要，不复制题干或答题文本到图谱进度账本。
    var text = JSON.stringify(answers.filter(function (a) { return a && a.id === id; }).map(function (a) {
      return [a.qid || '', a.result, a.text || ''];
    }));
    var a = 2166136261, b = 5381;
    for (var i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  function emit() {
    try { if (root.dispatchEvent) root.dispatchEvent(new Event('cnm:progress')); } catch (e) { /* 非浏览器环境 */ }
  }
  function readStore() {
    try {
      var raw = localStorage.getItem(KEY);
      var data = raw === null ? { v: 1, byChild: {} } : JSON.parse(raw);
      return validateStore(data) ? data : null;
    } catch (e) { return null; }
  }
  function validateStore(data) {
    if (!object(data) || data.v !== 1 || !object(data.byChild)) return false;
    return Object.keys(data.byChild).every(function (bucket) {
      var box = data.byChild[bucket];
      if (bucketId(bucket) !== bucket || !object(box) || !Array.isArray(box.runs)) return false;
      var keys = new Set();
      return box.runs.every(function (run) {
        if (!object(run) || typeof run.key !== 'string' || !run.key || run.key.length > 20000 ||
            !validDate(run.at) || ['science', 'physics'].indexOf(run.subject) < 0 || !object(run.states) ||
            keys.has(run.subject + '|' + run.key)) return false;
        keys.add(run.subject + '|' + run.key);
        return Object.keys(run.states).every(function (id) {
          var state = run.states[id];
          return subjectOf(id) === run.subject && object(state) &&
            ['mastered', 'weak', 'shaky'].indexOf(state.status) >= 0 && validDate(state.at) &&
            (!own(state, 'signature') || (typeof state.signature === 'string' && /^[a-f0-9]{16}$/.test(state.signature)));
        });
      });
    });
  }
  function saveStore(data) {
    try {
      var json = JSON.stringify(data);
      localStorage.setItem(KEY, json);
      emit();
      return true;
    } catch (e) { return false; }
  }
  function recordSession(payload) {
    if (!payload || payload.demo || ['science', 'physics'].indexOf(payload.subject) < 0 ||
        typeof payload.key !== 'string' || !payload.key || payload.key.length > 20000 ||
        !object(payload.session) || !object(payload.session.status) || !Array.isArray(payload.session.answers)) return false;
    var bucket = bucketId(payload.childId), data = readStore();
    var at = payload.at === undefined ? new Date().toISOString() : payload.at;
    if (!bucket || !data || !validDate(at)) return false;
    if (!own(data.byChild, bucket)) data.byChild[bucket] = { runs: [] };
    var runs = data.byChild[bucket].runs;
    var index = runs.findIndex(function (run) { return run.key === payload.key && run.subject === payload.subject; });
    var old = index >= 0 ? runs[index] : null;
    var answered = new Set(payload.session.answers.filter(function (answer) {
      return answer && subjectOf(answer.id) === payload.subject && ['correct', 'wrong', 'skip'].indexOf(answer.result) >= 0;
    }).map(function (answer) { return answer.id; }));
    var states = {};
    Object.keys(payload.session.status).forEach(function (id) {
      var state = payload.session.status[id];
      if (subjectOf(id) !== payload.subject || !answered.has(id) || !state || state.src !== 'direct' ||
          ['mastered', 'weak', 'shaky'].indexOf(state.s) < 0) return;
      var previous = old && old.states[id];
      var signature = answerSignature(payload.session.answers, id);
      var unchanged = previous && previous.status === state.s && (!previous.signature || previous.signature === signature);
      states[id] = { status: state.s, at: unchanged ? previous.at : at, signature: signature };
    });
    // 未完成 / 推断不产生标记。空快照仍保留，使旧备份不会复活已经撤回的本次结论。
    var next = { key: payload.key, subject: payload.subject, at: at, states: states };
    if (old && JSON.stringify(old.states) === JSON.stringify(states)) return true;
    if (index >= 0) runs[index] = next;
    else runs.push(next);
    return saveStore(data);
  }
  function statuses(childId, subject) {
    var bucket = bucketId(childId), data = readStore(), out = {};
    if (!bucket || !data || (subject !== 'science' && subject !== 'physics')) return out;
    var box = data.byChild[bucket];
    if (!box) return out;
    box.runs.forEach(function (run) {
      if (run.subject !== subject) return;
      Object.keys(run.states).forEach(function (id) {
        var state = run.states[id], old = out[id];
        if (!old || Date.parse(state.at) > Date.parse(old.at) ||
            (state.at === old.at && run.key > old.key)) {
          out[id] = { status: state.status, mark: state.status === 'mastered' ? '✓' : '×', at: state.at, key: run.key };
        }
      });
    });
    return out;
  }
  function eraseChild(childId) {
    var bucket = bucketId(childId), data = readStore();
    if (!bucket || !data) return false;
    if (!own(data.byChild, bucket)) return true;
    delete data.byChild[bucket];
    return saveStore(data);
  }
  /* 仅供归属明确且已经用现行题库回放的旧会话；调用者必须显式提供 childId。
   * 未归属的旧全局 session、汇总 records.mastered 都不自动迁移。 */
  function migrateSession(payload) {
    if (!payload || !own(payload, 'childId') || !payload.session) return false;
    return recordSession(payload);
  }
  return { KEY: KEY, GUEST: GUEST, recordSession: recordSession,
    statuses: statuses, eraseChild: eraseChild, migrateSession: migrateSession, validateStore: validateStore };
});
