/* Only the isolated promotion-demo origin may load this synthetic account. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root, root.CnmPromotionSeed);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var MARKER = 'cnmPromotionDemo.v1';
  var PENDING = 'cnmPromotionDemo.navigationReset.v1';
  var LOCAL_KEYS = ['cnmChildren.v1', 'cnmChildren.records.v1', 'cnmProgress.v1', 'cnmAvatarRewards.v1',
    'cnmBlind.local.v1', 'cnmWrong.v1', 'cnmDiagnose.archived.v1',
    'cnmDiagnose.settings.v2', 'cnmDiagnose.seen.v1', 'cnpDiagnose.session.v2', 'cnsDiagnose.session.v1'];
  function allowedHost(location) {
    return !!location && (location.protocol === 'https:' && location.hostname === 'promotion-demo.physicalmap.pages.dev' ||
      location.protocol === 'http:' && ['127.0.0.1', 'localhost'].indexOf(location.hostname) >= 0 && location.port === '8774');
  }
  function managedLocal(key) {
    return key === MARKER || LOCAL_KEYS.indexOf(key) >= 0 ||
      /^cnmLastLocation\.v1(?:\.(?:account|learning)\.[A-Za-z0-9_-]+)?(?:\.(?:physics|science))?$/.test(key);
  }
  function managedSession(key) {
    return key === PENDING || key === 'cnmNavigation.subject.v1' ||
      /^cnmExplore\.viewport\.v1(?:\.account\.[A-Za-z0-9_-]+)?(?:\.(?:physics|science))?$/.test(key);
  }
  function keysOf(storage, matches) {
    var keys = [];
    for (var i = 0; i < storage.length; i++) { var key = storage.key(i); if (matches(key)) keys.push(key); }
    return keys;
  }
  function replacePreset(env, seed, willNavigate) {
    if (!allowedHost(env.location)) return { ok: false, error: '这个网址不能载入宣传演示数据。' };
    if (!seed || seed.version !== 1 || !seed.storage || typeof seed.storage !== 'object' ||
        Array.isArray(seed.storage) || !LOCAL_KEYS.slice(0, 4).every(function (key) { return typeof seed.storage[key] === 'string'; }) ||
        Object.keys(seed.storage).some(function (key) { return key === MARKER || !managedLocal(key) || typeof seed.storage[key] !== 'string'; })) {
      return { ok: false, error: '演示预设不完整，请刷新后重试。' };
    }
    var snapshots = [], attempted = false;
    try {
      var local = env.localStorage, session = env.sessionStorage;
      var localKeys = Array.from(new Set(keysOf(local, managedLocal).concat(Object.keys(seed.storage), [MARKER])));
      var sessionKeys = Array.from(new Set(keysOf(session, managedSession).concat([PENDING])));
      [[local, localKeys], [session, sessionKeys]].forEach(function (entry) {
        entry[1].forEach(function (key) { snapshots.push({ storage: entry[0], key: key, value: entry[0].getItem(key) }); });
      });
      attempted = true;
      localKeys.forEach(function (key) { if (key !== MARKER) local.removeItem(key); });
      sessionKeys.forEach(function (key) { session.removeItem(key); });
      Object.keys(seed.storage).forEach(function (key) { local.setItem(key, seed.storage[key]); });
      if (willNavigate) session.setItem(PENDING, '1');
      // Commit last: a failed or interrupted initialization must be retried.
      local.setItem(MARKER, JSON.stringify({ version: seed.version, resetAt: new Date().toISOString() }));
      return { ok: true };
    } catch (error) {
      var restored = true;
      if (attempted) snapshots.forEach(function (entry) {
        try { if (entry.value === null) entry.storage.removeItem(entry.key); else entry.storage.setItem(entry.key, entry.value); }
        catch (rollbackError) { restored = false; }
      });
      return { ok: false, error: restored ? '浏览器无法保存演示预设，请检查存储空间后重试。' : '演示数据恢复未完成，请重新打开演示网址后重试。' };
    }
  }
  function install(env, seed) {
    if (!allowedHost(env.location)) return { active: false };
    var result;
    try {
      if (env.sessionStorage.getItem(PENDING) === '1') {
        // The departing graph saves its camera on pagehide, after reset has run.
        // Clear that final stale write in the next document, before app scripts.
        keysOf(env.sessionStorage, managedSession).filter(function (key) { return key !== PENDING; }).forEach(function (key) { env.sessionStorage.removeItem(key); });
        env.sessionStorage.removeItem(PENDING);
      }
      result = env.localStorage.getItem(MARKER) ? { ok: true } : replacePreset(env, seed);
    }
    catch (error) { result = { ok: false, error: '浏览器未允许保存演示数据，请允许本站存储后刷新。' }; }
    env.CnmPromotionDemo = { reset: function () { return replacePreset(env, seed); }, result: result };
    var doc = env.document;
    function node(tag, text, className) {
      var item = doc.createElement(tag);
      if (text) item.textContent = text;
      if (className) item.className = className;
      return item;
    }
    function ready() {
      var header = doc.querySelector('.site-header');
      if (!header || doc.getElementById('promotion-demo-controls')) return;
      var bar = node('div', null, 'promotion-demo-controls'); bar.id = 'promotion-demo-controls';
      bar.appendChild(node('span', result.ok ? '宣传演示 · 虚拟学习数据' : '宣传演示 · 数据暂未载入'));
      var open = node('button', '演示工具'); open.type = 'button'; open.id = 'promotion-demo-open';
      open.setAttribute('aria-haspopup', 'dialog'); open.setAttribute('aria-controls', 'promotion-demo-dialog'); bar.appendChild(open);
      header.appendChild(bar);
      var dialog = node('dialog', null, 'promotion-demo-dialog'); dialog.id = 'promotion-demo-dialog';
      dialog.setAttribute('aria-labelledby', 'promotion-demo-title');
      var title = node('h2', '宣传演示'); title.id = 'promotion-demo-title'; dialog.appendChild(title);
      dialog.appendChild(node('p', '这里的账号、通关进度和拼图均为演示预设。可自由操作，与正式网址的学习数据完全分开。'));
      var stats = node('p', '两科学习进度约 90% · 全部 10 套装扮已解锁', 'promotion-demo-stats'); dialog.appendChild(stats);
      var links = node('div', null, 'promotion-demo-links');
      var focus = seed && seed.summary && seed.summary.focusTopicId || 'cnp_053';
      [['物理图谱', '/explore/?subject=physics&volume=' + encodeURIComponent('九全') + '&view=book#' + encodeURIComponent(focus)],
        ['小学科学图谱', '/explore/?subject=science&volume=' + encodeURIComponent('六下') + '&view=book#cns_p242'],
        ['个人中心与装扮', '/children/?subject=physics'], ['首页', '/?home=1&subject=physics']].forEach(function (item) {
        var link = node('a', item[0]); link.href = item[1]; links.appendChild(link);
      });
      dialog.appendChild(links);
      var status = node('p', result.ok ? '' : result.error); status.id = 'promotion-demo-status'; status.setAttribute('role', 'status'); dialog.appendChild(status);
      var actions = node('div', null, 'promotion-demo-actions');
      var reset = node('button', '恢复演示预设'); reset.type = 'button'; reset.id = 'promotion-demo-reset';
      reset.addEventListener('click', function () {
        var next = replacePreset(env, seed, true);
        if (!next.ok) { status.textContent = next.error; return; }
        // assign() to the same path/query (even a different hash) keeps the old
        // graph document alive. Reset must reload the app and its seeded state.
        env.history.replaceState(null, '', '/explore/?subject=physics&volume=' + encodeURIComponent('九全') + '&view=book#' + encodeURIComponent(focus));
        env.location.reload();
      });
      var close = node('button', '继续演示'); close.type = 'button'; close.addEventListener('click', function () { dialog.close(); });
      actions.append(reset, close); dialog.appendChild(actions);
      var original = node('a', '打开正式网页'); original.href = 'https://physicalmap.pages.dev/';
      original.target = '_blank'; original.rel = 'noopener noreferrer'; dialog.appendChild(original);
      doc.body.appendChild(dialog);
      open.addEventListener('click', function () { dialog.showModal(); });
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();
    env.addEventListener('storage', function (event) {
      if (event.key === MARKER && event.newValue) {
        try { env.sessionStorage.setItem(PENDING, '1'); } catch (error) { /* Reload still updates the demo account. */ }
        env.location.reload();
      }
    });
    return { active: true, ok: result.ok };
  }
  return { MARKER: MARKER, allowedHost: allowedHost, replacePreset: replacePreset, install: install };
});
