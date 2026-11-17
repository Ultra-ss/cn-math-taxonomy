/* 图谱进场：节点轻轻摆动后精确归位，不改布局、缩放或检测数据。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmGraphMotion = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var DURATION = 2100, MAX_NODES = 60;
  function create(options) {
    options = options || {};
    var container = options.container, doc = options.document || root.document;
    var win = options.window || root;
    var request = options.requestFrame || function (fn) { return root.requestAnimationFrame(fn); };
    var cancel = options.cancelFrame || function (id) { root.cancelAnimationFrame(id); };
    var match = options.matchMedia || (root.matchMedia && root.matchMedia.bind(root));
    var preference = match ? match('(prefers-reduced-motion: reduce)') : null;
    var graph = null, bases = [], frame = null, running = false, used = false, blocked = false, destroyed = false;
    var firstTime = null, cleanups = [];
    function state(value) { if (container && container.dataset) container.dataset.motion = value; }
    function alive() { return graph && !(typeof graph.destroyed === 'function' && graph.destroyed()); }
    function batch(fn) { if (typeof graph.batch === 'function') graph.batch(fn); else fn(); }
    function settle() {
      if (frame !== null) { cancel(frame); frame = null; }
      running = false;
      if (alive() && bases.length) batch(function () {
        bases.forEach(function (row) { row.node.position({ x: row.x, y: row.y }); });
      });
      bases = [];
      state(preference && preference.matches ? 'reduced' : 'settled');
    }
    function on(target, type, listener, capture) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(type, listener, capture);
      cleanups.push(function () { target.removeEventListener(type, listener, capture); });
    }
    function interrupt() { blocked = true; settle(); }
    function graphDestroyed() {
      // Cytoscape 的 destroy 事件发生时 renderer 已移除，不能再 batch/position。
      blocked = true; running = false; bases = [];
      if (frame !== null) { cancel(frame); frame = null; }
      state(preference && preference.matches ? 'reduced' : 'settled');
    }
    // Capture phase stops motion before graph hit-testing or a control changes the camera.
    ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(function (type) { on(container, type, interrupt, true); });
    on(doc, 'keydown', interrupt, true);
    on(doc, 'visibilitychange', function () { if (doc.hidden) interrupt(); });
    on(win, 'pagehide', interrupt);
    function changed() { if (preference.matches) interrupt(); }
    if (preference && preference.addEventListener) {
      preference.addEventListener('change', changed);
      cleanups.push(function () { preference.removeEventListener('change', changed); });
    } else if (preference && preference.addListener) {
      preference.addListener(changed);
      cleanups.push(function () { preference.removeListener(changed); });
    }
    function step(time) {
      frame = null;
      if (!running || !alive() || (doc && doc.hidden) || (preference && preference.matches)) { settle(); return; }
      if (firstTime === null) firstTime = time;
      var elapsed = time - firstTime;
      if (elapsed >= DURATION) { settle(); return; }
      batch(function () {
        bases.forEach(function (row) {
          var p = Math.max(0, (elapsed - row.delay) / (DURATION - row.delay));
          var envelope = Math.sin(Math.PI * p) * Math.sin(Math.PI * p);
          var wave = 4 * Math.PI * p + row.phase;
          row.node.position({ x: row.x + row.amplitude * Math.sin(wave) * envelope,
            y: row.y + row.amplitude * 0.6 * Math.cos(wave) * envelope });
        });
      });
      frame = request(step);
    }
    function start(cy) {
      if (used || destroyed) return false;
      used = true; graph = cy;
      if (blocked || !container || !alive() || (doc && doc.hidden) || (preference && preference.matches)) { settle(); return false; }
      var width = container.clientWidth, height = container.clientHeight;
      if (!(width > 0 && height > 0)) { settle(); return false; }
      var zoom = Number(graph.zoom());
      if (!(zoom > 0 && Number.isFinite(zoom))) { settle(); return false; }
      var candidates = [];
      graph.nodes().forEach(function (node, index) {
        if (typeof node.visible === 'function' && !node.visible()) return;
        var screen = node.renderedPosition(), point = node.position();
        if (![screen.x, screen.y, point.x, point.y].every(Number.isFinite) ||
            screen.x < -100 || screen.x > width + 100 || screen.y < -70 || screen.y > height + 70) return;
        var hash = 0, name = String(node.id());
        for (var i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        hash = Math.abs(hash);
        candidates.push({ node: node, x: point.x, y: point.y, phase: (hash % 628) / 100,
          delay: hash % 160, amplitude: (1.4 + (hash % 7) / 10) / zoom,
          distance: Math.pow(screen.x - width / 2, 2) + Math.pow(screen.y - height / 2, 2), index: index });
      });
      candidates.sort(function (a, b) { return a.distance - b.distance || a.index - b.index; });
      bases = candidates.slice(0, MAX_NODES);
      if (!bases.length) { settle(); return false; }
      if (typeof graph.on === 'function') {
        graph.on('pan zoom', interrupt); graph.on('destroy', graphDestroyed);
        cleanups.push(function () {
          if (cy && typeof cy.off === 'function') { cy.off('pan zoom', interrupt); cy.off('destroy', graphDestroyed); }
        });
      }
      firstTime = null; running = true; state('running'); frame = request(step);
      return true;
    }
    state(preference && preference.matches ? 'reduced' : 'settled');
    return { start: start, stop: settle, active: function () { return running; },
      destroy: function () { if (destroyed) return; settle(); destroyed = true; cleanups.forEach(function (fn) { fn(); }); cleanups = []; graph = null; } };
  }
  return { create: create, DURATION: DURATION, MAX_NODES: MAX_NODES };
});
