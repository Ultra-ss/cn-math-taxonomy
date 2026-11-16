#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../explore/app.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
let owner = null;
const normal = { cnp_001: { status: 'mastered', at: '2026-01-01' }, cnp_002: { status: 'weak' } };
const pro = { cnp_001: { status: 'weak' } };
const calls = [], ownerLabel = {};
const ctx = {
  progress: {}, proProgress: {}, progressStamp: '', subject: 'physics', topics: [], cy: null,
  window: {
    CnmChildren: { current: () => owner },
    CnmProgress: { statuses(child, subject, level) {
      calls.push([child, subject, level]);
      return child === 'another' ? {} : level === 'pro' ? pro : normal;
    } }
  },
  $: () => ownerLabel,
  el: (tag, attrs) => ({ tag, attrs })
};
vm.createContext(ctx);
vm.runInContext(section('function currentChild()', 'function graphReturnTo()'), ctx);
ctx.refreshProgress();
assert.equal(calls.length, 2, '读取普通与专家两个独立状态');
assert.equal(calls[1][2], 'pro');
assert.equal(ctx.progressClass(ctx.progressOf('cnp_001')), 'test-passed', '专家失败保留普通通过勾');
assert.equal(ctx.progressMark(ctx.progressOf('cnp_001')), '✓');
assert.equal(ctx.progressMark(ctx.progressOf('cnp_002')), '×');
assert.equal(ctx.progressOf('unseen'), null);
pro.cnp_001 = { status: 'mastered', at: '2026-01-02' };
ctx.refreshProgress();
const expert = ctx.progressOf('cnp_001');
assert.equal(expert.status, 'mastered', '普通状态没有被专家覆盖');
assert.equal(expert.expert, true);
assert.equal(ctx.progressClass(expert), 'test-expert');
assert.equal(ctx.progressMark(expert), '⭐');
assert.equal(ctx.progressLabel(expert), '已通过专家挑战');
assert.equal(ctx.progressBadge(expert).attrs.text, '⭐');
assert.ok(ctx.progressBadge(expert).attrs['aria-label'].includes('专家'));
normal.cnp_001 = { status: 'weak', at: '2026-01-03' };
ctx.refreshProgress();
assert.equal(ctx.progressMark(ctx.progressOf('cnp_001')), '×', '后续普通重测失败须显示普通失败，不用旧专家星遮住');
normal.cnp_001 = { status: 'mastered', at: '2026-01-04' };
ctx.refreshProgress();
assert.equal(ctx.progressMark(ctx.progressOf('cnp_001')), '⭐');
pro.cnp_001 = { status: 'weak', at: '2026-01-05' };
ctx.refreshProgress();
assert.equal(ctx.progressMark(ctx.progressOf('cnp_001')), '✓', '后续专家失败保留普通通过');
pro.cnp_001 = { status: 'mastered', at: '2026-01-06' };
ctx.refreshProgress();
owner = { id: 'another', name: '另一个孩子' };
ctx.refreshProgress();
assert.equal(ctx.progressOf('cnp_001'), null, '切换档案不携带其他孩子的普通或专家角标');
assert.equal(ownerLabel.textContent, '检测记录：另一个孩子');
owner = null;
ctx.refreshProgress();
assert.equal(ctx.progressMark(ctx.progressOf('cnp_001')), '⭐', '切回访客恢复其专家角标');
assert.ok(source.includes("selector: 'node.test-expert'"), '图谱画布有独立专家星形图片');
assert.ok(source.includes("node.removeClass('test-passed test-failed test-expert')"), '刷新先清理旧角标类');
console.log('test_explore_pro: separate expert state, preserved normal pass, expert star and owner isolation passed');
