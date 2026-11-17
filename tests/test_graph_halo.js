#!/usr/bin/env node
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const cytoscape=require('../assets/vendor/cytoscape.min.js');
const Halo=require('../assets/graph-halo.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('  ok   '+name);}
function target(extra={}){const listeners=new Map();return {...extra,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){if(listeners.has(type))listeners.get(type).delete(fn);},
  fire(type,event={}){for(const fn of [...(listeners.get(type)||[])])fn(event);},
  count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0);}};}
const badge=color=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="10" fill="'+color+'"/></svg>');
function fixture({paused=false,reduced=false}={}){
  function styles(color){return [
    {selector:'node',style:{width:'data(w)',height:'data(h)','background-color':'data(bg)','border-color':'data(border)','border-width':3,'background-image':badge(color),'background-width':22,'background-height':22,'background-image-opacity':1}},
    {selector:'node.expert-unlocked',style:{'background-image':['none',badge(color)],'background-width':[212,22],'background-height':[96,22],'background-image-opacity':[.7,1]}}
  ];}
  const cy=cytoscape({headless:true,styleEnabled:true,autoungrabify:false,layout:{name:'preset',fit:false},elements:[
    {data:{id:'cnp_053',w:156,h:40,bg:'#d4e1eb',border:'#4f6c83'},position:{x:120,y:120},classes:'expert-unlocked current test-expert'},
    {data:{id:'cnp_054',w:132,h:40,bg:'#e8e0ed',border:'#877491'},position:{x:330,y:300},classes:'expert-unlocked test-passed'},
    {data:{id:'cnp_055',w:132,h:40,bg:'#e8e0ed',border:'#877491'},position:{x:120,y:330},classes:'test-failed'}
  ],style:styles('#9a7e46')});cy.zoom(1.1);cy.pan({x:5,y:-3});
  const container=target({dataset:{},clientWidth:500,clientHeight:500}),doc=target({hidden:false}),win=target(),media=target({matches:reduced});
  let time=0,serial=0;const frames=new Map(),microtasks=[];
  const api=Halo.create({cy,container,document:doc,window:win,matchMedia:()=>media,
    requestFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelFrame(id){frames.delete(id);},queueMicrotask(fn){microtasks.push(fn);}});
  const node=id=>cy.$id(id);
  const pose=()=>cy.nodes().map(n=>({id:n.id(),position:{...n.position()},width:n.width(),height:n.height(),data:{...n.data()},classes:n.classes(),fill:n.style('background-color'),border:n.style('border-color')}));
  const look=()=>cy.nodes().map(n=>({width:n.pstyle('background-width').value.slice(),height:n.pstyle('background-height').value.slice(),opacity:n.pstyle('background-image-opacity').value.slice()}));
  const base=pose(),camera={zoom:cy.zoom(),pan:{...cy.pan()}};
  function flush(){while(microtasks.length)microtasks.shift()();}
  function tick(ms=16){flush();time+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}
  function run(ms){for(let t=0;t<ms;t+=16)tick(Math.min(16,ms-t));}
  return {cy,api,container,doc,win,media,frames,microtasks,flush,node,pose,look,base,camera,tick,run,styles,dispose(){api.destroy();cy.destroy();}};
}
test('透明贴图缓存带足够外延，兼容回退没有filter、mask或实心底板',()=>{
  const a=Halo.image(156,40,'#d5b85f');assert.equal(a,Halo.image(156,40,'#d5b85f'));
  assert.equal(a.width,156+Halo.PADDING*2);assert.equal(a.height,40+Halo.PADDING*2);
  assert.notEqual(a.url,Halo.image(156,40,'#e5c96d').url);
  const svg=decodeURIComponent(a.url);assert.ok(svg.includes('fill="none"'));assert.ok(!/<filter|<mask|fill="white"/.test(svg));
});
test('可见专家节点持续扩散呼吸、周期错相，角标不透明，其他节点与相机数据不变',()=>{
  const f=fixture();const start=f.look();const variations=new Set();
  for(let t=0;t<8000;t+=160){f.run(160);const look=f.look();variations.add(look[0].opacity[0].toFixed(3));
    for(const index of [0,1]){assert.equal(look[index].opacity[1],1);assert.equal(look[index].width[1],22);assert.equal(look[index].height[1],22);}
    assert.deepEqual(look[2],start[2]);assert.deepEqual(f.pose(),f.base);assert.deepEqual({zoom:f.cy.zoom(),pan:{...f.cy.pan()}},f.camera);
  }
  assert.ok(variations.size>20);assert.notEqual(f.look()[0].opacity[0],f.look()[1].opacity[0]);assert.equal(f.frames.size,1);f.dispose();
});
test('更新限频，暂停冻结当前光晕，恢复首帧不会突然跳到另一相位',()=>{
  const f=fixture();f.tick();const first=f.look();f.run(48);assert.deepEqual(f.look(),first);
  f.run(480);const at=f.look();f.api.setPaused(true);assert.equal(f.frames.size,0);f.run(6000);assert.deepEqual(f.look(),at);
  f.api.setPaused(false);f.tick();assert.deepEqual(f.look(),at);f.run(800);assert.notDeepEqual(f.look(),at);f.dispose();
});
test('view/dialog和手动暂停分别控制，隐藏pane不占RAF，CSS恢复后重新运行',()=>{
  const f=fixture();f.run(200);f.api.hold('view');f.container.clientWidth=0;assert.equal(f.frames.size,0);
  f.api.hold('dialog');f.api.release('view');f.container.clientWidth=500;assert.equal(f.frames.size,0);
  f.api.setPaused(true);f.api.release('dialog');assert.equal(f.frames.size,0);
  f.api.setPaused(false);f.run(300);assert.equal(f.api.active(),true);f.dispose();
});
test('减少动态效果始终静态柔光，没有RAF，运行中切换也能停止和恢复',()=>{
  const f=fixture({reduced:true});assert.equal(f.frames.size,0);assert.equal(f.container.dataset.halo,'reduced');
  const still=f.look();f.run(6000);assert.deepEqual(f.look(),still);
  f.media.matches=false;f.media.fire('change');f.run(700);assert.equal(f.api.active(),true);
  f.media.matches=true;f.media.fire('change');assert.equal(f.frames.size,0);assert.equal(f.look()[0].opacity[1],1);f.dispose();
});
test('失焦、后台与原生grab分别暂停，恢复后不写节点位置',()=>{
  for(const cause of ['blur','pagehide','hidden','grab']){
    const f=fixture();f.run(300);
    if(cause==='hidden'){f.doc.hidden=true;f.doc.fire('visibilitychange');}
    else if(cause==='grab')f.node('cnp_053').emit('grab');else f.win.fire(cause);
    assert.equal(f.frames.size,0,cause);const look=f.look();f.run(500);assert.deepEqual(f.look(),look,cause);
    if(cause==='hidden'){f.doc.hidden=false;f.doc.fire('visibilitychange');}
    else if(cause==='grab')f.node('cnp_053').emit('free');else f.win.fire(cause==='blur'?'focus':'pageshow');
    f.run(300);assert.equal(f.api.active(),true,cause);assert.deepEqual(f.pose(),f.base);f.dispose();
  }
});
test('进度失去资格后清掉动态bypass，单层失败角标恢复22px；重新通过可续动',()=>{
  const f=fixture();f.run(300);f.node('cnp_053').removeClass('expert-unlocked');f.flush();
  assert.equal(f.node('cnp_053').pstyle('background-width').value[0],22);
  assert.equal(f.node('cnp_053').pstyle('background-image-opacity').value[0],1);
  f.node('cnp_054').removeClass('expert-unlocked');f.flush();assert.equal(f.frames.size,0);
  f.node('cnp_053').addClass('expert-unlocked');f.run(300);assert.equal(f.api.active(),true);assert.equal(f.node('cnp_053').pstyle('background-image-opacity').value[1],1);f.dispose();
});
test('多指取消没有free时，最后一个pointer或touch结束会解除原生drag暂停',()=>{
  const f=fixture();f.container.fire('pointerdown',{pointerId:1});f.node('cnp_053').emit('grab');
  f.container.fire('pointerdown',{pointerId:2});assert.equal(f.container.dataset.halo,'held');assert.equal(f.frames.size,0);
  f.doc.fire('pointerup',{pointerId:1});assert.equal(f.frames.size,0,'仍有一个手指时保持暂停');
  f.doc.fire('pointercancel',{pointerId:2});f.run(200);assert.equal(f.api.active(),true);
  for(const type of ['touchend','touchcancel']){
    f.node('cnp_053').emit('grab');f.doc.fire(type,{touches:[{}]});assert.equal(f.frames.size,0);
    f.doc.fire(type,{touches:[]});f.run(200);assert.equal(f.api.active(),true,type);
  }
  f.node('cnp_053').emit('grab');f.doc.fire('mouseup');f.run(200);assert.equal(f.api.active(),true);
  assert.deepEqual(f.pose(),f.base);f.dispose();
});
test('手势结束仅清原生drag，不解除view/dialog或手动暂停',()=>{
  const f=fixture();f.api.hold('view');f.api.hold('dialog');f.node('cnp_053').emit('grab');f.api.setPaused(true);
  f.doc.fire('touchend',{touches:[]});f.api.release('view');f.api.setPaused(false);assert.equal(f.frames.size,0);
  assert.equal(f.container.dataset.halo,'held');f.api.release('dialog');f.run(200);assert.equal(f.api.active(),true);
  f.cy.destroy();assert.doesNotThrow(()=>f.doc.fire('touchcancel',{touches:[]}));f.api.destroy();
  assert.equal(f.container.count()+f.doc.count()+f.win.count()+f.media.count(),0);
});
test('主题重置stylesheet时只保留尺寸透明度bypass，不锁住旧角标或改变相机',()=>{
  const f=fixture();f.run(200);const old=f.node('cnp_053').pstyle('background-image').value[1];
  f.cy.style().fromJson(f.styles('#ffffff')).update();f.win.fire('cnm:theme');
  assert.notEqual(f.node('cnp_053').pstyle('background-image').value[1],old);assert.equal(f.node('cnp_053').pstyle('background-image-opacity').value[1],1);
  assert.deepEqual({zoom:f.cy.zoom(),pan:{...f.cy.pan()}},f.camera);assert.deepEqual(f.pose(),f.base);f.dispose();
});
test('没有可见专家节点时停止调度，平移出现时可以恢复',()=>{
  const f=fixture();f.cy.pan({x:10000,y:10000});assert.equal(f.frames.size,0);
  f.cy.pan(f.camera.pan);f.run(200);assert.equal(f.api.active(),true);f.dispose();
});
test('renderer销毁后安全清理RAF与监听，不访问已经删除的renderer',()=>{
  const f=fixture();f.run(300);assert.doesNotThrow(()=>f.cy.destroy());assert.equal(f.frames.size,0);assert.doesNotThrow(()=>f.api.destroy());
  assert.equal(f.container.count()+f.doc.count()+f.win.count()+f.media.count(),0);
  const g=fixture();g.run(300);g.api.destroy();assert.equal(g.frames.size,0);assert.equal(g.container.dataset.halo,'stopped');
  assert.equal(g.node('cnp_053').pstyle('background-width').value[0],212,'销毁解除仅用于动画的宽高覆盖');g.cy.destroy();
});
test('批量class事件只安排一次刷新，销毁前的未结微任务不会触碰renderer',()=>{
  const f=fixture();for(let i=0;i<90;i++){f.node('cnp_053').toggleClass('test-expert');f.node('cnp_054').toggleClass('test-passed');}
  assert.equal(f.microtasks.length,1);f.flush();assert.equal(f.microtasks.length,0);
  f.node('cnp_053').removeClass('expert-unlocked');assert.equal(f.microtasks.length,1);
  f.cy.destroy();assert.doesNotThrow(f.flush);assert.equal(f.frames.size,0);f.api.destroy();
});
test('长时间动画只使用有限的背景样式状态，避免纹理缓存无限增长',()=>{
  const f=fixture(),keys=new Set();
  for(let t=0;t<60000;t+=80){f.run(80);const n=f.look()[0];keys.add(JSON.stringify(n));}
  assert.ok(keys.size>=20);assert.ok(keys.size<=25,keys.size);f.dispose();
});
test('浏览器/CommonJS API一致，未创建controller不会写存储或创建RAF',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/graph-halo.js'),'utf8');
  assert.ok(!/localStorage|sessionStorage|CnmProgress|\.position\(/.test(source));
  const context={window:{},Map};require('vm').runInNewContext(source,context);assert.equal(typeof context.window.CnmGraphHalo.create,'function');
});
console.log('test_graph_halo: '+passed+' passed');
