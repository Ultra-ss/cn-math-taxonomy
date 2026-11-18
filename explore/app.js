/* 知识图谱浏览：搜索、筛选，以及选中知识点的局部先修图。 */
(function () {
  'use strict';

  var SYSTEM_FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
  var PLAYFUL_FONT = '"Physicalmap Playful", ' + SYSTEM_FONT;
  var FONT = SYSTEM_FONT;
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
  var selectedVolumes = [];
  var showWholeBook = true;
  var domain = '';
  var query = '';
  var aliasHitIds = new Set();
  var subject = 'physics';
  var progress = {};
  var proProgress = {};
  var progressStamp = '';
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
  var mobileView = 'graph';
  var mobileFiltersOpen = false;
  var mobileScroll = { directory: 0, detail: 0 };
  var graphNeedsRender = false;
  var pendingGraphRestore = true;
  var renderedCameraContext = null;
  var renderedExpanded = false;
  var liveCamera = null;
  var changingCamera = false;
  var viewportSaveTimer = null;
  var graphMotion = null;
  var graphHalo = null;
  var graphCamera = null;
  var pendingCameraTransition = null;
  var graphStyleContext = null;
  var graphSprings = null;
  var graphMotionPaused = false;
  var GRAPH_MOTION_PAUSED_KEY = 'cnmGraph.motionPaused.v1';

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
  function setBookScope(keys) {
    var input = Array.isArray(keys) ? keys : [];
    selectedVolumes = window.CnmBookSelection
      ? window.CnmBookSelection.normalize(subject, input)
      : booksForSubject().map(function (book) { return book[0]; }).filter(function (key) { return input.indexOf(key) >= 0; });
    volume = selectedVolumes.length === 1 ? selectedVolumes[0] : '';
  }
  function hasBookScope() { return selectedVolumes.length > 0; }
  function isAllBookScope() {
    var books = booksForSubject();
    return selectedVolumes.length === books.length && books.every(function (book) { return selectedVolumes.indexOf(book[0]) >= 0; });
  }
  function inBookScope(topic) { return !hasBookScope() || selectedVolumes.indexOf(volumeOf(topic)) >= 0; }
  function scopedNodeSet(neighborhood) {
    if (!hasBookScope()) return neighborhood;
    if (showWholeBook) return new Set(topics.filter(inBookScope).map(function (topic) { return topic.id; }));
    return new Set(Array.from(neighborhood).filter(function (id) { return byId.has(id) && inBookScope(byId.get(id)); }));
  }
  function scopeTitle() { return isAllBookScope() ? '全部教材' : selectedVolumes.length > 1 ? '已选 ' + selectedVolumes.length + ' 本教材' : volume ? bookTitle(volume) : '选择教材'; }
  function writeBookScope(params) {
    if (window.CnmBookSelection) return window.CnmBookSelection.writeParams(params, subject, selectedVolumes);
    params.delete('volume'); params.delete('volumes');
    if (selectedVolumes.length > 1) params.set('volumes', selectedVolumes.join(','));
    else if (volume) params.set('volume', volume);
    return params;
  }
  function firstScopedTopic() {
    for (var i = 0; i < selectedVolumes.length; i++) {
      var key = selectedVolumes[i];
      var first = topics.find(function (topic) { return volumeOf(topic) === key && passFilter(topic); });
      if (first) return first;
    }
    return topics.find(passFilter);
  }
  function currentChild() {
    return window.CnmChildren && window.CnmChildren.current ? window.CnmChildren.current() : null;
  }
  function progressOf(id) {
    var row = progress[id] || null;
    if (row && row.status === 'mastered' && proProgress[id] && proProgress[id].status === 'mastered') {
      return { status: row.status, at: row.at, key: row.key, expert: true };
    }
    return row;
  }
  function progressMark(row) { return !row ? '' : row.expert ? '⭐' : row.status === 'mastered' ? '✓' : '×'; }
  function progressLabel(row) {
    return !row ? '尚未完成检测' : row.expert ? '已通过专家挑战' : row.status === 'mastered' ? '已通过检测' : '未通过检测，建议巩固后再测';
  }
  function progressClass(row) { return row ? row.expert ? 'test-expert' : row.status === 'mastered' ? 'test-passed' : 'test-failed' : ''; }
  function progressBadge(row) {
    return row ? el('span', { class: 'topic-state ' + progressClass(row), 'aria-label': progressLabel(row), title: progressLabel(row), text: progressMark(row) }) : null;
  }
  function refreshProgress(force) {
    var child = currentChild();
    var next = window.CnmProgress && window.CnmProgress.statuses ? window.CnmProgress.statuses(child ? child.id : null, subject) : {};
    var nextPro = window.CnmProgress && window.CnmProgress.statuses ? window.CnmProgress.statuses(child ? child.id : null, subject, 'pro') : {};
    var stamp = JSON.stringify([child ? child.id : null, next, nextPro]);
    if (!force && progressStamp === stamp) return;
    progressStamp = stamp;
    progress = next;
    proProgress = nextPro;
    if ($('progress-owner')) $('progress-owner').textContent = child ? '检测记录：' + child.name : '检测记录：本机访客';
    if (topics.length) {
      renderList();
      renderDetail();
      if (cy) {
        cy.nodes().forEach(function (node) {
          if (!byId.has(node.id())) return;
          var row = progressOf(node.id());
          node.removeClass('test-passed test-failed test-expert');
          if (row) node.addClass(progressClass(row));
          node.toggleClass('expert-unlocked', canChallengeExpert(node.id()));
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
    writeBookScope(params);
    if (stage) params.set('stage', stage); else params.delete('stage');
    if (domain) params.set('domain', domain); else params.delete('domain');
    if (query) params.set('q', query); else params.delete('q');
    if (hasBookScope()) params.set('view', showWholeBook ? 'book' : 'local'); else params.delete('view');
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
    title.textContent = scopeTitle();
    title.title = selectedVolumes.map(bookTitle).join('、');
    var mobileTitle = $('mobile-book-title');
    if (mobileTitle) {
      mobileTitle.textContent = hasBookScope() ? scopeTitle() : subject === 'physics' ? '物理知识图谱' : '科学知识图谱';
      mobileTitle.setAttribute('aria-label', hasBookScope() ? '所选教材：' + selectedVolumes.map(bookTitle).join('、') : mobileTitle.textContent);
    }
    var juniorPhysics = subject === 'physics' && hasBookScope() && selectedVolumes.every(function (key) {
      var book = bookSpec(key);
      return book && book[2] >= 8 && book[2] <= 9;
    });
    ['book-challenge-hint', 'mobile-book-challenge-hint'].forEach(function (id) {
      var hint = $(id);
      if (hint) hint.hidden = !juniorPhysics;
    });
    var count = topics.filter(inBookScope).length;
    $('book-note').textContent = isAllBookScope() ? '全部教材共有 ' + count + ' 个知识点' : selectedVolumes.length > 1 ? '所选教材共有 ' + count + ' 个知识点'
      : volume ? '本册共有 ' + count + ' 个知识点' : '在教材选择器中选择册次，或从首页多选教材进入。';
    action.hidden = !volume;
    action.href = volume ? bookHref() : '#';
    if (volume) action.setAttribute('data-diagnose-return', '../diagnose/?subject=' + subject + '&volume=' + encodeURIComponent(volume) + '&order=book');
    else action.removeAttribute('data-diagnose-return');
    $('book-view').hidden = !hasBookScope();
    $('book-view').textContent = showWholeBook ? '局部图谱' : '全网路图谱';
    $('book-view').setAttribute('aria-pressed', showWholeBook ? 'true' : 'false');
    refreshDiagnosisLinks();
  }
  function syncBookQuery() {
    history.replaceState(null, '', graphReturnTo());
  }
  function chooseBook(key) {
    if (key === '__selection__' || key === '__local__') return;
    var book = bookSpec(key), allBooks = !book;
    var focus = null, previous = byId.get(selected);
    if (allBooks) {
      var memory = window.CnmLastLocation, recent = null;
      try {
        if (memory && memory.resume) recent = memory.resume(topics, subject);
        else if (memory && memory.resolve && memory.read) recent = memory.resolve(topics, memory.read(subject));
      } catch (error) { /* 本地记录不可用时，仍可从当前知识点浏览完整网络。 */ }
      var studied = recent && recent.subject === subject && byId.get(recent.topicId);
      if (studied && !studied.external) focus = studied.id;
      else if (previous && !previous.external) focus = previous.id;
    }
    rememberViewport();
    explicitNodeSelection = null;
    closeNodeDiagnosis();
    setBookScope(book ? [key] : booksForSubject().map(function (item) { return item[0]; }));
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
    var first = firstScopedTopic();
    if (focus || first) select(focus || first.id, 'user', allBooks ? false : undefined);
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
  function testBadge(passed, color, ink) {
    var path = passed === 'expert' ? 'm11 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L3.2 8.7l5.4-.8Z' : passed ? 'm6 11 3 3 7-7' : 'm7 7 8 8m0-8-8 8';
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="' + color + '" stroke="' + ink + '" stroke-width="2"/><path d="' + path + '" fill="none" stroke="' + ink + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  }
  function expertGlowStyle(colors, width, height, badge) {
    var halo = typeof window !== 'undefined' && window.CnmGraphHalo
      ? window.CnmGraphHalo.image(width, height, colors.expertGlow)
      : { url: 'none', width: width + 56, height: height + 56 };
    return {
      'background-image': [halo.url, badge],
      'background-width': [halo.width, 22], 'background-height': [halo.height, 22],
      'background-position-x': ['50%', '100%'], 'background-position-y': ['50%', '0%'],
      'background-offset-x': [0, 7], 'background-offset-y': [0, -7],
      'background-fit': ['none', 'none'], 'background-clip': ['none', 'none'],
      'background-image-containment': ['over', 'over'], 'background-image-opacity': [0.7, 1], 'bounds-expansion': 34
    };
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
      passedBorder: cssVar('--node-passed-border') || cssVar('--ok'),
      expertBorder: cssVar('--node-expert-border') || cssVar('--node-senior'),
      expertGlow: cssVar('--node-expert-glow'),
      text: cssVar('--node-text'),
      edge: cssVar('--edge'),
      edgeSoft: cssVar('--edge-soft'),
      passedBadge: testBadge(true, cssVar('--ok'), cssVar('--on-ok')),
      failedBadge: testBadge(false, cssVar('--bad'), cssVar('--on-bad')),
      expertBadge: testBadge('expert', cssVar('--node-senior-bg'), cssVar('--node-senior'))
    };
  }

  function syncGraphMotionButton() {
    var controls = $('graph-viewport-tools');
    if (controls) controls.hidden = !cy || cy.destroyed() || $('cy').dataset.ready !== '1';
    var button = $('graph-motion-toggle');
    if (!button) return;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    button.hidden = !window.CnmGraphMotion || !cy || cy.destroyed() || $('cy').dataset.ready !== '1';
    button.disabled = reduced;
    button.setAttribute('aria-pressed', graphMotionPaused ? 'true' : 'false');
    button.textContent = reduced ? '静态显示' : graphMotionPaused ? '继续漂浮' : '暂停漂浮';
    button.setAttribute('aria-label', reduced ? '静态显示：已启用系统减少动态效果' : button.textContent);
    button.title = reduced ? '已遵循系统的减少动态效果设置' : graphMotionPaused ? '继续知识点的轻柔漂浮' : '暂停知识点漂浮，方便静心阅读';
  }

  function syncControls() {
    document.querySelectorAll('#stage-tabs [data-stage]').forEach(function (button) {
      var on = button.getAttribute('data-stage') === stage;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var bookSelect = $('fGrade'), scopeOption = $('selected-books-option');
    if (scopeOption) scopeOption.remove();
    var allBooks = isAllBookScope();
    if (!hasBookScope() || selectedVolumes.length > 1 && !allBooks) {
      bookSelect.insertBefore(el('option', { id: 'selected-books-option', value: hasBookScope() ? '__selection__' : '__local__',
        text: hasBookScope() ? scopeTitle() : '局部图谱' }), bookSelect.options[1] || null);
    }
    bookSelect.value = allBooks ? '' : selectedVolumes.length > 1 ? '__selection__' : volume || '__local__';
    var domainSelect = $('fDomain');
    if (Array.prototype.some.call(domainSelect.options, function (option) { return option.value === domain; })) {
      domainSelect.value = domain;
    }
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
    if (graphCamera) graphCamera.cancel();
    if (graphSprings) graphSprings.stop();
    if (graphMotion) graphMotion.stop();
    cy.resize();
    var many = cy.nodes().length > 80;
    if (many) cy.minZoom(0.5);
    cy.fit(undefined, 36);
    if (many && cy.zoom() < 0.5) {
      cy.zoom(0.5);
      cy.center();
    }
    if (graphMotion) graphMotion.start(cy);
  }

  function closeDrawerIfMobile() {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    setMobileView('graph', mobileView === 'directory', true);
  }

  function graphIsVisible() {
    return (!window.matchMedia('(max-width: 900px)').matches || mobileView === 'graph') &&
      $('cy').clientWidth > 0 && $('cy').clientHeight > 0;
  }
  function cameraContext() {
    var context = { subject: subject, volume: volume, topicId: selected,
      view: showWholeBook ? 'book' : 'local', depth: upDepth, layout: 'playful-v2-floating-labels-' + labelLimit() };
    if (selectedVolumes.length > 1) context.volumes = selectedVolumes.slice();
    return context;
  }
  function captureViewport() {
    if (!cy || changingCamera || !renderedCameraContext || $('cy').dataset.ready !== '1' || !graphIsVisible()) return null;
    var zoom = cy.zoom(), pan = cy.pan(), width = $('cy').clientWidth, height = $('cy').clientHeight;
    return { zoom: zoom, centerX: (width / 2 - pan.x) / zoom, centerY: (height / 2 - pan.y) / zoom,
      width: width, height: height, expanded: renderedExpanded };
  }
  function saveLiveCamera() {
    if (window.CnmLastLocation && window.CnmLastLocation.owner && window.CnmLastLocation.owner() !== locationOwner) return;
    if (liveCamera && window.CnmExploreViewport) window.CnmExploreViewport.save(liveCamera.context, liveCamera.camera);
  }
  function rememberViewport() {
    var camera = captureViewport();
    if (camera) liveCamera = { context: renderedCameraContext, camera: camera };
    saveLiveCamera();
    return camera;
  }
  function queueViewportSave() {
    var camera = captureViewport();
    if (!camera) return;
    liveCamera = { context: renderedCameraContext, camera: camera };
    clearTimeout(viewportSaveTimer);
    viewportSaveTimer = setTimeout(saveLiveCamera, 120);
  }
  function applyViewport(camera) {
    if (!cy || !camera || !graphIsVisible()) return;
    changingCamera = true;
    try {
      cy.resize();
      var zoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), camera.zoom));
      cy.viewport({ zoom: zoom, pan: {
        x: $('cy').clientWidth / 2 - camera.centerX * zoom,
        y: $('cy').clientHeight / 2 - camera.centerY * zoom
      } });
    } finally { changingCamera = false; }
  }
  function resizeGraphViewport() {
    if (!cy || !graphIsVisible()) return;
    var current = cy;
    requestAnimationFrame(function () {
      if (cy !== current || !graphIsVisible()) return;
      if (graphCamera && graphCamera.active()) { cy.resize(); return; }
      if (liveCamera && liveCamera.context === renderedCameraContext) applyViewport(liveCamera.camera);
      else cy.resize();
      rememberViewport();
    });
  }
  function syncMobilePanels() {
    var mobile = window.matchMedia('(max-width: 900px)').matches;
    var frame = document.querySelector('.explore');
    frame.dataset.mobileView = mobileView;
    var panels = { directory: 'side', graph: 'graph-pane', detail: 'detail' };
    Object.keys(panels).forEach(function (view) {
      var panel = $(panels[view]);
      if (!panel) return;
      var inactive = mobile && view !== mobileView;
      panel.inert = inactive;
      if (mobile) {
        panel.setAttribute('aria-hidden', inactive ? 'true' : 'false');
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', 'mobile-tab-' + view);
      } else {
        panel.removeAttribute('aria-hidden');
        panel.removeAttribute('role');
        panel.removeAttribute('aria-labelledby');
      }
      var tab = $('mobile-tab-' + view);
      if (tab) {
        tab.setAttribute('aria-selected', view === mobileView ? 'true' : 'false');
        tab.tabIndex = view === mobileView ? 0 : -1;
        tab.classList.toggle('on', view === mobileView);
      }
    });
    var legacy = $('list-toggle');
    if (legacy) legacy.setAttribute('aria-expanded', mobileView === 'directory' ? 'true' : 'false');
  }
  function setMobileView(view, focusTab, deferRender) {
    if (['directory', 'graph', 'detail'].indexOf(view) < 0) return;
    var mobile = window.matchMedia('(max-width: 900px)').matches;
    if (mobile && view !== mobileView) {
      if (mobileView === 'graph') rememberViewport();
      if (mobileView === 'directory') mobileScroll.directory = $('list').scrollTop;
      if (mobileView === 'detail') mobileScroll.detail = $('detail').scrollTop;
    }
    mobileView = view;
    document.querySelector('.site-header').classList.remove('menu-open');
    document.querySelector('.explore').classList.remove('options-open');
    syncMobileChrome();
    if (mobile && view === 'directory') $('list').scrollTop = mobileScroll.directory;
    if (mobile && view === 'detail') $('detail').scrollTop = mobileScroll.detail;
    if (view === 'graph' && graphNeedsRender && !deferRender) renderGraph(pendingGraphRestore, pendingCameraTransition);
    if (view === 'graph') resizeGraphViewport();
    if (focusTab && $('mobile-tab-' + view)) $('mobile-tab-' + view).focus({ preventScroll: true });
  }
  function syncMobileChrome() {
    var mobile = window.matchMedia('(max-width: 900px)').matches;
    if (mobile && mobileView !== 'graph') {
      if (typeof graphCamera !== 'undefined' && graphCamera) graphCamera.cancel();
      if (typeof graphSprings !== 'undefined' && graphSprings) graphSprings.stop();
      if (typeof graphMotion !== 'undefined' && graphMotion) graphMotion.hold('view');
      if (typeof graphHalo !== 'undefined' && graphHalo) graphHalo.hold('view');
    }
    var menuOpen = document.querySelector('.site-header').classList.contains('menu-open');
    var optionsOpen = document.querySelector('.explore').classList.contains('options-open');
    $('main-nav').hidden = mobile && !menuOpen;
    $('graph-options').hidden = mobile && !optionsOpen;
    $('mobile-menu-toggle').setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    $('mobile-menu-toggle').textContent = menuOpen ? '收起菜单' : '菜单';
    $('mobile-options-toggle').setAttribute('aria-expanded', optionsOpen ? 'true' : 'false');
    $('mobile-options-toggle').textContent = optionsOpen ? '收起' : '选项';
    $('mobile-options-toggle').setAttribute('aria-label', optionsOpen ? '收起图谱选项' : '展开图谱选项');
    syncMobilePanels();
    syncDirectoryFilters();
    if (typeof graphMotion !== 'undefined' && graphMotion && (!mobile || mobileView === 'graph')) graphMotion.release('view');
    if (typeof graphHalo !== 'undefined' && graphHalo && (!mobile || mobileView === 'graph')) graphHalo.release('view');
    if (!mobile && graphNeedsRender) renderGraph(pendingGraphRestore, pendingCameraTransition);
    resizeGraphViewport();
  }
  function syncDirectoryFilters() {
    var filters = $('directory-filters'), toggle = $('mobile-filter-toggle');
    if (!filters || !toggle) return;
    var mobile = window.matchMedia('(max-width: 900px)').matches;
    var collapsed = mobile && !mobileFiltersOpen;
    filters.hidden = collapsed;
    filters.inert = collapsed;
    document.querySelector('.explore').classList.toggle('directory-filters-open', mobileFiltersOpen);
    toggle.setAttribute('aria-expanded', mobileFiltersOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', mobileFiltersOpen ? '收起目录筛选' : '展开目录筛选');
    toggle.textContent = mobileFiltersOpen ? '收起筛选' : '筛选';
  }
  function setDirectoryFilters(open, focusToggle) {
    mobileFiltersOpen = !!open;
    syncDirectoryFilters();
    if (focusToggle && $('mobile-filter-toggle')) $('mobile-filter-toggle').focus({ preventScroll: true });
  }
  function setMobileMenu(open) {
    if (graphCamera) graphCamera.cancel();
    document.querySelector('.site-header').classList.toggle('menu-open', open);
    syncMobileChrome();
  }
  function setMobileOptions(open) {
    if (graphCamera) graphCamera.cancel();
    rememberViewport();
    document.querySelector('.explore').classList.toggle('options-open', open);
    syncMobileChrome();
  }
  function canChallengeExpert(id) {
    var topic = byId.get(id), row = progressOf(id);
    return !!(subject === 'physics' && topic && topic.grade >= 8 && topic.grade <= 9 && row && row.status === 'mastered');
  }
  function nodeDiagnosisHref(id) {
    if (!byId.has(id)) return '';
    rememberViewport();
    return withReturn('../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(id) + '&retry=1' + (canChallengeExpert(id) ? '&level=pro' : ''));
  }
  function closeNodeDiagnosis() {
    var dialog = $('node-diagnose-dialog');
    if (dialog && dialog.open) dialog.close();
  }
  function openNodeDiagnosis(id) {
    if (id !== selected || !byId.has(id)) return false;
    var dialog = $('node-diagnose-dialog');
    if (!dialog || dialog.open) return false;
    if (typeof graphCamera !== 'undefined' && graphCamera) graphCamera.cancel();
    nodeDialogId = id;
    nodeDialogScroll = { x: window.scrollX, y: window.scrollY };
    var expert = canChallengeExpert(id);
    $('node-dialog-title').textContent = expert ? '是否挑战专家水平' : '检测这个知识点';
    $('node-dialog-question').textContent = expert ? '“' + byId.get(id).name + '”已通过普通检测。挑战更进一步的 Pro 题目，首次通过再得 1⭐。' : '要进入“' + byId.get(id).name + '”的检测吗？';
    $('node-dialog-try').textContent = expert ? '我要挑战' : '我要试试';
    $('node-dialog-try').setAttribute('href', nodeDiagnosisHref(id));
    dialog.showModal();
    if (typeof graphMotion !== 'undefined' && graphMotion) graphMotion.hold('dialog');
    if (typeof graphHalo !== 'undefined' && graphHalo) graphHalo.hold('dialog');
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
      // close 事件异步派发；关闭后快速重开时，旧事件不能清除新弹窗的选择。
      if (dialog.open) return;
      if (typeof graphMotion !== 'undefined' && graphMotion) graphMotion.release('dialog');
      if (typeof graphHalo !== 'undefined' && graphHalo) graphHalo.release('dialog');
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
    if (!inBookScope(topic)) return false;
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
      if (tested && tested.status === 'mastered') row.completed++;
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
    var filtering = !!(query || hasBookScope() || grade || stage || domain);
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
              'aria-label': '已通过检测 ' + completed.completed + ' 个，共 ' + completed.total + ' 个知识点',
              title: '已通过检测 / 本章知识点'
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
        '（' + (currentAlias.name || '未命名') + '）已对应到这个知识点。用该旧编号开始检测时，会包含映射中的全部 ' + currentAlias.targets.length + ' 个小学知识点。 ',
        el('a', {
          href: withReturn('../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(currentAlias.id)),
          'data-diagnose-return': '../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(currentAlias.id)
        }, '按旧编号检测')));
    }
    parts.push(el('h1', { class: 'detail-title', text: topic.name }));
    var tested = progressOf(topic.id);
    parts.push(el('p', { class: 'detail-test-state ' + progressClass(tested), text: (tested ? progressMark(tested) + ' ' : '') + progressLabel(tested) }));
    var diagHref = '../diagnose/?target=' + encodeURIComponent(topic.id);
    if (subject !== 'math') diagHref = '../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(topic.id);
    diagHref += '&retry=1' + (canChallengeExpert(topic.id) ? '&level=pro' : '');
    parts.push(el('a', {
      class: 'btn btn-primary btn-lg diag-btn',
      href: withReturn(diagHref),
      'data-diagnose-return': diagHref
    }, canChallengeExpert(topic.id) ? '挑战专家水平' : tested ? '重新检测这个知识点' : '检测这个知识点'));
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
    if (!tip || !node || node.empty()) return;
    var text = node.data('full') || node.data('label') || '';
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text + (node.data('testStatus') ? ' · ' + node.data('testLabel') : '');
    tip.hidden = false;
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
      classes: tone.cls + (current ? ' current' : '') + ' ' + progressClass(progressOf(id)) + (canChallengeExpert(id) ? ' expert-unlocked' : '')
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

  function graphStyles(colors, narrow, dense) {
    var textMax = narrow ? 116 : 140, boxW = narrow ? 132 : 156;
    return [
      { selector: 'node', style: {
        label: 'data(label)', 'text-wrap': 'ellipsis', 'text-max-width': textMax + 'px',
        'text-overflow-wrap': 'anywhere',
        'text-valign': 'center', 'text-halign': 'center',
        'font-size': 14, 'font-weight': 400, 'font-family': FONT, color: 'data(color)',
        'background-color': 'data(bg)', 'border-width': 3, 'border-color': 'data(border)',
        shape: 'round-rectangle', width: boxW, height: 40, padding: 0, 'corner-radius': 12
      } },
      { selector: 'node.current', style: { width: boxW * 1.05, height: 42, 'border-width': 4, 'z-index': 10 } },
      { selector: 'node:active', style: { 'overlay-opacity': 0 } },
      { selector: 'node.test-passed, node.test-failed, node.test-expert', style: {
        'background-width': 22, 'background-height': 22, 'background-fit': 'none',
        'background-position-x': '100%', 'background-position-y': '0%',
        'background-offset-x': 7, 'background-offset-y': -7, 'background-clip': 'none',
        'background-image-containment': 'over', 'bounds-expansion': 10
      } },
      { selector: 'node.test-passed', style: { 'background-image': colors.passedBadge, 'border-color': colors.passedBorder } },
      { selector: 'node.test-failed', style: { 'background-image': colors.failedBadge } },
      { selector: 'node.test-expert', style: { 'background-image': colors.expertBadge, 'border-color': colors.expertBorder } },
      { selector: 'node.expert-unlocked', style: expertGlowStyle(colors, boxW, 40, colors.passedBadge) },
      { selector: 'node.expert-unlocked.test-expert', style: expertGlowStyle(colors, boxW, 40, colors.expertBadge) },
      { selector: 'node.expert-unlocked.current', style: expertGlowStyle(colors, boxW * 1.05, 42, colors.passedBadge) },
      { selector: 'node.expert-unlocked.test-expert.current', style: expertGlowStyle(colors, boxW * 1.05, 42, colors.expertBadge) },
      { selector: 'edge', style: {
        width: 1.6, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle', 'curve-style': dense ? 'straight' : 'bezier',
        'arrow-scale': 0.8, 'line-style': 'solid'
      } },
      { selector: 'edge.soft', style: { 'line-style': 'dashed', width: 1.5 } }
    ];
  }

  function syncGraphTheme() {
    if (!cy || cy.destroyed() || !graphStyleContext) return;
    var colors = theme();
    // 只更新颜色和图标，不重建节点、布局、相机或正在运行的拖拽/漂浮。
    cy.batch(function () {
      cy.nodes().forEach(function (node) {
        var tone = node.hasClass('primary') ? { bg: colors.primaryBg, border: colors.primary }
          : node.hasClass('junior') ? { bg: colors.juniorBg, border: colors.junior }
          : { bg: colors.seniorBg, border: colors.senior };
        var current = node.hasClass('current');
        node.data({ bg: current ? colors.currentBg : tone.bg,
          border: current ? colors.currentBorder : tone.border, color: colors.text });
      });
      cy.edges().forEach(function (edge) { edge.data('color', edge.hasClass('soft') ? colors.edgeSoft : colors.edge); });
      cy.style().fromJson(graphStyles(colors, graphStyleContext.narrow, graphStyleContext.dense)).update();
    });
  }

  function mountGraphCamera() {
    if (!window.CnmGraphCamera) return;
    var graph = cy;
    graphCamera = window.CnmGraphCamera.create({ cy: graph, container: $('cy'), duration: 560,
      onStart: function () {
        if (cy !== graph) return;
        if (graphMotion) graphMotion.hold('camera');
        if (graphHalo) graphHalo.hold('camera');
      },
      onFinish: function (reason) {
        if (cy !== graph) return;
        if (graphMotion) graphMotion.release('camera');
        if (graphHalo) graphHalo.release('camera');
        if (reason !== 'destroy') rememberViewport();
      }
    });
  }

  function prepareCameraTransition(id) {
    if (id === selected) return null;
    if (graphCamera) graphCamera.cancel();
    if (!window.CnmGraphCamera || !cy || cy.destroyed() || !selected ||
        ($('cy').dataset.ready !== '1' && !pendingCameraTransition)) return null;
    var previous = liveCamera && liveCamera.camera;
    var width = $('cy').clientWidth || previous && previous.width;
    var height = $('cy').clientHeight || previous && previous.height;
    if (!(width > 0 && height > 0)) return null;
    if (graphSprings) graphSprings.stop();
    if (graphMotion) graphMotion.hold('camera');
    if (graphHalo) graphHalo.hold('camera');
    var anchors = [];
    [id, selected, liveCamera && liveCamera.context.topicId].forEach(function (key) {
      if (!key || anchors.some(function (item) { return item.id === key; })) return;
      var node = cy.getElementById(key);
      if (node.empty()) return;
      var point = node.renderedPosition();
      anchors.push({ id: key, x: point.x / width, y: point.y / height });
    });
    return { zoom: cy.zoom(), anchors: anchors };
  }

  function centeredCamera(zoom) {
    var point = cy.getElementById(selected).position();
    return { zoom: zoom, pan: { x: $('cy').clientWidth / 2 - point.x * zoom,
      y: $('cy').clientHeight / 2 - point.y * zoom } };
  }

  function focusExistingBook(transition) {
    if (!transition || !graphCamera || !cy || cy.destroyed() || graphNeedsRender || !graphIsVisible() ||
        !hasBookScope() || !showWholeBook || !renderedCameraContext || $('cy').dataset.ready !== '1' || cy.getElementById(selected).empty()) return false;
    var before = Object.assign({}, renderedCameraContext), after = cameraContext();
    delete before.topicId;
    var scene = Object.assign({}, after); delete scene.topicId;
    if (JSON.stringify(before) !== JSON.stringify(scene)) return false;
    var colors = theme();
    cy.batch(function () {
      cy.nodes('.current').forEach(function (node) {
        var tone = node.hasClass('primary') ? { bg: colors.primaryBg, border: colors.primary }
          : node.hasClass('junior') ? { bg: colors.juniorBg, border: colors.junior } : { bg: colors.seniorBg, border: colors.senior };
        node.removeClass('current'); node.data({ bg: tone.bg, border: tone.border });
      });
      var focus = cy.getElementById(selected);
      focus.addClass('current'); focus.data({ bg: colors.currentBg, border: colors.currentBorder });
    });
    renderedCameraContext = after;
    renderedExpanded = ancestorsOpen;
    rememberViewport();
    graphCamera.move(centeredCamera(cy.zoom()));
    return true;
  }

  function startSelectionCamera(transition, destination) {
    if (!graphCamera || !transition) return;
    var zoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), transition.zoom));
    var anchor = transition.anchors.find(function (item) { return !cy.getElementById(item.id).empty(); });
    var node = cy.getElementById(anchor ? anchor.id : selected), point = node.position();
    // 跨图没有共同节点时，只作一小段过渡，避免镜头飞过大片空白。
    var x = anchor ? Math.max(-0.25, Math.min(1.25, anchor.x)) : 0.3;
    var y = anchor ? Math.max(-0.25, Math.min(1.25, anchor.y)) : 0.5;
    cy.viewport({ zoom: zoom, pan: { x: $('cy').clientWidth * x - point.x * zoom,
      y: $('cy').clientHeight * y - point.y * zoom } });
    rememberViewport();
    graphCamera.move(destination);
  }

  function renderGraph(restoreSavedCamera, transition) {
    if (window.matchMedia('(max-width: 900px)').matches && mobileView !== 'graph') {
      graphNeedsRender = true;
      pendingGraphRestore = restoreSavedCamera !== false;
      pendingCameraTransition = transition || null;
      return;
    }
    if (graphCamera) { graphCamera.destroy(); graphCamera = null; }
    rememberViewport();
    if (graphHalo) { graphHalo.destroy(); graphHalo = null; }
    if (graphSprings) { graphSprings.destroy(); graphSprings = null; }
    if (graphMotion) { graphMotion.destroy(); graphMotion = null; }
    graphNeedsRender = false;
    var nextContext = cameraContext();
    var savedCamera = !transition && restoreSavedCamera !== false && window.CnmExploreViewport ? window.CnmExploreViewport.read(nextContext) : null;
    if (savedCamera) ancestorsOpen = savedCamera.expanded;
    explicitNodeSelection = null;
    var token = ++graphToken;
    tipFromTap = false;
    hideTip();
    var reuseScene = !!(transition && cy && !cy.destroyed());
    if (cy && !reuseScene) { cy.destroy(); cy = null; window.__cy = null; }
    renderedCameraContext = null;
    pendingCameraTransition = transition || null;
    var cyEl = $('cy');
    var emptyEl = $('graph-empty');
    var meta = $('graph-meta');
    if (!selected || !byId.has(selected)) {
      cyEl.hidden = true;
      cyEl.dataset.ready = '0';
      cyEl.dataset.mode = '';
      cyEl.dataset.total = '';
      syncGraphMotionButton();
      emptyEl.hidden = false;
      meta.textContent = '';
      updateFold(0, false);
      return;
    }
    var depth = upDepth === 'all' ? Infinity : upDepth;
    var upSet = upstream(selected, depth);
    var nodeSet = new Set(upSet);
    (post.get(selected) || []).forEach(function (edge) { nodeSet.add(edge.id); });
    nodeSet = scopedNodeSet(nodeSet);
    var total = nodeSet.size;
    var folded = !hasBookScope() && upDepth === 'all' && total > FOLD_AT && !ancestorsOpen;
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
    $('graph-viewport-tools').hidden = true;
    cyEl.dataset.mode = folded ? 'grade' : 'full';
    cyEl.dataset.total = String(total);
    var heavy = !folded && total > 80;
    cyEl.dataset.view = hasBookScope() && showWholeBook ? 'book' : 'local';
    cyEl.setAttribute('aria-label', (hasBookScope() && showWholeBook ? scopeTitle() + '完整知识图谱' : '选中知识点的局部先修图') + '；勾表示普通检测通过，星表示专家挑战通过，叉表示普通检测未通过，目录中也可查看检测状态。');
    if (heavy) meta.textContent = '正在排列全部 ' + total + ' 个知识点…';

    var kick = heavy ? function (fn) { setTimeout(fn, 40); } : requestAnimationFrame;
    kick(function () {
      if (token !== graphToken) return;
      if (!graphIsVisible()) {
        graphNeedsRender = true;
        pendingGraphRestore = restoreSavedCamera !== false;
        pendingCameraTransition = transition || null;
        return;
      }
      try {
        ensureDagre();
        var colors = theme();
        var narrow = labelLimit() <= 8;
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
          autoungrabify: false,
          autounselectify: true,
          userPanningEnabled: true,
          userZoomingEnabled: true
        };
        cyOptions.style = graphStyles(colors, narrow, dense);
        if (reuseScene) {
          cy.batch(function () {
            cy.elements().remove(); cy.add(elements);
            cy.style().fromJson(cyOptions.style).update();
          });
          cy.minZoom(cyOptions.minZoom);
        } else cy = window.cytoscape(cyOptions);
        graphStyleContext = { narrow: narrow, dense: dense };
        cy.nodes().ungrabify();
        window.__cy = cy;
        renderedCameraContext = nextContext;
        renderedExpanded = ancestorsOpen;
        if (!reuseScene) {
        cy.on('pan zoom', queueViewportSave);
        cy.on('mouseover', 'node', function (event) { if (!graphSprings || !graphSprings.dragging()) showTip(event.target); });
        cy.on('mouseout', 'node', function () { if (!tipFromTap) hideTip(); });
        cy.on('tap', 'node', function (event) {
          if (graphSprings && graphSprings.consumeTap(event)) { explicitNodeSelection = null; tipFromTap = false; hideTip(); return; }
          var id = event.target.id();
          activateGraphNode(id);
          // 局部图切换会清理旧提示，选中后再显示当前内容。
          tipFromTap = true;
          showTip(event.target);
        });
        cy.on('tap', function (event) {
          if (event.target === cy) { explicitNodeSelection = null; tipFromTap = false; hideTip(); }
        });
        }
        var layout = cy.layout({
          name: 'dagre', rankDir: 'TB',
          rankSep: dense ? 48 : 64,
          nodeSep: dense ? 18 : 26,
          edgeSep: dense ? 8 : 12,
          ranker: dense ? 'longest-path' : 'network-simplex',
          padding: 16, animate: false, fit: !transition,
          nodeDimensionsIncludeLabels: false, spacingFactor: dense ? 1.02 : 1.05
        });
        layout.one('layoutstop', function () {
          if (token !== graphToken) return;
          var finishLayout = function () {
            if (token !== graphToken || !cy) return;
            if (!graphIsVisible()) {
              graphNeedsRender = true;
              pendingGraphRestore = restoreSavedCamera !== false;
              pendingCameraTransition = transition || null;
              return;
            }
            cy.resize();
            cy.fit(undefined, dense ? 24 : 28);
            var framed = false;
            if ((heavy || (hasBookScope() && showWholeBook)) && cy.zoom() < 0.65) {
              cy.zoom(0.75);
              var focus = cy.getElementById(selected);
              if (focus && !focus.empty()) cy.center(focus);
              framed = true;
            }
            if (!folded) {
              meta.textContent = (hasBookScope() && showWholeBook ? (isAllBookScope() ? '全网路图谱 ' : selectedVolumes.length > 1 ? '所选教材全图 ' : '本册全图 ') + total + ' 个知识点、' + edgeCount + ' 条先修。可拖动、缩放查看。' : '局部图 ' + total + ' 个知识点、' + edgeCount + ' 条先修。向上 ' + depthLabel + '，向下 1 层。')
                + (framed ? '已对准当前知识点，可拖动查看其余节点。' : '')
                + note;
            }
            if (savedCamera) applyViewport(savedCamera);
            var destination = transition ? centeredCamera(cy.zoom()) : null;
            cyEl.dataset.ready = '1';
            if (!transition) rememberViewport();
            syncGraphMotionButton();
            if (window.CnmGraphMotion) {
              graphMotion = window.CnmGraphMotion.create({ container: cyEl, paused: graphMotionPaused });
              graphMotion.hold('startup');
            }
            if (window.CnmGraphSprings) {
              graphSprings = window.CnmGraphSprings.create({ cy: cy, container: cyEl,
                onHold: function () { if (graphMotion) graphMotion.hold('spring'); },
                onRelease: function () { if (graphMotion) graphMotion.release('spring'); },
                onDragStart: function () { explicitNodeSelection = null; tipFromTap = false; hideTip(); }
              });
            }
            if (window.CnmGraphMotion) {
              var enteringGraph = cy;
              // 先记录锚点，再允许原生拖拽；延时只释放启动暂停，不重读临时位移。
              graphMotion.start(enteringGraph);
              setTimeout(function () {
                if (token !== graphToken || cy !== enteringGraph || !graphMotion) return;
                graphMotion.release('startup', 0);
                if (window.matchMedia('(max-width: 900px)').matches && mobileView !== 'graph') graphMotion.hold('view');
                if ($('node-diagnose-dialog') && $('node-diagnose-dialog').open) graphMotion.hold('dialog');
              }, 80);
            }
            if (window.CnmGraphHalo) {
              graphHalo = window.CnmGraphHalo.create({ cy: cy, container: cyEl, paused: graphMotionPaused });
              if (window.matchMedia('(max-width: 900px)').matches && mobileView !== 'graph') graphHalo.hold('view');
              if ($('node-diagnose-dialog') && $('node-diagnose-dialog').open) graphHalo.hold('dialog');
            }
            if (graphSprings) cy.nodes().not('.grade').grabify();
            mountGraphCamera();
            if (transition) startSelectionCamera(transition, destination);
            pendingCameraTransition = null;
          };
          if (transition) finishLayout(); else requestAnimationFrame(finishLayout);
        });
        layout.run();
      } catch (error) {
        cyEl.dataset.ready = 'err';
        meta.textContent = '图没有画出来：' + (error && error.message ? error.message : error);
      }
    });
  }

  function select(raw, source, restoreSavedCamera) {
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
    var transition = prepareCameraTransition(hit.id);
    rememberViewport();
    var switchedBook = hasBookScope() && !inBookScope(byId.get(hit.id));
    if (switchedBook) {
      setBookScope([volumeOf(byId.get(hit.id))]);
      grade = '';
      stage = '';
      domain = '';
      showWholeBook = true;
      syncControls();
      syncBook();
      renderList();
    }
    var same = hit.id === selected && !currentAlias && !hit.alias;
    if (hit.id !== selected) {
      ancestorsOpen = false;
      mobileScroll.detail = 0;
      $('detail').scrollTop = 0;
    }
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
    if (!same || graphNeedsRender) {
      if (!focusExistingBook(transition)) renderGraph(restoreSavedCamera, transition);
    }
  }

  function zoomBy(factor) {
    if (!cy) return;
    if (graphCamera) graphCamera.cancel();
    var rect = cy.container().getBoundingClientRect();
    cy.zoom({
      level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)),
      renderedPosition: { x: rect.width / 2, y: rect.height / 2 }
    });
  }

  var locationOwner = window.CnmLastLocation && window.CnmLastLocation.owner ? window.CnmLastLocation.owner() : 'guest';
  function rememberLocation() {
    if (window.CnmLastLocation && window.CnmLastLocation.owner && window.CnmLastLocation.owner() !== locationOwner) return;
    if (!selected || !byId.has(selected) || !window.CnmLastLocation) return;
    var record = { subject:subject, volume:volume, topicId:selected,
      view:showWholeBook ? 'book' : 'local', depth:upDepth };
    if (selectedVolumes.length > 1) record.volumes = selectedVolumes.slice();
    window.CnmLastLocation.remember(record);
  }
  function restoreLocation(allTopics) {
    var memory = window.CnmLastLocation;
    if (!memory || !memory.shouldResume('explore', location)) return;
    var record = memory.resume ? memory.resume(allTopics, subject) : memory.resolve(allTopics, memory.read(subject));
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
    var memory = typeof window !== 'undefined' && window.CnmLastLocation;
    if (memory && memory.shouldResume('explore', location)) return memory.currentSubject();
    return 'physics';
  }

  function configureSubject() {
    document.body.classList.toggle('subject-physics', subject === 'physics');
    document.body.classList.toggle('subject-science', subject === 'science');
    if (window.CnmLastLocation) window.CnmLastLocation.syncNavigation(subject);
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
    var chosen = window.CnmBookSelection ? window.CnmBookSelection.fromParams(params, subject)
      : (params.get('volumes') || params.get('volume') || '').split(',');
    setBookScope(chosen);
    if (!hasBookScope()) {
      var legacyGrade = Number(params.get('grade'));
      var legacy = booksForSubject().find(function (book) { return book[2] === legacyGrade; });
      if (legacy) setBookScope([legacy[0]]);
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
    if (hash && resolveId(hash) && inBookScope(byId.get(resolveId(hash).id))) { select(hash, 'hash'); return; }
    if (!hash && !hasBookScope() && !grade && !stage && !domain && !query) { chooseBook(''); return; }
    if (hasBookScope() || grade) {
      var first = firstScopedTopic();
      if (first) { select(first.id, 'user'); return; }
    }
    renderDetail();
    renderGraph();
  }

  function bind() {
    try { graphMotionPaused = localStorage.getItem(GRAPH_MOTION_PAUSED_KEY) === '1'; } catch (error) { /* 隐私模式使用当前页设置。 */ }
    var motionToggle = $('graph-motion-toggle');
    if (motionToggle) motionToggle.addEventListener('click', function () {
      graphMotionPaused = !graphMotionPaused;
      try { localStorage.setItem(GRAPH_MOTION_PAUSED_KEY, graphMotionPaused ? '1' : '0'); } catch (error) { /* 不影响当前页。 */ }
      if (graphMotion) graphMotion.setPaused(graphMotionPaused);
      if (graphHalo) graphHalo.setPaused(graphMotionPaused);
      syncGraphMotionButton();
    });
    var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionPreference.addEventListener) motionPreference.addEventListener('change', syncGraphMotionButton);
    syncGraphMotionButton();
    $('mobile-menu-toggle').addEventListener('click', function () {
      var open = !document.querySelector('.site-header').classList.contains('menu-open');
      if (open) setMobileOptions(false);
      setMobileMenu(open);
    });
    $('mobile-options-toggle').addEventListener('click', function () {
      var open = !document.querySelector('.explore').classList.contains('options-open');
      if (open) { setMobileView('graph'); setMobileMenu(false); }
      setMobileOptions(open);
    });
    $('mobile-view-tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('[data-mobile-view]');
      if (tab) setMobileView(tab.getAttribute('data-mobile-view'), true);
    });
    $('mobile-view-tabs').addEventListener('keydown', function (event) {
      var views = ['directory', 'graph', 'detail'];
      var index = views.indexOf(mobileView), next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % views.length;
      else if (event.key === 'ArrowLeft') next = (index + 2) % views.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 2;
      else return;
      event.preventDefault();
      setMobileView(views[next], true);
    });
    $('mobile-filter-toggle').addEventListener('click', function () { setDirectoryFilters(!mobileFiltersOpen); });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || $('node-diagnose-dialog').open) return;
      if (document.querySelector('.site-header').classList.contains('menu-open')) {
        setMobileMenu(false);
        $('mobile-menu-toggle').focus({ preventScroll: true });
      } else if (document.querySelector('.explore').classList.contains('options-open')) {
        setMobileOptions(false);
        $('mobile-options-toggle').focus({ preventScroll: true });
      } else if (mobileView === 'directory' && mobileFiltersOpen && window.matchMedia('(max-width: 900px)').matches) {
        setDirectoryFilters(false, true);
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
      if (current && ((stage === 'j' && current[2] >= 10) || (stage === 'h' && current[2] <= 9))) setBookScope([]);
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
      syncBookQuery();
      renderGraph();
    });
    window.addEventListener('storage', function () { refreshProgress(); });
    window.addEventListener('focus', function () { refreshProgress(); });
    window.addEventListener('cnm:progress', function () { refreshProgress(); });
    window.addEventListener('pagehide', rememberViewport);
    document.addEventListener('visibilitychange', function () { if (document.hidden) rememberViewport(); });
    $('fDomain').addEventListener('change', function () {
      domain = $('fDomain').value;
      renderList();
      highlight(false);
    });
    $('graph-fold').addEventListener('click', function (event) {
      if (event.target.closest('#btn-expand-all')) ancestorsOpen = true;
      else if (event.target.closest('#btn-collapse-all')) ancestorsOpen = false;
      else return;
      renderGraph(false);
    });
    $('list-toggle').addEventListener('click', function () {
      setMobileView(mobileView === 'directory' ? 'graph' : 'directory', true);
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
      if (event.target.closest('a')) rememberViewport();
      var jump = event.target.closest('[data-jump]');
      if (!jump) return;
      select(jump.getAttribute('data-jump'), 'user');
    });
    window.addEventListener('hashchange', function () {
      var hash = readHash();
      if (hash) select(hash, 'hash');
    });
    if (window.ResizeObserver) {
      new ResizeObserver(resizeGraphViewport).observe($('cy'));
    }
    window.addEventListener('cnm:theme', syncGraphTheme);
    var colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    if (colorScheme.addEventListener) {
      colorScheme.addEventListener('change', function () { if (!window.CnmTheme) syncGraphTheme(); });
    }
    var narrow = window.matchMedia('(max-width: 700px)');
    if (narrow.addEventListener) {
      narrow.addEventListener('change', function () { if (selected) renderGraph(); });
    }
  }

  function prepareGraphFont() {
    if (!document.fonts || typeof document.fonts.load !== 'function') { FONT = PLAYFUL_FONT; return Promise.resolve(false); }
    return new Promise(function (done) {
      var finished = false;
      var timer = setTimeout(function () { finish(false); }, 1000);
      function finish(loaded) {
        if (finished) return;
        finished = true; clearTimeout(timer); done(loaded);
      }
      try {
        document.fonts.load('14px "Physicalmap Playful"', '物理知识图谱').then(function (faces) {
          if (!faces || !faces.length) { finish(false); return; }
          FONT = PLAYFUL_FONT;
          // 慢网络使用系统字体先显示；字体到达后只换文字，不重新排列节点或移动相机。
          if (cy && !cy.destroyed()) {
            cy.style().selector('node').style('font-family', FONT).update();
          }
          finish(true);
        }, function () { finish(false); });
      } catch (error) { finish(false); }
    });
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
  applyQuery();
  bind();
  load().then(prepareGraphFont).then(function () {
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
