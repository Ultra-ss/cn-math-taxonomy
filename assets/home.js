/* 首页：只展示小学科学与物理，统计和年级入口从当前数据计算。 */
(function () {
  'use strict';
  var raw = location.hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (e) { /* 保持原样 */ }
  if (/^(?:cnp|cns)_[A-Za-z0-9]+$/.test(raw)) return;

  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var subject = new URLSearchParams(location.search).get('subject') === 'physics' ? 'physics' : 'science';

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

  var eye = document.querySelector('.eyebrow');
  var primary = document.querySelector('.hero-actions a.btn-primary');
  var browse = document.querySelector('.hero-actions a.btn:not(.btn-primary)');
  var demo = document.querySelector('.quiet-link a');
  if (subject === 'physics') {
    document.title = '物理 · 科学·物理知识图谱';
    if (eye) eye.textContent = '物理：初中八、九年级 · 高中必修与选择性必修';
    if (primary) primary.setAttribute('href', 'diagnose/?subject=physics');
    if (browse) browse.setAttribute('href', 'explore/?subject=physics');
    if (demo) {
      demo.setAttribute('href', 'diagnose/?subject=physics&grade=' + encodeURIComponent('八上') + '&demo=1');
      demo.textContent = '先看一遍演示：八年级上册物理';
    }
  } else {
    document.title = '科学 · 科学·物理知识图谱';
    if (eye) eye.textContent = '科学：小学一至六年级 · 教科版';
    if (primary) primary.setAttribute('href', 'diagnose/?subject=science');
    if (browse) browse.setAttribute('href', 'explore/?subject=science');
    if (demo) {
      demo.setAttribute('href', 'diagnose/?subject=science&grade=' + encodeURIComponent('一上') + '&demo=1');
      demo.textContent = '先看一遍演示：一年级上册科学';
    }
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function fail(message) {
    var box = document.getElementById('load-error');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
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
  Promise.all([
    fetch('data/topics.json'),
    fetch('data/dependencies.json'),
    fetch('data/cn-curriculum-standards.json')
  ]).then(function (responses) {
    responses.forEach(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
    });
    return Promise.all(responses.map(function (response) { return response.json(); }));
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

    var grades = document.getElementById('grades');
    if (!grades) return;
    grades.replaceChildren();
    grades.removeAttribute('aria-busy');
    function addCard(g, stageName, title, klass, splitText) {
      var list = topics.filter(function (topic) { return topic.grade === g; });
      var link = document.createElement('a');
      link.className = 'grade-card ' + klass;
      link.href = 'explore/?subject=' + subject + '&grade=' + g;
      var stage = document.createElement('span');
      stage.className = 'grade-stage';
      stage.textContent = stageName;
      var name = document.createElement('strong');
      name.textContent = title;
      var count = document.createElement('span');
      count.className = 'grade-count';
      count.textContent = list.length + ' 个知识点';
      var split = document.createElement('span');
      split.className = 'grade-stage';
      split.textContent = splitText;
      link.append(stage, name, count, split);
      grades.append(link);
    }

    if (subject === 'science') {
      for (var g = 1; g <= 6; g++) {
        var list = topics.filter(function (topic) { return topic.grade === g; });
        var up = list.filter(function (topic) { return topic.semester === '上'; }).length;
        var down = list.filter(function (topic) { return topic.semester === '下'; }).length;
        addCard(g, '小学科学', CN[g] + '年级', 'is-primary', '上 ' + up + ' · 下 ' + down);
      }
    } else {
      [8, 9].forEach(function (g) {
        var list = topics.filter(function (topic) { return topic.grade === g; });
        var up = list.filter(function (topic) { return topic.semester === '上'; }).length;
        var down = list.filter(function (topic) { return topic.semester === '下'; }).length;
        var whole = list.filter(function (topic) { return topic.semester === '全'; }).length;
        addCard(g, '初中物理', CN[g] + '年级', 'is-junior', whole ? '全一册 ' + whole : '上 ' + up + ' · 下 ' + down);
      });
      [
        [10, '必修一', '必修第一册'], [11, '必修二', '必修第二册'], [12, '必修三', '必修第三册'],
        [13, '选必一', '选择性必修第一册'], [14, '选必二', '选择性必修第二册'], [15, '选必三', '选择性必修第三册']
      ].forEach(function (book) { addCard(book[0], '高中物理', book[1], 'is-senior', book[2]); });
    }
    renderBlindHome(topics);
  }).catch(function (error) {
    fail('数据没有加载成功（' + (error && error.message ? error.message : error) + '）。请稍后刷新重试。');
  });
})();
