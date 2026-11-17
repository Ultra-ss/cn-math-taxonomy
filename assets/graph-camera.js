/* 图谱视角：从当前相机平滑移动；用户操作立即接管，不改节点或学习数据。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmGraphCamera = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var DURATION = 560;
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function create(options) {
    options = options || {};
    var cy = options.cy, container = options.container || (cy && cy.container());
    var doc = options.document || root.document, win = options.window || root;
    var request = options.requestFrame || function (fn) { return root.requestAnimationFrame(fn); };
    var cancelFrame = options.cancelFrame || function (id) { root.cancelAnimationFrame(id); };
    var match = options.matchMedia || (root.matchMedia && root.matchMedia.bind(root));
    var preference = match ? match('(prefers-reduced-motion: reduce)') : null;
    var duration = finite(options.duration) ? Math.max(0, options.duration) : DURATION;
    var frame = null, current = null, serial = 0, destroyed = false, cleanups = [];
    function alive() { return !destroyed && cy && !(typeof cy.destroyed === 'function' && cy.destroyed()); }
    function state() { if (container && container.dataset) container.dataset.camera = destroyed ? 'stopped' : current ? 'moving' : 'idle'; }
    function stopFrame() { if (frame !== null) cancelFrame(frame); frame = null; }
    function notify(name, reason) { if (typeof options[name] === 'function') options[name](reason); }
    function finish(reason) {
      if (!current) return;
      stopFrame(); current = null; serial++; state(); notify('onFinish', reason);
    }
    function cancel(reason) { finish(typeof reason === 'string' ? reason : 'cancel'); }
    function clampZoom(value) {
      var min = typeof cy.minZoom === 'function' ? cy.minZoom() : 0.01;
      var max = typeof cy.maxZoom === 'function' ? cy.maxZoom() : 10;
      return Math.max(min, Math.min(max, value));
    }
    function apply(viewport) {
      if (!alive()) return false;
      cy.viewport({ zoom: viewport.zoom, pan: { x: viewport.pan.x, y: viewport.pan.y } });
      return true;
    }
    function end(reason) {
      var move = current;
      if (!move) return;
      if (alive()) apply(move.to);
      if (current === move) finish(reason);
    }
    function step(time, move) {
      if (current !== move || move.serial !== serial) return;
      frame = null;
      if (!alive()) { destroy(); return; }
      if (doc && doc.hidden) { cancel('hidden'); return; }
      if (move.started === null) move.started = time;
      var t = Math.min(1, Math.max(0, (time - move.started) / duration));
      var ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      apply(t === 1 ? move.to : { zoom: move.from.zoom + (move.to.zoom - move.from.zoom) * ease, pan: {
        x: move.from.pan.x + (move.to.pan.x - move.from.pan.x) * ease,
        y: move.from.pan.y + (move.to.pan.y - move.from.pan.y) * ease
      } });
      if (current !== move || move.serial !== serial) return;
      if (t === 1) finish('complete');
      else frame = request(function (next) { step(next, move); });
    }
    function move(target) {
      if (!alive() || !target || !target.pan || !finite(target.pan.x) || !finite(target.pan.y) ||
          (target.zoom !== undefined && (!finite(target.zoom) || target.zoom <= 0))) return false;
      cancel();
      if (!alive()) return false;
      var pan = cy.pan(), zoom = cy.zoom();
      var from = { zoom: zoom, pan: { x: pan.x, y: pan.y } };
      var to = { zoom: clampZoom(target.zoom === undefined ? zoom : target.zoom), pan: { x: target.pan.x, y: target.pan.y } };
      var active = current = { serial: ++serial, from: from, to: to, started: null };
      state(); notify('onStart', 'move');
      if (current !== active || !alive()) return true;
      if (!duration || (preference && preference.matches) || (doc && doc.hidden) ||
          (Math.hypot(to.pan.x - from.pan.x, to.pan.y - from.pan.y) < 0.05 && Math.abs(to.zoom - from.zoom) < 0.00001)) {
        end(preference && preference.matches ? 'reduce' : 'complete');
      } else frame = request(function (time) { step(time, active); });
      return true;
    }
    function on(target, type, fn, capture) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, !!capture);
      cleanups.push(function () { target.removeEventListener(type, fn, !!capture); });
    }
    function input() { cancel('input'); }
    function key(event) {
      if (!event || !/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|\+|-|=|0)$/.test(event.key)) return;
      var focused = doc && doc.activeElement;
      if (focused === container || event.target === container || (container && typeof container.contains === 'function' && container.contains(focused))) input();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; serial++; stopFrame();
      var pending = !!current; current = null; state();
      cleanups.forEach(function (fn) { fn(); }); cleanups = [];
      if (cy && typeof cy.off === 'function') cy.off('destroy', destroy);
      if (pending) notify('onFinish', 'destroy');
    }
    on(container, 'pointerdown', input, true); on(container, 'mousedown', input, true);
    on(container, 'touchstart', input, true); on(container, 'wheel', input, true);
    on(doc, 'keydown', key, true);
    on(doc, 'visibilitychange', function () { if (doc.hidden) cancel('hidden'); });
    on(win, 'resize', function () { cancel('resize'); });
    on(win, 'blur', function () { cancel('hidden'); }); on(win, 'pagehide', function () { cancel('hidden'); });
    if (cy && typeof cy.on === 'function') cy.on('destroy', destroy);
    function changed() { if (preference.matches) end('reduce'); }
    if (preference && preference.addEventListener) {
      preference.addEventListener('change', changed); cleanups.push(function () { preference.removeEventListener('change', changed); });
    } else if (preference && preference.addListener) {
      preference.addListener(changed); cleanups.push(function () { preference.removeListener(changed); });
    }
    state();
    return { move: move, cancel: cancel, active: function () { return !!current; }, destroy: destroy };
  }
  return { create: create, DURATION: DURATION };
});
