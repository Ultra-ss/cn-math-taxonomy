/* 持续轻柔漂浮：各节点使用独立方向和周期，布局基点与视角始终分开保存。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmGraphMotion = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var MAX_NODES = 320, IDLE_DELAY = 700, FADE_TIME = 1000, TAU = Math.PI * 2;
  function hash(text, salt) {
    var h = (2166136261 ^ salt) >>> 0;
    for (var i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }
  function unit(text, salt) { return hash(text, salt) / 4294967296; }
  function create(options) {
    options = options || {};
    var container = options.container, doc = options.document || root.document, win = options.window || root;
    var request = options.requestFrame || function (fn) { return root.requestAnimationFrame(fn); };
    var cancel = options.cancelFrame || function (id) { root.cancelAnimationFrame(id); };
    var timer = options.setTimer || function (fn, ms) { return root.setTimeout(fn, ms); };
    var clearTimer = options.clearTimer || function (id) { root.clearTimeout(id); };
    var match = options.matchMedia || (root.matchMedia && root.matchMedia.bind(root));
    var preference = match ? match('(prefers-reduced-motion: reduce)') : null;
    var graph = null, rows = [], visible = [], frame = null, idleTimer = null, running = false;
    var paused = !!options.paused, destroyed = false, pageHidden = false, windowBlurred = false, origin = null, lastPaint = null, renderedZoom = 1;
    var pointers = new Set();
    var holds = Object.create(null), cleanups = [], sceneCleanups = [];
    function state(value) { if (container && container.dataset) container.dataset.motion = value; }
    function alive() { return graph && !(typeof graph.destroyed === 'function' && graph.destroyed()); }
    function batch(fn) { if (typeof graph.batch === 'function') graph.batch(fn); else fn(); }
    function canResume() {
      return !destroyed && alive() && container && !paused && !pageHidden && !windowBlurred && !(doc && doc.hidden) &&
        !(preference && preference.matches) && !Object.keys(holds).length;
    }
    function canRun() { return canResume() && container.clientWidth > 0 && container.clientHeight > 0; }
    function updateState() {
      state(preference && preference.matches ? 'reduced' : paused ? 'paused' : pageHidden || windowBlurred || (doc && doc.hidden) ? 'hidden' :
        Object.keys(holds).length ? 'held' : running ? 'running' : graph ? 'waiting' : 'settled');
    }
    function freeze() {
      if (frame !== null) { cancel(frame); frame = null; }
      if (idleTimer !== null) { clearTimer(idleTimer); idleTimer = null; }
      running = false; lastPaint = null;
      visible.forEach(function (row) { row.resumeAt = null; row.startX = row.dx; row.startY = row.dy; });
      updateState();
    }
    function restore(row) {
      row.node.position({ x: row.x, y: row.y }); row.dx = 0; row.dy = 0; row.startX = 0; row.startY = 0; row.resumeAt = null;
    }
    function detachScene() { sceneCleanups.forEach(function (fn) { fn(); }); sceneCleanups = []; }
    function stop() {
      freeze();
      if (alive() && rows.length) batch(function () { rows.forEach(restore); });
      detachScene(); graph = null; rows = []; visible = []; origin = null; updateState();
    }
    function graphDestroyed() {
      // destroy 事件时 renderer 已删除，不再 batch/position。
      freeze(); detachScene(); graph = null; rows = []; visible = []; origin = null; clearPointers(); updateState();
    }
    function on(target, type, listener, capture) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(type, listener, capture);
      cleanups.push(function () { target.removeEventListener(type, listener, capture); });
    }
    function selectVisible() {
      if (!alive() || !container || !(container.clientWidth > 0 && container.clientHeight > 0)) return;
      var width = container.clientWidth, height = container.clientHeight, candidates = [];
      rows.forEach(function (row) {
        if (typeof row.node.visible === 'function' && !row.node.visible()) return;
        var point = row.node.renderedPosition();
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < -100 || point.x > width + 100 || point.y < -70 || point.y > height + 70) return;
        row.distance = Math.pow(point.x - width / 2, 2) + Math.pow(point.y - height / 2, 2); candidates.push(row);
      });
      candidates.sort(function (a, b) { return a.distance - b.distance || a.index - b.index; });
      var next = candidates.slice(0, MAX_NODES), keep = new Set(next);
      batch(function () { visible.forEach(function (row) { if (!keep.has(row) && (row.dx || row.dy)) restore(row); }); });
      visible = next;
      visible.forEach(function (row) { row.resumeAt = null; row.startX = row.dx; row.startY = row.dy; });
    }
    function step(time) {
      frame = null;
      if (!running || !canRun()) { freeze(); return; }
      if (lastPaint !== null && time - lastPaint < 30) { frame = request(step); return; }
      lastPaint = time;
      if (origin === null) origin = time;
      var elapsed = time - origin, zoom = Number(graph.zoom());
      if (!(zoom > 0 && Number.isFinite(zoom))) { freeze(); return; }
      batch(function () {
        visible.forEach(function (row) {
          if (row.resumeAt === null) row.resumeAt = time;
          var p = Math.min(1, Math.max(0, (time - row.resumeAt) / FADE_TIME));
          var ease = p * p * (3 - 2 * p);
          var x = row.ampX / zoom * Math.sin(row.phaseX + row.directionX * elapsed * TAU / row.periodX);
          var y = row.ampY / zoom * Math.sin(row.phaseY + row.directionY * elapsed * TAU / row.periodY);
          row.dx = row.startX + (x - row.startX) * ease;
          row.dy = row.startY + (y - row.startY) * ease;
          row.node.position({ x: row.x + row.dx, y: row.y + row.dy });
        });
      });
      frame = request(step);
    }
    function resume() {
      idleTimer = null;
      if (frame !== null) { cancel(frame); frame = null; }
      running = false;
      if (!canRun()) { updateState(); return; }
      selectVisible();
      if (!visible.length) { updateState(); return; }
      running = true; lastPaint = null; updateState(); frame = request(step);
    }
    function resumeSoon(delay) {
      if (idleTimer !== null) clearTimer(idleTimer);
      idleTimer = null;
      if (!canResume()) { updateState(); return; }
      idleTimer = timer(resume, delay === undefined ? IDLE_DELAY : delay); updateState();
    }
    function hold(reason) { holds[reason || 'external'] = true; freeze(); }
    function release(reason, delay) {
      reason = reason || 'external';
      if (!Object.prototype.hasOwnProperty.call(holds, reason)) return;
      delete holds[reason]; resumeSoon(delay);
    }
    function activity() {
      if (alive()) {
        var zoom = Number(graph.zoom());
        if (zoom > 0 && Number.isFinite(zoom) && zoom !== renderedZoom) {
          var ratio = renderedZoom / zoom;
          batch(function () { rows.forEach(function (row) {
            if (!row.dx && !row.dy) return;
            row.dx *= ratio; row.dy *= ratio;
            row.node.position({ x: row.x + row.dx, y: row.y + row.dy });
          }); });
          renderedZoom = zoom;
        }
      }
      freeze(); resumeSoon();
    }
    function setPaused(value) { paused = !!value; freeze(); if (!paused) resumeSoon(); }
    function start(cy) {
      if (destroyed) return false;
      stop(); graph = cy;
      if (!container || !alive()) { graph = null; updateState(); return false; }
      renderedZoom = Number(graph.zoom()) || 1;
      graph.nodes().forEach(function (node, index) {
        var point = node.position(), id = String(node.id());
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        rows.push({ node: node, id: id, index: index, x: point.x, y: point.y, dx: 0, dy: 0, startX: 0, startY: 0, resumeAt: null,
          phaseX: unit(id, 11) * TAU, phaseY: unit(id, 29) * TAU,
          periodX: 7000 + unit(id, 47) * 7000, periodY: 9000 + unit(id, 83) * 8000,
          directionX: hash(id, 101) & 1 ? 1 : -1, directionY: hash(id, 139) & 1 ? 1 : -1,
          ampX: 1.8 + unit(id, 173), ampY: 1.4 + unit(id, 211) * 0.9 });
      });
      if (typeof graph.on === 'function') {
        graph.on('pan zoom', activity); graph.on('destroy', graphDestroyed);
        sceneCleanups.push(function () {
          if (cy && typeof cy.off === 'function') {
            cy.off('pan zoom', activity); cy.off('destroy', graphDestroyed);
          }
        });
      }
      resume(); return true;
    }
    function pointerKey(event) { return event && event.pointerId != null ? event.pointerId : 'fallback'; }
    function down(event) { pointers.add(pointerKey(event)); hold('pointer'); }
    function up(event) {
      if (!pointers.delete(pointerKey(event))) return;
      if (!pointers.size) release('pointer');
    }
    function clearPointers() { pointers.clear(); delete holds.pointer; }
    on(container, 'pointerdown', down, true); on(doc, 'pointerup', up, true); on(doc, 'pointercancel', up, true);
    if (!win.PointerEvent) {
      on(container, 'mousedown', down, true); on(doc, 'mouseup', up, true);
      on(container, 'touchstart', down, true); on(doc, 'touchend', function (event) { if (!event.touches || !event.touches.length) up(event); }, true); on(doc, 'touchcancel', up, true);
    }
    on(container, 'wheel', activity, true); on(doc, 'keydown', activity, true);
    on(doc, 'visibilitychange', function () { if (doc.hidden) clearPointers(); freeze(); if (!doc.hidden) resumeSoon(); });
    on(win, 'pagehide', function () { pageHidden = true; clearPointers(); freeze(); });
    on(win, 'pageshow', function () { pageHidden = false; resumeSoon(); });
    on(win, 'blur', function () { windowBlurred = true; clearPointers(); freeze(); });
    on(win, 'focus', function () { windowBlurred = false; resumeSoon(); });
    function changed() { freeze(); if (!preference.matches) resumeSoon(); }
    if (preference && preference.addEventListener) {
      preference.addEventListener('change', changed); cleanups.push(function () { preference.removeEventListener('change', changed); });
    } else if (preference && preference.addListener) {
      preference.addListener(changed); cleanups.push(function () { preference.removeListener(changed); });
    }
    updateState();
    return { start: start, stop: stop, hold: hold, release: release, setPaused: setPaused, active: function () { return running; },
      destroy: function () { if (destroyed) return; stop(); destroyed = true; cleanups.forEach(function (fn) { fn(); }); cleanups = []; pointers.clear(); holds = Object.create(null); } };
  }
  return { create: create, MAX_NODES: MAX_NODES, IDLE_DELAY: IDLE_DELAY, FADE_TIME: FADE_TIME };
});
