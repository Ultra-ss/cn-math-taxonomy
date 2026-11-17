/* 图谱相机属于当前标签页的显示偏好，跨页面返回时恢复。
 * 每个学科各保留最近的有效场景，不读写孩子资料、检测结果或学习备份。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CnmExploreViewport = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'cnmExplore.viewport.v1';
  var PHYSICS_BOOKS = ['八上', '八下', '九全', '必修一', '必修二', '必修三', '选必一', '选必二', '选必三'];

  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function numberIn(value, min, max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
  function bookScope(subject, volume, values) {
    if (values === undefined) return { volume:volume };
    if (!Array.isArray(values) || !values.length || values.length > 24) return null;
    for (var i = 0; i < values.length; i++) if (!own(values, i) || typeof values[i] !== 'string' ||
        !(subject === 'physics' ? PHYSICS_BOOKS.indexOf(values[i]) >= 0 : /^[一二三四五六][上下]$/.test(values[i]))) return null;
    var order = subject === 'physics' ? PHYSICS_BOOKS : [];
    if (subject === 'science') ['一', '二', '三', '四', '五', '六'].forEach(function (grade) { order.push(grade + '上', grade + '下'); });
    var selected = order.filter(function (value) { return values.indexOf(value) >= 0; });
    if (!selected.length || (volume && (selected.length !== 1 || selected[0] !== volume))) return null;
    return selected.length === 1 ? { volume:selected[0] } : { volume:'', volumes:selected };
  }
  function context(value) {
    if (!object(value) || !['subject', 'volume', 'topicId', 'view', 'depth'].every(function (key) { return own(value, key); })) return null;
    var subject = value.subject, volume = value.volume, id = value.topicId;
    if (['physics', 'science'].indexOf(subject) < 0 || typeof volume !== 'string' ||
        typeof id !== 'string' || id.length > 128 ||
        !(subject === 'physics' ? /^cnp_[A-Za-z0-9]+$/ : /^cns_[A-Za-z0-9]+$/).test(id) ||
        (volume !== '' && !(subject === 'physics' ? PHYSICS_BOOKS.indexOf(volume) >= 0 : /^[一二三四五六][上下]$/.test(volume))) ||
        ['book', 'local'].indexOf(value.view) < 0 || [1, 2, 3, 'all'].indexOf(value.depth) < 0) return null;
    var layout = value.layout === undefined ? '' : value.layout;
    if (typeof layout !== 'string' || !/^[A-Za-z0-9:_|.-]{0,100}$/.test(layout) ||
        (value.volumes !== undefined && !own(value, 'volumes'))) return null;
    var scope = bookScope(subject, volume, value.volumes);
    if (!scope) return null;
    var normalized = { subject:subject, volume:scope.volume, topicId:id, view:value.view, depth:value.depth, layout:layout };
    if (scope.volumes) normalized.volumes = scope.volumes;
    return normalized;
  }
  function camera(value) {
    if (!object(value) || !['zoom', 'centerX', 'centerY', 'width', 'height'].every(function (key) { return own(value, key); }) ||
        !numberIn(value.zoom, 0.01, 10) || !numberIn(value.centerX, -1000000, 1000000) ||
        !numberIn(value.centerY, -1000000, 1000000) || !numberIn(value.width, 1, 20000) ||
        !numberIn(value.height, 1, 20000) || (value.expanded !== undefined && typeof value.expanded !== 'boolean')) return null;
    return { zoom:value.zoom, centerX:value.centerX, centerY:value.centerY, width:value.width, height:value.height, expanded:value.expanded === true };
  }
  function readRecord(key) {
    try {
      var raw = root.sessionStorage.getItem(key);
      if (typeof raw !== 'string' || !raw || raw.length > 4096) return null;
      var value = JSON.parse(raw);
      if (!object(value) || value.v !== 1) return null;
      var savedContext = context(value.context), savedCamera = camera(value.camera);
      return savedContext && savedCamera ? { v:1, context:savedContext, camera:savedCamera } : null;
    } catch (error) { return null; }
  }
  function keepSubject(record) {
    try { root.sessionStorage.setItem(KEY + '.' + record.context.subject, JSON.stringify(record)); }
    catch (error) { /* 当前场景仍由兼容旧版的主键保存。 */ }
  }
  function save(scene, state) {
    try {
      var validContext = context(scene), validCamera = camera(state);
      if (!validContext || !validCamera) return false;
      // 第一次跨科时也保留旧版只存于主键的画面。
      var previous = readRecord(KEY);
      if (previous && previous.context.subject !== validContext.subject) keepSubject(previous);
      var record = { v:1, context:validContext, camera:validCamera };
      root.sessionStorage.setItem(KEY, JSON.stringify(record));
      keepSubject(record);
      return true;
    } catch (error) { return false; }
  }
  function read(scene) {
    try {
      var wanted = context(scene);
      if (!wanted) return null;
      var latest = readRecord(KEY);
      // 同科以主键的最近场景为准，避免旧页面新保存后又套用更早的同科画面。
      var saved = latest && latest.context.subject === wanted.subject ? latest : readRecord(KEY + '.' + wanted.subject);
      if (!saved || saved.context.subject !== wanted.subject || JSON.stringify(saved.context) !== JSON.stringify(wanted)) return null;
      return saved.camera;
    } catch (error) { return null; }
  }
  function clear() {
    var cleared = true;
    [KEY, KEY + '.physics', KEY + '.science'].forEach(function (key) {
      try { root.sessionStorage.removeItem(key); } catch (error) { cleared = false; }
    });
    return cleared;
  }
  return { KEY:KEY, save:save, read:read, clear:clear };
});
