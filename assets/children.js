/* 孩子档案：多个孩子、当前孩子、每个孩子的检测记录。全部保存在本机 localStorage，不上传、不需要账号。
 * 检测页和档案页共用。window.CnmChildren。 */
(function () {
  'use strict';
  var KEY = 'cnmChildren.v1';
  var REC_KEY = 'cnmChildren.records.v1';
  var MAX_CHILDREN = 8;
  var MAX_RECORDS = 40;
  var MAX_BACKUP_BYTES = 10 * 1024 * 1024;
  var WRONG_KEY = 'cnmWrong.v1';
  var BLIND_KEY = 'cnmBlind.local.v1';
  var ARCHIVE_KEY = 'cnmDiagnose.archived.v1';
  var PROGRESS_KEY = 'cnmProgress.v1';
  var AVATAR_KEY = 'cnmAvatarRewards.v1';
  var SESSION_KEYS = { science: 'cnsDiagnose.session.v1', physics: 'cnpDiagnose.session.v2' };
  var BACKUP_KEYS = [KEY, REC_KEY, WRONG_KEY, BLIND_KEY, SESSION_KEYS.science, SESSION_KEYS.physics, ARCHIVE_KEY, PROGRESS_KEY, AVATAR_KEY];
  var GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三'];
  var TEXTBOOKS = ['教科版', '人教版', '其他'];
  var CAT_IDS = ['cat-snow', 'cat-ginger', 'cat-tuxedo', 'cat-blue', 'cat-mocha'];
  var BOOK_VOLUMES = {
    physics: ['八上', '八下', '九全', '必修一', '必修二', '必修三', '选必一', '选必二', '选必三'],
    science: ['一上', '一下', '二上', '二下', '三上', '三下', '四上', '四下', '五上', '五下', '六上', '六下']
  };

  function validCat(value) { return CAT_IDS.indexOf(value) >= 0; }
  // 猫咪属于账号身份。旧账号沿用以前选过的猫，而不重置装扮、拼图或积分。
  function resolveCats(profiles, avatars) {
    var changed = false;
    profiles.children.forEach(function (child) {
      if (validCat(child.catId)) return;
      var box = avatars && avatars.byOwner && own(avatars.byOwner, child.id) ? avatars.byOwner[child.id] : null;
      child.catId = box && validCat(box.catId) ? box.catId : 'cat-snow';
      changed = true;
    });
    return changed;
  }

  function read(k, fallback) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  function state(freezeCats) {
    var s = read(KEY, null);
    if (!s || !Array.isArray(s.children)) s = { v: 1, current: null, children: [] };
    if (s.current && !s.children.some(function (c) { return c.id === s.current; })) s.current = s.children.length ? s.children[0].id : null;
    if (s.children.some(function (c) { return !validCat(c.catId); })) {
      var avatars = null, readable = true;
      try {
        var rawAvatar = localStorage.getItem(AVATAR_KEY);
        if (rawAvatar !== null) { avatars = JSON.parse(rawAvatar); checkAvatarRewards(avatars); }
      } catch (e) { readable = false; }
      // 只在普通档案读取时迁移；备份预览和失败的表单提交仍保持无写入。
      if (resolveCats(s, avatars) && freezeCats && readable) write(KEY, s);
    }
    return s;
  }
  function records() {
    var r = read(REC_KEY, null);
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function list() { return state(true).children.slice(); }
  function get(id) { return state(true).children.filter(function (c) { return c.id === id; })[0] || null; }
  function current() { var s = state(true); return s.children.filter(function (c) { return c.id === s.current; })[0] || null; }
  function setCurrent(id) {
    var s = state();
    if (id && !s.children.some(function (c) { return c.id === id; })) return false;
    s.current = id || null;
    return write(KEY, s);
  }

  function selectionState() {
    // 教材偏好只修改档案键，不迁移猫咪身份，也不读取/改写检测或积分数据。
    var raw, s;
    try {
      raw = localStorage.getItem(KEY);
      s = raw === null ? { v: 1, current: null, children: [] } : JSON.parse(raw);
    } catch (e) { throw new Error('无法读取本机账号，教材选择未改变。'); }
    checkArchive(s, {}, true);
    return s;
  }
  function selectionOwner(s, childId) {
    var owner = childId === undefined ? (s.current || 'guest') : (childId === null ? 'guest' : childId);
    if (owner !== 'guest' && !s.children.some(function (child) { return child.id === owner; })) throw new Error('找不到这个账号。');
    return owner;
  }
  function bookSelection(subject, childId) {
    if (!own(BOOK_VOLUMES, subject)) return null;
    try {
      var s = selectionState(), owner = selectionOwner(s, childId);
      return s.bookSelections && own(s.bookSelections, owner) && own(s.bookSelections[owner], subject) ? copy(s.bookSelections[owner][subject]) : null;
    } catch (e) { return null; }
  }
  /* 批量保存两科学材选择，先完整校验再一次写入；空数组表示明确移出全部教材。 */
  function setBookSelections(changes, childId) {
    try {
      if (!isObject(changes) || !Object.keys(changes).length) throw new Error('请选择要修改的学科教材。');
      checkSafeKeys(changes);
      var subjects = Object.keys(changes), normalized = {};
      subjects.forEach(function (subject) { normalized[subject] = normalizeBookVolumes(subject, changes[subject]); });
      var s = selectionState(), owner = selectionOwner(s, childId), at = new Date().toISOString();
      if (!s.bookSelections) s.bookSelections = {};
      if (!own(s.bookSelections, owner)) s.bookSelections[owner] = {};
      var selections = {};
      subjects.forEach(function (subject) {
        selections[subject] = { volumes: normalized[subject], at: at };
        s.bookSelections[owner][subject] = copy(selections[subject]);
      });
      if (!write(KEY, s)) return { ok: false, error: '浏览器无法保存教材选择，请检查存储空间后重试。' };
      return { ok: true, selections: copy(selections) };
    } catch (e) { return { ok: false, error: e.message || '无法读取本机账号，教材选择未改变。' }; }
  }
  function setBookSelection(subject, volumes, childId) {
    if (!own(BOOK_VOLUMES, subject)) return { ok: false, error: '教材学科不正确。' };
    var changes = {};
    changes[subject] = volumes;
    var result = setBookSelections(changes, childId);
    if (result.ok) result.selection = copy(result.selections[subject]);
    return result;
  }

  function clean(f) {
    var name = String(f && f.name || '').replace(/\s+/g, ' ').trim();
    var grade = GRADES.indexOf(f && f.grade) >= 0 ? f.grade : '';
    var textbook = TEXTBOOKS.indexOf(f && f.textbook) >= 0 ? f.textbook : TEXTBOOKS[0];
    return { name: name, grade: grade, textbook: textbook };
  }
  function check(s, f, selfId) {
    if (!f.name) return '请填写孩子的昵称。';
    if (f.name.length > 12) return '昵称最多 12 个字。';
    if (!f.grade) return '请选择年级。';
    if (s.children.some(function (c) { return c.id !== selfId && c.name === f.name; })) return '已经有叫「' + f.name + '」的孩子了，换个昵称区分。';
    return '';
  }

  /* 返回 { ok, error, child } */
  function add(form) {
    var s = state();
    var f = clean(form);
    if (s.children.length >= MAX_CHILDREN) return { ok: false, error: '最多可以建 ' + MAX_CHILDREN + ' 个孩子。' };
    var err = check(s, f, null);
    if (err) return { ok: false, error: err };
    var catId = form && own(form, 'catId') ? form.catId : 'cat-snow';
    if (!validCat(catId)) return { ok: false, error: '请选择一种猫咪形象。' };
    var child = { id: newId(), name: f.name, grade: f.grade, textbook: f.textbook, catId: catId, createdAt: new Date().toISOString() };
    s.children.push(child);
    if (!s.current) s.current = child.id;
    if (!write(KEY, s)) return { ok: false, error: '浏览器不允许保存数据（可能是隐私模式），档案无法保存。' };
    return { ok: true, child: child };
  }
  function update(id, form) {
    var s = state();
    var f = clean(form);
    var i = s.children.map(function (c) { return c.id; }).indexOf(id);
    if (i < 0) return { ok: false, error: '找不到这个孩子。' };
    var err = check(s, f, id);
    if (err) return { ok: false, error: err };
    s.children[i] = Object.assign({}, s.children[i], f);
    if (!write(KEY, s)) return { ok: false, error: '浏览器无法保存修改，请检查存储空间后重试。' };
    return { ok: true, child: s.children[i] };
  }
  function remove(id) {
    var s = state();
    s.children = s.children.filter(function (c) { return c.id !== id; });
    if (s.current === id) s.current = s.children.length ? s.children[0].id : null;
    if (isObject(s.bookSelections) && own(s.bookSelections, id)) delete s.bookSelections[id];
    if (!write(KEY, s)) return false;
    var r = records();
    delete r[id];
    write(REC_KEY, r);
    // 不依赖 progress.js 已加载；档案删除后也清理该孩子的图谱进度，访客及其他孩子保留。
    try {
      var rawProgress = localStorage.getItem(PROGRESS_KEY);
      if (rawProgress !== null) {
        var progress = JSON.parse(rawProgress);
        checkProgress(progress);
        delete progress.byChild[id];
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
        emitProgress();
      }
    } catch (e) { /* 存储异常时保留原数据 */ }
    try {
      var rawAvatar = localStorage.getItem(AVATAR_KEY);
      if (rawAvatar !== null) {
        var avatars = JSON.parse(rawAvatar);
        checkAvatarRewards(avatars);
        delete avatars.byOwner[id];
        localStorage.setItem(AVATAR_KEY, JSON.stringify(avatars));
      }
    } catch (e) { /* 装扮存储异常时保留原数据，不影响其他档案。 */ }
    return true;
  }

  function recordsOf(childId) {
    var r = records()[childId];
    return Array.isArray(r) ? r.filter(function (rec) {
      return rec && (rec.subject === 'science' || rec.subject === 'physics');
    }).sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); }) : [];
  }
  /* 按 rec.key 覆盖：同一次检测反复打开结果页、更正答案，只会更新这一条 */
  function saveRecord(childId, rec) {
    if (!childId || !rec || !rec.key || (rec.subject !== 'science' && rec.subject !== 'physics') ||
        (own(rec, 'level') && rec.level !== 'normal' && rec.level !== 'pro') || (rec.level === 'pro' && rec.subject !== 'physics')) return false;
    var all = records();
    var arr = Array.isArray(all[childId]) ? all[childId] : [];
    var keepImportedHistory = arr.length > MAX_RECORDS;
    var i = arr.map(function (x) { return x.key; }).indexOf(rec.key);
    var now = new Date().toISOString();
    if (i >= 0) arr[i] = Object.assign({}, rec, { savedAt: arr[i].savedAt, updatedAt: now });
    else arr.push(Object.assign({}, rec, { savedAt: now, updatedAt: now }));
    arr.sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
    all[childId] = keepImportedHistory ? arr : arr.slice(0, MAX_RECORDS);
    return write(REC_KEY, all);
  }
  function hasRecord(childId, key) {
    return recordsOf(childId).some(function (x) { return x.key === key; });
  }
  function moveRecord(key, fromId, toId) {
    if (!key || fromId === toId) return;
    var all = records();
    var from = Array.isArray(all[fromId]) ? all[fromId] : [];
    var rec = from.filter(function (x) { return x.key === key; })[0];
    if (!rec) return;
    all[fromId] = from.filter(function (x) { return x.key !== key; });
    var to = Array.isArray(all[toId]) ? all[toId] : [];
    var keepImportedHistory = to.length > MAX_RECORDS;
    if (!to.some(function (x) { return x.key === key; })) to.push(rec);
    to.sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
    all[toId] = keepImportedHistory ? to : to.slice(0, MAX_RECORDS);
    write(REC_KEY, all);
  }
  function removeRecord(childId, key) {
    var all = records();
    if (!Array.isArray(all[childId])) return;
    all[childId] = all[childId].filter(function (x) { return x.key !== key; });
    write(REC_KEY, all);
  }

  function presentRecord(record) {
    var compat = typeof window !== 'undefined' ? window.StemCompat : null;
    return compat && compat.presentRecord ? compat.presentRecord(record) : record;
  }

  /* 把某个孩子的全部记录合成「每个知识点现在的状态」：越新的记录越说了算。
   * 返回 { id: { status, recKey, at, label, root, subject, needsRetest } }。
   * 没有现行题干戳的 cnc_p124 不记成语气的掌握 / 薄弱 / 不稳，只标需重测。 */
  function latestStatus(childId, subject, level) {
    var recs = recordsOf(childId).filter(function (r) { return (!subject || r.subject === subject) && (r.level === 'pro' ? 'pro' : 'normal') === (level === 'pro' ? 'pro' : 'normal'); }).reverse();
    var by = {};
    recs.forEach(function (r) {
      var view = presentRecord(r);
      var roots = {};
      (view.roots || []).forEach(function (id) { roots[id] = true; });
      var put = function (ids, status) {
        (ids || []).forEach(function (id) {
          by[id] = { status: status, recKey: r.key, at: r.savedAt, label: r.label, root: !!roots[id], subject: r.subject, needsRetest: false };
        });
      };
      put(view.mastered, 'mastered');
      put(view.shaky, 'shaky');
      put(view.weak, 'weak');
      (view.needsRetest || []).forEach(function (id) {
        if (!by[id] || by[id].status === 'retest') {
          by[id] = { status: 'retest', recKey: r.key, at: r.savedAt, label: r.label, root: false, subject: r.subject, needsRetest: true };
        }
      });
    });
    return by;
  }

  /* v2 备份同时保留两科学习数据；仅使用明确列出的存储键，不带入访问统计。
   * 严格读取，避免把损坏或无法读取的数据当作空备份。 */
  function exportBackup() {
    var snapshot = importSnapshot();
    if (!snapshot.profiles.children.length && !Object.keys(snapshot.learning.wrongbook).some(function (id) {
      return snapshot.learning.wrongbook[id].length;
    }) && !Object.keys(snapshot.learning.blindspots.byId).length && !Object.keys(snapshot.learning.sessions).length &&
        !snapshot.learning.archivedSessions.length && !Object.keys(snapshot.learning.progress.byChild).length &&
        !Object.keys(snapshot.learning.avatarRewards.byOwner).length &&
        !Object.keys(snapshot.profiles.bookSelections || {}).some(function (owner) { return Object.keys(snapshot.profiles.bookSelections[owner]).length; })) {
      throw new Error('还没有可导出的档案或学习数据。');
    }
    var backup = {
      format: 'cn-math-taxonomy.children',
      version: 2,
      exportedAt: new Date().toISOString(),
      profiles: snapshot.profiles,
      records: snapshot.records,
      learning: snapshot.learning
    };
    checkBackup(backup);
    return backup;
  }

  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function validId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) &&
      ['__proto__', 'constructor', 'prototype'].indexOf(value) < 0;
  }
  function checkSafeKeys(value, depth) {
    if (!value || typeof value !== 'object') return;
    depth = depth || 0;
    if (depth > 40) throw new Error('备份数据层级过深。');
    Object.keys(value).forEach(function (key) {
      if (['__proto__', 'constructor', 'prototype'].indexOf(key) >= 0) throw new Error('备份含有不允许的数据字段。');
      checkSafeKeys(value[key], depth + 1);
    });
  }
  function normalizeBookVolumes(subject, volumes) {
    if (!own(BOOK_VOLUMES, subject) || !Array.isArray(volumes)) throw new Error('教材学科或列表不正确。');
    for (var i = 0; i < volumes.length; i++) {
      if (!own(volumes, i) || BOOK_VOLUMES[subject].indexOf(volumes[i]) < 0) throw new Error('教材列表中有不支持的册次。');
    }
    return BOOK_VOLUMES[subject].filter(function (volume) { return volumes.indexOf(volume) >= 0; });
  }
  function checkBookSelections(selections, ids) {
    if (!isObject(selections)) throw new Error('教材选择数据不正确。');
    checkSafeKeys(selections);
    Object.keys(selections).forEach(function (owner) {
      if ((owner !== 'guest' && !ids.has(owner)) || !isObject(selections[owner])) throw new Error('教材选择没有对应的账号。');
      Object.keys(selections[owner]).forEach(function (subject) {
        var selection = selections[owner][subject];
        if (!isObject(selection) || !own(selection, 'volumes') || !own(selection, 'at') || !validDate(selection.at) || Object.keys(selection).some(function (key) { return key !== 'volumes' && key !== 'at'; })) throw new Error('教材选择的册次或时间不正确。');
        normalizeBookVolumes(subject, selection.volumes);
      });
    });
  }
  function checkArchive(profiles, history, allowEmpty) {
    if (!isObject(profiles) || profiles.v !== 1 || !Array.isArray(profiles.children) ||
        (!allowEmpty && !profiles.children.length) || profiles.children.length > MAX_CHILDREN || !isObject(history)) {
      throw new Error('档案数据格式或数量不正确。');
    }
    var ids = new Set();
    profiles.children.forEach(function (c) {
      if (!isObject(c) || !validId(c.id) || ids.has(c.id) ||
          typeof c.name !== 'string' || !c.name.trim() || c.name.length > 12 ||
          GRADES.indexOf(c.grade) < 0 || TEXTBOOKS.indexOf(c.textbook) < 0 || !validDate(c.createdAt) ||
          (own(c, 'catId') && !validCat(c.catId))) {
        throw new Error('孩子资料不完整、ID 重复，或年级和教材版本不正确。');
      }
      ids.add(c.id);
    });
    if (profiles.current !== null && !ids.has(profiles.current)) throw new Error('当前孩子不在备份档案中。');
    if (own(profiles, 'bookSelections')) checkBookSelections(profiles.bookSelections, ids);
    Object.keys(history).forEach(function (id) {
      if (!ids.has(id) || !Array.isArray(history[id])) throw new Error('检测记录没有对应的孩子档案。');
      var keys = new Set();
      history[id].forEach(function (r) {
        if (!isObject(r) || typeof r.key !== 'string' || !r.key || keys.has(r.key) ||
            ['science', 'physics'].indexOf(r.subject) < 0 || !validDate(r.savedAt) ||
            (own(r, 'updatedAt') && !validDate(r.updatedAt)) ||
            (own(r, 'level') && r.level !== 'normal' && r.level !== 'pro') || (r.level === 'pro' && r.subject !== 'physics')) throw new Error('检测记录的标识、学科或时间不正确。');
        keys.add(r.key);
        ['weak', 'roots', 'shaky', 'mastered', 'targets'].forEach(function (field) {
          if (!own(r, field) || (field === 'targets' && r[field] === null)) return;
          if (!Array.isArray(r[field]) || !r[field].every(function (topic) {
            return validId(topic) && subjectOfTopic(topic) === r.subject;
          })) throw new Error('检测记录的知识点列表不正确。');
        });
        if ((own(r, 'asked') && (!Number.isInteger(r.asked) || r.asked < 0)) ||
            (own(r, 'label') && typeof r.label !== 'string') ||
            (own(r, 'mode') && ['target', 'screen', 'textbook'].indexOf(r.mode) < 0)) throw new Error('检测记录的范围或题数不正确。');
        if (own(r, 'counts') && (!isObject(r.counts) || !Object.keys(r.counts).every(function (key) {
          return Number.isInteger(r.counts[key]) && r.counts[key] >= 0;
        }))) throw new Error('检测记录的统计不正确。');
      });
    });
    checkSafeKeys(profiles);
    checkSafeKeys(history);
  }
  function checkBackup(backup) {
    if (!isObject(backup) || backup.format !== 'cn-math-taxonomy.children') throw new Error('请选择本站导出的档案备份文件。');
    if (backup.version !== 1 && backup.version !== 2) throw new Error('暂不支持这个备份版本。');
    if (!validDate(backup.exportedAt)) throw new Error('备份导出时间不正确。');
    checkSafeKeys(backup);
    checkSize(JSON.stringify(backup));
    checkArchive(backup.profiles, backup.records, backup.version === 2);
    if (backup.version === 2) checkLearning(backup.learning);
  }
  function checkSize(text) {
    // 文件限制按 UTF-8 字节计算；中文不能按 JS 字符数误算。
    var bytes = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) bytes++;
      else if (c < 2048) bytes += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length &&
               text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) { bytes += 4; i++; }
      else bytes += 3;
      if (bytes > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 10 MB。');
    }
  }
  function subjectOfTopic(id) {
    if (typeof id !== 'string') return '';
    if (/^cns_[A-Za-z0-9]+$/.test(id)) return 'science';
    if (/^cnp_[A-Za-z0-9]+$/.test(id)) return 'physics';
    return '';
  }
  function validQuestion(qid, topic) {
    return typeof qid === 'string' && new RegExp('^' + topic + '_q[1-9][0-9]*$').test(qid);
  }
  function shortText(value, max) { return typeof value === 'string' && value.length <= (max || 4000); }
  function validReturnTo(value) {
    return shortText(value, 4096) && !/[\u0000-\u0020\u007f\\]/.test(value) &&
      /^\/(?:[^/?#\s\\]+\/)*explore\/(?:index\.html)?(?:[?#][^\s\\]*)?$/.test(value);
  }
  function natural(value) { return Number.isSafeInteger(value) && value >= 0; }
  function emptyLearning() {
    return { wrongbook: {}, sessions: {}, blindspots: { v: 1, byId: {} }, archivedSessions: [], progress: { v: 1, byChild: {} }, avatarRewards: { v: 1, byOwner: {} } };
  }
  function checkSession(session, subject) {
    function topics(ids) { return Array.isArray(ids) && ids.every(function (id) { return subjectOfTopic(id) === subject; }); }
    if (!isObject(session) || session.v !== 2 || ['target', 'screen', 'textbook'].indexOf(session.mode) < 0 ||
        !topics(session.targets) || !session.targets.length || !natural(session.limit) || session.limit < 1 || session.limit > 1000 ||
        !natural(session.confirm) || session.confirm < 1 || session.confirm > 10 || !shortText(session.seed, 256) ||
        !shortText(session.label) || !validDate(session.savedAt) || !Array.isArray(session.answers) ||
        (own(session, 'avoid') && (!Array.isArray(session.avoid) || !session.avoid.every(function (qid) {
          // seenList 是全站共用，科学之后开启物理时自然包含科学题号。
          // 历史其他学科题号也仅用于排重，不能按本次活动学科限制。
          return shortText(qid, 160) && /^cn[a-z]_[A-Za-z0-9]+_q[1-9][0-9]*$/.test(qid);
        })))) throw new Error('进行中检测的范围、设置或时间不正确。');
    if ((own(session, 'level') && session.level !== 'normal' && session.level !== 'pro') ||
        (session.level === 'pro' && (subject !== 'physics' || session.mode !== 'target' || session.targets.length !== 1)) ||
        (own(session, 'progressChildId') && session.progressChildId !== null && !validId(session.progressChildId)) ||
        (own(session, 'volume') && !shortText(session.volume, 100)) ||
        (own(session, 'order') && session.order !== 'book') ||
        (own(session, 'returnTo') && !validReturnTo(session.returnTo))) throw new Error('进行中检测的归属、教材或返回位置不正确。');
    session.answers.forEach(function (answer) {
      if (!isObject(answer) || subjectOfTopic(answer.id) !== subject || !validQuestion(answer.qid, answer.id) ||
          ['correct', 'wrong', 'skip'].indexOf(answer.result) < 0 ||
          (own(answer, 'text') && !shortText(answer.text)) || (own(answer, 'prompt') && !shortText(answer.prompt))) {
        throw new Error('进行中检测的作答数据不正确。');
      }
    });
    if (own(session, 'excluded') && (!Array.isArray(session.excluded) || !session.excluded.every(function (answer) {
      return isObject(answer) && subjectOfTopic(answer.id) === subject && validQuestion(answer.qid, answer.id) &&
        ['correct', 'wrong', 'skip'].indexOf(answer.result) >= 0 && shortText(answer.prompt);
    }))) throw new Error('进行中检测的排除记录不正确。');
  }
  function checkLearning(learning) {
    if (!isObject(learning) || !isObject(learning.wrongbook) || !isObject(learning.sessions) ||
        !isObject(learning.blindspots) || learning.blindspots.v !== 1 || !isObject(learning.blindspots.byId) ||
        !Array.isArray(learning.archivedSessions) || Object.keys(learning).some(function (key) {
          return ['wrongbook', 'sessions', 'blindspots', 'archivedSessions', 'progress', 'avatarRewards'].indexOf(key) < 0;
        })) throw new Error('学习备份数据格式不正确。');
    // 新增字段保持可选，旧版 v2 学习备份可原样导入。
    if (own(learning, 'progress')) checkProgress(learning.progress);
    if (own(learning, 'avatarRewards')) checkAvatarRewards(learning.avatarRewards);
    Object.keys(learning.wrongbook).forEach(function (bucket) {
      if (!validId(bucket) || !Array.isArray(learning.wrongbook[bucket])) throw new Error('错题本分组不正确。');
      var seen = new Set();
      learning.wrongbook[bucket].forEach(function (row) {
        if (!isObject(row) || !subjectOfTopic(row.topicId) || subjectOfTopic(row.topicId) !== row.subject ||
            !validQuestion(row.qid, row.topicId) || seen.has(row.qid) || !shortText(row.topic) || !shortText(row.prompt) ||
            !shortText(row.answer) || !shortText(row.chosen) || !shortText(row.explanation) ||
            ['wrong', 'skip'].indexOf(row.kind) < 0 || !natural(row.ts) || !row.ts || !natural(row.count) || !row.count ||
            (row.choices !== null && (!Array.isArray(row.choices) || !row.choices.every(function (c) {
              return isObject(c) && shortText(c.key) && shortText(c.text);
            })))) throw new Error('错题的题号、内容、学科或时间不正确。');
        seen.add(row.qid);
      });
    });
    Object.keys(learning.sessions).forEach(function (subject) {
      if (!own(SESSION_KEYS, subject)) throw new Error('进行中检测含有不支持的学科。');
      checkSession(learning.sessions[subject], subject);
    });
    learning.archivedSessions.forEach(function (entry) {
      if (!isObject(entry) || !own(SESSION_KEYS, entry.subject)) throw new Error('检测归档的学科不正确。');
      checkSession(entry.session, entry.subject);
    });
    Object.keys(learning.blindspots.byId).forEach(function (id) {
      var row = learning.blindspots.byId[id];
      if (!isObject(row) || !subjectOfTopic(id) || row.id !== id || row.subject !== subjectOfTopic(id) ||
          ['mastered', 'weak', 'shaky', 'retest'].indexOf(row.status) < 0 || !validDate(row.lastAt) ||
          !natural(row.hits) || !natural(row.wrongs) || typeof row.root !== 'boolean' ||
          (own(row, 'lastLabel') && !shortText(row.lastLabel)) || (own(row, 'lastKey') && !shortText(row.lastKey))) {
        throw new Error('盲区台账的知识点、状态或时间不正确。');
      }
    });
  }
  function checkProgress(progress) {
    if (!isObject(progress) || progress.v !== 1 || !isObject(progress.byChild)) throw new Error('图谱检测进度格式不正确。');
    Object.keys(progress.byChild).forEach(function (bucket) {
      var box = progress.byChild[bucket];
      if (!validId(bucket) || !isObject(box) || !Array.isArray(box.runs)) throw new Error('图谱进度分组不正确。');
      if (own(box, 'earned') && (!isObject(box.earned) || Object.keys(box.earned).some(function (level) {
        return ['normal', 'pro'].indexOf(level) < 0 || !isObject(box.earned[level]) || Object.keys(box.earned[level]).some(function (id) {
          return !subjectOfTopic(id) || (level === 'pro' && subjectOfTopic(id) !== 'physics') || !validDate(box.earned[level][id]);
        });
      }))) throw new Error('成就积分数据不正确。');
      var keys = new Set();
      box.runs.forEach(function (run) {
        if (!isObject(run) || !shortText(run.key, 20000) || !run.key || !validDate(run.at) ||
            ['science', 'physics'].indexOf(run.subject) < 0 || !isObject(run.states) ||
            (own(run, 'level') && run.level !== 'normal' && run.level !== 'pro') || (run.level === 'pro' && run.subject !== 'physics') ||
            keys.has(progressRunKey(run))) throw new Error('图谱检测记录的标识或时间不正确。');
        keys.add(progressRunKey(run));
        Object.keys(run.states).forEach(function (id) {
          var state = run.states[id];
          if (subjectOfTopic(id) !== run.subject || !isObject(state) ||
              ['mastered', 'weak', 'shaky'].indexOf(state.status) < 0 || !validDate(state.at) ||
              (own(state, 'signature') && (!shortText(state.signature, 16) || !/^[a-f0-9]{16}$/.test(state.signature)))) {
            throw new Error('图谱检测进度的知识点或状态不正确。');
          }
        });
      });
    });
  }
  function avatarSkin(value) { return typeof value === 'string' && /^skin-(?:0[1-9]|10)$/.test(value); }
  function checkAvatarRewards(store) {
    if (!isObject(store) || store.v !== 1 || !isObject(store.byOwner)) throw new Error('头像装扮数据格式不正确。');
    Object.keys(store.byOwner).forEach(function (owner) {
      var box = store.byOwner[owner], ids = new Set(), pieces = {};
      if (!validId(owner) || !isObject(box) || !Array.isArray(box.draws) ||
          (box.equipped !== 'default' && !avatarSkin(box.equipped)) || !validDate(box.equippedAt)) {
        throw new Error('头像装扮的归属或穿戴数据不正确。');
      }
      if (own(box, 'catId') !== own(box, 'catAt') || (own(box, 'catId') &&
          (!validCat(box.catId) || !validDate(box.catAt)))) {
        throw new Error('猫咪形象的选择或时间不正确。');
      }
      box.draws.forEach(function (draw) {
        if (!isObject(draw) || !validId(draw.id) || ids.has(draw.id) || !avatarSkin(draw.skinId) ||
            !Number.isInteger(draw.piece) || draw.piece < 0 || draw.piece > 8 || draw.cost !== 1 || !validDate(draw.at)) {
          throw new Error('拼图兑换记录的标识、装扮、碎片或消耗不正确。');
        }
        ids.add(draw.id);
        if (!pieces[draw.skinId]) pieces[draw.skinId] = new Set();
        pieces[draw.skinId].add(draw.piece);
      });
      if (box.equipped !== 'default' && (!pieces[box.equipped] || pieces[box.equipped].size !== 9)) {
        throw new Error('穿戴的装扮尚未集齐九块拼图。');
      }
    });
  }
  function parseBackup(text) {
    if (typeof text !== 'string') throw new Error('备份文件不是文本。');
    checkSize(text);
    var backup;
    try { backup = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) { throw new Error('文件不是有效的 JSON，档案未改变。'); }
    checkBackup(backup);
    return backup;
  }
  function importSnapshot() {
    var raw = {}, profiles, history, learning = emptyLearning();
    try {
      BACKUP_KEYS.forEach(function (key) { raw[key] = localStorage.getItem(key); });
      profiles = raw[KEY] === null ? { v: 1, current: null, children: [] } : JSON.parse(raw[KEY]);
      history = raw[REC_KEY] === null ? {} : JSON.parse(raw[REC_KEY]);
      if (raw[WRONG_KEY] !== null) learning.wrongbook = JSON.parse(raw[WRONG_KEY]);
      if (raw[BLIND_KEY] !== null) learning.blindspots = JSON.parse(raw[BLIND_KEY]);
      if (raw[ARCHIVE_KEY] !== null) learning.archivedSessions = JSON.parse(raw[ARCHIVE_KEY]);
      if (raw[PROGRESS_KEY] !== null) learning.progress = JSON.parse(raw[PROGRESS_KEY]);
      if (raw[AVATAR_KEY] !== null) learning.avatarRewards = JSON.parse(raw[AVATAR_KEY]);
      Object.keys(SESSION_KEYS).forEach(function (subject) {
        if (raw[SESSION_KEYS[subject]] !== null) learning.sessions[subject] = JSON.parse(raw[SESSION_KEYS[subject]]);
      });
    } catch (e) { throw new Error('无法读取本机档案或学习数据，操作已停止。请先检查本机数据。'); }
    checkSafeKeys(profiles); checkSafeKeys(history); checkSafeKeys(learning);
    checkArchive(profiles, history, true);
    checkLearning(learning);
    resolveCats(profiles, learning.avatarRewards);
    return { profiles: profiles, records: history, learning: learning, raw: raw, token: JSON.stringify(raw) };
  }
  function recordTime(r) { return Math.max(Date.parse(r.savedAt), Date.parse(r.updatedAt || r.savedAt)); }
  function stableJSON(value) {
    if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
    if (isObject(value)) return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableJSON(value[key]);
    }).join(',') + '}';
    return JSON.stringify(value);
  }
  function sessionSignature(subject, session) {
    var content = copy(session);
    delete content.savedAt;
    return subject + '|' + stableJSON(content);
  }
  function archiveSession(learning, subject, session) {
    var signature = sessionSignature(subject, session);
    if (learning.sessions[subject] && sessionSignature(subject, learning.sessions[subject]) === signature) return false;
    var found = learning.archivedSessions.some(function (entry) {
      return sessionSignature(entry.subject, entry.session) === signature;
    });
    if (!found) learning.archivedSessions.push({ subject: subject, session: copy(session) });
    return !found;
  }
  function progressRunKey(run) { return (run.level === 'pro' ? 'pro' : 'normal') + '|' + run.subject + '|' + run.key; }
  function progressEarned(box) {
    var earned = { normal: {}, pro: {} };
    function put(level, id, at) { if (!earned[level][id] || Date.parse(at) < Date.parse(earned[level][id])) earned[level][id] = at; }
    ['normal', 'pro'].forEach(function (level) {
      Object.keys(box.earned && box.earned[level] || {}).forEach(function (id) { put(level, id, box.earned[level][id]); });
    });
    box.runs.forEach(function (run) {
      Object.keys(run.states).forEach(function (id) { if (run.level !== 'pro' && run.states[id].status === 'mastered') put('normal', id, run.states[id].at); });
    });
    return earned;
  }
  function mergeLearning(local, incoming, summary) {
    var merged = copy(local);
    Object.keys(incoming.wrongbook).forEach(function (bucket) {
      var rows = new Map();
      (merged.wrongbook[bucket] || []).forEach(function (row) { rows.set(row.qid, row); });
      incoming.wrongbook[bucket].forEach(function (row) {
        var old = rows.get(row.qid);
        if (!old) { rows.set(row.qid, copy(row)); summary.addedWrongs++; }
        else {
          var next = copy(row.ts > old.ts ? row : old);
          next.count = Math.max(old.count, row.count);
          if (stableJSON(next) !== stableJSON(old)) summary.updatedWrongs++;
          rows.set(row.qid, next);
        }
      });
      merged.wrongbook[bucket] = Array.from(rows.values());
    });
    Object.keys(incoming.blindspots.byId).forEach(function (id) {
      var row = incoming.blindspots.byId[id], old = merged.blindspots.byId[id];
      if (!old) { merged.blindspots.byId[id] = copy(row); summary.addedBlindspots++; }
      else {
        var next = copy(Date.parse(row.lastAt) > Date.parse(old.lastAt) ? row : old);
        next.hits = Math.max(old.hits, row.hits);
        next.wrongs = Math.max(old.wrongs, row.wrongs);
        if (stableJSON(next) !== stableJSON(old)) summary.updatedBlindspots++;
        merged.blindspots.byId[id] = next;
      }
    });
    Object.keys(incoming.sessions).forEach(function (subject) {
      var session = incoming.sessions[subject];
      if (!merged.sessions[subject]) { merged.sessions[subject] = copy(session); summary.restoredSessions++; }
      else if (archiveSession(merged, subject, session)) summary.archivedSessions++;
    });
    incoming.archivedSessions.forEach(function (entry) {
      if (archiveSession(merged, entry.subject, entry.session)) summary.archivedSessions++;
    });
    var progress = incoming.progress || { v: 1, byChild: {} };
    Object.keys(progress.byChild).forEach(function (bucket) {
      if (!own(merged.progress.byChild, bucket)) merged.progress.byChild[bucket] = { runs: [] };
      var box = merged.progress.byChild[bucket], source = progress.byChild[bucket], runs = new Map();
      var localEarned = progressEarned(box), incomingEarned = progressEarned(source);
      var keepEarned = own(box, 'earned') || own(source, 'earned');
      box.runs.forEach(function (run) { runs.set(progressRunKey(run), run); });
      source.runs.forEach(function (run) {
        var key = progressRunKey(run), old = runs.get(key);
        // 新版快照仍决定图谱状态；两份快照都保留已获得的首次通关积分。
        if (old && stableJSON(old) !== stableJSON(run)) keepEarned = true;
        if (!old) { runs.set(key, copy(run)); summary.addedProgress++; }
        else if (Date.parse(run.at) > Date.parse(old.at)) { runs.set(key, copy(run)); summary.updatedProgress++; }
      });
      box.runs = Array.from(runs.values());
      if (keepEarned) {
        ['normal', 'pro'].forEach(function (level) {
          Object.keys(incomingEarned[level]).forEach(function (id) {
            var at = incomingEarned[level][id];
            if (!localEarned[level][id] || Date.parse(at) < Date.parse(localEarned[level][id])) localEarned[level][id] = at;
          });
        });
        Object.keys(localEarned.pro).forEach(function (id) { if (!localEarned.normal[id] || Date.parse(localEarned.normal[id]) > Date.parse(localEarned.pro[id])) delete localEarned.pro[id]; });
        box.earned = localEarned;
      }
    });
    var avatars = incoming.avatarRewards || { v: 1, byOwner: {} };
    Object.keys(avatars.byOwner).forEach(function (owner) {
      var source = avatars.byOwner[owner];
      if (!own(merged.avatarRewards.byOwner, owner)) {
        merged.avatarRewards.byOwner[owner] = copy(source);
        summary.addedAvatarDraws += source.draws.length;
        if (source.equipped !== 'default') summary.updatedAvatarEquipment++;
        if (source.catId && source.catId !== 'cat-snow') summary.updatedAvatarCats++;
        return;
      }
      var box = merged.avatarRewards.byOwner[owner], draws = new Map();
      box.draws.forEach(function (draw) { draws.set(draw.id, draw); });
      source.draws.forEach(function (draw) {
        var old = draws.get(draw.id);
        if (old && stableJSON(old) !== stableJSON(draw)) throw new Error('同一笔拼图兑换记录存在冲突，未导入任何数据。');
        if (!old) { draws.set(draw.id, copy(draw)); summary.addedAvatarDraws++; }
      });
      // 支出按唯一兑换事件并集保留，旧备份不会返还已经消耗的月亮。
      box.draws = Array.from(draws.values());
      if (Date.parse(source.equippedAt) > Date.parse(box.equippedAt)) {
        if (box.equipped !== source.equipped) summary.updatedAvatarEquipment++;
        box.equipped = source.equipped; box.equippedAt = source.equippedAt;
      }
      // 旧猫咪字段仅作为迁移资料保留。账号身份由 profile.catId 决定，不能通过新备份换猫。
    });
    return merged;
  }
  function prepareImport(backup) {
    checkBackup(backup);
    var before = importSnapshot();
    var profiles = copy(before.profiles);
    var history = copy(before.records);
    var byId = new Map();
    var names = new Set();
    profiles.children.forEach(function (c) { byId.set(c.id, c); names.add(c.name); });
    var additions = backup.profiles.children.filter(function (c) { return !byId.has(c.id); }).length;
    if (profiles.children.length + additions > MAX_CHILDREN) throw new Error('合并后会超过 ' + MAX_CHILDREN + ' 个孩子，请先整理现有档案。');
    // 先保留所有不冲突的原名，再为同名的新档案分配名称，重复导入仍按 ID 合并。
    backup.profiles.children.forEach(function (c) { if (!byId.has(c.id)) names.add(c.name); });
    var summary = { addedChildren: 0, matchedChildren: 0, renamedChildren: 0, addedRecords: 0, updatedRecords: 0, keptRecords: 0,
      addedWrongs: 0, updatedWrongs: 0, addedBlindspots: 0, updatedBlindspots: 0, restoredSessions: 0, archivedSessions: 0,
      addedProgress: 0, updatedProgress: 0, addedAvatarDraws: 0, updatedAvatarEquipment: 0, updatedAvatarCats: 0,
      children: [], token: before.token, legacy: backup.version === 1 };
    var usedNames = new Set(profiles.children.map(function (c) { return c.name; }));
    backup.profiles.children.forEach(function (source) {
      var child = byId.get(source.id);
      var action = 'merge';
      if (child) summary.matchedChildren++;
      else {
        child = copy(source);
        resolveCats({ children: [child] }, backup.version === 2 ? backup.learning.avatarRewards : null);
        if (usedNames.has(child.name)) {
          var n = 1, candidate;
          do {
            var suffix = n === 1 ? '（导入）' : '（导入' + n + '）';
            candidate = source.name.slice(0, Math.max(0, 12 - suffix.length)) + suffix;
            n++;
          } while (names.has(candidate));
          child.name = candidate;
          summary.renamedChildren++;
          action = 'rename';
        } else action = 'add';
        usedNames.add(child.name); names.add(child.name);
        byId.set(child.id, child); profiles.children.push(child); summary.addedChildren++;
      }
      var merged = new Map();
      (history[child.id] || []).forEach(function (r) { merged.set(r.key, r); });
      (backup.records[child.id] || []).forEach(function (r) {
        var old = merged.get(r.key);
        if (!old) { merged.set(r.key, copy(r)); summary.addedRecords++; }
        else if (recordTime(r) > recordTime(old)) { merged.set(r.key, copy(r)); summary.updatedRecords++; }
        else summary.keptRecords++;
      });
      if (own(history, child.id) || own(backup.records, child.id)) history[child.id] = Array.from(merged.values());
      summary.children.push({ name: child.name, sourceName: source.name, action: action, records: merged.size });
    });
    if (!before.profiles.children.length) profiles.current = backup.profiles.current;
    Object.keys(backup.profiles).forEach(function (key) { if (key !== 'bookSelections' && !own(profiles, key)) profiles[key] = copy(backup.profiles[key]); });
    if (own(backup.profiles, 'bookSelections')) {
      if (!profiles.bookSelections) profiles.bookSelections = {};
      Object.keys(backup.profiles.bookSelections).forEach(function (owner) {
        if (!own(profiles.bookSelections, owner)) profiles.bookSelections[owner] = {};
        Object.keys(backup.profiles.bookSelections[owner]).forEach(function (subject) {
          var sourceSelection = backup.profiles.bookSelections[owner][subject], localSelection = profiles.bookSelections[owner][subject];
          // 相同时间保留本机，旧备份不会悄悄恢复用户已移出的教材。
          if (!localSelection || Date.parse(sourceSelection.at) > Date.parse(localSelection.at)) {
            profiles.bookSelections[owner][subject] = { volumes: normalizeBookVolumes(subject, sourceSelection.volumes), at: sourceSelection.at };
          }
        });
      });
    }
    var learning = mergeLearning(before.learning, backup.version === 2 ? backup.learning : emptyLearning(), summary);
    return { before: before, profiles: profiles, records: history, learning: learning, summary: summary };
  }
  function previewImport(backup) { return prepareImport(backup).summary; }
  function writeSnapshot(before, profiles, history, learning) {
    var next = {};
    next[REC_KEY] = JSON.stringify(history);
    next[KEY] = JSON.stringify(profiles);
    next[WRONG_KEY] = JSON.stringify(learning.wrongbook);
    next[BLIND_KEY] = JSON.stringify(learning.blindspots);
    Object.keys(SESSION_KEYS).forEach(function (subject) {
      next[SESSION_KEYS[subject]] = learning.sessions[subject] ? JSON.stringify(learning.sessions[subject]) : null;
    });
    next[ARCHIVE_KEY] = JSON.stringify(learning.archivedSessions);
    next[AVATAR_KEY] = JSON.stringify(learning.avatarRewards);
    next[PROGRESS_KEY] = JSON.stringify(learning.progress);
    var written = [];
    try {
      Object.keys(next).forEach(function (key) {
        // 不创建无内容的辅助键，也避免重复导入造成无意义写入。
        if (next[key] === before.raw[key] || (before.raw[key] === null &&
            (next[key] === '{}' || next[key] === '[]' || next[key] === '{"v":1,"byId":{}}' || next[key] === '{"v":1,"byChild":{}}' || next[key] === '{"v":1,"byOwner":{}}'))) return;
        if (next[key] === null) localStorage.removeItem(key);
        else localStorage.setItem(key, next[key]);
        written.push(key);
      });
    } catch (e) {
      var rollbackFailed = false;
      written.reverse().forEach(function (key) {
        try {
          if (before.raw[key] === null) localStorage.removeItem(key);
          else localStorage.setItem(key, before.raw[key]);
        } catch (rollbackError) { rollbackFailed = true; }
      });
      if (rollbackFailed) throw new Error('操作未完成，原数据恢复失败。请保留备份文件并检查浏览器存储。');
      throw new Error('浏览器无法保存数据，原有档案和学习数据未改变。可能是存储空间不足。');
    }
  }
  function importBackup(backup, token) {
    var plan = prepareImport(backup);
    if (token !== plan.before.token) throw new Error('本机档案或学习数据已发生变化，请重新预览后再导入。');
    writeSnapshot(plan.before, plan.profiles, plan.records, plan.learning);
    emitProgress();
    return plan.summary;
  }
  function emitProgress() {
    try { if (window.dispatchEvent) window.dispatchEvent(new Event('cnm:progress')); } catch (e) { /* 非浏览器环境 */ }
  }
  function archivedSessions() {
    var snapshot = importSnapshot();
    return { token: snapshot.token, items: snapshot.learning.archivedSessions.map(function (entry, index) {
      return { index: index, subject: entry.subject, level: entry.session.level === 'pro' ? 'pro' : 'normal', label: entry.session.label,
        savedAt: entry.session.savedAt, answered: entry.session.answers.length };
    }) };
  }
  function restoreArchivedSession(index, token) {
    var before = importSnapshot();
    if (before.token !== token) throw new Error('本机学习数据已发生变化，请刷新列表后重试。');
    if (!natural(index) || !before.learning.archivedSessions[index]) throw new Error('找不到这份检测进度。');
    var learning = copy(before.learning);
    var selected = learning.archivedSessions.splice(index, 1)[0];
    var active = learning.sessions[selected.subject];
    delete learning.sessions[selected.subject];
    if (active) archiveSession(learning, selected.subject, active);
    learning.sessions[selected.subject] = selected.session;
    // 如本机已有同一进度的归档，仅保留现在激活的一份。
    var signature = sessionSignature(selected.subject, selected.session);
    learning.archivedSessions = learning.archivedSessions.filter(function (entry) {
      return sessionSignature(entry.subject, entry.session) !== signature;
    });
    writeSnapshot(before, before.profiles, before.records, learning);
    return selected.subject;
  }

  window.CnmChildren = {
    GRADES: GRADES, TEXTBOOKS: TEXTBOOKS, CAT_IDS: CAT_IDS.slice(), MAX_CHILDREN: MAX_CHILDREN,
    list: list, get: get, current: current, setCurrent: setCurrent,
    bookSelection: bookSelection, setBookSelection: setBookSelection, setBookSelections: setBookSelections,
    add: add, update: update, remove: remove,
    recordsOf: recordsOf, saveRecord: saveRecord, hasRecord: hasRecord, moveRecord: moveRecord, removeRecord: removeRecord,
    presentRecord: presentRecord, latestStatus: latestStatus, exportBackup: exportBackup,
    MAX_BACKUP_BYTES: MAX_BACKUP_BYTES, parseBackup: parseBackup, previewImport: previewImport, importBackup: importBackup,
    archivedSessions: archivedSessions, restoreArchivedSession: restoreArchivedSession
  };
})();
