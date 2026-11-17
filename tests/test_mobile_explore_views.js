#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../explore/app.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start); return source.slice(a, b);
}
function element() {
  const attrs = new Map(), classes = new Set();
  return {dataset:{},scrollTop:0,clientWidth:390,clientHeight:500,hidden:false,inert:false,
    classList:{contains:x=>classes.has(x),remove:x=>classes.delete(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
    setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),removeAttribute:k=>attrs.delete(k),
    focus(options){this.focused=options;}};
}
const ids = Object.fromEntries(['cy','list','side','detail','graph-pane','main-nav','graph-options','mobile-menu-toggle','mobile-options-toggle','list-toggle',
  'mobile-tab-directory','mobile-tab-graph','mobile-tab-detail',
  'directory-filters','mobile-filter-toggle'].map(id=>[id,element()]));
const frame=element(),header=element(),writes=[];
ids.cy.dataset.ready='1';
let mobile=true,zoom=1.25,pan={x:-120,y:-280},resizes=0,renders=0,row=null;
const graph={zoom:()=>zoom,pan:()=>pan,minZoom:()=>0.05,maxZoom:()=>2.8,
  viewport(v){zoom=v.zoom;pan=v.pan;},resize(){resizes++;}};
const ctx={
  window:{matchMedia:()=>({matches:mobile}),CnmExploreViewport:{save(context,camera){writes.push({context,camera});return true;}}},
  document:{querySelector:s=>s==='.site-header'?header:frame}, $:id=>ids[id],
  subject:'physics',volume:'九全',selectedVolumes:['九全'],selected:'cnp_053',showWholeBook:true,upDepth:2,labelLimit:()=>8,
  mobileView:'graph',mobileFiltersOpen:false,mobileScroll:{directory:0,detail:0},graphNeedsRender:false,pendingGraphRestore:true,pendingCameraTransition:null,graphCamera:null,
  renderedCameraContext:null,renderedExpanded:false,liveCamera:null,changingCamera:false,viewportSaveTimer:null,cy:graph,
  byId:new Map([['cnp_053',{name:'热量 比热容'}]]),progressOf:()=>row,progressClass:r=>r?'test-passed':'',
  progressMark:r=>!r?'':r.expert?'⭐':r.status==='mastered'?'✓':'×',
  requestAnimationFrame:fn=>fn(),setTimeout:fn=>{fn();return 1;},clearTimeout(){},
  renderGraph(){renders++;ctx.graphNeedsRender=false;}
};
vm.createContext(ctx);
vm.runInContext(section('function closeDrawerIfMobile()', 'function nodeDiagnosisHref(id)'),ctx);
ctx.renderedCameraContext=ctx.cameraContext();
ctx.rememberViewport();
assert.equal(writes.length,1);
assert.equal(writes[0].camera.centerX,(390/2+120)/1.25);
assert.equal(writes[0].camera.centerY,(500/2+280)/1.25);
const initialPan={...pan};
ctx.setMobileView('directory',true);
assert.equal(frame.dataset.mobileView,'directory');
assert.equal(ids.side.inert,false);assert.equal(ids['graph-pane'].inert,true);assert.equal(ids.detail.inert,true);
assert.equal(ids['mobile-tab-directory'].getAttribute('aria-selected'),'true');
assert.equal(ids['mobile-tab-directory'].tabIndex,0);assert.equal(ids['mobile-tab-graph'].tabIndex,-1);
assert.ok(ids['mobile-tab-directory'].focused);
assert.equal(ids['directory-filters'].hidden,true);assert.equal(ids['directory-filters'].inert,true);
assert.equal(ids['mobile-filter-toggle'].getAttribute('aria-expanded'),'false');
ctx.setDirectoryFilters(true);
assert.equal(ids['directory-filters'].hidden,false);assert.equal(ids['directory-filters'].inert,false);
assert.equal(ids['mobile-filter-toggle'].getAttribute('aria-expanded'),'true');
ids.list.scrollTop=230;
ctx.setMobileView('detail',true);ids.detail.scrollTop=180;
ctx.setMobileView('graph',true);
assert.equal(ctx.cy,graph,'tab切换保留同一个图谱实例');assert.equal(renders,0);
assert.equal(zoom,1.25);assert.deepEqual(pan,initialPan);
ctx.setMobileView('directory');assert.equal(ids.list.scrollTop,230);
assert.equal(ids['directory-filters'].hidden,false,'视图切换保留目录筛选展开状态');
ctx.setDirectoryFilters(false,true);
assert.equal(ids['directory-filters'].hidden,true);assert.ok(ids['mobile-filter-toggle'].focused);
ctx.setMobileView('detail');assert.equal(ids.detail.scrollTop,180);
ctx.closeDrawerIfMobile();assert.equal(ctx.mobileView,'graph');
assert.ok(resizes>0);
// 画布大小变化时保持模型中心，不沿用旧像素pan。
const camera=ctx.liveCamera.camera;
ids.cy.clientWidth=500;ids.cy.clientHeight=420;ctx.resizeGraphViewport();
assert.equal(pan.x,250-camera.centerX*zoom);assert.equal(pan.y,210-camera.centerY*zoom);
// 隐藏容器不能以零尺寸覆盖合法相机；布局尚未完成也不捕获默认fit。
ctx.setMobileView('detail');ids.cy.clientWidth=0;ids.cy.clientHeight=0;
assert.equal(ctx.captureViewport(),null);
ids.cy.clientWidth=390;ids.cy.clientHeight=500;ctx.mobileView='graph';ids.cy.dataset.ready='0';
assert.equal(ctx.captureViewport(),null);ids.cy.dataset.ready='1';
ctx.graphNeedsRender=true;ctx.setMobileView('graph');assert.equal(renders,1,'隐藏时待更新的布局只在回图谱后处理');
// 桌面断点撤销移动端的可访问性隐藏，恢复三栏。
mobile=false;ctx.syncMobileChrome();
for(const id of ['side','graph-pane','detail']){assert.equal(ids[id].inert,false);assert.equal(ids[id].getAttribute('aria-hidden'),undefined);}
assert.equal(ids['main-nav'].hidden,false);assert.equal(ids['graph-options'].hidden,false);
assert.equal(ids['directory-filters'].hidden,false);assert.equal(ids['directory-filters'].inert,false);
ctx.graphNeedsRender=true;ctx.syncMobileChrome();
assert.equal(renders,2,'切到桌面三栏时也要完成手机隐藏期间等待的布局');
const html=fs.readFileSync(path.join(__dirname,'../explore/index.html'),'utf8');
assert.ok(html.indexOf('id="mobile-view-tabs"')<html.indexOf('id="side"'),'底栏在DOM上先于panel，键盘Tab可进入当前工作区');
assert.ok(html.indexOf('assets/explore-viewport.js')<html.indexOf('src="app.js"'));
assert.ok(!html.includes('mobile-topic-summary') && !html.includes('mobile-show-detail'),'详情统一使用保留的底栏tab，图谱下方不重复占空间');
console.log('test_mobile_explore_views: tabs, focus/aria, retained graph/scroll/camera and desktop fallback passed');
