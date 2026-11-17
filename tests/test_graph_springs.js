#!/usr/bin/env node
/* 使用真实Cytoscape数据/事件与虚拟时钟核验锚定弹簧，不依赖浏览器renderer。 */
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const cytoscape=require('../assets/vendor/cytoscape.min.js');
const Springs=require('../assets/graph-springs.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('  ok   '+name);}
function target(extra={}){const map=new Map();return {...extra,
  addEventListener(t,fn){if(!map.has(t))map.set(t,new Set());map.get(t).add(fn);},
  removeEventListener(t,fn){if(map.has(t))map.get(t).delete(fn);},
  fire(t,event={}){for(const fn of [...(map.get(t)||[])])fn(event);},
  count(){return [...map.values()].reduce((n,set)=>n+set.size,0);}};}
function fixture({reduced=false,zoom=1}={}){
  const poses={A:{x:0,y:0},B:{x:0,y:140},C:{x:0,y:280},D:{x:0,y:420},E:{x:0,y:560},W:{x:-200,y:160},X:{x:360,y:160}};
  const nodes=Object.entries(poses).map(([id,position])=>({data:{id},position}));
  const edges=[['A','B'],['B','C'],['C','D'],['D','E'],['A','W','soft']].map(([source,target,cls],i)=>({data:{id:'e'+i,source,target},classes:cls||''}));
  const cy=cytoscape({headless:true,elements:nodes.concat(edges),layout:{name:'preset'},zoom,pan:{x:0,y:0},autoungrabify:false,autounselectify:true});
  cy.zoom(zoom);cy.pan({x:0,y:0});
  const container=target({dataset:{},clientWidth:500,clientHeight:600}),doc=target({hidden:false}),win=target(),preference=target({matches:reduced});
  let time=0,serial=0,held=0,released=0,starts=0;const frames=new Map();
  const api=Springs.create({cy,container,document:doc,window:win,matchMedia:()=>preference,now:()=>time,
    requestFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id),
    onHold(){held++;},onRelease(){released++;},onDragStart(){starts++;}});
  const node=id=>cy.getElementById(id);
  const point=id=>({...node(id).position()});
  const snapshot=()=>Object.fromEntries(Object.keys(poses).map(id=>[id,point(id)]));
  const base=snapshot(),camera={zoom:cy.zoom(),pan:{...cy.pan()}};
  function begin(id){node(id).emit('grab');}
  function drag(id,x,y){node(id).position({x,y});node(id).emit('drag');}
  function free(id){node(id).emit('free');}
  function tick(ms=16){time+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));}
  function run(ms){for(let elapsed=0;elapsed<ms;elapsed+=16)tick(Math.min(16,ms-elapsed));}
  function exact(){assert.deepEqual(snapshot(),base);}
  return {cy,api,node,point,snapshot,base,camera,container,doc,win,preference,frames,begin,drag,free,tick,run,exact,
    counts:()=>({held,released,starts}),clock:()=>time,dispose(){api.destroy();cy.destroy();}};
}
test('拖动关联点有延迟弹性，强关联跟随大于弱关联，三层外与无关点不动',()=>{
  const f=fixture();f.begin('A');f.drag('A',100,60);
  assert.equal(f.container.dataset.springState,'dragging');assert.equal(f.counts().starts,1);
  assert.equal(f.point('B').x,0,'不是刚性整图平移');f.tick();const early=f.point('B').x;
  assert.ok(early>0 && early<30);f.run(600);
  const b=f.point('B').x,c=f.point('C').x,d=f.point('D').x,w=f.point('W').x-f.base.W.x;
  assert.ok(b>c && c>d && d>0);assert.ok(b>w && w>0,'强关联应比弱关联牵引更明显');
  assert.deepEqual(f.point('E'),f.base.E);assert.deepEqual(f.point('X'),f.base.X);
  assert.deepEqual({zoom:f.cy.zoom(),pan:{...f.cy.pan()}},f.camera,'物理模拟不改变相机');
  f.free('A');assert.equal(f.container.dataset.springState,'settling');f.run(2600);f.exact();
  assert.equal(f.frames.size,0);assert.deepEqual(f.counts(),{held:1,released:1,starts:1});f.dispose();
});
test('松手后有阻尼回弹并最终精确归位，重复拖动不会累加偏移',()=>{
  const f=fixture();
  for(let i=0;i<3;i++){
    f.begin('A');f.drag('A',120,-40);f.run(160);f.free('A');
    const positions=[];for(let j=0;j<130;j++){f.tick();positions.push(f.point('A').x);}
    assert.ok(positions.some(x=>x<100),'离开手指后应该回弹');f.run(500);f.exact();
  }
  assert.equal(f.counts().held,3);assert.equal(f.counts().released,3);f.dispose();
});
test('快速换抓节点继承当前位移和原锚点，旧大位移不能被硬钳制成瞬移',()=>{
  const f=fixture();f.begin('A');f.drag('A',220,0);f.free('A');
  const before=f.snapshot();f.begin('B');assert.deepEqual(f.snapshot(),before,'新grab不能把节点拉离手指');
  f.drag('B',f.point('B').x+12,f.point('B').y);f.tick();
  assert.ok(f.point('A').x>170,'保留先前根节点limit，不能从220瞬移到96');
  f.free('B');f.run(2800);f.exact();assert.equal(f.counts().held,1);assert.equal(f.counts().released,1);f.dispose();
});
test('回弹过程中轻点不重置锚点，也不把当前节点立即归位',()=>{
  const f=fixture();f.begin('A');f.drag('A',100,60);f.run(100);f.free('A');f.run(80);
  const before=f.snapshot();f.begin('B');f.free('B');assert.deepEqual(f.snapshot(),before);
  f.run(2600);f.exact();assert.equal(f.counts().starts,1);f.dispose();
});
test('原生position可变引用仍正确记录释放惯性与抓取快照',()=>{
  const f=fixture();const reference=f.node('A').position();f.node('A').position({x:7,y:0});assert.equal(reference.x,7,'真实vendor getter为同一可变对象');
  f.node('A').position(f.base.A);f.begin('A');f.tick(30);f.drag('A',80,0);f.free('A');f.tick();
  assert.ok(f.point('A').x!==80,'松手后根节点参与物理回弹');f.run(2600);f.exact();f.dispose();
});
test('浮动已有偏移但没真正拖动时，普通grab/free不清点击意图也不吞tap',()=>{
  const f=fixture();f.node('A').position({x:12,y:0});f.begin('A');f.free('A');
  assert.equal(f.counts().starts,0);assert.equal(f.api.consumeTap({target:f.node('A')}),false);assert.equal(f.point('A').x,12);
  f.dispose();
});
test('六屏幕像素阈值与缩放一致；拖动后的tap被抑制，但下一次真grab清旧latch',()=>{
  const f=fixture({zoom:.5});f.begin('A');f.drag('A',10,0);assert.equal(f.counts().starts,0,'5屏幕像素仍视为轻点容差');
  f.drag('A',14,0);assert.equal(f.counts().starts,1);f.free('A');
  assert.equal(f.api.consumeTap({target:f.node('A')}),true);assert.equal(f.api.consumeTap({target:f.node('A')}),false);
  f.begin('A');f.drag('A',60,0);f.free('A');f.begin('A');f.free('A');
  assert.equal(f.api.consumeTap({target:f.node('A')}),false,'即使native没发旧tap也不能吃掉下次真click');
  f.run(2600);f.exact();f.dispose();
});
test('减少动态效果允许直接拖动关联，松手立即归位且不产生惯性RAF',()=>{
  const f=fixture({reduced:true});f.begin('A');f.drag('A',100,60);
  assert.ok(f.point('B').x>f.point('C').x && f.point('C').x>0);assert.equal(f.frames.size,0);
  assert.deepEqual(f.point('X'),f.base.X);f.free('A');f.exact();assert.equal(f.container.dataset.springState,'idle');f.dispose();
});
test('暂停漂浮不会禁止弹性拖动；physics本身没有读取或写入学习数据',()=>{
  const f=fixture();f.begin('A');f.drag('A',80,50);f.run(100);assert.ok(f.point('B').x>0);
  f.free('A');f.run(2600);f.exact();
  const source=fs.readFileSync(path.join(__dirname,'../assets/graph-springs.js'),'utf8');
  assert.ok(!/localStorage|sessionStorage|CnmProgress|CnmChildren/.test(source));f.dispose();
});
test('blur后继续原生移动不会留永久偏移，且新的pointerdown解除旧native取消锁',()=>{
  const f=fixture();f.begin('A');f.drag('A',100,30);f.run(100);f.win.fire('blur');f.exact();assert.equal(f.frames.size,0);
  f.drag('A',170,70);f.exact();f.free('A');f.exact();assert.equal(f.cy.autoungrabify(),false);
  f.begin('A');f.drag('A',80,30);f.win.fire('blur');assert.equal(f.cy.autoungrabify(),true);
  f.container.fire('pointerdown',{pointerId:4});assert.equal(f.cy.autoungrabify(),false);
  f.begin('B');f.drag('B',30,160);f.free('B');f.run(2600);f.exact();f.dispose();
});
test('pan/zoom、隐藏、fit式stop和双指取消都清理弹性并最终恢复grab',()=>{
  for(const cause of ['pan','zoom','hidden','stop','pinch']){
    const f=fixture();f.container.fire('pointerdown',{pointerId:1});f.begin('A');f.drag('A',90,20);f.run(60);
    if(cause==='pan'||cause==='zoom')f.cy.emit(cause);
    else if(cause==='hidden'){f.doc.hidden=true;f.doc.fire('visibilitychange');}
    else if(cause==='stop')f.api.stop();
    else f.container.fire('pointerdown',{pointerId:2});
    assert.equal(f.frames.size,0,cause);f.exact();f.drag('A',180,80);f.exact();
    f.doc.fire('pointerup',{pointerId:1});f.doc.fire('pointerup',{pointerId:2});f.free('A');
    assert.equal(f.cy.autoungrabify(),false,cause);assert.equal(f.counts().released,1,cause);f.dispose();
  }
});
test('renderer销毁及controller销毁都不遗留RAF、DOM监听或renderer-null访问',()=>{
  const f=fixture();f.begin('A');f.drag('A',80,20);f.run(60);
  assert.doesNotThrow(()=>f.cy.destroy());assert.equal(f.frames.size,0);assert.doesNotThrow(()=>f.api.destroy());
  assert.equal(f.container.count()+f.doc.count()+f.win.count()+f.preference.count(),0);
  const g=fixture();g.begin('A');g.drag('A',80,20);g.run(60);g.api.destroy();g.exact();assert.equal(g.frames.size,0);g.cy.destroy();
});
test('真实页面在grab前保存idle锚点，实际drag才清arm并禁用默认灰色active垫色',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../explore/app.js'),'utf8');
  assert.match(source,/autoungrabify: false/);assert.match(source,/autounselectify: true/);
  assert.match(source,/onDragStart: function \(\) \{ explicitNodeSelection = null/);
  assert.match(source,/graphSprings\.consumeTap\(event\)/);
  assert.match(source,/selector: 'node:active', style: \{ 'overlay-opacity': 0 \}/);
  assert.ok(source.indexOf('graphMotion.start(enteringGraph)')<source.indexOf("if (graphSprings) cy.nodes().not('.grade').grabify()"));
});
console.log('test_graph_springs: '+passed+' passed');
