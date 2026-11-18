/* 专家柔光：缓存透明位图，缓慢扩散呼吸；不移动节点，也不读写学习数据。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmGraphHalo = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var PADDING = 28, SPREAD = 5, INTERVAL = 80, cache = new Map();
  function roundPath(ctx, x, y, w, h, radius) {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius); ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h); ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
  }
  function fallback(width, height, color) {
    var w = width + PADDING * 2, h = height + PADDING * 2, rings = '';
    // 无 Canvas 的兼容回退不使用 SVG filter/mask，也没有实心矩形底板。
    for (var gap = 3.5; gap < 25; gap += 0.75) {
      var fadeIn = Math.min(1, (gap - 3) / 5), alpha = 0.06 * fadeIn * Math.exp(-gap * gap / 170);
      rings += '<rect x="' + (PADDING - gap) + '" y="' + (PADDING - gap) + '" width="' + (width + gap * 2) + '" height="' + (height + gap * 2) + '" rx="' + (12 + gap) + '" fill="none" stroke="' + color + '" stroke-width="1.1" opacity="' + alpha.toFixed(4) + '"/>';
    }
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' + rings + '</svg>');
  }
  function image(width, height, color) {
    var key = [width, height, color].join('|');
    if (cache.has(key)) return cache.get(key);
    var w = width + PADDING * 2, h = height + PADDING * 2, url;
    try {
      var canvas = root.document && root.document.createElement('canvas'), ctx = canvas && canvas.getContext('2d'), scale = 2;
      if (!ctx) throw new Error('Canvas unavailable');
      canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale); ctx.scale(scale, scale);
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18 * scale; ctx.globalAlpha = 0.95;
      roundPath(ctx, PADDING, PADDING, width, height, 12); ctx.fill();
      // 擦掉整个卡片及原边框，并把光晕内缘柔化，避免出现第二道硬描边。
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 5 * scale; ctx.fillStyle = '#000';
      roundPath(ctx, PADDING - 2.5, PADDING - 2.5, width + 5, height + 5, 14.5); ctx.fill();
      url = canvas.toDataURL('image/png');
    } catch (error) { url = fallback(width, height, color); }
    var result = { url: url, width: w, height: h, padding: PADDING };
    cache.set(key, result); if (cache.size > 32) cache.delete(cache.keys().next().value);
    return result;
  }
  function hash(id) {
    var value = 2166136261;
    for (var i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
    value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15; value = Math.imul(value, 0x846ca68b); value ^= value >>> 16; return value >>> 0;
  }
  function create(options) {
    options = options || {};
    var cy = options.cy, container = options.container || (cy && cy.container()), doc = options.document || root.document, win = options.window || root;
    var request = options.requestFrame || function (fn) { return root.requestAnimationFrame(fn); };
    var cancel = options.cancelFrame || function (id) { root.cancelAnimationFrame(id); };
    var match = options.matchMedia || (root.matchMedia && root.matchMedia.bind(root));
    var preference = match ? match('(prefers-reduced-motion: reduce)') : null;
    var paused = !!options.paused, destroyed = false, rendererGone = false, pageHidden = false, blurred = false;
    var frame = null, elapsed = 0, lastPaint = null, rows = new Map(), holds = Object.create(null), grabbed = new Set(), pointers = new Set(), cleanups = [], refreshQueued = false;
    var microtask = options.queueMicrotask || root.queueMicrotask || function (fn) { Promise.resolve().then(fn); };
    function alive() { return !destroyed && !rendererGone && cy && !(typeof cy.destroyed === 'function' && cy.destroyed()); }
    function reduced() { return !!(preference && preference.matches); }
    function sized() { return container && container.clientWidth > 0 && container.clientHeight > 0; }
    function allowed() { return alive() && !paused && !reduced() && !pageHidden && !blurred && !(doc && doc.hidden) && !Object.keys(holds).length; }
    function state() {
      if (container && container.dataset) container.dataset.halo = !alive() ? 'stopped' : reduced() ? 'reduced' : paused ? 'paused' :
        pageHidden || blurred || (doc && doc.hidden) || !sized() ? 'hidden' : Object.keys(holds).length ? 'held' : frame !== null ? 'running' : 'static';
    }
    function freeze() { if (frame !== null) cancel(frame); frame = null; lastPaint = null; state(); }
    function batch(fn) { if (typeof cy.batch === 'function') cy.batch(fn); else fn(); }
    function clear(row) { if (alive()) row.node.removeStyle('background-width background-height background-image-opacity'); }
    function visible(row) {
      if (!sized() || (typeof row.node.visible === 'function' && !row.node.visible())) return false;
      var p = row.node.renderedPosition(), z = Number(cy.zoom()) || 1, x = (row.width / 2 + PADDING + SPREAD) * z, y = (row.height / 2 + PADDING + SPREAD) * z;
      return p.x >= -x && p.x <= container.clientWidth + x && p.y >= -y && p.y <= container.clientHeight + y;
    }
    function draw() {
      if (!alive() || !sized()) return;
      batch(function () { rows.forEach(function (row) {
        if (!visible(row)) return;
        var p = reduced() ? 0.45 : (1 - Math.cos(row.phase + elapsed * Math.PI * 2 / row.period)) / 2;
        // 有限的25个柔光状态，避免不断制造新的Cytoscape纹理缓存。
        var phase = Math.round(p * 24), key = row.width + '|' + row.height + '|' + phase;
        if (row.lastKey === key) return;
        row.lastKey = key;
        var spread = Math.round(phase / 24 * SPREAD * 1000) / 1000, opacity = Math.round((0.93 - phase / 24 * 0.5) * 1000) / 1000;
        row.node.style({ 'background-width': [row.width + PADDING * 2 + spread * 2, 22],
          'background-height': [row.height + PADDING * 2 + spread * 2, 22], 'background-image-opacity': [opacity, 1] });
      }); });
    }
    function schedule(sizePending) {
      if (frame === null && allowed() && rows.size && (sizePending || sized()) && (sizePending || Array.from(rows.values()).some(visible))) frame = request(step);
      state();
    }
    function step(time) {
      frame = null;
      if (!allowed() || !sized()) { freeze(); return; }
      if (lastPaint !== null && time - lastPaint < INTERVAL) { schedule(); return; }
      if (lastPaint !== null) elapsed += Math.min(250, Math.max(0, time - lastPaint));
      lastPaint = time; draw(); schedule();
    }
    function refresh() {
      if (!alive()) { freeze(); return; }
      var next = new Map();
      cy.nodes('.test-expert').forEach(function (node) {
        var id = node.id(), old = rows.get(id), seed = hash(id);
        next.set(id, { node: node, width: node.width(), height: node.height(), phase: old ? old.phase : seed / 4294967296 * Math.PI * 2,
          period: old ? old.period : 4500 + seed % 1501, lastKey: old ? old.lastKey : null });
      });
      rows.forEach(function (row, id) { if (!next.has(id)) clear(row); }); rows = next;
      if (!rows.size || !Array.from(rows.values()).some(visible)) { freeze(); return; }
      draw(); schedule(); state();
    }
    function queueRefresh() {
      if (refreshQueued || !alive()) return;
      refreshQueued = true;
      microtask(function () { refreshQueued = false; if (alive()) refresh(); });
    }
    function setPaused(value) { paused = !!value; freeze(); if (!paused) schedule(true); }
    function hold(reason) { holds[reason || 'external'] = true; freeze(); }
    function release(reason) { delete holds[reason || 'external']; schedule(true); }
    function on(target, type, fn, capture) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, !!capture); cleanups.push(function () { target.removeEventListener(type, fn, !!capture); });
    }
    function grab(event) { grabbed.add(event.target.id()); hold('drag'); }
    function free(event) { grabbed.delete(event.target.id()); if (!grabbed.size) release('drag'); }
    function clearNativeDrag() {
      grabbed.clear();
      if (holds.drag) { delete holds.drag; schedule(true); }
    }
    function pointerDown(event) { pointers.add(event.pointerId === undefined ? 'pointer' : event.pointerId); }
    function pointerEnd(event) {
      pointers.delete(event.pointerId === undefined ? 'pointer' : event.pointerId);
      if (!pointers.size) clearNativeDrag();
    }
    function touchEnd(event) {
      // 多指缩放取消原生抓取时，Cytoscape可能不发free；全部手指离开后只解除drag。
      if (event.touches && event.touches.length) return;
      pointers.clear(); clearNativeDrag();
    }
    function hidden() { pageHidden = true; grabbed.clear(); pointers.clear(); delete holds.drag; freeze(); }
    function shown() { pageHidden = false; schedule(true); }
    function coreDestroyed() { rendererGone = true; freeze(); rows.clear(); }
    cy.on('class add remove', queueRefresh); cy.on('pan zoom', refresh); cy.on('grab', 'node', grab); cy.on('free', 'node', free); cy.on('destroy', coreDestroyed);
    on(container, 'pointerdown', pointerDown, true);
    on(doc, 'pointerup', pointerEnd, true); on(doc, 'pointercancel', pointerEnd, true);
    on(doc, 'touchend', touchEnd, true); on(doc, 'touchcancel', touchEnd, true);
    on(doc, 'mouseup', function () { if (!pointers.size) clearNativeDrag(); }, true);
    on(doc, 'visibilitychange', function () { if (doc.hidden) hidden(); else shown(); });
    on(win, 'pagehide', hidden); on(win, 'pageshow', shown);
    on(win, 'blur', function () { blurred = true; grabbed.clear(); pointers.clear(); delete holds.drag; freeze(); });
    on(win, 'focus', function () { blurred = false; schedule(true); });
    on(win, 'cnm:theme', refresh);
    function changed() { freeze(); draw(); schedule(true); }
    if (preference && preference.addEventListener) { preference.addEventListener('change', changed); cleanups.push(function () { preference.removeEventListener('change', changed); }); }
    else if (preference && preference.addListener) { preference.addListener(changed); cleanups.push(function () { preference.removeListener(changed); }); }
    refresh();
    return { refresh: refresh, setPaused: setPaused, hold: hold, release: release, active: function () { return frame !== null; },
      destroy: function () {
        if (destroyed) return;
        freeze(); rows.forEach(clear); rows.clear();
        cy.off('class add remove', queueRefresh); cy.off('pan zoom', refresh); cy.off('grab', 'node', grab); cy.off('free', 'node', free); cy.off('destroy', coreDestroyed);
        cleanups.forEach(function (fn) { fn(); }); cleanups = []; destroyed = true; state();
      } };
  }
  return { image: image, create: create, PADDING: PADDING, SPREAD: SPREAD, INTERVAL: INTERVAL };
});
