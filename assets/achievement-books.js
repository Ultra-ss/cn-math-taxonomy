/* 当前教材成就视图：只整理传入的教材范围与本人直接检测状态，不读写学习数据。 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./book-selection.js'));
  else root.CnmAchievementBooks = factory(root.CnmBookSelection);
})(typeof window !== 'undefined' ? window : globalThis, function (scope) {
  'use strict';
  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var HIGH = { 10:'必修一', 11:'必修二', 12:'必修三', 13:'选必一', 14:'选必二', 15:'选必三' };
  var TITLES = { '九全':'九年级全一册', '必修一':'必修第一册', '必修二':'必修第二册', '必修三':'必修第三册',
    '选必一':'选择性必修第一册', '选必二':'选择性必修第二册', '选必三':'选择性必修第三册' };
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function allowed(subject) { return scope && typeof scope.allowed === 'function' ? scope.allowed(subject) : []; }
  function empty() { return { subject:'', volumes:[], books:[], total:0, completed:0, remaining:0, expert:0 }; }
  function bookOf(topic) {
    if (!object(topic)) return '';
    var grade = topic.grade, volume = '';
    if (topic.subject === 'physics') {
      if (own(HIGH, grade)) volume = HIGH[grade];
      else if (grade === 8 && (topic.semester === '上' || topic.semester === '下')) volume = '八' + topic.semester;
      else if (grade === 9 && topic.semester === '全') volume = '九全';
    } else if (topic.subject === 'science' && Number.isInteger(grade) && grade >= 1 && grade <= 6 &&
        (topic.semester === '上' || topic.semester === '下')) volume = CN[grade] + topic.semester;
    return volume;
  }
  function titleOf(subject, volume) {
    if (allowed(subject).indexOf(volume) < 0) return '';
    if (own(TITLES, volume)) return TITLES[volume];
    return volume.charAt(0) + '年级' + volume.charAt(1) + '册';
  }
  function chapterOf(topic) {
    var title = typeof topic.chapter === 'string' && topic.chapter ? topic.chapter : '未分章';
    var match = /^[一二三四五六七八九]年级[上下全]册\s+(.+)$/.exec(title);
    if (match) return match[1];
    match = /^\S+\s+(第\S+章)\s+(.+)$/.exec(title);
    if (match) return match[1] + ' ' + match[2].replace(/\s+(?:\d+(?:\.\d+)*|整理与提升|实验活动\d+)$/, '');
    return title.replace(/^\S+\s+(绪言)$/, '$1');
  }
  function selected(topics, selection) {
    if (!object(selection) || ['physics','science'].indexOf(selection.subject) < 0 || typeof selection.topicId !== 'string') return null;
    var subject = selection.subject, order = allowed(subject), hasMany = own(selection, 'volumes'), volumes;
    var volume = own(selection, 'volume') ? selection.volume : '';
    if (typeof volume !== 'string' || (volume !== '' && order.indexOf(volume) < 0)) return null;
    if (hasMany) {
      var values = selection.volumes;
      if (!Array.isArray(values) || !values.length || values.length > 24) return null;
      for (var i=0; i<values.length; i++) if (!own(values,i) || order.indexOf(values[i]) < 0) return null;
      volumes = order.filter(function (item) { return values.indexOf(item) >= 0; });
      if (volume && (volumes.length !== 1 || volumes[0] !== volume)) return null;
    } else if (!own(selection,'volume')) return null;
    else volumes = volume ? [volume] : order;
    if (!volumes.length) return null;
    var topic = topics.find(function (row) {
      return object(row) && !row.external && row.id === selection.topicId && row.subject === subject;
    });
    if (!topic || volumes.indexOf(bookOf(topic)) < 0) return null;
    return { subject:subject, volumes:volumes };
  }
  function stateOf(states, id) {
    var row = object(states) && own(states,id) ? states[id] : null;
    if (!object(row) || row.src === 'inferred' || row.source === 'inferred') return 'unknown';
    return ['mastered','weak','shaky'].indexOf(row.status) >= 0 ? row.status : 'unknown';
  }
  function build(input) {
    try {
      if (!object(input) || !Array.isArray(input.topics)) return empty();
      var choice = selected(input.topics, input.selection);
      if (!choice) return empty();
      var byBook = Object.create(null), byChapter = Object.create(null), seen = Object.create(null);
      var books = choice.volumes.map(function (volume) {
        var book = { subject:choice.subject, volume:volume, title:titleOf(choice.subject,volume), total:0,
          completed:0, remaining:0, expert:0, firstTopicId:'', chapters:[] };
        byBook[volume] = book; byChapter[volume] = Object.create(null); return book;
      });
      input.topics.forEach(function (topic) {
        if (!object(topic) || topic.external || topic.subject !== choice.subject || typeof topic.id !== 'string' || seen[topic.id]) return;
        var volume = bookOf(topic), book = byBook[volume];
        if (!book) return;
        seen[topic.id] = true;
        var title = chapterOf(topic), chapter = byChapter[volume][title];
        if (!chapter) {
          chapter = { title:title, total:0, completed:0, remaining:0, expert:0, firstTopicId:topic.id, topics:[] };
          byChapter[volume][title] = chapter; book.chapters.push(chapter);
        }
        var status = stateOf(input.normal,topic.id), passed = status === 'mastered';
        var expert = passed && stateOf(input.pro,topic.id) === 'mastered';
        chapter.topics.push({ id:topic.id, name:typeof topic.name === 'string' ? topic.name : topic.id, status:status, expert:expert });
        if (!book.firstTopicId) book.firstTopicId = topic.id;
        [book,chapter].forEach(function (row) {
          row.total++; if (passed) row.completed++; else row.remaining++; if (expert) row.expert++;
        });
      });
      books = books.filter(function (book) { return book.total > 0; });
      var result = { subject:choice.subject, volumes:books.map(function (book) { return book.volume; }), books:books,
        total:0, completed:0, remaining:0, expert:0 };
      books.forEach(function (book) {
        ['total','completed','remaining','expert'].forEach(function (field) { result[field] += book[field]; });
      });
      return result;
    } catch (error) { return empty(); }
  }
  return { build:build, bookOf:bookOf, titleOf:titleOf };
});
