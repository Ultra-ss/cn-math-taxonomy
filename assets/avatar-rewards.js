/* 月亮拼图与头像装扮：消费独立记账，累计学习成就不扣除；全部按本地账号保存。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmAvatarRewards = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmAvatarRewards.v1';
  var SKIN_IDS = Array.from({ length: 10 }, function (_, i) { return 'skin-' + String(i + 1).padStart(2, '0'); });
  var CAT_IDS = ['cat-snow', 'cat-ginger', 'cat-tuxedo'];
  var DUPLICATE_CHANCE = 10;
  var BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function safeId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && BAD_KEYS.indexOf(value) < 0; }
  function owner(value) { return value === null || value === undefined || value === '' || value === 'guest' ? 'guest' : safeId(value) ? value : ''; }
  function skin(value) { return SKIN_IDS.indexOf(value) >= 0; }
  function cat(value) { return CAT_IDS.indexOf(value) >= 0; }
  function date(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function collection(draws, skinId) {
    var matching = draws.filter(function (draw) { return draw.skinId === skinId; });
    var pieces = Array.from(new Set(matching.map(function (draw) { return draw.piece; }))).sort(function (a, b) { return a - b; });
    return { pieces: pieces, count: pieces.length, draws: matching.length, drawCount: matching.length, unlocked: pieces.length === 9 };
  }
  function validateStore(store) {
    if (!object(store) || store.v !== 1 || !object(store.byOwner)) return false;
    return Object.keys(store.byOwner).every(function (id) {
      var box = store.byOwner[id], seen = new Set();
      if (owner(id) !== id || !object(box) || !Array.isArray(box.draws) ||
          (box.equipped !== 'default' && !skin(box.equipped)) || !date(box.equippedAt)) return false;
      if (own(box, 'catId') !== own(box, 'catAt') || (own(box, 'catId') && (!cat(box.catId) || !date(box.catAt)))) return false;
      if (!box.draws.every(function (draw) {
        if (!object(draw) || !safeId(draw.id) || seen.has(draw.id) || !skin(draw.skinId) ||
            !Number.isInteger(draw.piece) || draw.piece < 0 || draw.piece > 8 || draw.cost !== 1 || !date(draw.at)) return false;
        seen.add(draw.id); return true;
      })) return false;
      return box.equipped === 'default' || collection(box.draws, box.equipped).unlocked;
    });
  }
  function emptyBox() { return { draws: [], equipped: 'default', equippedAt: '1970-01-01T00:00:00.000Z' }; }
  function create(options) {
    options = options || {};
    var locks = own(options, 'locks') ? options.locks : root.navigator && root.navigator.locks;
    function storage() { return own(options, 'storage') ? options.storage : root.localStorage; }
    function read() {
      try {
        var raw = storage().getItem(KEY);
        if (raw === null) return { ok: true, store: { v: 1, byOwner: {} } };
        if (typeof raw !== 'string' || raw.length > 10 * 1024 * 1024) return { ok: false, code: 'invalid_store' };
        var store = JSON.parse(raw);
        return validateStore(store) ? { ok: true, store: store } : { ok: false, code: 'invalid_store' };
      } catch (error) { return { ok: false, code: error instanceof SyntaxError ? 'invalid_store' : 'storage_unavailable' }; }
    }
    function stars(id) {
      try {
        var progress = options.progress || root.CnmProgress;
        var result = progress && progress.achievements(id === 'guest' ? null : id);
        return result && Number.isSafeInteger(result.total) && result.total >= 0 ? result.total : null;
      } catch (error) { return null; }
    }
    function summarize(id, store, total) {
      var box = own(store.byOwner, id) ? store.byOwner[id] : emptyBox();
      var totalStars = total === null ? 0 : total, totalMoons = Math.floor(totalStars / 3), spent = box.draws.length;
      var collections = {};
      SKIN_IDS.forEach(function (skinId) { collections[skinId] = collection(box.draws, skinId); });
      return { ok: true, owner: id, totalStars: totalStars, totalMoons: totalMoons, earnedMoons: totalMoons,
        spentMoons: spent, availableMoons: Math.max(0, totalMoons - spent), equipped: box.equipped,
        catId: box.catId || 'cat-snow', collections: collections };
    }
    function summary(value) {
      var id = owner(value), result = read();
      if (!id) return { ok: false, code: 'invalid_owner' };
      return result.ok ? summarize(id, result.store, stars(id)) : result;
    }
    function emit(id) {
      try {
        if (options.emit) options.emit(id);
        else if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('cnm:avatar-rewards', { detail: { owner: id } }));
      } catch (error) { /* 显示层监听失败不改变已保存的兑换。 */ }
    }
    function write(store, id) {
      try { storage().setItem(KEY, JSON.stringify(store)); }
      catch (error) { return false; }
      emit(id); return true;
    }
    function now() { return options.now ? options.now() : new Date().toISOString(); }
    function integer(size) {
      if (options.randomIndex) {
        var index = options.randomIndex(size);
        return Number.isInteger(index) && index >= 0 && index < size ? index : null;
      }
      var crypto = options.crypto || root.crypto;
      if (!crypto || !crypto.getRandomValues) return null;
      var limit = Math.floor(4294967296 / size) * size, value = new Uint32Array(1);
      do { crypto.getRandomValues(value); } while (value[0] >= limit);
      return value[0] % size;
    }
    function newId() {
      if (options.newId) return options.newId();
      var crypto = options.crypto || root.crypto;
      if (!crypto || !crypto.getRandomValues) return '';
      if (crypto.randomUUID) return 'draw-' + crypto.randomUUID();
      var bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
      return 'draw-' + Array.from(bytes).map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
    }
    async function exclusive(fn) {
      try {
        // 所有账号共用一个存储键，因此锁也覆盖整个账本，防止跨窗口互相覆盖。
        if (locks && typeof locks.request === 'function') return await locks.request(KEY, { mode: 'exclusive' }, fn);
        // 旧浏览器保持一次同步读改写；界面也会在兑换期间禁用按钮。
        return fn();
      } catch (error) { return { ok: false, code: 'storage_unavailable' }; }
    }
    function draw(value, skinId, requestId) {
      return exclusive(function () {
        var id = owner(value);
        if (!id) return { ok: false, code: 'invalid_owner' };
        if (!skin(skinId)) return { ok: false, code: 'invalid_skin' };
        var result = read(); if (!result.ok) return result;
        var store = result.store, box = own(store.byOwner, id) ? store.byOwner[id] : emptyBox();
        var token = requestId === undefined ? newId() : requestId;
        if (!safeId(token)) return { ok: false, code: 'invalid_request' };
        var previous = box.draws.findIndex(function (event) { return event.id === token; });
        var total = stars(id), current = summarize(id, store, total);
        if (previous >= 0) {
          var prior = box.draws[previous];
          if (prior.skinId !== skinId) return { ok: false, code: 'request_conflict' };
          return { ok: true, code: 'drawn', replayed: true, piece: prior.piece,
            duplicate: box.draws.slice(0, previous).some(function (event) { return event.skinId === skinId && event.piece === prior.piece; }),
            unlocked: current.collections[skinId].unlocked, balance: current.availableMoons, summary: current };
        }
        var pieces = current.collections[skinId];
        if (pieces.unlocked) return { ok: false, code: 'already_unlocked', summary: current };
        if (total === null) return { ok: false, code: 'progress_unavailable' };
        if (current.availableMoons < 1) return { ok: false, code: 'insufficient_moons', summary: current };
        var missing = Array.from({ length: 9 }, function (_, i) { return i; }).filter(function (piece) { return pieces.pieces.indexOf(piece) < 0; });
        var pool = missing;
        if (pieces.draws >= 2 && pieces.pieces.length) {
          var chance = integer(100);
          if (chance === null) return { ok: false, code: 'random_unavailable' };
          if (chance < DUPLICATE_CHANCE) pool = pieces.pieces;
        }
        var picked = integer(pool.length), at = now();
        if (picked === null) return { ok: false, code: 'random_unavailable' };
        if (!date(at)) return { ok: false, code: 'storage_unavailable' };
        var piece = pool[picked], duplicate = pieces.pieces.indexOf(piece) >= 0;
        box.draws.push({ id: token, skinId: skinId, piece: piece, cost: 1, at: at });
        store.byOwner[id] = box;
        if (!write(store, id)) return { ok: false, code: 'storage_unavailable' };
        var next = summarize(id, store, total);
        return { ok: true, code: 'drawn', piece: piece, duplicate: duplicate,
          unlocked: next.collections[skinId].unlocked, balance: next.availableMoons, summary: next };
      });
    }
    function equip(value, skinId) {
      return exclusive(function () {
        var id = owner(value);
        if (!id) return { ok: false, code: 'invalid_owner' };
        if (skinId !== 'default' && !skin(skinId)) return { ok: false, code: 'invalid_skin' };
        var result = read(); if (!result.ok) return result;
        var total = stars(id), current = summarize(id, result.store, total);
        if (skinId !== 'default' && !current.collections[skinId].unlocked) return { ok: false, code: 'locked_skin', summary: current };
        if (current.equipped === skinId) return { ok: true, code: 'equipped', summary: current };
        var box = own(result.store.byOwner, id) ? result.store.byOwner[id] : emptyBox(), at = now();
        if (!date(at)) return { ok: false, code: 'storage_unavailable' };
        box.equipped = skinId; box.equippedAt = at; result.store.byOwner[id] = box;
        if (!write(result.store, id)) return { ok: false, code: 'storage_unavailable' };
        return { ok: true, code: 'equipped', summary: summarize(id, result.store, total) };
      });
    }
    function setCat(value, catId) {
      return exclusive(function () {
        var id = owner(value);
        if (!id) return { ok: false, code: 'invalid_owner' };
        if (!cat(catId)) return { ok: false, code: 'invalid_cat' };
        var result = read(); if (!result.ok) return result;
        var total = stars(id), current = summarize(id, result.store, total);
        if (current.catId === catId) return { ok: true, code: 'cat_selected', summary: current };
        var box = own(result.store.byOwner, id) ? result.store.byOwner[id] : emptyBox(), at = now();
        if (!date(at)) return { ok: false, code: 'storage_unavailable' };
        box.catId = catId; box.catAt = at; result.store.byOwner[id] = box;
        if (!write(result.store, id)) return { ok: false, code: 'storage_unavailable' };
        return { ok: true, code: 'cat_selected', summary: summarize(id, result.store, total) };
      });
    }
    return { summary: summary, draw: draw, equip: equip, setCat: setCat };
  }
  var api = create();
  api.KEY = KEY; api.SKIN_IDS = SKIN_IDS.slice(); api.CAT_IDS = CAT_IDS.slice(); api.DUPLICATE_CHANCE = DUPLICATE_CHANCE;
  api.validateStore = validateStore; api.create = create;
  return api;
});
