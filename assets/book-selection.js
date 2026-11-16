/* 教材范围：同一学科内的多本教材使用固定顺序，单本链接仍沿用 volume。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CnmBookSelection = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var PHYSICS = ['八上', '八下', '九全', '必修一', '必修二', '必修三', '选必一', '选必二', '选必三'];
  var SCIENCE = [];
  ['一', '二', '三', '四', '五', '六'].forEach(function (grade) { SCIENCE.push(grade + '上', grade + '下'); });

  function allowed(subject) {
    return (subject === 'physics' ? PHYSICS : subject === 'science' ? SCIENCE : []).slice();
  }
  function normalize(subject, values) {
    if (!Array.isArray(values)) return [];
    try { return allowed(subject).filter(function (book) { return values.indexOf(book) >= 0; }); }
    catch (error) { return []; }
  }
  function fromParams(params, subject) {
    try {
      var groups = typeof params.getAll === 'function' ? params.getAll('volumes') : [params.get('volumes')];
      var values = [];
      groups.forEach(function (group) {
        if (typeof group !== 'string' || group.length > 4096) return;
        group.split(',').forEach(function (book) { values.push(book.trim()); });
      });
      var selected = normalize(subject, values);
      return selected.length ? selected : normalize(subject, [params.get('volume')]);
    } catch (error) { return []; }
  }
  function writeParams(params, subject, values) {
    var selected = normalize(subject, values);
    params.delete('volume');
    params.delete('volumes');
    if (selected.length === 1) params.set('volume', selected[0]);
    else if (selected.length > 1) params.set('volumes', selected.join(','));
    return params;
  }
  return { allowed: allowed, normalize: normalize, fromParams: fromParams, writeParams: writeParams };
});
