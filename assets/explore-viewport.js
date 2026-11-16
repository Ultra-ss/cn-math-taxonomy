/* 图谱相机属于当前标签页的显示偏好，跨页面返回时恢复。
 * 只保存一个有效场景，不读写孩子资料、检测结果或学习备份。 */
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
  function context(value) {
    if (!object(value) || !['subject', 'volume', 'topicId', 'view', 'depth'].every(function (key) { return own(value, key); })) return null;
    var subject = value.subject, volume = value.volume, id = value.topicId;
    if (['physics', 'science'].indexOf(subject) < 0 || typeof volume !== 'string' ||
        typeof id !== 'string' || id.length > 128 ||
        !(subject === 'physics' ? /^cnp_[A-Za-z0-9]+$/ : /^cns_[A-Za-z0-9]+$/).test(id) ||
        (volume !== '' && !(subject === 'physics' ? PHYSICS_BOOKS.indexOf(volume) >= 0 : /^[一二三四五六][上下]$/.test(volume))) ||
        ['book', 'local'].indexOf(value.view) < 0 || [1, 2, 3, 'all'].indexOf(value.depth) < 0) return null;
    var layout = value.layout === undefined ? '' : value.layout;
    if (typeof layout !== 'string' || !/^[A-Za-z0-9:_|.-]{0,100}$/.test(layout)) return null;
    return { subject:subject, volume:volume, topicId:id, view:value.view, depth:value.depth, layout:layout };
  }
  function camera(value) {
    if (!object(value) || !['zoom', 'centerX', 'centerY', 'width', 'height'].every(function (key) { return own(value, key); }) ||
        !numberIn(value.zoom, 0.01, 10) || !numberIn(value.centerX, -1000000, 1000000) ||
        !numberIn(value.centerY, -1000000, 1000000) || !numberIn(value.width, 1, 20000) ||
        !numberIn(value.height, 1, 20000) || (value.expanded !== undefined && typeof value.expanded !== 'boolean')) return null;
    return { zoom:value.zoom, centerX:value.centerX, centerY:value.centerY, width:value.width, height:value.height, expanded:value.expanded === true };
  }
  function save(scene, state) {
    try {
      var validContext = context(scene), validCamera = camera(state);
      if (!validContext || !validCamera) return false;
      root.sessionStorage.setItem(KEY, JSON.stringify({ v:1, context:validContext, camera:validCamera }));
      return true;
    } catch (error) { return false; }
  }
  function read(scene) {
    try {
      var wanted = context(scene);
      if (!wanted) return null;
      var raw = root.sessionStorage.getItem(KEY);
      if (typeof raw !== 'string' || !raw || raw.length > 4096) return null;
      var value = JSON.parse(raw);
      if (!object(value) || value.v !== 1) return null;
      var savedContext = context(value.context), savedCamera = camera(value.camera);
      if (!savedContext || !savedCamera || JSON.stringify(savedContext) !== JSON.stringify(wanted)) return null;
      return savedCamera;
    } catch (error) { return null; }
  }
  function clear() {
    try { root.sessionStorage.removeItem(KEY); return true; } catch (error) { return false; }
  }
  return { KEY:KEY, save:save, read:read, clear:clear };
});
