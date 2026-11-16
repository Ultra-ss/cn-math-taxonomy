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
  document.querySelectorAll('.site-nav a:not(.subject-link), a.brand').forEach(function (link) {
    var href = link.getAttribute('href');
    var next = withSubject(href);
    if (next && next !== href) link.setAttribute('href', next);
  });

  document.title = (subject === 'physics' ? '物理' : '科学') + ' · 科学·物理知识图谱';

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

  function renderBlindHome(allTopics) {
    var box = document.getElementById('blind-home');
    var list = document.getElementById('blind-home-list');
    var actions = document.getElementById('blind-home-actions');
    if (!box || !list || !actions || !window.CnmBlind) return;
    var nameOf = {};
    (allTopics || []).forEach(function (t) { nameOf[t.id] = t.name; });
    var rows = window.CnmBlind.list({ subject: subject, limit: 8 });
    if (!rows.length) {
      box.hidden = true;
      list.replaceChildren();
      actions.replaceChildren();
      return;
    }
    box.hidden = false;
    list.replaceChildren();
    rows.forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'blind-home-item';
      var name = document.createElement('a');
      name.className = 'blind-home-name';
      name.href = window.CnmBlind.diagnoseHref([row.id], row.subject || subject);
      name.textContent = nameOf[row.id] || row.id;
      li.appendChild(name);
      var meta = document.createElement('span');
      meta.className = 'blind-home-meta';
      var bits = [row.status === 'weak' ? (row.root ? '根因' : '薄弱') : (row.status === 'retest' ? '需重测' : '不稳')];
      if (row.wrongs && row.status !== 'retest') bits.push('答错 ' + row.wrongs + ' 次');
      meta.textContent = bits.join(' · ');
      li.appendChild(meta);
      list.appendChild(li);
    });
    actions.replaceChildren();
    var cur = window.CnmChildren && window.CnmChildren.current && window.CnmChildren.current();
    var all = document.createElement('a');
    all.className = 'btn';
    all.href = window.CnmBlind.historyHref(cur && cur.id, 'children/');
    all.textContent = '查看全部盲区';
    actions.appendChild(all);
    var weakIds = rows.filter(function (r) { return r.status === 'weak'; }).slice(0, 5).map(function (r) { return r.id; });
    if (weakIds.length) {
      var re = document.createElement('a');
      re.className = 'btn btn-primary';
      re.href = window.CnmBlind.diagnoseHref(weakIds, subject);
      re.textContent = '再测本页薄弱点';
      actions.appendChild(re);
    }
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

  var fetchInflight = {};
  function fetchJsonWithRetry(url, attempts) {
    attempts = attempts || 2;
    if (fetchInflight[url]) return fetchInflight[url];
    var run = (function tryOnce(left) {
      return fetch(url).then(function (response) {
        if (!response.ok) {
          var httpErr = new Error('HTTP ' + response.status);
          httpErr.noRetry = true;
          throw httpErr;
        }
        return response.json();
      }).catch(function (err) {
        if (err && err.noRetry) throw err;
        if (left > 1) return tryOnce(left - 1);
        throw err;
      });
    })(attempts);
    fetchInflight[url] = run.then(function (data) {
      delete fetchInflight[url];
      return data;
    }, function (err) {
      delete fetchInflight[url];
      throw err;
    });
    return fetchInflight[url];
  }

  var homeLoadToken = subject;
  // 教材入口只等待知识点文件，题库及其他统计失败仍能选教材。
  var topicsPromise = fetch('data/topics.json').then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function (allTopics) {
    if (!Array.isArray(allTopics)) throw new Error('知识点数据格式无法识别');
    var selected = allTopics.filter(function (topic) { return topic.subject === subject; });
    renderTextbooks(selected);
    renderBlindHome(selected);
    return allTopics;
  });
  Promise.all([
    topicsPromise,
    fetch('data/dependencies.json'),
    fetch('data/cn-curriculum-standards.json')
  ]).then(function (responses) {
    return Promise.all(responses.map(function (response, index) {
      if (index === 0) return response;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }));
  }).then(function (data) {
    if (homeLoadToken !== subject) return;
    if (!Array.isArray(data[0]) || !Array.isArray(data[1])) throw new Error('数据格式无法识别');
    var topicIds = new Set(data[0].map(function (topic) { return topic.id; }));
    var topics = data[0].filter(function (topic) { return topic.subject === subject; });
    var deps = data[1].filter(function (edge) {
      return subject === 'physics' ? edge.topicId.indexOf('cnp_') === 0 : edge.topicId.indexOf('cns_') === 0;
    });
    var standards = data[2] && Array.isArray(data[2].items) ? data[2].items : [];
    var items = standards.filter(function (item) {
      return subject === 'physics' ? String(item.id).indexOf('cps-') === 0 : String(item.id).indexOf('css-') === 0;
    });

    setText('n-topics', String(topics.length));
    setText('n-edges', String(deps.length));
    setText('n-questions', '…');
    setText('n-standards', String(items.length));

    fetchJsonWithRetry('data/questions.json', 2).then(function (questions) {
      if (qTokenExpired()) return;
      if (!Array.isArray(questions)) throw new Error('数据格式无法识别');
      var count = questions.filter(function (question) {
        return topicIds.has(question.topicId) && topics.some(function (topic) { return topic.id === question.topicId; });
      }).length;
      setText('n-questions', String(count));
    }).catch(function () {
      if (!qTokenExpired()) setText('n-questions', '—');
    });
    function qTokenExpired() { return homeLoadToken !== subject; }

  }).catch(function (error) {
    fail('数据没有加载成功（' + (error && error.message ? error.message : error) + '）。请稍后刷新重试。');
  });
})();
