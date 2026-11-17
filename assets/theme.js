/* 日间 / 深夜主题：首次跟随系统，手动选择仅保存为这台浏览器的显示偏好。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmTheme = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmTheme.v1';
  var COLORS = { light: '#786685', dark: '#2d2d39' };
  var LABELS = { light: '日间模式', dark: '深夜模式' };
  function valid(value) { return value === 'light' || value === 'dark'; }

  function create(environment) {
    var win = environment || root, doc = win.document, html = doc && doc.documentElement;
    var media = null, preferred = null, current = null, destroyed = false;
    var bound = [], cleanups = [];
    try { media = win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)'); } catch (error) { /* 默认日间模式。 */ }
    try {
      var saved = win.localStorage.getItem(KEY);
      if (valid(saved)) preferred = saved;
    } catch (error) { /* 隐私模式仍可在本页选择主题。 */ }

    function systemTheme() { return media && media.matches ? 'dark' : 'light'; }
    function on(target, type, listener) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, listener);
      cleanups.push(function () { target.removeEventListener(type, listener); });
    }
    function controls() {
      return doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('[data-theme-choice]') : [];
    }
    function sync() {
      Array.prototype.forEach.call(controls(), function (button) {
        var choice = button.getAttribute('data-theme-choice');
        if (!valid(choice)) return;
        button.setAttribute('aria-pressed', choice === current ? 'true' : 'false');
        button.setAttribute('aria-label', LABELS[choice]);
      });
      if (doc && typeof doc.querySelectorAll === 'function') {
        doc.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
          // 两条系统媒体查询下都使用当前选定颜色，手动主题可独立于系统。
          meta.setAttribute('content', COLORS[current]);
        });
      }
    }
    function notify() {
      if (typeof win.dispatchEvent !== 'function') return;
      var event = null;
      if (typeof win.CustomEvent === 'function') event = new win.CustomEvent('cnm:theme', { detail: { theme: current } });
      else if (doc && typeof doc.createEvent === 'function') {
        event = doc.createEvent('CustomEvent');
        event.initCustomEvent('cnm:theme', false, false, { theme: current });
      }
      if (event) win.dispatchEvent(event);
    }
    function apply(theme, emit) {
      var changed = current !== theme;
      current = theme;
      if (html) html.setAttribute('data-theme', theme);
      sync();
      if (changed && emit) notify();
    }
    function set(theme) {
      if (destroyed || !valid(theme)) return false;
      preferred = theme;
      try { win.localStorage.setItem(KEY, theme); } catch (error) { /* 主题立即生效，即使浏览器不能保存。 */ }
      apply(theme, true);
      return true;
    }
    function bind() {
      if (destroyed) return;
      Array.prototype.forEach.call(controls(), function (button) {
        var choice = button.getAttribute('data-theme-choice');
        if (!valid(choice) || bound.indexOf(button) >= 0) return;
        bound.push(button);
        on(button, 'click', function () { set(choice); });
      });
      sync();
    }
    function systemChanged() { if (!destroyed && preferred === null) apply(systemTheme(), true); }
    if (media && typeof media.addEventListener === 'function') on(media, 'change', systemChanged);
    else if (media && typeof media.addListener === 'function') {
      media.addListener(systemChanged);
      cleanups.push(function () { media.removeListener(systemChanged); });
    }
    on(win, 'storage', function (event) {
      if (destroyed || (event.key !== KEY && event.key !== null)) return;
      if (event.storageArea) {
        try { if (event.storageArea !== win.localStorage) return; } catch (error) { return; }
      }
      preferred = valid(event.newValue) ? event.newValue : null;
      apply(preferred || systemTheme(), true);
    });

    // 脚本在样式表之前执行，首次绘制即使用正确主题，不写 inline color-scheme 以保留打印样式。
    apply(preferred || systemTheme(), false);
    if (doc && doc.readyState === 'loading') {
      var ready = function () { doc.removeEventListener('DOMContentLoaded', ready); bind(); };
      on(doc, 'DOMContentLoaded', ready);
    } else bind();

    return {
      KEY: KEY,
      get: function () { return current; },
      set: set,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        cleanups.forEach(function (cleanup) { cleanup(); });
        cleanups = []; bound = [];
      }
    };
  }

  var api = { KEY: KEY, create: create };
  if (root.document && root.document.documentElement) {
    var active = create(root);
    api.get = active.get; api.set = active.set; api.destroy = active.destroy;
  }
  return api;
});
