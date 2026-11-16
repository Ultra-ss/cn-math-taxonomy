/* 首页：按教材进入科学与物理，知识点数量与统计从当前数据计算。 */
(function () {
  'use strict';
  var raw = location.hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (e) { /* 保持原样 */ }
  if (/^(?:cnp|cns)_[A-Za-z0-9]+$/.test(raw)) return;

  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var subject = new URLSearchParams(location.search).get('subject') === 'science' ? 'science' : 'physics';
  var bookScope = window.CnmBookSelection;
  var multiMode = false;
  var chosenBooks = new Set();
  var loadedTopics = null;
  var cardGrid = document.getElementById('textbook-grid');
  var multiToggle = document.getElementById('book-multiselect-toggle');
  var cancelSelection = document.getElementById('book-selection-cancel');
  var enterSelection = document.getElementById('book-selection-enter');

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
    if (node && node.textContent !== value) node.textContent = value;
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

  function selectedBooks() {
    return bookScope ? bookScope.normalize(subject, Array.from(chosenBooks)) : [];
  }

  function syncSelection() {
    if (!cardGrid) return;
    var selected = selectedBooks();
    cardGrid.setAttribute('data-multi-select', multiMode ? 'true' : 'false');
    cardGrid.setAttribute('role', 'group');
    cardGrid.setAttribute('aria-label', multiMode ? '多选教材' : '教材列表');
    Array.prototype.forEach.call(cardGrid.children, function (card) {
      var checked = multiMode && chosenBooks.has(card.getAttribute('data-volume'));
      card.classList.toggle('is-selected', checked);
      if (multiMode) {
        card.setAttribute('aria-pressed', checked ? 'true' : 'false');
        var title = card.querySelector('strong');
        card.setAttribute('aria-label', title.textContent + '，' + (checked ? '已选择' : '未选择'));
      }
    });
    setText('textbook-title', multiMode ? (selected.length ? '已选 ' + selected.length + ' 本教材' : '请选择教材') : '选择教材开始学习');
    if (multiToggle) {
      multiToggle.hidden = !bookScope || multiMode;
      multiToggle.setAttribute('aria-pressed', multiMode ? 'true' : 'false');
    }
    if (cancelSelection) cancelSelection.hidden = !multiMode;
    if (enterSelection) {
      enterSelection.hidden = !multiMode;
      enterSelection.setAttribute('aria-disabled', selected.length ? 'false' : 'true');
      if (selected.length) {
        var params = new URLSearchParams({subject: subject});
        bookScope.writeParams(params, subject, selected);
        enterSelection.href = 'explore/?' + params.toString();
        enterSelection.removeAttribute('tabindex');
      } else {
        enterSelection.removeAttribute('href');
        enterSelection.setAttribute('tabindex', '-1');
      }
    }
  }

  function renderTextbooks() {
    var grid = document.getElementById('textbook-grid');
    if (!grid) return;
    grid.replaceChildren();
    textbookList().forEach(function (book) {
      var link = document.createElement(multiMode ? 'button' : 'a');
      link.className = 'textbook-card ' + book.klass;
      link.setAttribute('data-volume', book.volume);
      if (multiMode) link.type = 'button';
      else link.href = 'explore/?subject=' + subject + '&volume=' + encodeURIComponent(book.volume);
      var stage = document.createElement('span');
      stage.className = 'textbook-stage';
      stage.textContent = book.stage;
      var title = document.createElement('strong');
      title.textContent = book.title;
      var count = document.createElement('span');
      count.className = 'textbook-count';
      count.textContent = loadedTopics ? loadedTopics.filter(function (topic) {
        return topic.grade === book.grade && topic.semester === book.term;
      }).length + ' 个知识点' : '正在加载知识点…';
      var action = document.createElement('span');
      action.className = 'textbook-action';
      action.textContent = multiMode ? '点击选择教材' : '进入教材 →';
      link.append(stage, title, count, action);
      if (multiMode) {
        var mark = document.createElement('span');
        mark.className = 'textbook-selection-mark';
        mark.setAttribute('aria-hidden', 'true');
        link.appendChild(mark);
      }
      grid.appendChild(link);
    });
    if (loadedTopics) grid.removeAttribute('aria-busy');
    syncSelection();
  }

  function updateTextbookCounts(topics) {
    loadedTopics = topics;
    var books = textbookList();
    // 数据到达只更新数字，保留已选状态、键盘焦点和正在按下的卡片。
    Array.prototype.forEach.call(cardGrid.children, function (card) {
      var book = books.find(function (item) { return item.volume === card.getAttribute('data-volume'); });
      if (!book) return;
      card.querySelector('.textbook-count').textContent = topics.filter(function (topic) {
        return topic.grade === book.grade && topic.semester === book.term;
      }).length + ' 个知识点';
    });
    cardGrid.removeAttribute('aria-busy');
  }

  setText('textbook-subject', subject === 'physics' ? '物理 · 人教版' : '科学 · 教科版');
  renderTextbooks();
  if (cardGrid && multiToggle && cancelSelection && enterSelection && bookScope) {
    multiToggle.addEventListener('click', function () {
      multiMode = true;
      renderTextbooks();
      if (cardGrid.firstElementChild) cardGrid.firstElementChild.focus({preventScroll:true});
    });
    cancelSelection.addEventListener('click', function () {
      multiMode = false;
      chosenBooks.clear();
      renderTextbooks();
      multiToggle.focus({preventScroll:true});
    });
    cardGrid.addEventListener('click', function (event) {
      if (!multiMode) return;
      var card = event.target.closest('.textbook-card');
      if (!card || card.parentElement !== cardGrid) return;
      event.preventDefault();
      var key = card.getAttribute('data-volume');
      if (!bookScope.normalize(subject, [key]).length) return;
      if (chosenBooks.has(key)) chosenBooks.delete(key); else chosenBooks.add(key);
      syncSelection();
    });
    enterSelection.addEventListener('click', function (event) {
      if (!selectedBooks().length) event.preventDefault();
    });
  }

  // 卡片开页自动悬浮；暂停入口只控制显示，不干预教材链接。
  var motionToggle = document.getElementById('card-motion-toggle');
  if (cardGrid && motionToggle) {
    var motionPreference = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function syncCardMotionControl() {
      var paused = cardGrid.getAttribute('data-motion-paused') === 'true';
      motionToggle.hidden = !!(motionPreference && motionPreference.matches);
      motionToggle.textContent = paused ? '继续晃动' : '暂停晃动';
      motionToggle.setAttribute('aria-label', paused ? '继续卡片自动晃动' : '暂停卡片自动晃动');
      motionToggle.setAttribute('title', paused ? '继续卡片自动晃动' : '暂停卡片自动晃动');
      motionToggle.setAttribute('data-paused', paused ? 'true' : 'false');
    }
    motionToggle.addEventListener('click', function () {
      cardGrid.setAttribute('data-motion-paused', cardGrid.getAttribute('data-motion-paused') === 'true' ? 'false' : 'true');
      syncCardMotionControl();
    });
    if (motionPreference && motionPreference.addEventListener) motionPreference.addEventListener('change', syncCardMotionControl);
    syncCardMotionControl();
  }

  // 首页只加载教材知识点数量，不再请求统计和题库数据。
  fetch('data/topics.json').then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function (allTopics) {
    if (!Array.isArray(allTopics)) throw new Error('知识点数据格式无法识别');
    updateTextbookCounts(allTopics.filter(function (topic) { return topic.subject === subject; }));
  }).catch(function (error) {
    fail('数据没有加载成功（' + (error && error.message ? error.message : error) + '）。请稍后刷新重试。');
  });
})();
