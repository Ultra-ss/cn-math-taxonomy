/* 晒一晒：只导出已捕获的个人形象，不读取或修改账号、积分和装扮记录。 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CnmAvatarShare = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var WIDTH = 1200, HEIGHT = 1600;
  var FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
  function capture(input) {
    var value = input || {};
    return { image: typeof value.image === 'string' ? value.image : '',
      username: typeof value.username === 'string' ? value.username : '',
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : null };
  }
  function metadata(input) {
    var value = capture(input);
    var name = Array.from(value.username.normalize('NFC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim()).slice(0, 12).join('') || '本机访客';
    var registration = '本机访客 · 未注册';
    if (value.createdAt !== null) {
      var date = new Date(value.createdAt);
      registration = Number.isFinite(date.getTime()) ? '注册时间：' + date.getFullYear() + '年' +
        String(date.getMonth() + 1).padStart(2, '0') + '月' + String(date.getDate()).padStart(2, '0') + '日' : '注册时间：未记录';
    }
    var filename = name.replace(/[\\/:*?"<>|]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '') || '个人形象';
    return { username: name, title: name + '的物理图谱个人秀', registration: registration,
      filename: filename + '-物理图谱个人秀.png', width: WIDTH, height: HEIGHT };
  }
  function round(ctx, x, y, width, height, radius) {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius); ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
  }
  function titleLayout(ctx, info) {
    var size = 60, maxWidth = 952, lines = [info.title];
    ctx.font = '700 ' + size + 'px ' + FONT;
    if (ctx.measureText(info.title).width > maxWidth) lines = [info.username + '的', '物理图谱个人秀'];
    while (size > 36 && lines.some(function (line) { return ctx.measureText(line).width > maxWidth; })) {
      size -= 2; ctx.font = '700 ' + size + 'px ' + FONT;
    }
    return { size: size, lines: lines, baselines: lines.length === 1 ? [236] : [204, 282], maxWidth: maxWidth };
  }
  function create(env) {
    env = env || root;
    function later(fn, ms) { return (env.setTimeout || root.setTimeout).call(env, fn, ms); }
    function clear(id) { (env.clearTimeout || root.clearTimeout).call(env, id); }
    function fontsReady() {
      var fonts;
      try { fonts = env.document && env.document.fonts; } catch (error) { return Promise.resolve(); }
      if (!fonts || !fonts.ready || typeof fonts.ready.then !== 'function') return Promise.resolve();
      return new Promise(function (resolve) {
        var done = false, timer;
        function finish() { if (done) return; done = true; if (timer !== undefined) clear(timer); resolve(); }
        timer = later(finish, 1800); Promise.resolve(fonts.ready).then(finish, finish);
      });
    }
    function imageURL(value) {
      try {
        var base = env.location && env.location.href, origin = env.location && env.location.origin;
        var url = new URL(value, base);
        if (!value || !origin || url.origin !== origin || !/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error();
        return url.href;
      } catch (error) { throw new Error('形象图片地址无效，请刷新个人中心后重试。'); }
    }
    function loadImage(url) {
      return new Promise(function (resolve, reject) {
        if (typeof env.Image !== 'function') { reject(new Error('当前浏览器暂不支持生成图片。')); return; }
        var image = new env.Image(), settled = false;
        var timer = later(function () { fail(); }, 10000);
        function finish(error) {
          if (settled) return; settled = true; clear(timer); image.onload = image.onerror = null;
          if (error) reject(error); else resolve(image);
        }
        function fail() { finish(new Error('形象图片暂未加载成功，请稍后再试。')); }
        image.crossOrigin = 'anonymous'; image.decoding = 'async';
        image.onerror = fail;
        image.onload = function () {
          Promise.resolve().then(function () { return typeof image.decode === 'function' ? image.decode() : null; }).then(function () {
            if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) fail(); else finish();
          }, fail);
        };
        image.src = url;
      });
    }
    function paint(canvas, ctx, image, info) {
      canvas.width = WIDTH; canvas.height = HEIGHT;
      var wash = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      wash.addColorStop(0, '#eee8f2'); wash.addColorStop(0.48, '#f4eddc'); wash.addColorStop(1, '#dfe9ee');
      ctx.fillStyle = wash; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.save(); ctx.shadowColor = 'rgba(77,63,87,.12)'; ctx.shadowBlur = 38; ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#fffcf9'; round(ctx, 58, 58, 1084, 1484, 44); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#d7cedd'; ctx.lineWidth = 2; round(ctx, 58, 58, 1084, 1484, 44); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#81718d';
      ctx.font = '500 27px ' + FONT; ctx.fillText('全网路物理学习图谱', WIDTH / 2, 124);
      var layout = titleLayout(ctx, info);
      ctx.fillStyle = '#5e4c6c'; ctx.font = '700 ' + layout.size + 'px ' + FONT;
      layout.lines.forEach(function (line, i) { ctx.fillText(line, WIDTH / 2, layout.baselines[i]); });
      ctx.fillStyle = '#f3edf5'; round(ctx, 124, 346, 952, 952, 34); ctx.fill();
      ctx.save(); round(ctx, 143, 365, 914, 914, 24); ctx.clip(); ctx.drawImage(image, 143, 365, 914, 914); ctx.restore();
      ctx.strokeStyle = '#e0d8e4'; ctx.lineWidth = 2; round(ctx, 124, 346, 952, 952, 34); ctx.stroke();
      ctx.fillStyle = '#4e455a'; ctx.font = '650 41px ' + FONT; ctx.fillText('用户名：' + info.username, WIDTH / 2, 1376);
      ctx.fillStyle = '#776c80'; ctx.font = '400 32px ' + FONT; ctx.fillText(info.registration, WIDTH / 2, 1434);
      ctx.strokeStyle = '#ddd6df'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(426, 1470); ctx.lineTo(774, 1470); ctx.stroke();
      ctx.fillStyle = '#8a8091'; ctx.font = '400 24px ' + FONT; ctx.fillText('physicalmap.pages.dev', WIDTH / 2, 1513);
    }
    async function render(input) {
      var value = capture(input), info = metadata(value), url = imageURL(value.image);
      if (!env.document || typeof env.document.createElement !== 'function') throw new Error('当前浏览器暂不支持生成图片。');
      var image = (await Promise.all([loadImage(url), fontsReady()]))[0];
      var canvas, ctx;
      try { canvas = env.document.createElement('canvas'); ctx = canvas.getContext && canvas.getContext('2d'); }
      catch (error) { throw new Error('当前浏览器暂不支持 PNG 导出。'); }
      if (!ctx || typeof canvas.toBlob !== 'function') throw new Error('当前浏览器暂不支持 PNG 导出。');
      try { paint(canvas, ctx, image, info); }
      catch (error) { throw new Error('图片生成暂未完成，请刷新后重试。'); }
      return new Promise(function (resolve, reject) {
        var done = false, timer = later(function () { finish(null); }, 15000);
        function finish(blob, error) {
          if (done) return; done = true; clear(timer);
          if (error) reject(error);
          else if (blob && blob.size > 0 && blob.type === 'image/png') resolve(blob);
          else reject(new Error('PNG 生成失败，请稍后重试。'));
        }
        try {
          canvas.toBlob(function (blob) { finish(blob); }, 'image/png');
        } catch (error) { finish(null, new Error('图片暂时无法导出，请重新选择个人形象后重试。')); }
      });
    }
    async function download(input) {
      var value = capture(input), info = metadata(value), blob = await render(value);
      var URLApi = env.URL || root.URL, link, url;
      if (!URLApi || typeof URLApi.createObjectURL !== 'function') throw new Error('当前浏览器暂不支持下载图片。');
      try {
        url = URLApi.createObjectURL(blob); link = env.document.createElement('a');
        link.href = url; link.download = info.filename; link.setAttribute('aria-hidden', 'true');
        env.document.body.appendChild(link); link.click();
      } catch (error) { throw new Error('图片未能开始下载，请稍后重试。'); }
      finally {
        if (link && typeof link.remove === 'function') link.remove();
        if (url) later(function () { try { URLApi.revokeObjectURL(url); } catch (error) { /* 浏览器下载已接管。 */ } }, 1200);
      }
      return { ok: true, filename: info.filename, width: WIDTH, height: HEIGHT };
    }
    return { metadata: metadata, render: render, download: download };
  }
  var api = create(root); api.create = create; api.titleLayout = titleLayout; return api;
});
