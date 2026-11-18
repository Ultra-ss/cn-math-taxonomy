/* 按本地账号保存最近学习和浏览位置。只保存学科、册次与知识点，不保存或信任任意跳转URL。
 * 恢复前必须对照当前知识点数据；显示偏好不属于学习备份。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CnmLastLocation = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmLastLocation.v1';
  var SUBJECT_KEY = 'cnmNavigation.subject.v1';
  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var PHYSICS_BOOKS = ['八上', '八下', '九全', '必修一', '必修二', '必修三', '选必一', '选必二', '选必三'];
  var HIGH_BOOKS = {10:'必修一', 11:'必修二', 12:'必修三', 13:'选必一', 14:'选必二', 15:'选必三'};
  var homePromise = null;

  function storage() { return root.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null); }
  function subjectOf(id) {
    if (typeof id !== 'string') return '';
    if (/^cnp_[A-Za-z0-9]+$/.test(id)) return 'physics';
    if (/^cns_[A-Za-z0-9]+$/.test(id)) return 'science';
    return '';
  }
  function validVolume(value, subject) {
    if (value === '') return true;
    return typeof value === 'string' && (subject === 'physics' ? PHYSICS_BOOKS.indexOf(value) >= 0 : /^[一二三四五六][上下]$/.test(value));
  }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function bookKeys(subject) {
    if (subject === 'physics') return PHYSICS_BOOKS.slice();
    var books = [];
    if (subject === 'science') CN.slice(1, 7).forEach(function (grade) { books.push(grade + '上', grade + '下'); });
    return books;
  }
  function bookScope(subject, volume, values) {
    if (values === undefined) return { volume:volume };
    if (!Array.isArray(values) || !values.length || values.length > 24) return null;
    for (var i = 0; i < values.length; i++) if (!own(values, i) || values[i] === '' || !validVolume(values[i], subject)) return null;
    var order = bookKeys(subject);
    var selected = order.filter(function (value) { return values.indexOf(value) >= 0; });
    if (!selected.length || (volume && (selected.length !== 1 || selected[0] !== volume))) return null;
    return selected.length === 1 ? { volume:selected[0] } : { volume:'', volumes:selected };
  }
  function normalize(value) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 ||
          ['physics', 'science'].indexOf(value.subject) < 0 || subjectOf(value.topicId) !== value.subject ||
          !validVolume(value.volume, value.subject) || ['book', 'local'].indexOf(value.view) < 0 ||
          [1, 2, 3, 'all'].indexOf(value.depth) < 0 ||
          typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at)) ||
          (value.volumes !== undefined && !own(value, 'volumes'))) return null;
      var scope = bookScope(value.subject, value.volume, value.volumes);
      if (!scope) return null;
      var record = {v:1, subject:value.subject, volume:scope.volume, topicId:value.topicId, view:value.view, depth:value.depth, at:value.at};
      if (scope.volumes) record.volumes = scope.volumes;
      return record;
    } catch (error) { return null; }
  }
  function readKey(key) {
    try {
      var raw = storage().getItem(key);
      if (!raw || raw.length > 4096) return null;
      return normalize(JSON.parse(raw));
    } catch (error) { return null; }
  }
  function owner(value) {
    if (arguments.length) return value === null || value === '' || value === 'guest' ? 'guest' :
      typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && ['__proto__', 'constructor', 'prototype'].indexOf(value) < 0 ? value : '';
    try {
      var state = JSON.parse(storage().getItem('cnmChildren.v1'));
      return state && Array.isArray(state.children) && state.children.some(function (item) { return item && item.id === state.current; })
        ? owner(state.current) || 'guest' : 'guest';
    } catch (error) { return 'guest'; }
  }
  function recordKey(learning, account) {
    return learning ? KEY + '.learning.' + account : account === 'guest' ? KEY : KEY + '.account.' + account;
  }
  function readAt(subject, learning, account) {
    var key = recordKey(learning, account), latest = readKey(key);
    if (subject === undefined) return latest;
    if (subject !== 'physics' && subject !== 'science') return null;
    if (latest && latest.subject === subject) return latest;
    var saved = readKey(key + '.' + subject);
    return saved && saved.subject === subject ? saved : null;
  }
  function read(subject) {
    var account = owner();
    return readAt(subject, true, account) || readAt(subject, false, account);
  }
  function writeRecord(payload, learning, account, at) {
    try {
      if (!account || !payload || typeof payload !== 'object' || Array.isArray(payload) ||
          (payload.volumes !== undefined && !own(payload, 'volumes'))) return false;
      var record = normalize({v:1, subject:payload.subject, volume:payload.volume || '', volumes:payload.volumes, topicId:payload.topicId,
        view:payload.view === undefined ? 'book' : payload.view, depth:payload.depth === undefined ? 2 : payload.depth,
        at:at || new Date().toISOString()});
      if (!record) return false;
      var key = recordKey(learning, account), previous = readKey(key);
      if (previous) {
        var previousKey = key + '.' + previous.subject, archived = readKey(previousKey);
        if (!archived || archived.subject !== previous.subject || Date.parse(archived.at) < Date.parse(previous.at)) {
          try { storage().setItem(previousKey, JSON.stringify(previous)); } catch (error) { /* 仍尝试保存当前位置 */ }
        }
      }
      storage().setItem(key, JSON.stringify(record));
      try { storage().setItem(key + '.' + record.subject, JSON.stringify(record)); } catch (error) { /* 主位置仍可使用 */ }
      return true;
    } catch (error) { return false; }
  }
  function remember(payload, account) { return writeRecord(payload, false, arguments.length > 1 ? owner(account) : owner()); }
  function rememberLearning(payload, account) { return writeRecord(payload, true, arguments.length > 1 ? owner(account) : owner()); }
  function json(key) {
    try { var raw = storage().getItem(key); return raw && raw.length <= 12 * 1024 * 1024 ? JSON.parse(raw) : null; }
    catch (error) { return null; }
  }
  // 只从归属明确的记录恢复；旧版未绑定账号的全局会话不能借给当前账号。
  function previousStudy(subject, account) {
    var best = null;
    function add(id, at) {
      if (!subjectOf(id) || (subject && subjectOf(id) !== subject) || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return;
      if (!best || Date.parse(at) >= Date.parse(best.at)) best = {topicId:id, subject:subjectOf(id), at:at};
    }
    var progress = json('cnmProgress.v1'), box = progress && progress.byChild && own(progress.byChild, account) && progress.byChild[account];
    if (box && Array.isArray(box.runs)) box.runs.forEach(function (run) {
      if (run && run.states && typeof run.states === 'object') Object.keys(run.states).forEach(function (id) {
        var state = run.states[id];
        if (state && ['mastered', 'weak', 'shaky'].indexOf(state.status) >= 0) add(id, state.at);
      });
    });
    ['cnpDiagnose.session.v2', 'cnsDiagnose.session.v1'].forEach(function (key) {
      var saved = json(key);
      if (!saved || !own(saved, 'progressChildId') || owner(saved.progressChildId) !== account || !Array.isArray(saved.answers)) return;
      var last = saved.answers[saved.answers.length - 1];
      if (last && ['correct', 'wrong', 'skip'].indexOf(last.result) >= 0) add(last.id, saved.savedAt);
    });
    // 历史摘要没有真实作答顺序，仅单目标且确实作答过时作为最终兜底。
    if (!best) {
      var records = json('cnmChildren.records.v1'), history = records && own(records, account) && records[account];
      if (Array.isArray(history)) history.forEach(function (row) {
        if (row && row.asked > 0 && Array.isArray(row.targets) && row.targets.length === 1) add(row.targets[0], row.savedAt);
      });
    }
    return best;
  }
  function resume(topics, subject) {
    var account = owner(), saved = readAt(subject, true, account);
    // 一旦保存了新版学习点，它包含确切的题目顺序和图谱上下文，优先于旧汇总推断。
    if (saved) {
      var valid = resolve(topics, saved);
      if (valid) {
        var browse = resolve(topics, readAt(valid.subject, false, account)), books = bookKeys(valid.subject);
        // 全教材是显示范围：沿用较新的浏览偏好，但最近学习点及其时间仍取真实答题记录。
        if (browse && browse.volumes && browse.volumes.length === books.length &&
            books.every(function (book) { return browse.volumes.indexOf(book) >= 0; }) &&
            Date.parse(browse.at) >= Date.parse(valid.at)) {
          return resolve(topics, Object.assign({}, valid, {
            volume: '', volumes: browse.volumes.slice(), view: browse.view, depth: browse.depth
          })) || valid;
        }
        return valid;
      }
    }
    var old = previousStudy(subject, account);
    if (old && Array.isArray(topics)) {
      var topic = topics.find(function (item) { return item && item.id === old.topicId && item.subject === old.subject && !item.external; });
      if (topic) {
        var prior = readAt(old.subject, false, account), book = volumeOf(topic);
        var sameScope = prior && (prior.volumes ? prior.volumes.indexOf(book) >= 0 : prior.volume === book);
        var record = sameScope ? Object.assign({}, prior, {topicId:old.topicId, at:old.at}) :
          {v:1, subject:old.subject, volume:book, topicId:old.topicId, view:'book', depth:2, at:old.at};
        writeRecord(record, true, account, old.at);
        return resolve(topics, record);
      }
    }
    return resolve(topics, readAt(subject, false, account));
  }
  function volumeOf(topic) {
    return HIGH_BOOKS[topic.grade] || (CN[topic.grade] ? CN[topic.grade] + topic.semester : '');
  }
  function forgetIfSame(record) {
    try {
      [recordKey(false, owner()), recordKey(true, owner())].forEach(function (key) {
        [key, key + '.' + record.subject].forEach(function (item) {
          if (JSON.stringify(readKey(item)) === JSON.stringify(record)) storage().removeItem(item);
        });
      });
    } catch (error) { /* 存储不可用时仍可浏览 */ }
  }
  function resolve(topics, candidate) {
    var record = candidate === undefined ? read() : normalize(candidate);
    if (!record || !Array.isArray(topics)) return null;
    var topic = topics.find(function (item) {
      return item && item.id === record.topicId && item.subject === record.subject && !item.external;
    });
    if (!topic || (record.volume && record.volume !== volumeOf(topic)) ||
        (record.volumes && record.volumes.indexOf(volumeOf(topic)) < 0)) {
      forgetIfSame(record);
      return null;
    }
    return record;
  }
  function shouldResume(mode, location) {
    var loc = location || root.location;
    if (!loc || (mode !== 'home' && mode !== 'explore') || loc.hash) return false;
    var params = new URLSearchParams(loc.search || '');
    if (params.get('home') === '1') return false;
    var managed = mode === 'explore' && params.get('resume') === '1' && ['physics', 'science'].indexOf(params.get('subject')) >= 0;
    return !(managed ? [] : ['subject']).concat(['volume', 'volumes', 'grade', 'stage', 'domain', 'q', 'view', 'depth', 'target', 'chapter', 'returnTo']).some(function (name) {
      return params.has(name);
    });
  }
  function currentSubject(location) {
    var loc = location || root.location || {}, params = new URLSearchParams(loc.search || '');
    var explicit = params.get('subject');
    if (explicit === 'physics' || explicit === 'science') return explicit;
    var hash = String(loc.hash || '').replace(/^#/, '');
    try { hash = decodeURIComponent(hash); } catch (error) { /* 保持原样 */ }
    var inferred = subjectOf(hash);
    if (inferred) return inferred;
    if (/(^|,)\s*cns_/.test(params.get('target') || '')) return 'science';
    if (/(^|,)\s*cnp_/.test(params.get('target') || '')) return 'physics';
    // 裸首页保留默认物理；其他页面继承当前标签页选择的学科。
    if (root.document && root.document.body && root.document.body.classList && root.document.body.classList.contains('page-home')) return 'physics';
    try {
      var selected = root.sessionStorage.getItem(SUBJECT_KEY);
      if (selected === 'physics' || selected === 'science') return selected;
    } catch (error) { /* 没有存储时仍由链接携带学科 */ }
    var latest = read();
    return latest ? latest.subject : 'physics';
  }
  function syncNavigation(subject) {
    var selected = subject === 'physics' || subject === 'science' ? subject : currentSubject();
    try { root.sessionStorage.setItem(SUBJECT_KEY, selected); } catch (error) { /* 链接本身仍保留学科 */ }
    var doc = root.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return selected;
    doc.querySelectorAll('.site-nav a:not(.subject-link), a.brand').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/.test(href) || /[\\\u0000-\u001f]/.test(href)) return;
      var hashAt = href.indexOf('#'), hash = hashAt < 0 ? '' : href.slice(hashAt);
      var path = hashAt < 0 ? href : href.slice(0, hashAt), queryAt = path.indexOf('?');
      var params = new URLSearchParams(queryAt < 0 ? '' : path.slice(queryAt + 1));
      params.set('subject', selected);
      if (link.hasAttribute('data-resume-graph')) params.set('resume', '1');
      link.setAttribute('href', (queryAt < 0 ? path : path.slice(0, queryAt)) + '?' + params.toString() + hash);
    });
    return selected;
  }
  function siteBase(pathname) {
    var path = typeof pathname === 'string' ? pathname : '/';
    if (!/^\/(?!\/)/.test(path) || /[\\?#\u0000-\u001f]/.test(path) || path.split('/').some(function (part) { return part === '.' || part === '..'; })) return '/';
    if (/\/explore\/(?:index\.html)?$/.test(path)) return path.replace(/explore\/(?:index\.html)?$/, '');
    if (/\/index\.html$/.test(path)) return path.slice(0, -10);
    return path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
  }
  function exploreURL(candidate, pathname) {
    var record = normalize(candidate);
    if (!record) return '';
    var params = new URLSearchParams();
    params.set('subject', record.subject);
    if (record.volumes) params.set('volumes', record.volumes.join(','));
    else if (record.volume) params.set('volume', record.volume);
    params.set('view', record.view);
    params.set('depth', String(record.depth));
    return siteBase(pathname === undefined && root.location ? root.location.pathname : pathname) + 'explore/?' + params.toString() + '#' + encodeURIComponent(record.topicId);
  }
  function loadHomeTopics(url) {
    return new Promise(function (done) {
      var finished = false;
      var timer = setTimeout(function () { finish(null); }, 3000);
      function finish(rows) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        done(Array.isArray(rows) ? rows : null);
      }
      try {
        Promise.resolve(root.fetch(url)).then(function (response) {
          return response && response.ok ? response.json() : null;
        }).then(finish, function () { finish(null); });
      } catch (error) { finish(null); }
    });
  }
  function resumeHome() {
    if (homePromise) return homePromise;
    if (!shouldResume('home') || typeof root.fetch !== 'function') return Promise.resolve(false);
    var candidate = read();
    if (!candidate && !previousStudy(undefined, owner())) return Promise.resolve(false);
    var doc = root.document;
    var dialog = doc && doc.getElementById('continue-learning-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return Promise.resolve(false);
    homePromise = loadHomeTopics(siteBase(root.location.pathname) + 'data/topics.json').then(function (topics) {
      var record = resume(topics);
      if (!record) return false;
      var topic = topics.find(function (item) { return item.id === record.topicId; });
      function bookTitle(key) {
        if (/^[一二三四五六八][上下]$/.test(key)) return key.charAt(0) + '年级' + key.charAt(1) + '册';
        return key === '九全' ? '九年级全一册' : key;
      }
      var title = record.volumes ? record.volumes.slice(0, 2).map(bookTitle).join('、') +
        (record.volumes.length > 2 ? '等 ' + record.volumes.length + ' 本教材' : '（2 本教材）') : bookTitle(record.volume);
      doc.getElementById('continue-learning-location').textContent =
        (record.subject === 'physics' ? '初高中物理' : '小学科学') +
        (title ? ' · ' + title : '') + ' · ' + topic.name;
      doc.getElementById('continue-learning-yes').addEventListener('click', function () {
        dialog.close();
        root.location.assign(exploreURL(record, root.location.pathname));
      });
      doc.getElementById('continue-learning-no').addEventListener('click', function () { dialog.close(); });
      dialog.showModal();
      return true;
    }).catch(function () { return false; });
    return homePromise;
  }
  if (root.document && typeof root.document.querySelectorAll === 'function') syncNavigation();
  return {KEY:KEY, SUBJECT_KEY:SUBJECT_KEY, read:read, remember:remember, rememberLearning:rememberLearning, owner:owner, resume:resume, resolve:resolve, shouldResume:shouldResume,
    currentSubject:currentSubject, syncNavigation:syncNavigation, exploreURL:exploreURL, resumeHome:resumeHome};
});
