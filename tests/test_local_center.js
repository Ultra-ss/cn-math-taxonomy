#!/usr/bin/env node
/* 全站导航、本地个人中心与角落项目说明保持一致。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'explore/index.html', 'diagnose/index.html', 'children/index.html', 'children/history.html', 'wrongbook/index.html'];
for (const file of pages) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const nav = source.match(/<nav\b[^>]*class="site-nav"[^>]*>[\s\S]*?<\/nav>/);
  assert.ok(nav, file + ': 主导航存在');
  assert.match(nav[0], />本地个人中心<\/a>/, file);
  assert.doesNotMatch(nav[0], />档案<\/a>|>关于<\/a>|>错题本<\/a>|site-about/, file);
  const graph = nav[0].match(/<a\b[^>]*>知识图谱<\/a>/);
  assert.ok(graph, file + ': 图谱入口存在');
  assert.match(graph[0], /\sdata-resume-graph(?:\s|>)/, file + ': 导航图谱统一恢复上次位置');
  const graphHref = graph[0].match(/href="([^"]+)"/)[1];
  const graphURL = new URL(graphHref, 'https://physicalmap.pages.dev/' + file);
  assert.strictEqual(graphURL.search, '', file + ': 静态入口由共享导航补齐当前学科与续看参数');
  assert.strictEqual(graphURL.hash, '', file + ': 不预选其他知识点');
  const about = source.match(/<a\b[^>]*class="site-about"[^>]*>关于<\/a>/g);
  assert.ok(source.includes('assets/last-location.js'), file + ': 共享学科续看导航已加载');
  assert.strictEqual(about && about.length, 1, file + ': 唯一角落说明入口');
  assert.match(about[0], /href="https:\/\/github.com\/Ultra-ss\/cn-math-taxonomy"/);
  assert.match(about[0], /target="_blank"/);
  assert.match(about[0], /rel="noopener noreferrer"/);
  assert.match(about[0], /aria-label="关于本项目/);
  assert.doesNotMatch(source, /提交\s*Issue|<footer\b[^>]*class="site-footer"/i, file + ': 删除旧页脚');
  if (file !== 'index.html') assert.doesNotMatch(source, /home-feedback|feedback-qr\.jpg|欢迎交流与反馈/, file + ': 反馈二维码只在首页');
}
for (const script of ['assets/home.js', 'explore/app.js', 'diagnose/app.js']) {
  const source = fs.readFileSync(path.join(root, script), 'utf8');
  assert.ok(source.includes('CnmLastLocation.syncNavigation(subject)'), script + ': 导航使用当前页面真实学科');
  assert.ok(!source.includes(':not([data-resume-graph])'), script + ': 图谱入口不再跳过学科同步');
}
const center = fs.readFileSync(path.join(root, 'children/index.html'), 'utf8');
assert.match(center, /<title>本地个人中心 ·/);
assert.match(center, /<h1>本地个人中心<\/h1>/);
assert.match(center, /资料只保存在当前浏览器/);
assert.match(center, /<main\b[\s\S]*id="center-wrongbook-link"[^>]*href="\.\.\/wrongbook\/"[\s\S]*<\/main>/, '个人中心内有错题本入口');
for (const id of ['form', 'list', 'import-backup', 'confirm-import']) {
  assert.ok(center.includes('id="' + id + '"'), '保留档案与备份功能：' + id);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const shortcut = manifest.shortcuts.find(item => item.url.startsWith('children/'));
assert.strictEqual(shortcut.name, '本地个人中心');
assert.strictEqual(shortcut.short_name, '个人中心');
const css = fs.readFileSync(path.join(root, 'assets/site.css'), 'utf8');
const rule = css.match(/a\.site-about\s*\{([^}]+)\}/)[1];
assert.match(rule, /position:\s*fixed/);
assert.match(rule, /font-size:\s*12px/);
assert.match(rule, /z-index:\s*[0-4]\s*;/);
assert.match(css, /a\.site-about:focus-visible\s*\{[^}]*outline:/);
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tools = home.match(/<div class="home-nav-tools">([\s\S]*?)<\/nav>/)[1];
assert.ok(tools.indexOf('resource-search-btn') < tools.indexOf('subject-switch'), '首页学科切换在资源搜索右侧');
assert.match(home, /<footer class="home-feedback"[\s\S]*欢迎交流与反馈[\s\S]*<img[^>]*src="assets\/feedback-qr\.jpg"[\s\S]*本网页仅用于个人学习，免费使用[\s\S]*<\/footer>/);
assert.ok(fs.statSync(path.join(root, 'assets/feedback-qr.jpg')).size > 1000, '反馈二维码原图存在');
console.log('local center: 6 page navigations, preserved tools, manifest and corner-link checks passed');
