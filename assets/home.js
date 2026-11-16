/* 首页：按教材进入科学与物理，知识点数量与统计从当前数据计算。 */
(function () {
  'use strict';
  var raw = location.hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (e) { /* 保持原样 */ }
  if (/^(?:cnp|cns)_[A-Za-z0-9]+$/.test(raw)) return;

  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var subject = new URLSearchParams(location.search).get('subject') === 'science' ? 'science' : 'physics';

  function withSubject(href) {
    if (!href || href.indexOf('subject=') >= 0 || href.indexOf('http') === 0 || href.charAt(0) === '#') return href;
    return href + (href.indexOf('?') >= 0 ? '&' : '?') + 'subject=' + subject;
  }

  document.body.classList.toggle('subject-physics', subject === 'physics');
  document.body.classList.toggle('subject-science', subject === 'science');
  document.querySelectorAll('.subject-link').forEach(function (link) {
    var on = link.getAttribute('data-subject') === subject;
    link.classList.toggle('on', on);
    if (on) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.site-nav a:not(.subject-link):not([data-resume-graph]), a.brand').forEach(function (link) {
    var href = link.getAttribute('href');
    var next = withSubject(href);
    if (next && next !== href) link.setAttribute('href', next);
  });

  document.title = (subject === 'physics' ? '物理' : '科学') + ' · 全网路物理学习图谱';

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function fail(message) {
    var box = document.getElementById('load-error');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
    var grid = document.getElementById('textbook-grid');
    if (grid) grid.removeAttribute('aria-busy');
  }

  function textbookList() {
    if (subject === 'science') {
      var books = [];
      for (var g = 1; g <= 6; g++) {
        ['上', '下'].forEach(function (term) {
          books.push({ volume: CN[g] + term, grade: g, term: term,
            title: CN[g] + '年级' + term + '册', stage: '小学科学', klass: 'is-primary' });
        });
      }
      return books;
    }
    return [
      ['八上', 8, '上', '八年级上册'], ['八下', 8, '下', '八年级下册'], ['九全', 9, '全', '九年级全一册'],
      ['必修一', 10, '上', '必修第一册'], ['必修二', 11, '上', '必修第二册'], ['必修三', 12, '上', '必修第三册'],
      ['选必一', 13, '上', '选择性必修第一册'], ['选必二', 14, '上', '选择性必修第二册'], ['选必三', 15, '上', '选择性必修第三册']
    ].map(function (book) {
      return { volume: book[0], grade: book[1], term: book[2], title: book[3],
        stage: book[1] < 10 ? '初中物理' : '高中物理', klass: book[1] < 10 ? 'is-junior' : 'is-senior' };
    });
  }

  function renderTextbooks(topics) {
    var grid = document.getElementById('textbook-grid');
    if (!grid) return;
    grid.replaceChildren();
    textbookList().forEach(function (book) {
      var link = document.createElement('a');
      link.className = 'textbook-card ' + book.klass;
      link.setAttribute('data-volume', book.volume);
      link.href = 'explore/?subject=' + subject + '&volume=' + encodeURIComponent(book.volume);
      var stage = document.createElement('span');
      stage.className = 'textbook-stage';
      stage.textContent = book.stage;
      var title = document.createElement('strong');
      title.textContent = book.title;
      var count = document.createElement('span');
      count.className = 'textbook-count';
      count.textContent = topics ? topics.filter(function (topic) {
        return topic.grade === book.grade && topic.semester === book.term;
      }).length + ' 个知识点' : '正在加载知识点…';
      var action = document.createElement('span');
      action.className = 'textbook-action';
      action.textContent = '进入教材 →';
      link.append(stage, title, count, action);
      grid.appendChild(link);
    });
    if (topics) grid.removeAttribute('aria-busy');
  }

  setText('textbook-subject', subject === 'physics' ? '物理 · 人教版' : '科学 · 教科版');
  renderTextbooks(null);

  // 首页只加载教材知识点数量，不再请求统计和题库数据。
  fetch('data/topics.json').then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function (allTopics) {
    if (!Array.isArray(allTopics)) throw new Error('知识点数据格式无法识别');
    renderTextbooks(allTopics.filter(function (topic) { return topic.subject === subject; }));
  }).catch(function (error) {
    fail('数据没有加载成功（' + (error && error.message ? error.message : error) + '）。请稍后刷新重试。');
  });
})();
