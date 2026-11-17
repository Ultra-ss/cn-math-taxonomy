/* 个人中心的头像与拼图装扮。兑换、余额和穿戴只通过 AvatarRewards 记账。 */
(function (root) {
  'use strict';
  var mounted = [], serial = 0;
  function node(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function picture(src, alt, cls) {
    var img = node('img', cls); img.src = src || ''; img.alt = alt || ''; img.decoding = 'async';
    return img;
  }
  function mount(container) {
    if (!container) return null;
    if (container.__avatarCenter) return container.__avatarCenter;
    var Catalog = root.CnmAvatarCatalog, Rewards = root.CnmAvatarRewards, CC = root.CnmChildren;
    if (!Catalog || !Rewards || !CC) return null;
    var skins = Array.isArray(Catalog.skins) ? Catalog.skins : [];
    var cats = Array.isArray(Catalog.cats) ? Catalog.cats : [];
    var defaultCat = Catalog.DEFAULT_CAT || 'cat-snow';
    if (!skins.length) return null;
    var uid = 'avatar-reveal-' + (++serial), selected = {}, ownerId = null, lastOwner = null, summary = null;
    var busy = false, busyLabel = '', mountedAlive = true, statusMessage = '', statusError = false;
    var sharing = Object.create(null), shareMessages = Object.create(null);
    var shell = node('div', 'avatar-center-content'), dialog = node('dialog', 'avatar-reveal');
    var workshop = node('details', 'avatar-workshop'), compact = node('summary', 'avatar-workshop-summary');
    var compactTitleId = uid + '-compact-title';
    var mobile = root.matchMedia('(max-width: 600px)'), mobileOpen = false, wasMobile = mobile.matches;
    var galleryScroll = 0;
    var cleanups = [];
    workshop.append(compact, shell); workshop.open = !mobile.matches;
    container.classList.add('avatar-center'); container.textContent = ''; container.append(workshop, dialog);
    dialog.setAttribute('aria-labelledby', uid + '-title'); dialog.setAttribute('aria-modal', 'true');
    function on(target, type, fn) { target.addEventListener(type, fn); cleanups.push(function () { target.removeEventListener(type, fn); }); }
    function current() { return CC.current(); }
    function owner() { var c = current(); return c ? c.id : null; }
    function sameOwner(a, b) { return (a || '') === (b || ''); }
    function ownerKey(id) { return id || 'guest'; }
    function syncWorkshop() {
      var toggle = compact.querySelector('.avatar-workshop-toggle');
      if (toggle) toggle.textContent = workshop.open ? '收起' : '展开';
      compact.setAttribute('aria-expanded', workshop.open ? 'true' : 'false');
      container.setAttribute('aria-labelledby', mobile.matches ? compactTitleId : 'avatar-center-title');
    }
    function resizedWorkshop() {
      if (wasMobile) mobileOpen = workshop.open;
      wasMobile = mobile.matches;
      workshop.open = mobile.matches ? mobileOpen : true;
      syncWorkshop();
    }
    on(workshop, 'toggle', function () { if (mobile.matches) mobileOpen = workshop.open; syncWorkshop(); });
    if (mobile.addEventListener) on(mobile, 'change', resizedWorkshop);
    else if (mobile.addListener) { mobile.addListener(resizedWorkshop); cleanups.push(function () { mobile.removeListener(resizedWorkshop); }); }
    function catId() { return summary && summary.catId || defaultCat; }
    function cat(id) { return cats.find(function (item) { return item.id === (id || catId()); }) || cats[0] || { id: defaultCat, name: '小猫' }; }
    function get(id, selectedCat) {
      var found = id === 'default' ? Catalog.defaultAvatar : skins.find(function (skin) { return skin.id === id; });
      return found ? Catalog.get && Catalog.get(id, selectedCat || catId()) || found : null;
    }
    function duplicateChance() { return typeof Rewards.DUPLICATE_CHANCE === 'number' ? Rewards.DUPLICATE_CHANCE : 10; }
    function imageOf(skin) { return skin && (skin.image || skin.src || skin.imageUrl) || ''; }
    function collection(id) {
      var value = summary && summary.collections && summary.collections[id];
      return value || { pieces: [], count: 0, draws: 0, unlocked: false };
    }
    function count(value) { return Array.isArray(value.pieces) ? value.pieces.length : value.count || 0; }
    function chosen() {
      var key = ownerKey(ownerId), id = selected[key];
      if (!get(id)) {
        id = summary && summary.equipped !== 'default' && get(summary.equipped) ? summary.equipped : '';
        if (!id) {
          var started = skins.filter(function (skin) { var c = collection(skin.id); return count(c) > 0 && !c.unlocked; });
          started.sort(function (a, b) { return count(collection(b.id)) - count(collection(a.id)); });
          id = started.length ? started[0].id : skins[0].id;
        }
        selected[key] = id;
      }
      return get(id) || skins[0];
    }
    function closeReveal() {
      if (!dialog.open) return;
      if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    }
    function restoreFocus() {
      if (!mountedAlive || !container.isConnected) return;
      if (!workshop.open) { compact.focus({ preventScroll: true }); return; }
      var button = shell.querySelector('[data-avatar-action="draw"]:not(:disabled)') || shell.querySelector('[data-avatar-skin][aria-selected="true"]');
      if (button) button.focus({ preventScroll: true });
    }
    on(dialog, 'close', restoreFocus);
    on(dialog, 'cancel', function (event) { event.preventDefault(); closeReveal(); });
    on(dialog, 'click', function (event) {
      if (event.target !== dialog) return;
      var box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeReveal();
    });
    function note(text, bad) { statusMessage = text; statusError = !!bad; }
    function explain(code) {
      return ({ insufficient_moons: '可兑换月亮还不够。每累计 3⭐ 就能获得 1🌙 兑换额度，继续学习后再来吧。',
        already_unlocked: '这套装扮已经集齐，无需再消耗月亮。', locked_skin: '集齐这套装扮的 9 块不同拼图后，就可以穿戴。',
        invalid_owner: '当前账号已变更，请重新选择账号后再试。', invalid_skin: '这套装扮暂时无法读取，请刷新后再试。',
        invalid_cat: '这只猫咪暂时无法读取，请刷新页面后重试。',
        progress_unavailable: '学习积分暂时无法读取，月亮未扣除，请刷新页面后重试。',
        random_unavailable: '浏览器暂时无法打开拼图，月亮未扣除，请稍后重试。',
        storage_unavailable: '兑换没有保存成功，月亮未扣除。请确认浏览器允许保存本地数据后重试。',
        invalid_store: '装扮记录暂时无法读取。为保留原记录，已暂停兑换，请先导出学习数据备份。' })[code] || '本次操作没有完成，月亮未扣除，请稍后重试。';
    }
    function selectSkin(id, focus) {
      selected[ownerKey(ownerId)] = id; note('', false); render();
      var tab = shell.querySelector('[data-avatar-skin="' + id + '"]');
      if (tab && focus) {
        tab.focus({ preventScroll: true });
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      }
    }
    function pieceTile(skin, piece, cls) {
      var tile = node('div', 'avatar-piece ' + (cls || ''));
      var img = picture(imageOf(skin), '', 'avatar-piece-art');
      img.style.left = -(piece % 3) * 100 + '%'; img.style.top = -Math.floor(piece / 3) * 100 + '%';
      tile.appendChild(img); tile.setAttribute('data-piece', String(piece + 1));
      return tile;
    }
    async function chooseCat(id) {
      if (busy || !Rewards.setCat) return;
      var account = owner();
      busy = true; busyLabel = '正在切换猫咪…'; note('', false); shareMessages[ownerKey(account)] = null; render();
      try {
        var result = await Rewards.setCat(account, id);
        if (!mountedAlive) return;
        if (sameOwner(owner(), account)) note(result && result.ok ? '已选择「' + cat(id).name + '」，服装和拼图进度会保留。' : explain(result && result.code), !result || !result.ok);
      } catch (error) { if (mountedAlive && sameOwner(owner(), account)) note('猫咪选择暂时没有保存成功，请稍后重试。', true); }
      finally { busy = false; busyLabel = ''; if (mountedAlive) render(); }
    }
    async function shareAvatar() {
      var account = owner(), key = ownerKey(account);
      if (sharing[key]) return;
      var person = current(), saved = Rewards.summary(account), activeCat = saved.catId || defaultCat;
      var avatar = get(saved.equipped || 'default', activeCat);
      var options = { image: imageOf(avatar), username: person ? person.name : '本机访客', createdAt: person && person.createdAt || null };
      var label = cat(activeCat).name + (saved.equipped === 'default' ? '默认形象' : ' · ' + avatar.name);
      sharing[key] = true; shareMessages[key] = null; render();
      try {
        if (!root.CnmAvatarShare || !root.CnmAvatarShare.download) throw new Error('图片保存功能暂时不可用，请刷新后重试。');
        var result = await root.CnmAvatarShare.download(options);
        if (!result || !result.ok) throw new Error('图片暂时没有保存成功，请稍后重试。');
        shareMessages[key] = { text: '已保存「' + label + '」个人秀图片。', error: false };
      } catch (error) {
        shareMessages[key] = { text: '保存失败：' + String(error && error.message || '请稍后重试。').slice(0, 160), error: true };
      } finally { sharing[key] = false; if (mountedAlive) render(); }
    }
    async function wear(id, account) {
      if (busy) return;
      busy = true; busyLabel = '正在保存装扮…'; shareMessages[ownerKey(account)] = null; render();
      try {
        var result = await Rewards.equip(account, id);
        if (!mountedAlive) return;
        if ((!result || !result.ok) && sameOwner(owner(), account)) note(explain(result && result.code), true);
        else if (result && result.ok && sameOwner(owner(), account)) note(id === 'default' ? '已恢复默认形象。' : '已穿戴「' + get(id).name + '」。', false);
      } catch (error) { if (mountedAlive && sameOwner(owner(), account)) note('装扮暂时没有保存成功，请稍后重试。', true); }
      finally { busy = false; busyLabel = ''; if (mountedAlive) render(); }
    }
    function reveal(result, skin, account, nickname) {
      dialog.textContent = '';
      var top = node('div', 'avatar-reveal-top');
      top.appendChild(node('span', 'avatar-reveal-kicker', result.unlocked ? '九块拼图，完整相遇' : '月亮拼图'));
      var title = node('h2', '', result.unlocked ? '装扮解锁了！' : result.duplicate ? '抽到重复拼图' : '获得新拼图');
      title.id = uid + '-title'; top.appendChild(title); dialog.appendChild(top);
      if (result.unlocked) dialog.appendChild(picture(imageOf(skin), skin.name, 'avatar-reveal-full'));
      else {
        var sample = pieceTile(skin, result.piece, 'avatar-reveal-piece');
        sample.appendChild(node('span', 'avatar-piece-number', String(result.piece + 1))); dialog.appendChild(sample);
      }
      dialog.appendChild(node('p', 'avatar-reveal-name', skin.name + (result.unlocked ? '' : ' · 第 ' + (result.piece + 1) + ' 块')));
      dialog.appendChild(node('p', 'avatar-reveal-message', result.unlocked ? '9 / 9 块不同拼图已集齐。这套装扮现在可以永久穿戴。'
        : result.duplicate ? '本次无效：这块拼图已经拥有，仍消耗 1🌙，不增加收集进度。' : '新的一块已放进拼图。集齐 9 块不同拼图即可解锁装扮。'));
      dialog.appendChild(node('p', 'avatar-reveal-owner', nickname + ' · 本次消耗 1🌙'));
      var actions = node('div', 'avatar-reveal-actions');
      var done = node('button', result.unlocked ? '' : 'primary', result.unlocked ? '稍后再穿' : '收好了'); done.type = 'button';
      done.addEventListener('click', closeReveal); actions.appendChild(done);
      if (result.unlocked) {
        var equip = node('button', 'primary', '立即穿戴'); equip.type = 'button';
        equip.addEventListener('click', function () { closeReveal(); if (sameOwner(owner(), account)) wear(skin.id, account); });
        actions.appendChild(equip);
      }
      dialog.appendChild(actions);
      dialog.classList.toggle('is-duplicate', !!result.duplicate); dialog.classList.toggle('is-unlock', !!result.unlocked);
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      done.focus({ preventScroll: true });
    }
    async function draw(skin) {
      if (busy) return;
      var account = owner(), c = current(), nickname = c ? c.name : '本机访客';
      // 图源在兑换开始时捕获，等待期间换猫或换账号不会把结果换成另一只猫。
      var requestSkin = get(skin.id, catId());
      busy = true; busyLabel = '正在打开拼图…'; note('', false); render();
      var result;
      try { result = await Rewards.draw(account, skin.id); }
      catch (error) { result = { ok: false, code: 'storage_unavailable' }; }
      busy = false; busyLabel = '';
      if (!mountedAlive) return;
      if (!result || !result.ok) note(explain(result && result.code), true);
      else if (!sameOwner(owner(), account)) note('兑换结果已为「' + nickname + '」保存，切回该账号即可查看。', false);
      else note(result.duplicate ? '本次无效：重复拼图未计入，本次消耗 1🌙。' : '第 ' + (result.piece + 1) + ' 块拼图已加入「' + skin.name + '」。', false);
      render();
      if (result && result.ok && sameOwner(owner(), account)) reveal(result, requestSkin, account, nickname);
    }
    function render() {
      if (!mountedAlive) return;
      var c = current(), nextOwner = c ? c.id : null;
      var changedOwner = lastOwner !== null && !sameOwner(ownerId, nextOwner);
      if (changedOwner) { closeReveal(); note('', false); mobileOpen = false; galleryScroll = 0; }
      else if (mobile.matches) mobileOpen = workshop.open;
      workshop.open = !mobile.matches || mobileOpen;
      ownerId = nextOwner; lastOwner = ownerKey(ownerId);
      summary = Rewards.summary(ownerId);
      var oldGallery = shell.querySelector('.avatar-gallery');
      if (oldGallery && !changedOwner && workshop.open) galleryScroll = oldGallery.scrollLeft;
      var scroll = changedOwner ? 0 : galleryScroll;
      var oldRules = shell.querySelector('.avatar-rules'), rulesOpen = !!(oldRules && oldRules.open);
      shell.textContent = '';
      var heading = node('div', 'avatar-section-heading');
      var titles = node('div'); titles.appendChild(node('span', 'avatar-eyebrow', '学习换来的小惊喜'));
      var h2 = node('h2', '', '我的装扮工坊'); h2.id = 'avatar-center-title'; titles.appendChild(h2); heading.appendChild(titles);
      heading.appendChild(node('span', 'avatar-season-tag', '10 套主题服装')); shell.appendChild(heading);
      var avatar = get(summary && summary.equipped || 'default') || Catalog.defaultAvatar;
      var currentCat = cat();
      compact.textContent = '';
      compact.appendChild(picture(imageOf(avatar), '', 'avatar-workshop-portrait'));
      var compactCopy = node('span', 'avatar-workshop-copy');
      var compactTitle = node('strong', 'avatar-workshop-title', '我的装扮工坊'); compactTitle.id = compactTitleId;
      compactCopy.appendChild(compactTitle);
      compactCopy.appendChild(node('span', 'avatar-workshop-meta', (c ? c.name : '本机访客') + ' · ' + currentCat.name));
      compactCopy.appendChild(node('span', 'avatar-workshop-balance', summary && summary.ok ? '可兑换 ' + summary.availableMoons + ' 🌙' : '余额暂不可用'));
      compact.append(compactCopy, node('span', 'avatar-workshop-toggle'));
      syncWorkshop();
      var hero = node('div', 'avatar-hero');
      var portrait = node('div', 'avatar-portrait'); portrait.appendChild(picture(imageOf(avatar), avatar.name, 'avatar-portrait-image'));
      var info = node('div', 'avatar-hero-info'); info.appendChild(node('p', 'avatar-owner-name', c ? c.name : '本机访客'));
      info.appendChild(node('p', 'avatar-equipped-name', currentCat.name + (avatar.id === 'default' ? ' · 默认形象' : ' · ' + avatar.name)));
      var heroActions = node('div', 'avatar-hero-actions');
      var share = node('button', 'avatar-share-button', sharing[ownerKey(ownerId)] ? '保存中…' : '晒一晒'); share.type = 'button';
      share.setAttribute('data-avatar-action', 'share'); share.disabled = !!sharing[ownerKey(ownerId)];
      share.setAttribute('aria-label', sharing[ownerKey(ownerId)] ? '正在保存个人秀图片' : '晒一晒，保存当前形象的个人秀图片');
      share.addEventListener('click', shareAvatar); heroActions.appendChild(share);
      if (summary && summary.equipped !== 'default') {
        var reset = node('button', 'avatar-text-button', '恢复默认形象'); reset.type = 'button'; reset.disabled = busy;
        reset.addEventListener('click', function () { wear('default', ownerId); }); heroActions.appendChild(reset);
      }
      info.appendChild(heroActions);
      var shared = shareMessages[ownerKey(ownerId)];
      var shareStatus = node('p', 'avatar-share-status' + (shared && shared.error ? ' is-error' : ''), shared ? shared.text : '');
      shareStatus.setAttribute('role', shared && shared.error ? 'alert' : 'status'); shareStatus.setAttribute('aria-live', 'polite'); shareStatus.hidden = !shared; info.appendChild(shareStatus);
      hero.append(portrait, info); shell.appendChild(hero);
      if (cats.length) {
        var catHeading = node('div', 'avatar-cat-heading'); catHeading.appendChild(node('h3', '', '选择你的猫咪')); catHeading.appendChild(node('span', '', '三只都免费')); shell.appendChild(catHeading);
        var options = node('div', 'avatar-cat-options'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', '免费基础猫咪');
        cats.forEach(function (item) {
          var pick = node('button', 'avatar-cat-option' + (item.id === currentCat.id ? ' is-selected' : '')); pick.type = 'button';
          pick.setAttribute('data-avatar-cat', item.id); pick.setAttribute('aria-pressed', item.id === currentCat.id ? 'true' : 'false'); pick.disabled = busy;
          pick.appendChild(picture(item.image || imageOf(get('default', item.id)), '', 'avatar-cat-image'));
          var label = node('span', 'avatar-cat-label'); label.appendChild(node('strong', '', item.name)); label.appendChild(node('span', '', item.id === currentCat.id ? '已选择' : '免费选择')); pick.appendChild(label);
          pick.addEventListener('click', function () { chooseCat(item.id); }); options.appendChild(pick);
        });
        shell.appendChild(options);
      }
      var unlocked = skins.filter(function (skin) { return collection(skin.id).unlocked; }).length;
      var wallet = node('div', 'avatar-wallet');
      var balance = node('div', 'avatar-wallet-main'); balance.appendChild(node('span', '', '可兑换月亮'));
      balance.appendChild(node('strong', '', summary && summary.ok ? summary.availableMoons + ' 🌙' : '暂不可用')); wallet.appendChild(balance);
      var walletNote = node('div', 'avatar-wallet-meta');
      walletNote.appendChild(node('span', '', '已解锁 ' + unlocked + ' / ' + skins.length + ' 套'));
      walletNote.appendChild(node('span', '', '累计使用 ' + (summary && summary.spentMoons || 0) + ' 🌙')); wallet.appendChild(walletNote); shell.appendChild(wallet);
      if (!c) {
        var guestNote = node('p', 'avatar-guest-note', '当前使用本机访客记录。添加新账号后，装扮与兑换额度会分别保存，不会自动转入新账号。');
        var create = node('a', '', '添加新账号'); create.href = '#form-card';
        create.addEventListener('click', function () { var form = document.getElementById('form-card'); if (form) form.open = true; });
        guestNote.appendChild(create); shell.appendChild(guestNote);
      }
      if (!summary || !summary.ok) {
        var error = node('p', 'avatar-status is-error', explain(summary && summary.code)); error.setAttribute('role', 'alert'); shell.appendChild(error);
      }
      var galleryHeading = node('div', 'avatar-gallery-heading'); galleryHeading.appendChild(node('h3', '', '选择想收集的服装'));
      galleryHeading.appendChild(node('span', '', '左右滑动查看')); shell.appendChild(galleryHeading);
      var skin = chosen(), gallery = node('div', 'avatar-gallery'); gallery.setAttribute('role', 'tablist'); gallery.setAttribute('aria-label', '装扮画册');
      skins.forEach(function (item, index) {
        var col = collection(item.id), tab = node('button', 'avatar-skin-tab' + (item.id === skin.id ? ' is-selected' : ''));
        tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('data-avatar-skin', item.id);
        tab.setAttribute('aria-selected', item.id === skin.id ? 'true' : 'false'); tab.setAttribute('aria-controls', 'avatar-collection-panel'); tab.tabIndex = item.id === skin.id ? 0 : -1;
        tab.appendChild(picture(imageOf(get(item.id)), '', 'avatar-skin-thumb')); tab.appendChild(node('span', 'avatar-skin-name', item.name));
        tab.appendChild(node('span', 'avatar-skin-progress', summary && summary.equipped === item.id ? '已穿戴' : col.unlocked ? '已解锁' : count(col) + ' / 9'));
        tab.addEventListener('click', function () { selectSkin(item.id, true); });
        tab.addEventListener('keydown', function (event) {
          var target = event.key === 'ArrowRight' ? (index + 1) % skins.length : event.key === 'ArrowLeft' ? (index + skins.length - 1) % skins.length : event.key === 'Home' ? 0 : event.key === 'End' ? skins.length - 1 : -1;
          if (target < 0) return; event.preventDefault(); selectSkin(skins[target].id, true);
        });
        gallery.appendChild(tab);
      });
      shell.appendChild(gallery); gallery.scrollLeft = scroll;
      gallery.addEventListener('scroll', function () { if (workshop.open) galleryScroll = gallery.scrollLeft; });
      if (changedOwner) { var activeTab = gallery.querySelector('[aria-selected="true"]'); if (activeTab) gallery.scrollLeft = Math.max(0, activeTab.offsetLeft - gallery.offsetLeft - 8); }
      var col = collection(skin.id), owned = Array.isArray(col.pieces) ? col.pieces : [];
      var panel = node('div', 'avatar-collection-panel'); panel.id = 'avatar-collection-panel'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-label', skin.name + '拼图');
      var boardWrap = node('div', 'avatar-board-wrap'), board = node('div', 'avatar-puzzle'); board.setAttribute('aria-label', skin.name + '，已收集 ' + owned.length + ' / 9 块拼图');
      for (var i = 0; i < 9; i++) {
        var has = owned.indexOf(i) >= 0, tile = pieceTile(skin, i, has ? 'is-owned' : 'is-missing');
        tile.setAttribute('aria-label', '第 ' + (i + 1) + ' 块，' + (has ? '已获得' : '待收集'));
        tile.appendChild(node('span', 'avatar-piece-number', String(i + 1)));
        if (!has) tile.appendChild(node('span', 'avatar-piece-waiting', '待收集')); board.appendChild(tile);
      }
      boardWrap.appendChild(board); panel.appendChild(boardWrap);
      var description = node('div', 'avatar-collection-info'); description.appendChild(node('span', 'avatar-collection-kicker', col.unlocked ? '已解锁装扮' : '正在收集'));
      description.appendChild(node('h3', '', skin.name)); description.appendChild(node('p', 'avatar-collection-cat', '正在为「' + currentCat.name + '」收集服装'));
      description.appendChild(node('p', 'avatar-description', skin.description));
      var progress = node('p', 'avatar-collection-progress'); progress.appendChild(node('strong', '', owned.length + ' / 9'));
      progress.appendChild(node('span', '', '块不同拼图')); description.appendChild(progress);
      var meter = node('progress', 'avatar-puzzle-meter'); meter.max = 9; meter.value = owned.length;
      meter.setAttribute('aria-label', skin.name + '收集进度'); description.appendChild(meter);
      var drawCount = col.drawCount === undefined ? col.draws || 0 : col.drawCount;
      description.appendChild(node('p', 'avatar-draw-count', '这套已兑换 ' + drawCount + ' 次' + (drawCount < 2 && !col.unlocked ? ' · 前两次保证不重复' : '')));
      var action = node('button', 'primary avatar-draw-button', busy ? busyLabel : col.unlocked ? summary.equipped === skin.id ? '正在穿戴' : '穿戴这套装扮' : '兑换拼图 · 1🌙');
      action.type = 'button'; action.setAttribute('data-avatar-action', col.unlocked ? 'equip' : 'draw');
      action.disabled = busy || !summary || !summary.ok || col.unlocked && summary.equipped === skin.id || !col.unlocked && summary.availableMoons < 1;
      action.addEventListener('click', function () { if (col.unlocked) wear(skin.id, ownerId); else draw(skin); }); description.appendChild(action);
      if (!col.unlocked && summary && summary.ok && summary.availableMoons < 1) {
        var earn = node('a', 'avatar-learn-link', '去知识图谱赚取月亮 →');
        var subject = root.CnmLastLocation && root.CnmLastLocation.currentSubject ? root.CnmLastLocation.currentSubject() : 'physics';
        earn.href = '../explore/?subject=' + (subject === 'science' ? 'science' : 'physics') + '&resume=1'; earn.setAttribute('data-resume-graph', ''); description.appendChild(earn);
      } else if (col.unlocked) description.appendChild(node('p', 'avatar-unlocked-note', '已集齐，不会再消耗月亮兑换这套拼图。'));
      else description.appendChild(node('p', 'avatar-draw-note', '第 3 次起 ' + duplicateChance() + '% 概率重复；重复本次无效，仍消耗 1🌙。'));
      panel.appendChild(description); shell.appendChild(panel);
      var rules = node('details', 'avatar-rules'), ruleSummary = node('summary', '', '月亮与拼图兑换规则'); rules.open = rulesOpen; rules.appendChild(ruleSummary);
      var ruleList = node('ul');
      ['每累计 3⭐ 产生 1🌙 兑换额度，历史成就与累计总积分保留。',
        '先免费选择猫咪，再选择想收集的服装，每次用 1🌙 兑换其中一块拼图。同一套前两次保证不重复。',
        '从第 3 次起，每次有 ' + duplicateChance() + '% 概率抽到重复拼图，' + (100 - duplicateChance()) + '% 概率获得未拥有的新拼图。重复本次无效，仍消耗 1🌙，不增加收集进度。',
        '集齐 9 块不同拼图即可永久解锁服装；三只猫咪都可以穿已解锁的服装，换猫不影响拼图进度。',
        '所有记录按本地账号分别保存。换设备或清理浏览器前，请先在下方导出学习数据备份。'].forEach(function (text) { ruleList.appendChild(node('li', '', text)); });
      rules.appendChild(ruleList); shell.appendChild(rules);
      var status = node('p', 'avatar-status' + (statusError ? ' is-error' : '')); status.setAttribute('role', statusError ? 'alert' : 'status'); status.setAttribute('aria-live', 'polite');
      status.textContent = statusMessage; status.hidden = !statusMessage; shell.appendChild(status);
      syncWorkshop();
    }
    function refresh() { render(); }
    function handleStore() { render(); }
    on(root, 'cnm:avatar-rewards', handleStore); on(root, 'cnm:progress', handleStore); on(root, 'storage', handleStore); on(root, 'focus', handleStore);
    render();
    var instance = { refresh: refresh, destroy: function () { mountedAlive = false; closeReveal(); cleanups.forEach(function (fn) { fn(); }); cleanups = []; container.__avatarCenter = null; var index = mounted.indexOf(instance); if (index >= 0) mounted.splice(index, 1); } };
    container.__avatarCenter = instance; mounted.push(instance); return instance;
  }
  root.CnmAvatarCenter = { mount: mount, refresh: function () { mounted.forEach(function (instance) { instance.refresh(); }); } };
  function boot() { mount(document.getElementById('avatar-center')); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window);
