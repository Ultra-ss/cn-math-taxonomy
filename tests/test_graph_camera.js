#!/usr/bin/env node
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cytoscape=require('../assets/vendor/cytoscape.min.js');
const Camera=require('../assets/graph-camera.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('  ok   '+name);}
function target(extra={}){
  const listeners=new Map();
  return {...extra,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){if(listeners.has(type))listeners.get(type).delete(fn);},
    fire(type,event={}){for(const fn of [...(listeners.get(type)||[])])fn(event);},
    count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0);}};
}
function fixture({reduced=false,duration=560}={}){
  const cy=cytoscape({headless:true,styleEnabled:true,minZoom:.1,maxZoom:3,layout:{name:'preset',fit:false},
    elements:[{data:{id:'a',label:'力'},position:{x:30,y:70},classes:'junior current'},
      {data:{id:'b',label:'弹力'},position:{x:400,y:300},classes:'junior test-expert'},
      {data:{id:'ab',source:'a',target:'b'},classes:'hard'}],
    style:[{selector:'node',style:{width:132,height:40,'background-color':'#e8e0ed','border-color':'#877491','border-width':3,label:'data(label)'}},
      {selector:'node.current',style:{width:138.6,height:42}},{selector:'node.test-expert',style:{'border-color':'#c5a44b'}}]});
  cy.zoom(1.2);cy.pan({x:37,y:-24});
  const container=target({dataset:{},clientWidth:800,clientHeight:600,contains:()=>false});
  const doc=target({hidden:false,activeElement:null}),win=target(),media=target({matches:reduced});
  const frames=new Map(),callbacks=[];let time=0,serial=0,writes=0;
  const viewport=cy.viewport.bind(cy);cy.viewport=function(...args){writes++;return viewport(...args);};
  const api=Camera.create({cy,container,document:doc,window:win,matchMedia:()=>media,duration,
    requestFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelFrame(id){frames.delete(id);},
    onStart(reason){callbacks.push(['start',reason]);},onFinish(reason){callbacks.push(['finish',reason]);}});
  const view=()=>({zoom:cy.zoom(),pan:{...cy.pan()}});
  const model=()=>cy.elements().map(n=>({id:n.id(),data:{...n.data()},classes:n.classes(),position:n.isNode()?{...n.position()}:null,
    style:n.isNode()?{width:n.width(),height:n.height(),fill:n.style('background-color'),border:n.style('border-color')}:null}));
  function tick(ms=16){time+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}
  function run(ms){for(let t=0;t<ms;t+=16)tick(Math.min(16,ms-t));}
  return {cy,api,container,doc,win,media,frames,callbacks,view,model,tick,run,writes:()=>writes,
    dispose(){api.destroy();cy.destroy();}};
}
function near(a,b,epsilon=1e-7){assert.ok(Math.abs(a-b)<=epsilon,a+' != '+b);}
test('真实图谱从当前视角经过中间帧到准确终点，缩放同时变化而节点数据几何样式不变',()=>{
  const f=fixture(),start=f.view(),model=f.model();
  assert.equal(f.api.move({pan:{x:337,y:176},zoom:2}),true);assert.equal(f.container.dataset.camera,'moving');
  assert.deepEqual(f.view(),start);f.tick(0);f.tick(280);
  near(f.view().pan.x,187);near(f.view().pan.y,76);near(f.view().zoom,1.6);assert.deepEqual(f.model(),model);
  f.tick(280);assert.deepEqual(f.view(),{zoom:2,pan:{x:337,y:176}});assert.deepEqual(f.model(),model);
  assert.equal(f.api.active(),false);assert.equal(f.frames.size,0);assert.equal(f.container.dataset.camera,'idle');
  assert.deepEqual(f.callbacks,[['start','move'],['finish','complete']]);f.dispose();
});
test('平移默认保留当前缩放，显式目标缩放遵循实际cy范围',()=>{
  const f=fixture();f.api.move({pan:{x:120,y:180}});f.run(600);near(f.cy.zoom(),1.2);
  f.api.move({pan:{x:1,y:2},zoom:100});f.run(600);assert.equal(f.cy.zoom(),3);
  f.api.move({pan:{x:1,y:2},zoom:.0001});f.run(600);assert.equal(f.cy.zoom(),.1);f.dispose();
});
test('快速重选从当前中间视角继续，过期RAF不能覆盖新目标',()=>{
  const f=fixture();f.api.move({pan:{x:537,y:176}});f.tick(0);f.tick(280);const at=f.view();
  const stale=[...f.frames.values()][0];f.api.move({pan:{x:-120,y:360},zoom:.9});assert.deepEqual(f.view(),at);
  stale(10000);assert.deepEqual(f.view(),at);assert.equal(f.frames.size,1);
  f.run(600);assert.deepEqual(f.view(),{zoom:.9,pan:{x:-120,y:360}});
  assert.deepEqual(f.callbacks,[['start','move'],['finish','cancel'],['start','move'],['finish','complete']]);f.dispose();
});
test('cancel保留真实中间相机并只结束一次，不跳到终点',()=>{
  const f=fixture();f.api.move({pan:{x:637,y:500}});f.run(200);const at=f.view();
  f.api.cancel();f.api.cancel();f.run(2000);assert.deepEqual(f.view(),at);
  assert.equal(f.frames.size,0);assert.deepEqual(f.callbacks,[['start','move'],['finish','cancel']]);f.dispose();
});
test('原生按下、触控、滚轮立即接管，重复的兼容鼠标事件不多发finish',()=>{
  for(const type of ['pointerdown','mousedown','touchstart','wheel']){
    const f=fixture();f.api.move({pan:{x:637,y:500}});f.run(160);const at=f.view();
    f.container.fire(type);f.container.fire('mousedown');f.run(1000);
    assert.deepEqual(f.view(),at,type);assert.equal(f.frames.size,0);assert.equal(f.callbacks.filter(x=>x[0]==='finish').length,1);f.dispose();
  }
});
test('只响应聚焦图谱的导航键，输入框和非导航键不会抢走移动',()=>{
  const f=fixture();f.api.move({pan:{x:637,y:500}});
  f.doc.activeElement={};f.doc.fire('keydown',{key:'ArrowUp',target:{}});assert.equal(f.api.active(),true);
  f.doc.activeElement=f.container;f.doc.fire('keydown',{key:'a',target:f.container});assert.equal(f.api.active(),true);
  f.doc.fire('keydown',{key:'+',target:f.container});assert.equal(f.api.active(),false);assert.equal(f.callbacks.at(-1)[1],'input');f.dispose();
});
test('文档隐藏、窗口失焦/离开和resize停止当前移动，页面恢复不偷偷飞向旧终点',()=>{
  for(const type of ['hidden','blur','pagehide','resize']){
    const f=fixture();f.api.move({pan:{x:637,y:500}});f.run(160);const at=f.view();
    if(type==='hidden'){f.doc.hidden=true;f.doc.fire('visibilitychange');}else f.win.fire(type);
    f.doc.hidden=false;f.win.fire('focus');f.win.fire('pageshow');f.run(1000);
    assert.deepEqual(f.view(),at,type);assert.equal(f.api.active(),false);assert.equal(f.frames.size,0);f.dispose();
  }
});
test('减少动态直接准确定位并配对回调，运行中开启时收尾到目标且不留RAF',()=>{
  const f=fixture({reduced:true});f.api.move({pan:{x:637,y:500},zoom:2});
  assert.deepEqual(f.view(),{zoom:2,pan:{x:637,y:500}});assert.equal(f.frames.size,0);
  assert.deepEqual(f.callbacks,[['start','move'],['finish','reduce']]);
  f.media.matches=false;f.media.fire('change');f.api.move({pan:{x:237,y:100},zoom:1});f.run(120);
  assert.equal(f.api.active(),true);f.media.matches=true;f.media.fire('change');
  assert.deepEqual(f.view(),{zoom:1,pan:{x:237,y:100}});assert.equal(f.frames.size,0);assert.equal(f.callbacks.at(-1)[1],'reduce');f.dispose();
});
test('已经到位和零时长不启动帧，非法目标不取消有效移动或写入相机',()=>{
  const f=fixture();const at=f.view();assert.equal(f.api.move(at),true);assert.equal(f.frames.size,0);assert.equal(f.callbacks.length,2);
  f.api.move({pan:{x:200,y:300}});const writes=f.writes();
  for(const bad of [null,{}, {pan:{x:NaN,y:2}}, {pan:{x:1,y:2},zoom:Infinity},{pan:{x:1,y:2},zoom:-1}])assert.equal(f.api.move(bad),false);
  assert.equal(f.api.active(),true);assert.equal(f.writes(),writes);f.dispose();
  const g=fixture({duration:0});g.api.move({pan:{x:200,y:300}});assert.deepEqual(g.view().pan,{x:200,y:300});assert.equal(g.frames.size,0);g.dispose();
});
test('controller和原生renderer销毁均不再写viewport，回调一次且移除全部监听',()=>{
  for(const native of [false,true]){
    const f=fixture();f.api.move({pan:{x:637,y:500}});f.run(160);const writes=f.writes();
    const stale=[...f.frames.values()][0];if(native)f.cy.destroy();else f.api.destroy();
    assert.equal(f.container.dataset.camera,'stopped');assert.equal(f.frames.size,0);assert.equal(f.api.active(),false);
    assert.doesNotThrow(()=>stale(10000));assert.equal(f.writes(),writes);
    assert.equal(f.container.count()+f.doc.count()+f.win.count()+f.media.count(),0);
    assert.deepEqual(f.callbacks,[['start','move'],['finish','destroy']]);
    assert.equal(f.api.move({pan:{x:0,y:0}}),false);assert.doesNotThrow(()=>f.api.destroy());if(!native)f.cy.destroy();
  }
});
test('浏览器与CommonJS接口一致，模块没有节点定位、样式或存储副作用',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/graph-camera.js'),'utf8'),ctx={window:{}};
  vm.runInNewContext(source,ctx);assert.equal(typeof ctx.window.CnmGraphCamera.create,'function');assert.equal(ctx.window.CnmGraphCamera.DURATION,560);
  assert.ok(!/localStorage|sessionStorage|\.position\(|\.style\(/.test(source));
});
console.log('test_graph_camera: '+passed+' passed');
