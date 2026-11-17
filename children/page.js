/* 孩子档案页：添加、编辑、删除孩子，切换当前孩子。数据来自 assets/children.js（localStorage）。 */
(function () {
  'use strict';
  var CC = window.CnmChildren;
  var listBox = document.getElementById('list');
  var form = document.getElementById('form');
  var formCard = document.getElementById('form-card');
  var nameIn = document.getElementById('f-name');
  var gradeSel = document.getElementById('f-grade');
  var bookSel = document.getElementById('f-book');
  var errBox = document.getElementById('f-error');
  var submitBtn = document.getElementById('f-submit');
  var cancelBtn = document.getElementById('f-cancel');
  var formTitle = document.getElementById('form-title');
  var exportBtn = document.getElementById('export-backup');
  var exportStatus = document.getElementById('export-status');
  var importFile = document.getElementById('import-backup');
  var importPreview = document.getElementById('import-preview');
  var importError = document.getElementById('import-error');
  var importStatus = document.getElementById('import-status');
  var confirmImport = document.getElementById('confirm-import');
  var pendingBackup = null;
  var pendingPreview = null;
  var fileRequest = 0;
  var editing = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fillSelect(sel, items, placeholder) {
    sel.textContent = '';
    if (placeholder) { var o = el('option', null, placeholder); o.value = ''; sel.appendChild(o); }
    items.forEach(function (x) { var o = el('option', null, x); o.value = x; sel.appendChild(o); });
  }
  fillSelect(gradeSel, CC.GRADES, '请选择年级');
  fillSelect(bookSel, CC.TEXTBOOKS);

  var params = new URLSearchParams(location.search);
  if (params.get('from') === 'diagnose') {
    var back = document.getElementById('back');
    var sub = params.get('subject');
    var href = '../diagnose/?subject=' + (sub === 'science' ? 'science' : 'physics');
    var a = el('a', null, '← 回到检测');
    a.href = href;
    back.appendChild(a);
    back.hidden = false;
  }

  function showError(msg) { errBox.textContent = msg || ''; errBox.hidden = !msg; }

  function resetForm() {
    editing = null;
    nameIn.value = '';
    gradeSel.value = '';
    bookSel.value = CC.TEXTBOOKS[0];
    formTitle.textContent = '添加新账号';
    submitBtn.textContent = '添加新账号';
    cancelBtn.hidden = true;
    showError('');
    formCard.open = false;
  }

  function startEdit(c) {
    editing = c.id;
    nameIn.value = c.name;
    gradeSel.value = c.grade;
    bookSel.value = c.textbook;
    formTitle.textContent = '修改「' + c.name + '」的信息';
    submitBtn.textContent = '保存修改';
    cancelBtn.hidden = false;
    showError('');
    formCard.hidden = false;
    formCard.open = true;
    formCard.scrollIntoView({ block: 'center' });
    nameIn.focus({ preventScroll: true });
  }

  function stats(c) {
    var recs = CC.recordsOf(c.id);
    var by = CC.latestStatus(c.id);
    var weak = 0;
    Object.keys(by).forEach(function (id) { if (by[id].status === 'weak') weak++; });
    return { runs: recs.length, weak: weak };
  }

  function card(c, isCurrent) {
    var st = stats(c);
    var art = el('article', 'kid-card' + (isCurrent ? ' is-current' : ''));
    var head = el('div', 'kid-head');
    head.appendChild(el('h3', null, c.name));
    if (isCurrent) head.appendChild(el('span', 'kid-badge', '当前'));
    art.appendChild(head);
    art.appendChild(el('p', 'kid-meta', c.grade + ' · ' + c.textbook));
    art.appendChild(el('p', 'kid-stat', st.runs
      ? '已检测 ' + st.runs + ' 次，目前有 ' + st.weak + ' 个薄弱知识点'
      : '还没有检测记录'));
    var row = el('div', 'kid-actions');
    if (!isCurrent) {
      var use = el('button', 'primary', '设为当前');
      use.type = 'button';
      use.addEventListener('click', function () { CC.setCurrent(c.id); render(); });
      row.appendChild(use);
    }
    var hist = el('a', 'btn', '薄弱知识点与历史');
    hist.href = 'history.html?child=' + encodeURIComponent(c.id);
    row.appendChild(hist);
    var edit = el('button', null, '编辑');
    edit.type = 'button';
    edit.addEventListener('click', function () { startEdit(c); });
    row.appendChild(edit);
    var del = el('button', 'danger', '删除');
    del.type = 'button';
    del.addEventListener('click', function () {
      if (!confirm('删除「' + c.name + '」的档案和全部检测记录？删除后无法恢复。')) return;
      CC.remove(c.id);
      if (editing === c.id) resetForm();
      render();
    });
    row.appendChild(del);
    art.appendChild(row);
    return art;
  }

  function render() {
    var kids = CC.list();
    var cur = CC.current();
    exportBtn.disabled = false;
    exportStatus.hidden = true;
    listBox.textContent = '';
    if (!kids.length) {
      listBox.appendChild(el('p', 'kid-empty', '还没有本地账号。点击“添加新账号”后填写昵称和年级。'));
    } else {
      kids.forEach(function (c) { listBox.appendChild(card(c, !!cur && cur.id === c.id)); });
    }
    var full = kids.length >= CC.MAX_CHILDREN && !editing;
    formCard.hidden = full;
    if (full) {
      var note = el('p', 'muted small', '已经建满 ' + CC.MAX_CHILDREN + ' 个本地账号。要添加新的，先删除不用的档案。');
      listBox.appendChild(note);
    }
    renderArchivedSessions();
    renderLearningOverview();
  }

  var topicNames = {}, achievementTopics = null, achievementLoadFailed = false;
  function cleanLabel(value) { return String(value || '').replace(/\u8bca\u65ad/g, '检测'); }
  function achievementSelection(childId) {
    var memory = window.CnmLastLocation, helper = window.CnmAchievementBooks;
    var record = memory && memory.resolve(achievementTopics);
    if (record) return { record: record, from: 'graph' };
    if (!helper || !Array.isArray(achievementTopics)) return null;
    // 尚未浏览图谱时，沿用本档案最近一次检测所用的教材。
    var latest = null;
    [['physics', 'cnpDiagnose.session.v2'], ['science', 'cnsDiagnose.session.v1']].forEach(function (pair) {
      try {
        var saved = JSON.parse(localStorage.getItem(pair[1]));
        if (!saved || saved.v !== 2 || saved.progressChildId !== childId ||
            ['target', 'textbook', 'screen'].indexOf(saved.mode) < 0 || !Array.isArray(saved.targets) || !saved.targets.length ||
            typeof saved.savedAt !== 'string' || !Number.isFinite(Date.parse(saved.savedAt))) return;
        var targetTopics = saved.targets.map(function (id) { return achievementTopics.find(function (topic) { return topic.id === id; }); });
        var first = targetTopics[0], volume = saved.volume || helper.bookOf(first);
        if (!first || targetTopics.some(function (topic) { return !topic || topic.external || topic.subject !== pair[0] || helper.bookOf(topic) !== volume; })) return;
        var candidate = { subject: pair[0], volume: volume, topicId: first.id };
        if (!helper.build({ topics: achievementTopics, selection: candidate }).books.length) return;
        if (!latest || Date.parse(saved.savedAt) > latest.at) latest = { record: candidate, from: 'session', at: Date.parse(saved.savedAt) };
      } catch (error) { /* 损坏或无法归属的检测记录不用于教材选择。 */ }
    });
    return latest;
  }
  function achievementTopicHref(model, id) {
    var params = new URLSearchParams({ subject: model.subject });
    window.CnmBookSelection.writeParams(params, model.subject, model.volumes);
    return '../explore/?' + params.toString() + '#' + encodeURIComponent(id);
  }
  function renderAchievementBooks(childId) {
    var box = document.getElementById('achievement-books'), context = document.getElementById('achievement-books-context');
    var opened = new Set(Array.from(box.querySelectorAll('details[data-achievement-state][open]')).map(function (node) { return node.getAttribute('data-achievement-state'); }));
    box.textContent = '';
    if (achievementTopics === null) {
      context.textContent = achievementLoadFailed ? '教材进度暂时无法读取，请刷新页面重试。' : '正在读取教材范围…';
      return null;
    }
    var selected = achievementSelection(childId), helper = window.CnmAchievementBooks, P = window.CnmProgress;
    var model = helper && helper.build({ topics: achievementTopics, selection: selected && selected.record,
      normal: selected ? P.statuses(childId, selected.record.subject) : {},
      pro: selected ? P.statuses(childId, selected.record.subject, 'pro') : {} });
    if (!model || !model.books.length) {
      context.textContent = '尚未选择教材。请从首页选择教材，这里会显示对应知识点的完成情况。';
      return null;
    }
    context.textContent = (model.subject === 'physics' ? '初高中物理' : '小学科学') + ' · 已选 ' + model.books.length + ' 本教材 · 已通过 ' + model.completed + '/' + model.total +
      '，待完成 ' + model.remaining + '。' + (selected.from === 'graph' ? '范围与最近一次图谱选择一致。' : '沿用当前档案最近检测的教材。');
    function disclosure(className, key, label) {
      var node = el('details', className); node.setAttribute('data-achievement-state', (childId || 'guest') + '|' + model.subject + '|' + key);
      node.open = opened.has(node.getAttribute('data-achievement-state'));
      if (label) node.appendChild(el('summary', null, label));
      return node;
    }
    model.books.forEach(function (book) {
      var card = disclosure('achievement-book', book.volume, '');
      card.setAttribute('data-volume', book.volume); card.setAttribute('data-subject', book.subject);
      var summary = el('summary'), title = el('span', 'achievement-book-title', book.title);
      summary.appendChild(title);
      summary.appendChild(el('span', 'achievement-book-progress', '已通过 ' + book.completed + '/' + book.total + ' · 待完成 ' + book.remaining));
      card.appendChild(summary);
      var body = el('div', 'achievement-book-content'), progress = el('progress', 'achievement-book-meter');
      progress.max = book.total; progress.value = book.completed; progress.setAttribute('aria-label', book.title + ' 已通过 ' + book.completed + ' 个，共 ' + book.total + ' 个知识点');
      body.appendChild(progress);
      if (book.expert) body.appendChild(el('p', 'muted small', '⭐ 其中 ' + book.expert + ' 个已通过专家挑战'));
      [[true, '已通过', book.completed, 'passed'], [false, '待完成', book.remaining, 'remaining']].forEach(function (group) {
        var details = disclosure('achievement-book-' + group[3], book.volume + '|' + group[3], group[1] + '（' + group[2] + '）');
        if (!group[2]) details.appendChild(el('p', 'muted small', group[0] ? '还没有通过的知识点。' : '本册所有知识点均已通过。'));
        book.chapters.forEach(function (chapter) {
          var topics = chapter.topics.filter(function (topic) { return (topic.status === 'mastered') === group[0]; });
          if (!topics.length) return;
          details.appendChild(el('h4', 'achievement-topic-chapter', chapter.title));
          var list = el('ul', 'achievement-topic-list');
          topics.forEach(function (topic) {
            var row = el('li', 'achievement-topic-row'), link = el('a', 'achievement-topic-link', topic.name);
            link.href = achievementTopicHref(model, topic.id); link.setAttribute('data-topic-id', topic.id);
            row.appendChild(link);
            var status = topic.expert ? '⭐ 专家通过' : topic.status === 'mastered' ? '✓ 已通过' : topic.status === 'weak' ? '× 未通过' : topic.status === 'shaky' ? '× 待巩固' : '未检测';
            row.appendChild(el('span', 'achievement-topic-status ' + topic.status, status)); list.appendChild(row);
          });
          details.appendChild(list);
        });
        body.appendChild(details);
      });
      card.appendChild(body); box.appendChild(card);
    });
    return model;
  }
  function renderAchievements() {
    var P = window.CnmProgress;
    if (!P || !P.achievements) return;
    var current = CC.current(), id = current ? current.id : null, score = P.achievements(id);
    var ownerSelect = document.getElementById('achievement-owner'); ownerSelect.textContent = '';
    var guest = el('option', null, '本机访客'); guest.value = ''; ownerSelect.appendChild(guest);
    CC.list().forEach(function (child) { var option = el('option', null, child.name); option.value = child.id; ownerSelect.appendChild(option); });
    ownerSelect.value = id || '';
    document.getElementById('achievement-owner-name').textContent = '当前：' + (current ? current.name : '本机访客') + ' · 成就按档案分别保存';
    var scoreBox = document.getElementById('achievement-score'); scoreBox.textContent = '';
    var total = el('div', 'achievement-total');
    total.appendChild(el('strong', null, String(score.total))); total.appendChild(el('span', null, '累计总积分（⭐）')); scoreBox.appendChild(total);
    var medals = el('div', 'achievement-medals');
    [['🌞', score.suns, '太阳'], ['🌙', score.moons, '月亮'], ['⭐', score.stars, '星星']].forEach(function (row) {
      var item = el('span', 'achievement-medal'); item.setAttribute('aria-label', row[2] + ' ' + row[1] + ' 个');
      item.appendChild(el('span', 'achievement-icon', row[0])); item.appendChild(el('strong', null, '× ' + row[1])); medals.appendChild(item);
    });
    scoreBox.appendChild(medals);
    document.getElementById('achievement-breakdown').textContent = '累计普通通关 ' + score.normal + ' 个 · 累计专家通关 ' + score.pro + ' 个';
    var model = renderAchievementBooks(id);
    var list = document.getElementById('achievement-chapter-list'); list.textContent = '';
    if (achievementTopics === null) { document.getElementById('achievement-chapters-summary').textContent = '当前教材已解锁章节 · ' + (achievementLoadFailed ? '暂时无法读取' : '正在读取'); return; }
    if (!model) { document.getElementById('achievement-chapters-summary').textContent = '已解锁章节 · 请先选择教材'; return; }
    var selectedTopics = achievementTopics.filter(function (topic) { return topic.subject === model.subject && model.volumes.indexOf(window.CnmAchievementBooks.bookOf(topic)) >= 0; });
    var chapters = P.chapters(id, selectedTopics), unlocked = chapters.filter(function (chapter) { return chapter.unlocked; });
    document.getElementById('achievement-chapters-summary').textContent = '当前教材已解锁章节 ' + unlocked.length + ' / ' + chapters.length;
    if (!unlocked.length) list.appendChild(el('li', 'muted small', '还没有整章通关。完成一章内所有知识点的普通检测，即可在这里点亮章节。'));
    unlocked.forEach(function (chapter) {
      var item = el('li'), link = el('a', null, '✓ ' + chapter.book + ' · ' + chapter.title);
      link.href = achievementTopicHref(model, chapter.firstTopicId);
      item.appendChild(link); item.appendChild(el('span', 'muted small', ' ' + chapter.completed + '/' + chapter.total)); list.appendChild(item);
    });
  }
  document.getElementById('achievement-owner').addEventListener('change', function (event) {
    if (CC.setCurrent(event.target.value || null)) render();
  });
  function renderLearningOverview() {
    renderAchievements();
    var learning = window.CnmLocalLearning;
    if (!learning) return;
    var current = CC.current(), childId = current ? current.id : null;
    var rows = learning.weakPoints({ childId: childId });
    var weakList = document.getElementById('center-weak-list');
    weakList.textContent = '';
    document.getElementById('weak-points-count').textContent = rows.length + ' 个';
    document.getElementById('weak-points-owner').textContent = '当前：' + (current ? current.name : '本机访客') + ' · 共 ' + rows.length + ' 个';
    document.getElementById('center-weak-all').href = 'history.html?' + (childId ? 'child=' + encodeURIComponent(childId) : 'scope=guest');
    if (!rows.length) weakList.appendChild(el('li', 'muted small', '暂无薄弱知识点，完成检测后会在这里汇总。'));
    rows.slice(0, 5).forEach(function (row) {
      var item = el('li', 'center-learning-item'), info = el('div', 'center-learning-info');
      var name = el('a', 'center-topic-name', topicNames[row.id] || row.id);
      name.href = '../explore/?subject=' + row.subject + '#' + encodeURIComponent(row.id);
      info.appendChild(name);
      info.appendChild(el('span', 'kid-tag ' + (row.status === 'weak' ? 'weak' : row.status === 'retest' ? 'unk' : 'shaky'), row.status === 'weak' ? '薄弱' : row.status === 'retest' ? '待复测' : '不稳'));
      info.appendChild(el('span', 'muted small', row.subject === 'physics' ? '物理' : '小学科学'));
      item.appendChild(info);
      var retest = el('a', 'btn center-retest', '再测');
      retest.href = '../diagnose/?subject=' + row.subject + '&target=' + encodeURIComponent(row.id) + '&retry=1';
      item.appendChild(retest);
      weakList.appendChild(item);
    });
    document.getElementById('legacy-weak-details').hidden = !learning.legacyWeakPoints({}).length;
    var saved = learning.savedSessions(), section = document.getElementById('center-sessions');
    var sessions = document.getElementById('center-session-list');
    sessions.textContent = '';
    section.hidden = !saved.length;
    saved.forEach(function (entry) {
      var item = el('li', 'center-learning-item'), info = el('div', 'center-learning-info');
      info.appendChild(el('strong', null, (entry.subject === 'physics' ? '物理' : '小学科学') + (entry.level === 'pro' ? ' · 专家挑战' : '') + ' · ' + cleanLabel(entry.label)));
      info.appendChild(el('span', 'muted small', entry.ownerLabel + ' · 已答 ' + entry.answered + ' 题'));
      item.appendChild(info);
      var resume = el('a', 'btn', entry.completed ? '查看结果' : '继续查看');
      resume.href = entry.href;
      item.appendChild(resume);
      sessions.appendChild(item);
    });
  }

  function renderArchivedSessions() {
    var section = document.getElementById('session-archive');
    var box = document.getElementById('archived-sessions');
    var status = document.getElementById('archive-status');
    box.textContent = '';
    try {
      var archive = CC.archivedSessions();
      section.hidden = !archive.items.length;
      archive.items.forEach(function (entry) {
        var row = el('li');
        var subjectName = entry.subject === 'physics' ? '物理' : '科学';
        row.appendChild(el('span', null, subjectName + (entry.level === 'pro' ? ' · 专家挑战' : '') + ' · ' + String(entry.label).replace(/\u8bca\u65ad/g, '检测') + ' · 已答 ' + entry.answered + ' 题 · ' +
          new Date(entry.savedAt).toLocaleString('zh-CN') + ' '));
        var restore = el('button', null, '恢复这份进度');
        restore.type = 'button';
        restore.addEventListener('click', function () {
          try {
            var subject = CC.restoreArchivedSession(entry.index, archive.token);
            renderArchivedSessions();
            status.className = 'small';
            status.textContent = '进度已恢复。';
            var link = el('a', null, '打开' + subjectName + '检测');
            link.href = '../diagnose/?subject=' + subject + '&resume=1';
            status.appendChild(link);
            renderLearningOverview();
            section.hidden = false;
          } catch (error) {
            renderArchivedSessions();
            status.className = 'small err';
            status.textContent = error.message || '恢复失败，请重试。';
          }
          status.hidden = false;
        });
        row.appendChild(restore);
        box.appendChild(row);
      });
    } catch (error) {
      section.hidden = false;
      status.className = 'small err';
      status.textContent = error.message || '无法读取检测进度。';
      status.hidden = false;
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = { name: nameIn.value, grade: gradeSel.value, textbook: bookSel.value };
    var res = editing ? CC.update(editing, f) : CC.add(f);
    if (!res.ok) { showError(res.error); return; }
    if (!editing && window.cnmTrack) window.cnmTrack('child_added');
    resetForm();
    render();
    if (!formCard.hidden) formCard.querySelector('summary').focus({ preventScroll: true });
  });
  cancelBtn.addEventListener('click', function () {
    resetForm(); render();
    if (!formCard.hidden) formCard.querySelector('summary').focus({ preventScroll: true });
  });

  function clearImport(keepFile) {
    fileRequest++;
    pendingBackup = null;
    pendingPreview = null;
    if (keepFile !== true) importFile.value = '';
    importPreview.hidden = true;
    importError.hidden = true;
    importStatus.hidden = true;
    confirmImport.disabled = true;
  }
  function showImportError(error) {
    importError.textContent = (error && error.message) || '导入失败，档案未改变。';
    importError.hidden = false;
  }
  function previewBackup(backup) {
    var preview = CC.previewImport(backup);
    pendingBackup = backup;
    pendingPreview = preview;
    document.getElementById('import-summary').textContent =
      '新增 ' + preview.addedChildren + ' 个孩子，合并 ' + preview.matchedChildren + ' 个已有档案；' +
      '新增 ' + preview.addedRecords + ' 条记录，更新 ' + preview.updatedRecords + ' 条记录；' +
      '新增错题 ' + preview.addedWrongs + ' 道、更新 ' + preview.updatedWrongs + ' 道；' +
      '新增薄弱知识点 ' + preview.addedBlindspots + ' 个、更新 ' + preview.updatedBlindspots + ' 个；' +
      '恢复检测进度 ' + preview.restoredSessions + ' 份、归档 ' + preview.archivedSessions + ' 份。' +
      '图谱检测记录新增 ' + preview.addedProgress + ' 份、更新 ' + preview.updatedProgress + ' 份。' +
      (preview.legacy ? '这是旧版档案备份，不包含错题、进行中检测和薄弱知识点台账。' : '');
    var children = document.getElementById('import-children');
    children.textContent = '';
    preview.children.forEach(function (c) {
      var action = c.action === 'rename' ? '同名档案，将改名为「' + c.name + '」' : c.action === 'merge' ? '合并到已有档案' : '新增档案';
      children.appendChild(el('li', null, c.sourceName + '：' + action + '，合并后 ' + c.records + ' 条记录'));
    });
    importPreview.hidden = false;
    confirmImport.disabled = false;
  }
  importFile.addEventListener('change', function () {
    var file = importFile.files[0];
    clearImport(true);
    if (!file) return;
    var request = fileRequest;
    if (file.size > CC.MAX_BACKUP_BYTES) { importFile.value = ''; showImportError(new Error('备份文件不能超过 10 MB。')); return; }
    importStatus.textContent = '正在读取备份文件…';
    importStatus.hidden = false;
    file.text().then(function (text) {
      if (request !== fileRequest) return;
      importStatus.hidden = true;
      previewBackup(CC.parseBackup(text));
    }).catch(function (error) {
      if (request !== fileRequest) return;
      importStatus.hidden = true;
      importFile.value = '';
      showImportError(error);
    });
  });
  document.getElementById('cancel-import').addEventListener('click', clearImport);
  confirmImport.addEventListener('click', function () {
    if (!pendingBackup || !pendingPreview) return;
    confirmImport.disabled = true;
    importError.hidden = true;
    try {
      var result = CC.importBackup(pendingBackup, pendingPreview.token);
      clearImport();
      resetForm();
      render();
      importStatus.textContent = '导入完成：新增 ' + result.addedChildren + ' 个孩子，合并 ' + result.matchedChildren +
        ' 个已有档案；新增记录 ' + result.addedRecords + ' 条、错题 ' + result.addedWrongs + ' 道、薄弱知识点 ' +
        result.addedBlindspots + ' 个；恢复进度 ' + result.restoredSessions + ' 份，归档进度 ' + result.archivedSessions +
        ' 份；图谱检测记录新增 ' + result.addedProgress + ' 份、更新 ' + result.updatedProgress + ' 份。';
      importStatus.hidden = false;
    } catch (error) {
      // 失败后重新计算预览，防止其他页面的修改让旧预览失效。
      try { previewBackup(pendingBackup); }
      catch (previewError) { pendingPreview = null; importPreview.hidden = true; }
      showImportError(error);
    }
  });

  exportBtn.addEventListener('click', function () {
    var url = null;
    var link = null;
    try {
      var backup = CC.exportBackup();
      var blob = new Blob([JSON.stringify(backup)], { type: 'application/json;charset=utf-8' });
      url = URL.createObjectURL(blob);
      link = el('a');
      link.href = url;
      link.download = 'learning-backup-' + backup.exportedAt.replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link);
      link.click();
      exportStatus.className = 'small';
      exportStatus.textContent = '已生成备份文件，请在浏览器下载列表中查看。';
    } catch (e) {
      exportStatus.className = 'small err';
      exportStatus.textContent = (e && e.message) || '导出失败，请重试。';
    } finally {
      if (link) link.remove();
      // 给浏览器时间接管下载，再释放临时地址。
      if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      exportStatus.hidden = false;
    }
  });

  resetForm();
  render();
  function revealWeakPoints() {
    if (location.hash === '#weak-points') document.getElementById('weak-points').open = true;
  }
  revealWeakPoints();
  if (window.addEventListener) {
    window.addEventListener('storage', renderLearningOverview);
    window.addEventListener('focus', renderLearningOverview);
    window.addEventListener('cnm:progress', renderLearningOverview);
    window.addEventListener('hashchange', revealWeakPoints);
  }
  fetch('../data/topics.json').then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('教材数据格式错误');
    achievementTopics = rows;
    rows.forEach(function (topic) { if (topic && typeof topic.id === 'string') topicNames[topic.id] = topic.name; });
    renderLearningOverview();
  }).catch(function () {
    achievementLoadFailed = true;
    renderAchievements();
  });
})();
