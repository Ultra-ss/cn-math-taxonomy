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
  assert.doesNotMatch(nav[0], />档案<\/a>|>关于<\/a>|site-about/, file);
  const about = source.match(/<a\b[^>]*class="site-about"[^>]*>关于<\/a>/g);
  assert.strictEqual(about && about.length, 1, file + ': 唯一角落说明入口');
  assert.match(about[0], /href="https:\/\/github.com\/Ultra-ss\/cn-math-taxonomy"/);
  assert.match(about[0], /target="_blank"/);
  assert.match(about[0], /rel="noopener noreferrer"/);
  assert.match(about[0], /aria-label="关于本项目/);
  assert.match(source, /issues\/new\/choose/, file + ': 保留提交 Issue');
}
const center = fs.readFileSync(path.join(root, 'children/index.html'), 'utf8');
assert.match(center, /<title>本地个人中心 ·/);
assert.match(center, /<h1>本地个人中心<\/h1>/);
assert.match(center, /资料只保存在当前浏览器/);
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
console.log('local center: 6 page navigations, preserved tools, manifest and corner-link checks passed');
