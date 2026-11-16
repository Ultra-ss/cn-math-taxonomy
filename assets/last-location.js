/* 本机最后浏览位置。只保存学科、册次与知识点，不保存或信任任意跳转URL。
 * 恢复前必须对照当前知识点数据；显示偏好不属于学习备份。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CnmLastLocation = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmLastLocation.v1';
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
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 ||
        ['physics', 'science'].indexOf(value.subject) < 0 || subjectOf(value.topicId) !== value.subject ||
        !validVolume(value.volume, value.subject) || ['book', 'local'].indexOf(value.view) < 0 ||
        [1, 2, 3, 'all'].indexOf(value.depth) < 0 ||
        typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return null;
    return {v:1, subject:value.subject, volume:value.volume, topicId:value.topicId, view:value.view, depth:value.depth, at:value.at};
  }
  function read() {
    try {
      var raw = storage().getItem(KEY);
      if (!raw || raw.length > 4096) return null;
      return normalize(JSON.parse(raw));
    } catch (error) { return null; }
  }
  function remember(payload) {
    if (!payload) return false;
    var record = normalize({v:1, subject:payload.subject, volume:payload.volume || '', topicId:payload.topicId,
      view:payload.view === undefined ? 'book' : payload.view, depth:payload.depth === undefined ? 2 : payload.depth,
      at:new Date().toISOString()});
    if (!record) return false;
    try { storage().setItem(KEY, JSON.stringify(record)); return true; } catch (error) { return false; }
  }
  function volumeOf(topic) {
    return HIGH_BOOKS[topic.grade] || (CN[topic.grade] ? CN[topic.grade] + topic.semester : '');
  }
  function forgetIfSame(record) {
    try {
      if (JSON.stringify(read()) === JSON.stringify(record)) storage().removeItem(KEY);
    } catch (error) { /* 存储不可用时仍可浏览 */ }
  }
  function resolve(topics, candidate) {
    var record = candidate === undefined ? read() : normalize(candidate);
    if (!record || !Array.isArray(topics)) return null;
    var topic = topics.find(function (item) {
      return item && item.id === record.topicId && item.subject === record.subject && !item.external;
    });
    if (!topic || (record.volume && record.volume !== volumeOf(topic))) {
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
    return !['subject', 'volume', 'grade', 'stage', 'domain', 'q', 'view', 'depth', 'target', 'chapter', 'returnTo'].some(function (name) {
      return params.has(name);
    });
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
    if (record.volume) params.set('volume', record.volume);
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
    var candidate = shouldResume('home') ? read() : null;
    if (!candidate || typeof root.fetch !== 'function') return Promise.resolve(false);
    var doc = root.document;
    var style = doc && doc.documentElement && doc.documentElement.style;
    var visibility = style ? style.visibility : '';
    if (style) style.visibility = 'hidden';
    var redirected = false;
    homePromise = loadHomeTopics(siteBase(root.location.pathname) + 'data/topics.json').then(function (topics) {
      var record = resolve(topics, candidate);
      if (!record) return false;
      root.location.replace(exploreURL(record, root.location.pathname));
      redirected = true;
      return true;
    }).catch(function () { return false; }).then(function (result) {
      if (!redirected && style) style.visibility = visibility;
      return result;
    });
    return homePromise;
  }
  return {KEY:KEY, read:read, remember:remember, resolve:resolve, shouldResume:shouldResume, exploreURL:exploreURL, resumeHome:resumeHome};
});
