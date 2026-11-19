/* 个人中心的只读学习摘要：有归属的数据按人显示，旧全局汇总单独展示。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CnmLocalLearning = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEYS = { physics: 'cnpDiagnose.session.v2', science: 'cnsDiagnose.session.v1' };
  function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function own(v, k) { return Object.prototype.hasOwnProperty.call(v, k); }
  function read(key) { try { return JSON.parse(root.localStorage.getItem(key)); } catch (e) { return null; } }
  function subjectOf(id) { return typeof id === 'string' && /^cnp_[A-Za-z0-9]+$/.test(id) ? 'physics' : typeof id === 'string' && /^cns_[A-Za-z0-9]+$/.test(id) ? 'science' : ''; }
  function stamp(v) { return typeof v === 'string' && Number.isFinite(Date.parse(v)); }
  function owner(id) { return id === null || id === undefined || id === '' ? null : id; }
  function validSession(saved, subject) {
    return object(saved) && saved.v === 2 && ['target', 'screen', 'textbook'].indexOf(saved.mode) >= 0 &&
      Array.isArray(saved.targets) && saved.targets.length > 0 && saved.targets.length <= 1000 &&
      saved.targets.every(function (id) { return subjectOf(id) === subject; }) &&
      Number.isSafeInteger(saved.limit) && saved.limit > 0 && saved.limit <= 1000 &&
      Number.isSafeInteger(saved.confirm) && saved.confirm > 0 && saved.confirm <= 10 &&
      typeof saved.seed === 'string' && saved.seed.length <= 256 && typeof saved.label === 'string' && saved.label.length <= 4000 &&
      stamp(saved.savedAt) && (!own(saved, 'level') || saved.level === 'normal' || saved.level === 'pro') &&
      (saved.level !== 'pro' || (saved.mode === 'target' && saved.targets.length === 1)) && (!own(saved, 'progressChildId') || saved.progressChildId === null ||
        (typeof saved.progressChildId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(saved.progressChildId))) &&
      Array.isArray(saved.answers) && saved.answers.length <= 5000 && saved.answers.every(function (a) {
        return object(a) && subjectOf(a.id) === subject &&
          (a.qid == null || (typeof a.qid === 'string' && new RegExp('^' + a.id + '_q[1-9][0-9]*$').test(a.qid))) &&
          ['correct', 'wrong', 'skip'].indexOf(a.result) >= 0;
      });
  }
  function keyOf(subject, saved) { return (saved.level === 'pro' ? 'pro|' : '') + [subject, saved.seed, saved.targets.join(',')].join('|'); }
  function completed(subject, saved) {
    var key = keyOf(subject, saved), CC = root.CnmChildren;
    if (saved.progressChildId) return !!(CC && CC.hasRecord && CC.hasRecord(saved.progressChildId, key));
    if (saved.level === 'pro' && own(saved, 'progressChildId') && saved.progressChildId === null) {
      var progress = read('cnmProgress.v1'), guest = object(progress) && object(progress.byChild) && progress.byChild.guest;
      return !!(object(guest) && Array.isArray(guest.runs) && guest.runs.some(function (run) {
        var state = object(run) && object(run.states) && run.states[saved.targets[0]];
        return object(run) && run.key === key && run.subject === subject && run.level === 'pro' && object(state) &&
          ['mastered', 'weak', 'shaky'].indexOf(state.status) >= 0;
      }));
    }
    var ledger = read('cnmBlind.local.v1');
    return !!(object(ledger) && object(ledger.byId) && Object.keys(ledger.byId).some(function (id) {
      var row = ledger.byId[id]; return subjectOf(id) === subject && object(row) && row.lastKey === key;
    }));
  }
  function savedSessions() {
    var CC = root.CnmChildren;
    return Object.keys(KEYS).map(function (subject) {
      var saved = read(KEYS[subject]);
      if (!validSession(saved, subject)) return null;
      var recordedOwner = own(saved, 'progressChildId'), id = recordedOwner ? owner(saved.progressChildId) : undefined;
      var child = id && CC && CC.get ? CC.get(id) : null;
      return { subject: subject, level: saved.level === 'pro' ? 'pro' : 'normal', label: saved.label.replace(/\u8bca\u65ad/g, '检测'), answered: saved.answers.length,
        savedAt: saved.savedAt, ownerId: id, ownerLabel: !recordedOwner ? '归属未记录' : id ? (child ? child.name : '原档案已删除') : '本机访客',
        completed: completed(subject, saved), href: '../diagnose/?subject=' + subject + '&resume=1' };
    }).filter(Boolean);
  }
  function weakPoints(options) {
    var opts = options || {}, childId = owner(opts.childId), by = {}, CC = root.CnmChildren, P = root.CnmProgress;
    function put(id, row, sub) {
      if (!sub || !object(row) || subjectOf(id) !== sub || (row.subject && row.subject !== sub) || (opts.subject && opts.subject !== sub) ||
          ['mastered', 'weak', 'shaky', 'retest'].indexOf(row.status) < 0) return;
      var old = by[id], at = row.at || '';
      if (old && String(old.at).localeCompare(String(at)) > 0) return;
      by[id] = { id: id, subject: sub, status: row.status, root: !!row.root, at: at,
        label: row.label || '', wrongs: row.wrongs || 0, hits: row.hits || 0 };
    }
    if (childId && CC && CC.get && !CC.get(childId)) return [];
    if (childId && CC && CC.latestStatus) {
      var latest = CC.latestStatus(childId, opts.subject || null);
      Object.keys(latest).forEach(function (id) { put(id, latest[id], subjectOf(id)); });
    }
    Object.keys(KEYS).forEach(function (sub) {
      if (opts.subject && opts.subject !== sub) return;
      if (P && P.statuses) {
        var states = P.statuses(childId, sub);
        Object.keys(states).forEach(function (id) { put(id, states[id], sub); });
      }
      var saved = read(KEYS[sub]);
      if (!validSession(saved, sub) || saved.level === 'pro' || !own(saved, 'progressChildId') || owner(saved.progressChildId) !== childId || completed(sub, saved)) return;
      saved.answers.forEach(function (answer) {
        // 已有直接结论优先；旧会话的答错不能把后来已掌握的点重新列为薄弱。
        if ((answer.result !== 'wrong' && answer.result !== 'skip') || by[answer.id]) return;
        put(answer.id, { status: 'retest', at: saved.savedAt, label: saved.label, wrongs: 1 }, sub);
      });
    });
    return Object.keys(by).map(function (id) { return by[id]; }).filter(function (row) { return row.status !== 'mastered'; }).sort(function (a, b) {
      var rank = { weak: 0, shaky: 1, retest: 2 };
      return rank[a.status] - rank[b.status] || String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id);
    });
  }
  function legacyWeakPoints(options) {
    var opts = options || {}, ledger = read('cnmBlind.local.v1');
    if (!object(ledger) || ledger.v !== 1 || !object(ledger.byId)) return [];
    return Object.keys(ledger.byId).map(function (id) {
      var row = ledger.byId[id], sub = subjectOf(id);
      if (!object(row) || !sub || (row.subject && row.subject !== sub) || (opts.subject && sub !== opts.subject) || ['weak', 'shaky', 'retest'].indexOf(row.status) < 0) return null;
      return { id: id, subject: sub, status: row.status, root: !!row.root, at: row.lastAt || '',
        label: row.lastLabel || '', wrongs: row.wrongs || 0, hits: row.hits || 0 };
    }).filter(Boolean).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  return { weakPoints: weakPoints, legacyWeakPoints: legacyWeakPoints, savedSessions: savedSessions };
});
