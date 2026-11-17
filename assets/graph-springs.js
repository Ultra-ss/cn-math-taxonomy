/* 拖拽弹性关联：显示中的连接作为弹簧，松手后回到本次手势前的锚点。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmGraphSprings = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var THRESHOLD = 6, DEPTH = 3, MAX_SETTLE = 2300;
  function create(options) {
    options = options || {};
    var cy = options.cy, container = options.container || (cy && cy.container()), doc = options.document || root.document, win = options.window || root;
    var request = options.requestFrame || function (fn) { return root.requestAnimationFrame(fn); };
    var cancel = options.cancelFrame || function (id) { root.cancelAnimationFrame(id); };
    var now = options.now || function () { return root.performance && root.performance.now ? root.performance.now() : Date.now(); };
    var match = options.matchMedia || (root.matchMedia && root.matchMedia.bind(root));
    var preference = match ? match('(prefers-reduced-motion: reduce)') : null;
    var phase = 'idle', held = false, moved = false, motionHeld = false, destroyed = false, rendererGone = false;
    var pinned = null, anchors = new Map(), rows = new Map(), links = new Map(), frame = null;
    var lastTime = null, lastPaint = null, releasedAt = null, grabPoint = null, dragPoint = null, dragTime = null;
    var priorSettling = false, latch = null, pointers = new Set(), cancelNative = false, initialUngrabify = null;
    var cleanups = [];
    function alive() { return cy && !rendererGone && !(typeof cy.destroyed === 'function' && cy.destroyed()); }
    function zoom() { var value = Number(cy.zoom()); return value > 0 && Number.isFinite(value) ? value : 1; }
    function reduced() { return options.reducedMotion === true || !!(preference && preference.matches); }
    function state() { if (container && container.dataset) container.dataset.springState = phase === 'dragging' ? 'dragging' : phase === 'settling' ? 'settling' : 'idle'; }
    function batch(fn) { if (typeof cy.batch === 'function') cy.batch(fn); else fn(); }
    function pauseFrame() { if (frame !== null) { cancel(frame); frame = null; } lastTime = null; lastPaint = null; }
    function holdMotion() { if (!motionHeld) { motionHeld = true; if (options.onHold) options.onHold(); } }
    function releaseMotion() { if (motionHeld) { motionHeld = false; if (options.onRelease) options.onRelease(); } }
    function setGuard() { if (pinned) latch = { id: pinned.id(), until: now() + 350 }; }
    function restoreAll() {
      if (alive() && anchors.size) batch(function () { anchors.forEach(function (row) { row.node.position({ x: row.x, y: row.y }); }); });
    }
    function restoreNativeGrab() {
      if (initialUngrabify !== null && alive() && typeof cy.autoungrabify === 'function') cy.autoungrabify(initialUngrabify);
      initialUngrabify = null; cancelNative = false;
    }
    function finish(restore) {
      pauseFrame(); if (restore !== false) restoreAll();
      restoreNativeGrab(); held = false; moved = false; pinned = null; anchors.clear(); rows.clear(); links.clear();
      releasedAt = null; priorSettling = false; phase = 'idle'; state(); releaseMotion();
    }
    function stop() {
      if (held && pinned) { cancelGesture(); return; }
      if (moved) setGuard(); finish(true);
    }
    function sourceId(edge, method, field) {
      var node = typeof edge[method] === 'function' && edge[method]();
      return node && typeof node.id === 'function' ? node.id() : edge.data(field);
    }
    function graphLinks() {
      links = new Map();
      cy.edges().forEach(function (edge) {
        var a = sourceId(edge, 'source', 'source'), b = sourceId(edge, 'target', 'target');
        if (!anchors.has(a) || !anchors.has(b) || a === b) return;
        var weight = typeof edge.hasClass === 'function' && edge.hasClass('soft') ? 0.28 : 1;
        if (!links.has(a)) links.set(a, new Map()); if (!links.has(b)) links.set(b, new Map());
        links.get(a).set(b, Math.max(links.get(a).get(b) || 0, weight));
        links.get(b).set(a, Math.max(links.get(b).get(a) || 0, weight));
      });
    }
    function buildRows(id) {
      var distance = new Map([[id, 0]]), influence = new Map([[id, 1]]), queue = [id], previous = rows;
      for (var i = 0; i < queue.length; i++) {
        var key = queue[i], depth = distance.get(key);
        if (depth >= DEPTH) continue;
        (links.get(key) || new Map()).forEach(function (weight, next) {
          if (!distance.has(next)) { distance.set(next, depth + 1); queue.push(next); }
          if (distance.get(next) === depth + 1) influence.set(next, Math.max(influence.get(next) || 0, influence.get(key) * weight * 0.42));
        });
      }
      rows = new Map();
      var include = new Set(queue);
      previous.forEach(function (row, key) { if (Math.abs(row.dx) + Math.abs(row.dy) > 0.0001) include.add(key); });
      include.forEach(function (key) {
        var anchor = anchors.get(key), point = anchor.node.position(), old = previous.get(key);
        rows.set(key, { id: key, node: anchor.node, x: anchor.x, y: anchor.y, dx: point.x - anchor.x, dy: point.y - anchor.y,
          vx: old ? old.vx : 0, vy: old ? old.vy : 0, limit: old && old.limit, depth: distance.has(key) ? distance.get(key) : DEPTH + 1,
          follow: distance.has(key), influence: influence.get(key) || 0, neighbours: [] });
      });
      rows.forEach(function (row) {
        (links.get(row.id) || new Map()).forEach(function (weight, next) { if (rows.has(next)) row.neighbours.push({ row: rows.get(next), weight: weight }); });
      });
    }
    function begin(event) {
      var node = event && event.target;
      if (destroyed || !alive() || !node || typeof node.id !== 'function' || (node.hasClass && node.hasClass('grade'))) return;
      pauseFrame(); latch = null; priorSettling = phase === 'settling';
      holdMotion();
      if (!anchors.size) {
        cy.nodes().forEach(function (item) { var p = item.position(); if (Number.isFinite(p.x) && Number.isFinite(p.y)) anchors.set(item.id(), { node: item, x: p.x, y: p.y }); });
        graphLinks();
      }
      if (!anchors.has(node.id())) { finish(true); return; }
      pinned = node; held = true; moved = false; cancelNative = false; phase = 'grabbed';
      var rendered = node.renderedPosition(), world = node.position();
      grabPoint = { x: rendered.x, y: rendered.y }; dragPoint = { x: world.x, y: world.y }; dragTime = now();
      buildRows(node.id()); state();
    }
    function directFollow() {
      if (!pinned || !alive()) return;
      var rootRow = rows.get(pinned.id()), point = pinned.position(), z = zoom();
      rootRow.dx = point.x - rootRow.x; rootRow.dy = point.y - rootRow.y;
      batch(function () { rows.forEach(function (row) {
        if (row === rootRow || !row.follow) return;
        var dx = rootRow.dx * row.influence, dy = rootRow.dy * row.influence, length = Math.hypot(dx, dy), limit = 96 / z;
        if (length > limit) { dx *= limit / length; dy *= limit / length; }
        row.dx = dx; row.dy = dy; row.vx = 0; row.vy = 0; row.node.position({ x: row.x + dx, y: row.y + dy });
      }); });
    }
    function movedNode(event) {
      if (!held || !pinned || event.target !== pinned || !alive()) return;
      if (cancelNative) { restoreAll(); return; }
      var point = pinned.renderedPosition();
      if (!moved && Math.hypot(point.x - grabPoint.x, point.y - grabPoint.y) >= THRESHOLD) {
        moved = true; phase = 'dragging'; state(); if (options.onDragStart) options.onDragStart(pinned.id());
      }
      if (!moved) return;
      var world = pinned.position(), t = now(), elapsed = Math.max(0.008, (t - dragTime) / 1000), row = rows.get(pinned.id()), limit = 350 / zoom();
      row.vx = Math.max(-limit, Math.min(limit, (world.x - dragPoint.x) / elapsed));
      row.vy = Math.max(-limit, Math.min(limit, (world.y - dragPoint.y) / elapsed));
      dragPoint = { x: world.x, y: world.y }; dragTime = t;
      if (reduced()) directFollow(); else schedule();
    }
    function free(event) {
      if (!held || !pinned || event.target !== pinned) return;
      if (cancelNative) { setGuard(); finish(true); return; }
      held = false;
      if (!moved) {
        if (!priorSettling) { finish(true); return; }
        // 在上一轮回弹时轻点不重设锚点，也不把节点突然拉离手指。
        pinned.position({ x: dragPoint.x, y: dragPoint.y });
        phase = 'settling'; releasedAt = now(); state(); if (reduced()) finish(true); else schedule(); return;
      }
      setGuard(); phase = 'settling'; releasedAt = now(); state();
      var rootRow = rows.get(pinned.id()), point = pinned.position();
      rootRow.dx = point.x - rootRow.x; rootRow.dy = point.y - rootRow.y;
      rootRow.limit = Math.max(96 / zoom(), Math.hypot(rootRow.dx, rootRow.dy) + 32 / zoom());
      if (reduced()) finish(true); else schedule();
    }
    function schedule() { if (frame === null && alive() && !(doc && doc.hidden)) frame = request(step); }
    function step(time) {
      frame = null;
      if (!alive() || destroyed || (doc && doc.hidden)) { finish(alive()); return; }
      if (lastPaint !== null && time - lastPaint < 30) { schedule(); return; }
      var dt = lastTime === null ? 0.016 : Math.min(0.04, Math.max(0.001, (time - lastTime) / 1000));
      lastTime = time; lastPaint = time;
      var pinnedId = held && pinned ? pinned.id() : null, z = zoom();
      if (pinnedId) { var p = pinned.position(), rootRow = rows.get(pinnedId); rootRow.dx = p.x - rootRow.x; rootRow.dy = p.y - rootRow.y; }
      var iterations = Math.ceil(dt / 0.008), h = dt / iterations;
      for (var i = 0; i < iterations; i++) {
        rows.forEach(function (row) {
          if (row.id === pinnedId || (held && !row.follow)) return;
          var k = 50 + row.depth * 12, fx = -k * row.dx - 14 * row.vx, fy = -k * row.dy - 14 * row.vy;
          var linkK = 85 / Math.max(1, Math.sqrt(row.neighbours.length));
          row.neighbours.forEach(function (edge) { fx += linkK * edge.weight * (edge.row.dx - row.dx); fy += linkK * edge.weight * (edge.row.dy - row.dy); });
          row.ax = fx; row.ay = fy;
        });
        rows.forEach(function (row) {
          if (row.id === pinnedId || (held && !row.follow)) return;
          row.vx += row.ax * h; row.vy += row.ay * h; row.dx += row.vx * h; row.dy += row.vy * h;
          var length = Math.hypot(row.dx, row.dy), limit = row.limit || 96 / z;
          if (length > limit) { row.dx *= limit / length; row.dy *= limit / length; row.vx *= 0.5; row.vy *= 0.5; }
        });
      }
      var quiet = true;
      batch(function () { rows.forEach(function (row) {
        if (row.id !== pinnedId && (!held || row.follow)) row.node.position({ x: row.x + row.dx, y: row.y + row.dy });
        if (Math.hypot(row.dx, row.dy) * z > 0.12 || Math.hypot(row.vx, row.vy) * z > 0.7) quiet = false;
      }); });
      if (!held && (quiet || now() - releasedAt >= MAX_SETTLE)) { finish(true); return; }
      schedule();
    }
    function cancelGesture() {
      if (!anchors.size) return;
      if (held && pinned) {
        setGuard(); pauseFrame(); restoreAll(); moved = false; cancelNative = true; phase = 'idle'; state();
        if (typeof cy.autoungrabify === 'function') { if (initialUngrabify === null) initialUngrabify = cy.autoungrabify(); cy.autoungrabify(true); }
      } else finish(true);
    }
    function on(target, type, fn, capture) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(type, fn, capture); cleanups.push(function () { target.removeEventListener(type, fn, capture); });
    }
    function pointerDown(event) {
      if (cancelNative) finish(true);
      pointers.add(event.pointerId === undefined ? 'pointer' : event.pointerId); if (pointers.size > 1) cancelGesture();
    }
    function pointerUp(event) {
      pointers.delete(event.pointerId === undefined ? 'pointer' : event.pointerId);
      if (!pointers.size && cancelNative) { setGuard(); finish(true); }
    }
    cy.on('grab', 'node', begin); cy.on('drag', 'node', movedNode); cy.on('free', 'node', free);
    cy.on('pan zoom', cancelGesture);
    function coreDestroyed() { rendererGone = true; pointers.clear(); finish(false); }
    cy.on('destroy', coreDestroyed);
    on(container, 'pointerdown', pointerDown, true); on(doc, 'pointerup', pointerUp, true); on(doc, 'pointercancel', function () { cancelGesture(); pointers.clear(); finish(true); }, true);
    on(container, 'touchstart', function (event) { if (event.touches && event.touches.length > 1) cancelGesture(); }, true);
    on(doc, 'touchend', function (event) { if ((!event.touches || !event.touches.length) && cancelNative) { setGuard(); finish(true); } }, true);
    function hidden() { pointers.clear(); stop(); releaseMotion(); }
    on(doc, 'visibilitychange', function () { if (doc.hidden) hidden(); });
    on(win, 'blur', hidden); on(win, 'pagehide', hidden);
    function changed() { if (reduced()) { pauseFrame(); if (held && moved) directFollow(); else if (anchors.size) finish(true); } }
    if (preference && preference.addEventListener) { preference.addEventListener('change', changed); cleanups.push(function () { preference.removeEventListener('change', changed); }); }
    state();
    return { stop: stop, dragging: function () { return held && moved; },
      consumeTap: function (event) {
        if (held && moved) return true;
        if (!latch) return false;
        if (now() > latch.until) { latch = null; return false; }
        var target = event && event.target;
        if (target && typeof target.id === 'function' && target.id() !== latch.id) return false;
        latch = null; return true;
      },
      destroy: function () {
        if (destroyed) return; finish(true); destroyed = true;
        cy.off('grab', 'node', begin); cy.off('drag', 'node', movedNode); cy.off('free', 'node', free); cy.off('pan zoom', cancelGesture); cy.off('destroy', coreDestroyed);
        cleanups.forEach(function (fn) { fn(); }); cleanups = [];
      } };
  }
  return { create: create, THRESHOLD: THRESHOLD, DEPTH: DEPTH, MAX_SETTLE: MAX_SETTLE };
});
