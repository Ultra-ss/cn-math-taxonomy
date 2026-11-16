/* 知识图谱浏览：搜索、筛选，以及选中知识点的局部先修图。 */
(function () {
  'use strict';

  var FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
  var CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var DOMAIN_ORDER = ['数与代数', '图形与几何', '统计与概率', '综合与实践'];
  var SCI_DOMAIN_ORDER = ['物质科学', '生命科学', '地球与宇宙科学', '技术与工程'];
  var MOR_DOMAIN_ORDER = ['生活与安全', '学校生活', '家庭与亲情', '社会规则', '公民与国家', '自然与环境'];
  var HIS_DOMAIN_ORDER = ['中国古代史', '中国近代史', '中国现代史', '世界古代史', '世界近代史', '世界现代史'];
  var GEO_DOMAIN_ORDER = ['地球与地图', '世界地理', '中国地理'];
  var BIO_DOMAIN_ORDER = ['生物体的结构层次', '生物的多样性', '生物与环境', '植物的生活', '人体生理与健康', '遗传与进化', '生物学与社会·跨学科实践'];
  var CHEM_DOMAIN_ORDER = ['科学探究与化学实验', '物质的性质与应用', '物质的组成与结构', '物质的化学变化', '化学与社会·跨学科实践'];
  var ZH_DOMAIN_ORDER = ['拼音', '识字写字', '词语', '句子', '阅读理解', '古诗文积累', '文言文阅读', '名著阅读', '习作基础'];

  var topics = [];
  var deps = [];
  var aliases = {};
  var byId = new Map();
  var indexOf = new Map();
  var pre = new Map();
  var post = new Map();
  var stdById = new Map();
  var selected = null;
  var currentAlias = null;
  var stage = '';
  var grade = '';
  var volume = '';
  var showWholeBook = true;
  var domain = '';
  var query = '';
  var aliasHitIds = new Set();
  var subject = 'physics';
  var progress = {};
  var progressStamp = '';
  var PASS_BADGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#137847" stroke="white" stroke-width="2"/><path d="m6 11 3 3 7-7" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  var FAIL_BADGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#bd2828" stroke="white" stroke-width="2"/><path d="m7 7 8 8m0-8-8 8" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>');
  var upDepth = 2;
  var ancestorsOpen = false;
  var tipFromTap = false;
  var cy = null;
  var graphToken = 0;
  var dagreReady = false;
  var FOLD_AT = 40;
  var explicitNodeSelection = null;
  var nodeDialogId = null;
  var nodeDialogScroll = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (key) {
      var value = a[key];
      if (value == null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (item) { append(node, item); }); return; }
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  function stageKind(grade) {
    if (grade <= 6) return 'primary';
    if (grade <= 9) return 'junior';
    return 'senior';
  }
  function stageLabel(grade) {
    if (grade <= 6) return '小学';
    if (grade <= 9) return '初中';
    return '高中';
  }
  var EN_BOOK = {
    10: ['必修一', '必修一 · 必修第一册'],
    11: ['必修二', '必修二 · 必修第二册'],
    12: ['必修三', '必修三 · 必修第三册'],
    13: ['选必一', '选必一 · 选择性必修第一册'],
    14: ['选必二', '选必二 · 选择性必修第二册'],
    15: ['选必三', '选必三 · 选择性必修第三册'],
    16: ['选必四', '选必四 · 选择性必修第四册']
  };
  // 化学沿用数学式分册：12 是选必一，不是英语/物理的必修三。
  var CHEM_BOOK = {
    10: ['必修一', '必修一 · 必修第一册'],
    11: ['必修二', '必修二 · 必修第二册'],
    12: ['选必一', '选必一 · 选择性必修第一册'],
    13: ['选必二', '选必二 · 选择性必修第二册'],
    14: ['选必三', '选必三 · 选择性必修第三册']
  };
  function booksForSubject() {
    if (subject === 'physics') return [
      ['八上', '八年级上册', 8, '上'], ['八下', '八年级下册', 8, '下'], ['九全', '九年级全一册', 9, '全'],
      ['必修一', '必修第一册', 10], ['必修二', '必修第二册', 11], ['必修三', '必修第三册', 12],
      ['选必一', '选择性必修第一册', 13], ['选必二', '选择性必修第二册', 14], ['选必三', '选择性必修第三册', 15]
    ];
    var list = [];
    for (var g = 1; g <= 6; g++) {
      list.push([CN[g] + '上', CN[g] + '年级上册', g, '上']);
      list.push([CN[g] + '下', CN[g] + '年级下册', g, '下']);
    }
    return list;
  }
  function volumeOf(topic) {
    if (topic.grade >= 10) return EN_BOOK[topic.grade] ? EN_BOOK[topic.grade][0] : '';
    return CN[topic.grade] + (topic.semester === '全' ? '全' : topic.semester);
  }
  function bookSpec(key) {
    return booksForSubject().find(function (book) { return book[0] === key; }) || null;
  }
  function bookTitle(key) { var book = bookSpec(key); return book ? book[1] : key; }
  function currentChild() {
    return window.CnmChildren && window.CnmChildren.current ? window.CnmChildren.current() : null;
  }
  function progressOf(id) { return progress[id] || null; }
  function progressLabel(row) {
    return !row ? '尚未完成检测' : row.status === 'mastered' ? '已通过检测' : '未通过检测，建议巩固后再测';
  }
  function progressClass(row) { return row ? row.status === 'mastered' ? 'test-passed' : 'test-failed' : ''; }
  function progressBadge(row) {
    return row ? el('span', { class: 'topic-state ' + progressClass(row), 'aria-label': progressLabel(row), title: progressLabel(row), text: row.status === 'mastered' ? '✓' : '×' }) : null;
  }
  function refreshProgress(force) {
    var child = currentChild();
    var next = window.CnmProgress && window.CnmProgress.statuses ? window.CnmProgress.statuses(child ? child.id : null, subject) : {};
    var stamp = JSON.stringify([child ? child.id : null, next]);
    if (!force && progressStamp === stamp) return;
    progressStamp = stamp;
    progress = next;
    if ($('progress-owner')) $('progress-owner').textContent = child ? '检测记录：' + child.name : '检测记录：本机访客';
    if (topics.length) {
      renderList();
      renderDetail();
      if (cy) {
        cy.nodes().forEach(function (node) {
          if (!byId.has(node.id())) return;
          var row = progressOf(node.id());
          node.removeClass('test-passed test-failed');
          if (row) node.addClass(progressClass(row));
          node.data('testStatus', row ? row.status : '');
          node.data('testLabel', progressLabel(row));
        });
      }
    }
  }
  function graphReturnTo() {
    // 从当前同源图谱状态生成返回地址，不采用 URL 中传入的 returnTo。
    var params = new URLSearchParams(location.search);
    params.delete('returnTo');
    params.set('subject', subject);
    params.delete('grade');
    if (volume) params.set('volume', volume); else params.delete('volume');
    if (stage) params.set('stage', stage); else params.delete('stage');
    if (domain) params.set('domain', domain); else params.delete('domain');
    if (query) params.set('q', query); else params.delete('q');
    if (volume) params.set('view', showWholeBook ? 'book' : 'local'); else params.delete('view');
    params.set('depth', String(upDepth));
    var pathname = '/' + location.pathname.replace(/^\/+/, '');
    return pathname + '?' + params.toString() + (selected ? '#' + encodeURIComponent(selected) : '');
  }
  function withReturn(href) {
    var fallback = new URL('../diagnose/?subject=' + subject, location.href);
    var target;
    try { target = new URL(href, location.href); } catch (error) { target = fallback; }
    if (target.origin !== location.origin || !/\/diagnose\/(?:index\.html)?$/.test(target.pathname)) target = fallback;
    target.searchParams.set('returnTo', graphReturnTo());
    return target.pathname + target.search + target.hash;
  }
  function refreshDiagnosisLinks() {
    document.querySelectorAll('a[data-diagnose-return]').forEach(function (link) {
      link.setAttribute('href', withReturn(link.getAttribute('data-diagnose-return')));
    });
  }
  function bookHref() {
    return withReturn('../diagnose/?subject=' + subject + '&volume=' + encodeURIComponent(volume) + '&order=book');
  }
  function syncBook() {
    var title = $('book-title');
    var action = $('book-diagnose');
    if (!title || !action) return;
    title.textContent = volume ? bookTitle(volume) : '选择一本教材';
    var mobileTitle = $('mobile-book-title');
    if (mobileTitle) mobileTitle.textContent = volume ? bookTitle(volume) : subject === 'physics' ? '物理知识图谱' : '科学知识图谱';
    $('book-note').textContent = volume ? '本册 ' + topics.filter(function (topic) { return volumeOf(topic) === volume; }).length + ' 个知识点，检测从教材第一个知识点开始。' : '在教材选择器中选择册次，或从首页进入。';
    action.hidden = !volume;
    action.href = volume ? bookHref() : '#';
    if (volume) action.setAttribute('data-diagnose-return', '../diagnose/?subject=' + subject + '&volume=' + encodeURIComponent(volume) + '&order=book');
    else action.removeAttribute('data-diagnose-return');
    $('book-view').hidden = !volume;
    $('book-view').textContent = showWholeBook ? '查看局部先修' : '查看本册全图';
    $('book-view').setAttribute('aria-pressed', showWholeBook ? 'true' : 'false');
    refreshDiagnosisLinks();
  }
  function syncBookQuery() {
    history.replaceState(null, '', graphReturnTo());
  }
  function chooseBook(key) {
    explicitNodeSelection = null;
    closeNodeDiagnosis();
    volume = bookSpec(key) ? key : '';
    grade = '';
    stage = '';
    domain = '';
    query = '';
    $('q').value = '';
    showWholeBook = true;
    selected = null;
    currentAlias = null;
    ancestorsOpen = false;
    syncControls();
    syncBook();
    syncBookQuery();
    renderList();
    var first = topics.find(passFilter);
    if (first && volume) select(first.id, 'user');
    else { renderDetail(); renderGraph(); }
  }

  function gradeWord(grade) {
    if (subject === 'chemistry' && CHEM_BOOK[grade]) return CHEM_BOOK[grade][0];
    if ((subject === 'english' || subject === 'physics') && EN_BOOK[grade]) return EN_BOOK[grade][0];
    if (grade === 10) return '高一';
    if (grade === 11) return '高二';
    if (grade === 12) return '选必一';
    if (grade === 13) return '选必二';
    if (grade === 14) return '选必三';
    return CN[grade] + '年级';
  }
  function gradeLabel(topic) {
    if (subject === 'chemistry' && CHEM_BOOK[topic.grade]) return CHEM_BOOK[topic.grade][1];
    if ((subject === 'english' || subject === 'physics') && EN_BOOK[topic.grade]) return EN_BOOK[topic.grade][1];
    if (topic.grade === 10) return '高一 · 必修第一册';
    if (topic.grade === 11) return '高二 · 必修第二册';
    if (topic.grade === 12) return '选必一 · 选择性必修第一册';
    if (topic.grade === 13) return '选必二 · 选择性必修第二册';
    if (topic.grade === 14) return '选必三 · 选择性必修第三册';
    if (topic.semester === '全') return CN[topic.grade] + '年级全一册';
    return CN[topic.grade] + '年级' + topic.semester + '册';
  }
  function paint(grade, colors) {
    if (grade <= 6) return { bg: colors.primaryBg, border: colors.primary, cls: 'primary' };
    if (grade <= 9) return { bg: colors.juniorBg, border: colors.junior, cls: 'junior' };
    return { bg: colors.seniorBg, border: colors.senior, cls: 'senior' };
  }

  function chapterOf(topic) {
    var text = topic.chapter || '未分章';
    var primary = /^[一二三四五六七八九]年级[上下全]册\s+(.+)$/.exec(text);
    if (primary) return primary[1];
    var enHs = /^(?:必修第[一二三]册|选择性必修第[一二三四]册) ((?:欢迎单元|第\d+单元) .+)$/.exec(text);
    if (enHs) return enHs[1];
    var model = /^(高[一二]|选必[一二三]) (数学建模|数学探究) (\S+)$/.exec(text);
    if (model) return model[2] + ' ' + model[3];
    var junior = /^\S+\s+(第\S+章)\s+(.+)$/.exec(text);
    if (junior) return junior[1] + ' ' + junior[2].replace(/\s+(?:\d+(?:\.\d+)*|整理与提升|实验活动\d+)$/, '');
    if (/^必修[一二三]\s+绪言$/.test(text)) return '绪言';
    return text;
  }

  function readHash() {
    var hash = location.hash.replace(/^#/, '');
    if (!hash) return '';
    try { hash = decodeURIComponent(hash); } catch (error) { /* 保持原样 */ }
    return hash;
  }

  function resolveId(raw) {
    if (!raw) return null;
    if (byId.has(raw)) return { id: raw, alias: null };
    var spec = aliases[raw];
    if (spec && Array.isArray(spec.targets) && spec.targets.length && byId.has(spec.targets[0])) {
      return {
        id: spec.targets[0],
        alias: { id: raw, name: spec.name || raw, targets: spec.targets.slice() }
      };
    }
    return null;
  }

  function writeHash(id) {
    if (readHash() === id) return;
    history.replaceState(null, '', location.pathname + location.search + '#' + id);
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function theme() {
    return {
      primary: cssVar('--node-primary'),
      primaryBg: cssVar('--node-primary-bg'),
      junior: cssVar('--node-junior'),
      juniorBg: cssVar('--node-junior-bg'),
      senior: cssVar('--node-senior'),
      seniorBg: cssVar('--node-senior-bg'),
      currentBg: cssVar('--node-current-bg'),
      currentBorder: cssVar('--node-current-border'),
      text: cssVar('--node-text'),
      edge: cssVar('--edge'),
      edgeSoft: cssVar('--edge-soft')
    };
  }

  function restoreDepth() {
    try {
      var saved = sessionStorage.getItem('cnmExplore.depth');
      if (saved === '1' || saved === '2' || saved === '3') upDepth = parseInt(saved, 10);
      else if (saved === 'all') upDepth = 'all';
    } catch (error) { /* 隐私模式 */ }
  }

  function syncControls() {
    document.querySelectorAll('#stage-tabs [data-stage]').forEach(function (button) {
      var on = button.getAttribute('data-stage') === stage;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('fGrade').value = volume;
    var domainSelect = $('fDomain');
    if (Array.prototype.some.call(domainSelect.options, function (option) { return option.value === domain; })) {
      domainSelect.value = domain;
    }
    syncDepthButtons();
  }

  function syncDepthButtons() {
    var current = upDepth === 'all' ? 'all' : String(upDepth);
    document.querySelectorAll('#depth-switch [data-depth]').forEach(function (button) {
      var on = button.getAttribute('data-depth') === current;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  var SIDE_COLLAPSED_KEY = 'explore.sideCollapsed';

  function applySideCollapsed(collapsed) {
    document.querySelector('.explore').classList.toggle('side-collapsed', collapsed);
    var btn = $('side-collapse');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.textContent = collapsed ? '展开目录' : '收起目录';
  }

  function fitGraph() {
    if (!cy) return;
    cy.resize();
    var many = cy.nodes().length > 80;
    if (many) cy.minZoom(0.5);
    cy.fit(undefined, 36);
    if (many && cy.zoom() < 0.5) {
      cy.zoom(0.5);
      cy.center();
    }
  }

  function closeDrawerIfMobile() {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    $('side').classList.remove('open');
    var toggle = $('list-toggle');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '目录';
    toggle.setAttribute('aria-label', '展开知识点目录');
  }

  function syncMobileChrome() {
    var mobile = window.matchMedia('(max-width: 900px)').matches;
    var menuOpen = document.querySelector('.site-header').classList.contains('menu-open');
    var optionsOpen = document.querySelector('.explore').classList.contains('options-open');
    $('main-nav').hidden = mobile && !menuOpen;
    $('graph-options').hidden = mobile && !optionsOpen;
    $('mobile-menu-toggle').setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    $('mobile-menu-toggle').textContent = menuOpen ? '收起菜单' : '菜单';
    $('mobile-options-toggle').setAttribute('aria-expanded', optionsOpen ? 'true' : 'false');
    $('mobile-options-toggle').textContent = optionsOpen ? '收起' : '选项';
    $('mobile-options-toggle').setAttribute('aria-label', optionsOpen ? '收起图谱选项' : '展开图谱选项');
    requestAnimationFrame(function () { if (cy) cy.resize(); });
  }
  function setMobileMenu(open) {
    document.querySelector('.site-header').classList.toggle('menu-open', open);
    syncMobileChrome();
  }
  function setMobileOptions(open) {
    document.querySelector('.explore').classList.toggle('options-open', open);
    syncMobileChrome();
  }
  function nodeDiagnosisHref(id) {
    if (!byId.has(id)) return '';
    return withReturn('../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(id) + '&retry=1');
  }
  function closeNodeDiagnosis() {
    var dialog = $('node-diagnose-dialog');
    if (dialog && dialog.open) dialog.close();
  }
  function openNodeDiagnosis(id) {
    if (id !== selected || !byId.has(id)) return false;
    var dialog = $('node-diagnose-dialog');
    if (!dialog || dialog.open) return false;
    nodeDialogId = id;
    nodeDialogScroll = { x: window.scrollX, y: window.scrollY };
    $('node-dialog-question').textContent = '要进入“' + byId.get(id).name + '”的诊断吗？';
    $('node-dialog-try').setAttribute('href', nodeDiagnosisHref(id));
    dialog.showModal();
    return true;
  }
  function activateGraphNode(id) {
    if (!id || String(id).indexOf('grade-') === 0 || !byId.has(id)) return false;
    // 自动预选和目录选择不算第一次真实点击；同点再次点击不重建图或改变视口。
    if (explicitNodeSelection === id && selected === id) return openNodeDiagnosis(id);
    if (id !== selected || currentAlias) select(id, 'user');
    explicitNodeSelection = id;
    return false;
  }
  function bindNodeConfirmation() {
    var dialog = $('node-diagnose-dialog');
    $('node-dialog-no').addEventListener('click', closeNodeDiagnosis);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeNodeDiagnosis(); });
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      var box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeNodeDiagnosis();
    });
    dialog.addEventListener('close', function () {
      nodeDialogId = null;
      var point = nodeDialogScroll;
      nodeDialogScroll = null;
      $('cy').focus({ preventScroll: true });
      if (point) window.scrollTo(point.x, point.y);
    });
    $('node-dialog-try').addEventListener('click', function (event) {
      if (!nodeDialogId || nodeDialogId !== selected || !byId.has(nodeDialogId)) {
        event.preventDefault();
        closeNodeDiagnosis();
        return;
      }
      event.currentTarget.setAttribute('href', nodeDiagnosisHref(nodeDialogId));
      closeNodeDiagnosis();
    });
    $('cy').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!selected) return;
      event.preventDefault();
      activateGraphNode(selected);
    });
  }

  function recomputeAliasHits() {
    aliasHitIds = new Set();
    if (query.length < 2) return;
    Object.keys(aliases).forEach(function (id) {
      var spec = aliases[id];
      var name = ((spec && spec.name) || '').toLowerCase();
      if (id.toLowerCase().indexOf(query) >= 0 || name.indexOf(query) >= 0) {
        ((spec && spec.targets) || []).forEach(function (target) { aliasHitIds.add(target); });
      }
    });
  }

  function topicSubject(topic) {
    if (!topic) return '';
    if (topic.subject === 'physics' || topic.subject === 'science') return topic.subject;
    var id = String(topic.id || '');
    if (id.indexOf('cnp_') === 0) return 'physics';
    if (id.indexOf('cns_') === 0) return 'science';
    return '';
  }

  function withSubject(href) {
    if (!href || href.indexOf('http') === 0 || href.charAt(0) === '#') return href;
    var hashAt = href.indexOf('#');
    var hash = hashAt < 0 ? '' : href.slice(hashAt);
    var path = hashAt < 0 ? href : href.slice(0, hashAt);
    var queryAt = path.indexOf('?');
    var params = new URLSearchParams(queryAt < 0 ? '' : path.slice(queryAt + 1));
    params.set('subject', subject);
    return (queryAt < 0 ? path : path.slice(0, queryAt)) + '?' + params.toString() + hash;
  }

  function passFilter(topic) {
    if (subject === 'english') {
      if (stage === 'p' && topic.grade > 6) return false;
      if (stage === 'j' && (topic.grade < 7 || topic.grade > 9)) return false;
      if (stage === 'h' && topic.grade < 10) return false;
    } else {
      if (stage === 'p' && topic.grade > 6) return false;
      if (stage === 'j' && (topic.grade < 7 || topic.grade > 9)) return false;
      if (stage === 'h' && topic.grade < 10) return false;
    }
    if (volume && volumeOf(topic) !== volume) return false;
    if (grade && String(topic.grade) !== grade) return false;
    if (domain && topic.domain !== domain) return false;
    if (query) {
      var blob = (topic.name + '\n' + topic.description + '\n' + (topic.chapter || '') + '\n' + topic.id + '\n' + topic.domain).toLowerCase();
      if (blob.indexOf(query) < 0 && !aliasHitIds.has(topic.id)) return false;
    }
    return true;
  }

  function chapterProgressKey(topic) {
    return topic.grade + '|' + topic.semester + '|' + chapterOf(topic);
  }

  function chapterProgress() {
    var counts = new Map();
    // 按完整章节统计，不因搜索或领域筛选缩小分母。
    topics.forEach(function (topic) {
      var key = chapterProgressKey(topic);
      var row = counts.get(key);
      if (!row) { row = { completed: 0, total: 0 }; counts.set(key, row); }
      row.total++;
      var tested = progressOf(topic.id);
      if (tested && ['mastered', 'weak', 'shaky'].indexOf(tested.status) >= 0) row.completed++;
    });
    return counts;
  }

  function renderList() {
    recomputeAliasHits();
    var chapterCounts = chapterProgress();
    var volumes = [];
    var volumeMap = new Map();
    topics.forEach(function (topic) {
      if (!passFilter(topic)) return;
      var key = topic.grade + topic.semester;
      var volume = volumeMap.get(key);
      if (!volume) {
        volume = { label: gradeLabel(topic), grade: topic.grade, semester: topic.semester, chapters: [], chapterMap: new Map() };
        volumeMap.set(key, volume);
        volumes.push(volume);
      }
      var chapterKey = chapterOf(topic);
      var chapter = volume.chapterMap.get(chapterKey);
      if (!chapter) {
        chapter = { label: chapterKey, topics: [] };
        volume.chapterMap.set(chapterKey, chapter);
        volume.chapters.push(chapter);
      }
      chapter.topics.push(topic);
    });
    volumes.sort(function (a, b) {
      return a.grade - b.grade || (a.semester === b.semester ? 0 : a.semester === '上' ? -1 : 1);
    });

    var shown = 0;
    var box = $('list');
    box.replaceChildren();
    var filtering = !!(query || volume || grade || stage || domain);
    volumes.forEach(function (volume) {
      var count = volume.chapters.reduce(function (sum, chapter) { return sum + chapter.topics.length; }, 0);
      shown += count;
      var volumeHas = volume.chapters.some(function (chapter) {
        return chapter.topics.some(function (topic) { return topic.id === selected; });
      });
      var details = el('details', { class: 'vol' });
      details.open = filtering || volumeHas;
      details.append(el('summary', null, volume.label, el('span', { class: 'count-pill', text: ' ' + count })));
      volume.chapters.forEach(function (chapter) {
        var chapterHas = chapter.topics.some(function (topic) { return topic.id === selected; });
        var chapterDetails = el('details', { class: 'chap' });
        chapterDetails.open = !!query || chapterHas;
        var completed = chapterCounts.get(chapterProgressKey(chapter.topics[0]));
        chapterDetails.append(el('summary', null,
          el('span', { class: 'chapter-heading' },
            el('span', { class: 'chapter-name', text: chapter.label }),
            el('span', {
              class: 'chapter-progress' + (completed.completed === completed.total ? ' is-complete' : ''),
              text: completed.completed + '/' + completed.total,
              'aria-label': '已完成诊断 ' + completed.completed + ' 个，共 ' + completed.total + ' 个知识点',
              title: '已完成诊断 / 本章知识点'
            }))));
        chapter.topics.forEach(function (topic) {
          chapterDetails.append(el('button', {
            type: 'button',
            class: 'topic-item' + (topic.id === selected ? ' sel' : ''),
            'data-jump': topic.id,
            'aria-label': topic.name + '，' + progressLabel(progressOf(topic.id))
          }, el('span', { class: 'nm', text: topic.name }), progressBadge(progressOf(topic.id)), el('span', { class: 'meta', text: topic.domain })));
        });
        details.append(chapterDetails);
      });
      box.append(details);
    });
    if (!shown) box.append(el('p', { class: 'muted', text: '没有匹配的知识点。', style: 'padding:12px' }));
    $('count').textContent = '显示 ' + shown + ' / ' + topics.length;
    refreshDiagnosisLinks();
  }

  function sideVisible() {
    var side = $('side');
    return side.offsetParent !== null && side.getBoundingClientRect().height > 0;
  }

  function highlight(scroll) {
    document.querySelectorAll('#list .topic-item').forEach(function (button) {
      var on = button.getAttribute('data-jump') === selected;
      button.classList.toggle('sel', on);
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    var current = document.querySelector('#list .topic-item.sel');
    if (!current) return;
    var parent = current.parentElement;
    while (parent && parent.id !== 'list') {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
    if (scroll && sideVisible()) current.scrollIntoView({ block: 'nearest' });
  }

  function metaItem(label, value, wide) {
    return el('div', { class: wide ? 'span-2' : '' }, el('dt', { text: label }), el('dd', { text: value || '—' }));
  }

  function renderDetail() {
    var box = $('detail');
    if (!selected || !byId.has(selected)) {
      box.replaceChildren(el('div', { class: 'detail-empty' },
        el('h1', { text: '选择一个知识点' }),
        el('p', { text: '可以搜索，也可以按年级、册、章展开。选中之后，中间只画它附近的先修，以及后面一层会用到它的知识点。' })));
      document.title = subject === 'physics' ? '知识图谱 · 物理' : '知识图谱 · 小学科学';
      refreshDiagnosisLinks();
      return;
    }
    var topic = byId.get(selected);
    var parts = [];
    if (currentAlias) {
      parts.push(el('div', { class: 'alias-note' },
        '旧编号 ', el('code', { text: currentAlias.id }),
        '（' + (currentAlias.name || '未命名') + '）已对应到这个知识点。用该旧编号开始诊断时，会包含映射中的全部 ' + currentAlias.targets.length + ' 个小学知识点。 ',
        el('a', {
          href: withReturn('../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(currentAlias.id)),
          'data-diagnose-return': '../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(currentAlias.id)
        }, '按旧编号诊断')));
    }
    parts.push(el('h1', { class: 'detail-title', text: topic.name }));
    var tested = progressOf(topic.id);
    parts.push(el('p', { class: 'detail-test-state ' + progressClass(tested), text: (tested ? (tested.status === 'mastered' ? '✓ ' : '× ') : '') + progressLabel(tested) }));
    var diagHref = '../diagnose/?target=' + encodeURIComponent(topic.id);
    if (subject !== 'math') diagHref = '../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(topic.id);
    parts.push(el('a', {
      class: 'btn btn-primary btn-lg diag-btn',
      href: withReturn(diagHref),
      'data-diagnose-return': diagHref
    }, tested ? '重新检测这个知识点' : '检测这个知识点'));
    parts.push(el('dl', { class: 'meta-grid' },
      metaItem('年级册次', gradeLabel(topic), true),
      metaItem('章节', topic.chapter, true)));
    if (topic.description || topic.root_reason) {
      parts.push(el('section', { class: 'detail-section learning-goals' },
        el('h2', { text: '学习目标' }),
        topic.description ? el('p', { class: 'desc', text: topic.description }) : null,
        topic.root_reason ? el('p', { class: 'root-reason', text: topic.root_reason }) : null));
    }

    if (topic.mastery_criteria && topic.mastery_criteria.length) {
      parts.push(el('section', { class: 'detail-section mastery-criteria' },
        el('h2', { text: '掌握标准' }),
        el('ul', { class: 'plain' }, topic.mastery_criteria.map(function (item) { return el('li', { text: item }); }))));
    }

    var standards = topic.standards || [];
    var standardNodes = standards.length ? standards.map(function (entry) {
      var item = stdById.get(entry.id);
      return el('div', { class: 'std' },
        el('div', { class: 'std-id' }, el('code', { text: entry.id }), ' · ' + (entry.confidence === 'exact' ? '直接对应' : '推断对应')),
        el('p', { text: item ? item.text : '（课标文件中找不到该条目）' }),
        entry.note ? el('p', { class: 'muted', text: '说明：' + entry.note }) : null);
    }) : [el('p', { class: 'muted', text: '没有对应的课标条目。' })];
    parts.push(el('details', { class: 'standards-disclosure' },
      el('summary', { text: '课标条目' }),
      el('div', { class: 'standards-content' }, standardNodes)));

    box.replaceChildren.apply(box, parts);
    refreshDiagnosisLinks();
    document.title = topic.name + ' · 知识图谱';
  }

  function upstream(id, depth) {
    var seen = new Set([id]);
    var frontier = [id];
    var limit = depth === Infinity ? 10000 : depth;
    for (var step = 0; step < limit; step++) {
      var next = [];
      frontier.forEach(function (current) {
        (pre.get(current) || []).forEach(function (edge) {
          if (!seen.has(edge.id)) { seen.add(edge.id); next.push(edge.id); }
        });
      });
      if (!next.length) break;
      frontier = next;
    }
    return seen;
  }

  function labelLimit() {
    return window.matchMedia('(max-width: 700px)').matches ? 8 : 10;
  }

  function clipLabel(name) {
    var chars = Array.from(name || '');
    var limit = labelLimit();
    if (chars.length <= limit) return name || '';
    return chars.slice(0, limit - 1).join('') + '…';
  }

  function hideTip() {
    var tip = $('node-tip');
    if (tip) tip.hidden = true;
  }

  function showTip(node) {
    var tip = $('node-tip');
    var stage = $('graph-stage');
    if (!tip || !stage || !cy || !node || node.empty()) return;
    var text = node.data('full') || node.data('label') || '';
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text + (node.data('testStatus') ? ' · ' + node.data('testLabel') : '');
    tip.hidden = false;
    var stageRect = stage.getBoundingClientRect();
    var cyRect = cy.container().getBoundingClientRect();
    var bb = node.renderedBoundingBox({ includeLabels: true });
    var tipW = tip.offsetWidth;
    var tipH = tip.offsetHeight;
    var cx = cyRect.left - stageRect.left + (bb.x1 + bb.x2) / 2;
    var top = cyRect.top - stageRect.top + bb.y1;
    var left = Math.max(8, Math.min(cx - tipW / 2, Math.max(8, stageRect.width - tipW - 8)));
    var y = top - tipH - 8;
    if (y < 4) y = cyRect.top - stageRect.top + bb.y2 + 8;
    if (y + tipH > stageRect.height - 4) y = Math.max(4, stageRect.height - tipH - 4);
    tip.style.left = left + 'px';
    tip.style.top = y + 'px';
  }

  function ensureDagre() {
    if (dagreReady) return;
    if (!window.cytoscape || !window.dagre || !window.cytoscapeDagre) {
      throw new Error('图形库没有加载');
    }
    window.cytoscape.use(window.cytoscapeDagre);
    dagreReady = true;
  }

  function topicElement(id, colors) {
    var topic = byId.get(id);
    var tone = paint(topic.grade, colors);
    var current = id === selected;
    var name = topic.name;
    return {
      data: {
        id: id,
        name: name,
        full: name,
        label: clipLabel(name),
        bg: current ? colors.currentBg : tone.bg,
        border: current ? colors.currentBorder : tone.border,
        color: colors.text,
        testStatus: progressOf(id) ? progressOf(id).status : '',
        testLabel: progressLabel(progressOf(id))
      },
      classes: tone.cls + (current ? ' current' : '') + ' ' + progressClass(progressOf(id))
    };
  }

  function edgeElement(id, source, target, soft, colors) {
    return {
      data: {
        id: id,
        source: source,
        target: target,
        color: soft ? colors.edgeSoft : colors.edge
      },
      classes: soft ? 'soft' : 'hard'
    };
  }

  function updateFold(total, folded) {
    var box = $('graph-fold');
    if (upDepth !== 'all' || total <= FOLD_AT) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    if (folded) {
      box.replaceChildren(
        document.createTextNode('祖先较多，已按年级收起。'),
        el('button', { type: 'button', id: 'btn-expand-all', 'data-total': String(total), text: '共 ' + total + ' 个，点此展开全部' })
      );
    } else {
      box.replaceChildren(
        document.createTextNode('已展开全部 ' + total + ' 个知识点。'),
        el('button', { type: 'button', id: 'btn-collapse-all', text: '按年级收起' })
      );
    }
  }

  function buildFoldedElements(nodeSet, colors) {
    var downIds = {};
    (post.get(selected) || []).forEach(function (edge) { downIds[edge.id] = edge.strength; });
    var gradeMembers = new Map();
    nodeSet.forEach(function (id) {
      if (id === selected || downIds[id]) return;
      var grade = byId.get(id).grade;
      if (!gradeMembers.has(grade)) gradeMembers.set(grade, []);
      gradeMembers.get(grade).push(id);
    });
    var gradeOf = new Map();
    var elements = [];
    gradeMembers.forEach(function (ids, grade) {
      var tone = paint(grade, colors);
      var word = gradeWord(grade);
      var name = word + '·' + ids.length + '个';
      ids.forEach(function (id) { gradeOf.set(id, grade); });
      elements.push({
        data: {
          id: 'grade-' + grade,
          name: name,
          full: word + '的 ' + ids.length + ' 个先修',
          label: clipLabel(name),
          bg: tone.bg,
          border: tone.border,
          color: colors.text
        },
        classes: tone.cls + ' grade'
      });
    });
    elements.push(topicElement(selected, colors));
    Object.keys(downIds).forEach(function (id) {
      if (nodeSet.has(id)) elements.push(topicElement(id, colors));
    });
    var between = new Map();
    deps.forEach(function (edge) {
      var fromG = gradeOf.get(edge.prerequisiteId);
      var toG = gradeOf.get(edge.topicId);
      if (fromG == null || toG == null || fromG === toG) return;
      var key = fromG + '>' + toG;
      if (edge.strength !== 'soft') between.set(key, 'hard');
      else if (!between.has(key)) between.set(key, 'soft');
    });
    between.forEach(function (kind, key) {
      var parts = key.split('>');
      elements.push(edgeElement('g-' + parts[0] + '-' + parts[1], 'grade-' + parts[0], 'grade-' + parts[1], kind === 'soft', colors));
    });
    var into = new Map();
    (pre.get(selected) || []).forEach(function (edge) {
      var grade = gradeOf.get(edge.id);
      if (grade == null) return;
      if (edge.strength !== 'soft') into.set(grade, 'hard');
      else if (!into.has(grade)) into.set(grade, 'soft');
    });
    into.forEach(function (kind, grade) {
      elements.push(edgeElement('gs' + grade, 'grade-' + grade, selected, kind === 'soft', colors));
    });
    Object.keys(downIds).forEach(function (id) {
      if (!nodeSet.has(id)) return;
      elements.push(edgeElement('sd-' + id, selected, id, downIds[id] === 'soft', colors));
    });
    return elements;
  }

  function buildFullElements(nodeSet, colors) {
    var elements = [];
    nodeSet.forEach(function (id) { elements.push(topicElement(id, colors)); });
    deps.forEach(function (edge, edgeIndex) {
      if (!nodeSet.has(edge.topicId) || !nodeSet.has(edge.prerequisiteId)) return;
      elements.push(edgeElement('e' + edgeIndex, edge.prerequisiteId, edge.topicId, edge.strength === 'soft', colors));
    });
    return elements;
  }

  function renderGraph() {
    explicitNodeSelection = null;
    var token = ++graphToken;
    tipFromTap = false;
    hideTip();
    if (cy) { cy.destroy(); cy = null; window.__cy = null; }
    var cyEl = $('cy');
    var emptyEl = $('graph-empty');
    var meta = $('graph-meta');
    if (!selected || !byId.has(selected)) {
      cyEl.hidden = true;
      cyEl.dataset.ready = '0';
      cyEl.dataset.mode = '';
      cyEl.dataset.total = '';
      emptyEl.hidden = false;
      meta.textContent = '';
      updateFold(0, false);
      return;
    }
    var depth = upDepth === 'all' ? Infinity : upDepth;
    var upSet = upstream(selected, depth);
    var nodeSet = new Set(upSet);
    (post.get(selected) || []).forEach(function (edge) { nodeSet.add(edge.id); });
    if (volume) {
      if (showWholeBook) nodeSet = new Set(topics.filter(function (topic) { return volumeOf(topic) === volume; }).map(function (topic) { return topic.id; }));
      else nodeSet = new Set(Array.from(nodeSet).filter(function (id) { return volumeOf(byId.get(id)) === volume; }));
    }
    var total = nodeSet.size;
    var folded = !volume && upDepth === 'all' && total > FOLD_AT && !ancestorsOpen;
    var edgeCount = 0;
    if (!folded) {
      deps.forEach(function (edge) {
        if (nodeSet.has(edge.topicId) && nodeSet.has(edge.prerequisiteId)) edgeCount++;
      });
    }
    var depthLabel = upDepth === 'all' ? '全部祖先' : (upDepth + ' 层');
    var note = '长名称会省略，悬停或点按可看全名。';
    if (folded) meta.textContent = '已按年级收起，全部 ' + total + ' 个知识点。向上 ' + depthLabel + '，向下 1 层。' + note;
    else meta.textContent = '局部图 ' + total + ' 个知识点、' + edgeCount + ' 条先修。向上 ' + depthLabel + '，向下 1 层。' + note;
    updateFold(total, folded);
    cyEl.hidden = false;
    emptyEl.hidden = true;
    cyEl.dataset.ready = '0';
    cyEl.dataset.mode = folded ? 'grade' : 'full';
    cyEl.dataset.total = String(total);
    var heavy = !folded && total > 80;
    cyEl.dataset.view = volume && showWholeBook ? 'book' : 'local';
    cyEl.setAttribute('aria-label', (volume && showWholeBook ? bookTitle(volume) + '完整知识图谱' : '选中知识点的局部先修图') + '；绿色勾表示检测通过，红色叉表示未通过，目录中也可查看检测状态。');
    if (heavy) meta.textContent = '正在排列全部 ' + total + ' 个知识点…';

    var kick = heavy ? function (fn) { setTimeout(fn, 40); } : requestAnimationFrame;
    kick(function () {
      if (token !== graphToken) return;
      try {
        ensureDagre();
        if (cyEl.clientHeight < 40) cyEl.style.minHeight = '420px';
        var colors = theme();
        var narrow = labelLimit() <= 8;
        var textMax = narrow ? 104 : 126;
        var boxW = narrow ? 118 : 142;
        var elements = folded ? buildFoldedElements(nodeSet, colors) : buildFullElements(nodeSet, colors);
        var dense = heavy;
        var cyOptions = {
          container: cyEl,
          elements: elements,
          // 大图若缩到能塞进一屏，节点只剩几个像素，Cytoscape 会改画整图贴图，画面基本是空的。
          minZoom: heavy ? 0.5 : 0.05,
          maxZoom: 2.8,
          wheelSensitivity: 0.28,
          boxSelectionEnabled: false,
          autoungrabify: true,
          userPanningEnabled: true,
          userZoomingEnabled: true
        };
        cyOptions.style = [
          { selector: 'node', style: {
            label: 'data(label)', 'text-wrap': 'ellipsis', 'text-max-width': textMax + 'px',
            'text-overflow-wrap': 'anywhere',
            'text-valign': 'center', 'text-halign': 'center',
            'font-size': 13, 'font-family': FONT, color: 'data(color)',
            'background-color': 'data(bg)', 'border-width': 2, 'border-color': 'data(border)',
            shape: 'round-rectangle', width: boxW, height: 34, padding: 0, 'corner-radius': 8
          } },
          { selector: 'node.current', style: { 'border-width': 4, 'z-index': 10 } },
          { selector: 'node.test-passed, node.test-failed', style: {
            'background-width': 22, 'background-height': 22, 'background-fit': 'none',
            'background-position-x': '100%', 'background-position-y': '0%',
            'background-offset-x': 7, 'background-offset-y': -7, 'background-clip': 'none',
            'background-image-containment': 'over', 'bounds-expansion': 10
          } },
          { selector: 'node.test-passed', style: { 'background-image': PASS_BADGE } },
          { selector: 'node.test-failed', style: { 'background-image': FAIL_BADGE } },
          { selector: 'edge', style: {
            width: 1.6, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle', 'curve-style': dense ? 'straight' : 'bezier',
            'arrow-scale': 0.8, 'line-style': 'solid'
          } },
          { selector: 'edge.soft', style: { 'line-style': 'dashed', width: 1.5 } }
        ];
        cy = window.cytoscape(cyOptions);
        window.__cy = cy;
        cy.on('mouseover', 'node', function (event) { showTip(event.target); });
        cy.on('mouseout', 'node', function () { if (!tipFromTap) hideTip(); });
        cy.on('tap', 'node', function (event) {
          var id = event.target.id();
          tipFromTap = true;
          showTip(event.target);
          activateGraphNode(id);
        });
        cy.on('tap', function (event) {
          if (event.target === cy) { explicitNodeSelection = null; tipFromTap = false; hideTip(); }
        });
        var layout = cy.layout({
          name: 'dagre', rankDir: 'TB',
          rankSep: dense ? 48 : 64,
          nodeSep: dense ? 18 : 26,
          edgeSep: dense ? 8 : 12,
          ranker: dense ? 'longest-path' : 'network-simplex',
          padding: 16, animate: false, fit: true,
          nodeDimensionsIncludeLabels: false, spacingFactor: dense ? 1.02 : 1.05
        });
        layout.one('layoutstop', function () {
          if (token !== graphToken) return;
          requestAnimationFrame(function () {
            if (token !== graphToken || !cy) return;
            cy.resize();
            cy.fit(undefined, dense ? 24 : 28);
            var framed = false;
            if ((heavy || (volume && showWholeBook)) && cy.zoom() < 0.65) {
              cy.zoom(0.75);
              var focus = cy.getElementById(selected);
              if (focus && !focus.empty()) cy.center(focus);
              framed = true;
            }
            if (!folded) {
              meta.textContent = (volume && showWholeBook ? '本册全图 ' + total + ' 个知识点、' + edgeCount + ' 条先修。可拖动、缩放查看。' : '局部图 ' + total + ' 个知识点、' + edgeCount + ' 条先修。向上 ' + depthLabel + '，向下 1 层。')
                + (framed ? '已对准当前知识点，可拖动查看其余节点。' : '')
                + note;
            }
            cyEl.dataset.ready = '1';
          });
        });
        layout.run();
      } catch (error) {
        cyEl.dataset.ready = 'err';
        meta.textContent = '图没有画出来：' + (error && error.message ? error.message : error);
      }
    });
  }

  function select(raw, source) {
    explicitNodeSelection = null;
    closeNodeDiagnosis();
    var hit = resolveId(raw);
    if (!hit) {
      if (source === 'hash') {
        $('detail').replaceChildren(el('div', { class: 'detail-empty' },
          el('h1', { text: '没有这个知识点' }),
          el('p', { text: '编号「' + raw + '」不在图谱里，也不是已登记的旧编号。' })));
      }
      return;
    }
    var switchedBook = volume && volumeOf(byId.get(hit.id)) !== volume;
    if (switchedBook) {
      volume = volumeOf(byId.get(hit.id));
      grade = '';
      stage = '';
      domain = '';
      showWholeBook = true;
      syncControls();
      syncBook();
      renderList();
    }
    var same = hit.id === selected && !currentAlias && !hit.alias;
    if (hit.id !== selected) ancestorsOpen = false;
    selected = hit.id;
    if (switchedBook) syncBookQuery();
    currentAlias = source === 'user' ? null : hit.alias;
    rememberLocation();
    if (source === 'user') {
      writeHash(selected);
      closeDrawerIfMobile();
    }
    highlight(true);
    renderDetail();
    if (!same) renderGraph();
  }

  function zoomBy(factor) {
    if (!cy) return;
    var rect = cy.container().getBoundingClientRect();
    cy.zoom({
      level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)),
      renderedPosition: { x: rect.width / 2, y: rect.height / 2 }
    });
  }

  function rememberLocation() {
    if (!selected || !byId.has(selected) || !window.CnmLastLocation) return;
    window.CnmLastLocation.remember({ subject:subject, volume:volume, topicId:selected,
      view:showWholeBook ? 'book' : 'local', depth:upDepth });
  }
  function restoreLocation(allTopics) {
    var memory = window.CnmLastLocation;
    if (!memory || !memory.shouldResume('explore', location)) return;
    var record = memory.resolve(allTopics);
    if (!record) return;
    history.replaceState(null, '', memory.exploreURL(record, location.pathname));
    subject = record.subject;
    configureSubject();
    applyQuery();
  }

  function showLoadError(message) {
    $('count').textContent = '';
    $('list').replaceChildren(el('p', { class: 'muted', text: message, style: 'padding:12px' }));
    $('detail').replaceChildren(el('div', { class: 'detail-empty' },
      el('h1', { text: '数据没有加载成功' }),
      el('p', { text: message })));
    $('graph-meta').textContent = '';
  }

  function fillMoralityGrades() {
    if (subject !== 'morality') return;
    var morGrade = $('fGrade');
    if (!morGrade) return;
    var seen = {};
    topics.forEach(function (topic) {
      if (topic.grade >= 1 && topic.grade <= 9) seen[topic.grade] = true;
    });
    var keys = Object.keys(seen);
    if (!keys.length) {
      [1, 2, 3, 4, 5, 6, 7].forEach(function (g) { seen[g] = true; });
    }
    var prev = morGrade.value;
    morGrade.replaceChildren();
    morGrade.append(el('option', { value: '', text: '全部年级' }));
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (g) {
      if (!seen[g]) return;
      morGrade.append(el('option', { value: String(g), text: CN[g] + '年级' }));
    });
    if (prev && seen[Number(prev)]) morGrade.value = prev;
  }

  function fillDomain() {
    var seen = {};
    topics.forEach(function (topic) { if (topic.domain) seen[topic.domain] = true; });
    var domainOrder = subject === 'chinese' ? ZH_DOMAIN_ORDER : subject === 'science' ? SCI_DOMAIN_ORDER : subject === 'morality' ? MOR_DOMAIN_ORDER : subject === 'history' ? HIS_DOMAIN_ORDER : subject === 'geography' ? GEO_DOMAIN_ORDER : subject === 'biology' ? BIO_DOMAIN_ORDER : subject === 'chemistry' ? CHEM_DOMAIN_ORDER : DOMAIN_ORDER;
    var names = domainOrder.filter(function (name) { return seen[name]; });
    Object.keys(seen).forEach(function (name) { if (names.indexOf(name) < 0) names.push(name); });
    var select = $('fDomain');
    names.forEach(function (name) { select.append(el('option', { value: name, text: name })); });
    if (domain && !seen[domain]) domain = '';
  }

  function readSubject() {
    var params = new URLSearchParams(location.search);
    var explicit = params.get('subject');
    if (explicit === 'physics' || explicit === 'science') return explicit;
    var hash = readHash();
    if (/^cns_[A-Za-z0-9]+$/.test(hash)) {
      params.set('subject', 'science');
      history.replaceState(null, '', location.pathname + '?' + params.toString() + '#' + hash);
      return 'science';
    }
    return 'physics';
  }

  function configureSubject() {
    document.body.classList.toggle('subject-physics', subject === 'physics');
    document.body.classList.toggle('subject-science', subject === 'science');
    document.querySelectorAll('.site-nav a:not(.subject-link):not([data-resume-graph]), a.brand').forEach(function (link) {
      var href = link.getAttribute('href');
      var next = withSubject(href);
      if (next && next !== href) link.setAttribute('href', next);
    });
    document.querySelectorAll('.subject-link').forEach(function (link) {
      var on = link.getAttribute('data-subject') === subject;
      link.classList.toggle('on', on);
      if (on) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('#stage-tabs [data-stage]').forEach(function (button) {
      var value = button.getAttribute('data-stage');
      button.hidden = subject === 'physics' ? value === 'p' : value === 'j' || value === 'h';
    });
    var select = $('fGrade');
    select.replaceChildren(el('option', { value: '', text: '全部教材' }));
    booksForSubject().forEach(function (book) { select.append(el('option', { value: book[0], text: book[1] })); });
    $('pick-sample').textContent = subject === 'physics' ? '先看看「欧姆定律」' : '先看看「昼夜交替的解释」';
    document.title = subject === 'physics' ? '知识图谱 · 物理' : '知识图谱 · 小学科学';
  }

  function applyQuery() {
    var params = new URLSearchParams(location.search);
    var chosen = params.get('volume') || '';
    if (bookSpec(chosen)) volume = chosen;
    else {
      var legacyGrade = Number(params.get('grade'));
      var legacy = booksForSubject().find(function (book) { return book[2] === legacyGrade; });
      if (legacy) volume = legacy[0];
    }
    var stageValue = params.get('stage') || '';
    var allowedStages = subject === 'physics' ? ['', 'j', 'h'] : ['', 'p'];
    stage = allowedStages.indexOf(stageValue) >= 0 ? stageValue : '';
    domain = params.get('domain') || '';
    query = (params.get('q') || '').trim().toLowerCase();
    $('q').value = params.get('q') || '';
    showWholeBook = params.get('view') !== 'local';
    var depth = params.get('depth');
    if (/^[123]$/.test(depth || '')) upDepth = Number(depth);
    else if (depth === 'all') upDepth = 'all';
  }

  function bootSelection() {
    var hash = readHash();
    if (hash && resolveId(hash) && (!volume || volumeOf(byId.get(resolveId(hash).id)) === volume)) { select(hash, 'hash'); return; }
    if (volume || grade) {
      var first = topics.filter(passFilter)[0];
      if (first) { select(first.id, 'user'); return; }
    }
    renderDetail();
    renderGraph();
  }

  function bind() {
    $('mobile-menu-toggle').addEventListener('click', function () {
      var open = !document.querySelector('.site-header').classList.contains('menu-open');
      if (open) { setMobileOptions(false); closeDrawerIfMobile(); }
      setMobileMenu(open);
    });
    $('mobile-options-toggle').addEventListener('click', function () {
      var open = !document.querySelector('.explore').classList.contains('options-open');
      if (open) { setMobileMenu(false); closeDrawerIfMobile(); }
      setMobileOptions(open);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || $('node-diagnose-dialog').open) return;
      if (document.querySelector('.site-header').classList.contains('menu-open')) {
        setMobileMenu(false);
        $('mobile-menu-toggle').focus({ preventScroll: true });
      } else if (document.querySelector('.explore').classList.contains('options-open')) {
        setMobileOptions(false);
        $('mobile-options-toggle').focus({ preventScroll: true });
      }
    });
    var mobileChrome = window.matchMedia('(max-width: 900px)');
    if (mobileChrome.addEventListener) mobileChrome.addEventListener('change', syncMobileChrome);
    syncMobileChrome();
    bindNodeConfirmation();
    $('q').addEventListener('input', function () {
      query = $('q').value.trim().toLowerCase();
      renderList();
      highlight(false);
    });
    $('stage-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-stage]');
      if (!button || button.hidden) return;
      stage = button.getAttribute('data-stage');
      var current = bookSpec(volume);
      if (current && ((stage === 'j' && current[2] >= 10) || (stage === 'h' && current[2] <= 9))) volume = '';
      syncControls();
      syncBook();
      syncBookQuery();
      renderList();
      highlight(false);
    });
    $('fGrade').addEventListener('change', function () { chooseBook($('fGrade').value); });
    $('book-view').addEventListener('click', function () {
      showWholeBook = !showWholeBook;
      rememberLocation();
      syncBook();
      renderGraph();
    });
    window.addEventListener('storage', function () { refreshProgress(); });
    window.addEventListener('focus', function () { refreshProgress(); });
    window.addEventListener('cnm:progress', function () { refreshProgress(); });
    $('fDomain').addEventListener('change', function () {
      domain = $('fDomain').value;
      renderList();
      highlight(false);
    });
    $('depth-switch').addEventListener('click', function (event) {
      var button = event.target.closest('[data-depth]');
      if (!button) return;
      var value = button.getAttribute('data-depth');
      upDepth = value === 'all' ? 'all' : parseInt(value, 10);
      rememberLocation();
      ancestorsOpen = false;
      try { sessionStorage.setItem('cnmExplore.depth', value); } catch (error) { /* 忽略 */ }
      syncDepthButtons();
      refreshDiagnosisLinks();
      renderGraph();
    });
    $('graph-fold').addEventListener('click', function (event) {
      if (event.target.closest('#btn-expand-all')) ancestorsOpen = true;
      else if (event.target.closest('#btn-collapse-all')) ancestorsOpen = false;
      else return;
      renderGraph();
    });
    $('list-toggle').addEventListener('click', function () {
      setMobileMenu(false);
      setMobileOptions(false);
      var open = $('side').classList.toggle('open');
      $('list-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      $('list-toggle').textContent = open ? '收起' : '目录';
      $('list-toggle').setAttribute('aria-label', open ? '收起知识点目录' : '展开知识点目录');
    });
    $('btn-fit').addEventListener('click', fitGraph);
    $('side-collapse').addEventListener('click', function () {
      var collapsed = !document.querySelector('.explore').classList.contains('side-collapsed');
      applySideCollapsed(collapsed);
      try { localStorage.setItem(SIDE_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) {}
      requestAnimationFrame(fitGraph);
    });
    var savedCollapsed = false;
    try { savedCollapsed = localStorage.getItem(SIDE_COLLAPSED_KEY) === '1'; } catch (e) {}
    applySideCollapsed(savedCollapsed);
    $('btn-zoom-in').addEventListener('click', function () { zoomBy(1.25); });
    $('btn-zoom-out').addEventListener('click', function () { zoomBy(0.8); });
    $('pick-sample').addEventListener('click', function () {
      var wanted = subject === 'physics' ? '欧姆定律' : '昼夜交替';
      var hit = topics.find(function (topic) { return String(topic.name).indexOf(wanted) >= 0; }) || topics[0];
      if (hit) select(hit.id, 'user');
    });
    document.body.addEventListener('click', function (event) {
      var jump = event.target.closest('[data-jump]');
      if (!jump) return;
      select(jump.getAttribute('data-jump'), 'user');
    });
    window.addEventListener('hashchange', function () {
      var hash = readHash();
      if (hash) select(hash, 'hash');
    });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (cy) cy.resize(); }).observe($('cy'));
    }
    var colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    if (colorScheme.addEventListener) {
      colorScheme.addEventListener('change', function () { if (selected) renderGraph(); });
    }
    var narrow = window.matchMedia('(max-width: 700px)');
    if (narrow.addEventListener) {
      narrow.addEventListener('change', function () { if (selected) renderGraph(); });
    }
  }

  async function load() {
    var files = ['topics.json', 'dependencies.json', 'id-aliases.json', 'cn-curriculum-standards.json'];
    var responses = await Promise.all(files.map(function (file) { return fetch('../data/' + file); }));
    responses.forEach(function (response, responseIndex) {
      if (!response.ok) throw new Error(files[responseIndex] + ' HTTP ' + response.status);
    });
    var json = await Promise.all(responses.map(function (response) { return response.json(); }));
    restoreLocation(json[0]);
    topics = json[0].filter(function (topic) { return topicSubject(topic) === subject; });
    var allow = {};
    topics.forEach(function (topic) { allow[topic.id] = true; });
    deps = json[1].filter(function (edge) { return allow[edge.topicId] && allow[edge.prerequisiteId]; });
    aliases = (json[2] && json[2].aliases) || {};
    (json[3].items || []).forEach(function (item) { stdById.set(item.id, item); });
    topics.forEach(function (topic, topicIndex) {
      byId.set(topic.id, topic);
      indexOf.set(topic.id, topicIndex);
      pre.set(topic.id, []);
      post.set(topic.id, []);
    });
    deps.forEach(function (edge) {
      if (!pre.has(edge.topicId) || !post.has(edge.prerequisiteId)) return;
      pre.get(edge.topicId).push({ id: edge.prerequisiteId, strength: edge.strength, reason: edge.reason || '' });
      post.get(edge.prerequisiteId).push({ id: edge.topicId, strength: edge.strength, reason: edge.reason || '' });
    });
    pre.forEach(function (list) {
      list.sort(function (a, b) {
        return ((a.strength === 'hard' ? 0 : 1) - (b.strength === 'hard' ? 0 : 1)) || ((indexOf.get(a.id) || 0) - (indexOf.get(b.id) || 0));
      });
    });
    post.forEach(function (list) {
      list.sort(function (a, b) { return (indexOf.get(a.id) || 0) - (indexOf.get(b.id) || 0); });
    });
  }

  subject = readSubject();
  configureSubject();
  restoreDepth();
  syncDepthButtons();
  applyQuery();
  bind();
  load().then(function () {
    fillMoralityGrades();
    fillDomain();
    syncControls();
    refreshProgress(true);
    syncBook();
    renderList();
    bootSelection();
  }).catch(function (error) {
    showLoadError('无法读取数据（' + (error && error.message ? error.message : error) + '）。请在项目根目录运行 python3 -m http.server 8000，不要直接用 file:// 打开。');
  });
})();
