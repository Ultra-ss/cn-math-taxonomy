#!/usr/bin/env node
/* 进场动画必须可中断、精确归位，且不碰相机、颜色和学习状态。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Motion = require('../assets/graph-motion.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   '+name); }
function target(extra={}) {
  const listeners = new Map();
  return {...extra,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){if(listeners.has(type))listeners.get(type).delete(fn);},
    fire(type){for(const fn of [...(listeners.get(type)||[])])fn();},
    listenerCount(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}};
}
function fixture({zoom=1,count=8,reduced=false,hidden=false,offscreen=false}={}) {
  const container=target({clientWidth:390,clientHeight:500,dataset:{}}),doc=target({hidden}),win=target();
  const media=target({matches:reduced}),frames=new Map();let serial=0,mutations=0;
  const nodes=Array.from({length:count},(_,i)=>{
    let point={x:100+i%9*16,y:80+Math.floor(i/9)*10};
    const original={...point};
    return {original,id:()=>`cnp_${String(i+1).padStart(3,'0')}`,visible:()=>true,
      renderedPosition:()=>offscreen&&i===count-1?{x:10000,y:10000}:{x:point.x*zoom,y:point.y*zoom},
      position(value){if(value){point={...value};mutations++;}return {...point};}};
  });
  const coreListeners=new Map();let dead=false,disposing=false;
  const graph={nodes:()=>nodes,zoom:()=>zoom,destroyed:()=>dead,batch(fn){if(disposing)throw new Error('renderer already removed');fn();},
    on(types,fn){types.split(' ').forEach(type=>{if(!coreListeners.has(type))coreListeners.set(type,new Set());coreListeners.get(type).add(fn);});},
    off(types,fn){types.split(' ').forEach(type=>{if(coreListeners.has(type))coreListeners.get(type).delete(fn);});},
    emit(type){for(const fn of [...(coreListeners.get(type)||[])])fn();},
    destroy(){disposing=true;this.emit('destroy');dead=true;}};
  const api=Motion.create({container,document:doc,window:win,matchMedia:()=>media,
    requestFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id)});
  function step(time){const current=[...frames.values()];frames.clear();current.forEach(fn=>fn(time));}
  function exact(){nodes.forEach(node=>assert.deepEqual(node.position(),node.original));}
  return {api,container,doc,win,media,nodes,graph,frames,step,exact,mutations:()=>mutations};
}
test('每个节点相位不同、位移轻柔，动画结束后模型坐标精确归位且不重复播放',()=>{
  const f=fixture();assert.equal(f.api.start(f.graph),true);assert.equal(f.container.dataset.motion,'running');
  f.step(0);f.step(780);
  const offsets=f.nodes.map(node=>({x:node.position().x-node.original.x,y:node.position().y-node.original.y}));
  assert.ok(offsets.some(p=>Math.abs(p.x)>0.05));
  assert.ok(new Set(offsets.map(p=>p.x.toFixed(5)+','+p.y.toFixed(5))).size>1);
  offsets.forEach(p=>{assert.ok(Math.abs(p.x)<=2);assert.ok(Math.abs(p.y)<=1.2);});
  f.step(Motion.DURATION+1);f.exact();assert.equal(f.api.active(),false);assert.equal(f.frames.size,0);
  assert.equal(f.container.dataset.motion,'settled');assert.equal(f.api.start(f.graph),false);
});
test('渲染位移按缩放换算，放大与缩小时仍不超过2像素',()=>{
  for(const zoom of [.5,2.8]){
    const f=fixture({zoom});f.api.start(f.graph);f.step(0);f.step(830);
    f.nodes.forEach(n=>{assert.ok(Math.abs((n.position().x-n.original.x)*zoom)<=2.001);assert.ok(Math.abs((n.position().y-n.original.y)*zoom)<=1.201);});
    f.api.stop();f.exact();assert.equal(f.frames.size,0);
  }
});
test('指针、滚轮、键盘、pan/zoom以及切后台均立即中断且不残留偏移',()=>{
  for(const event of ['pointerdown','wheel','keydown','pan','zoom','visibilitychange','pagehide']){
    const f=fixture();f.api.start(f.graph);f.step(0);f.step(650);
    if(event==='visibilitychange'){f.doc.hidden=true;f.doc.fire(event);}
    else if(event==='keydown')f.doc.fire(event);
    else if(event==='pagehide')f.win.fire(event);
    else if(event==='pan'||event==='zoom')f.graph.emit(event);
    else f.container.fire(event);
    f.exact();assert.equal(f.api.active(),false,event);assert.equal(f.frames.size,0,event);
  }
});
test('减少动态效果从启动时生效，运行中更改系统偏好也能归位',()=>{
  const f=fixture({reduced:true});assert.equal(f.container.dataset.motion,'reduced');
  assert.equal(f.api.start(f.graph),false);assert.equal(f.mutations(),0);assert.equal(f.frames.size,0);
  const g=fixture();g.api.start(g.graph);g.step(0);g.step(900);g.media.matches=true;g.media.fire('change');
  g.exact();assert.equal(g.container.dataset.motion,'reduced');assert.equal(g.api.active(),false);
});
test('进场开始前已经操作时保持静止；隐藏或已销毁图谱也不启动',()=>{
  const f=fixture();f.container.fire('pointerdown');assert.equal(f.api.start(f.graph),false);f.exact();
  const g=fixture({hidden:true});assert.equal(g.api.start(g.graph),false);assert.equal(g.frames.size,0);
  const h=fixture();h.graph.destroy();assert.equal(h.api.start(h.graph),false);
});
test('大图只处理附近最多60个节点，不移动远处节点',()=>{
  const f=fixture({count:269,zoom:.5,offscreen:true});f.api.start(f.graph);f.step(0);f.step(700);
  const moved=f.nodes.filter(n=>n.position().x!==n.original.x||n.position().y!==n.original.y);
  assert.equal(moved.length,Motion.MAX_NODES);assert.deepEqual(f.nodes.at(-1).position(),f.nodes.at(-1).original);
  f.api.stop();f.exact();
});
test('destroy清理监听器与待执行帧，后续事件不会再访问已销毁图谱',()=>{
  const f=fixture();f.api.start(f.graph);f.step(0);f.step(500);f.api.destroy();f.exact();
  assert.equal(f.frames.size,0);assert.equal(f.container.listenerCount()+f.doc.listenerCount()+f.win.listenerCount()+f.media.listenerCount(),0);
  f.graph.destroy();f.api.destroy();assert.equal(f.api.start(f.graph),false);
});
test('Cytoscape已经移除renderer但尚未标记destroyed时不再尝试位置归位',()=>{
  const f=fixture();f.api.start(f.graph);f.step(0);f.step(500);
  assert.doesNotThrow(()=>f.graph.destroy());assert.equal(f.frames.size,0);assert.equal(f.api.active(),false);
  assert.doesNotThrow(()=>f.api.destroy());
});
const source=fs.readFileSync(path.join(__dirname,'../explore/app.js'),'utf8');
test('实际绘图的通过状态只改边框颜色，所有状态边框宽度和填充规则相同',()=>{
  assert.match(source,/'background-color': 'data\(bg\)'/);
  assert.match(source,/'border-width': 3/);
  for(const status of ['passed','expert']){
    const rule=source.match(new RegExp("selector: 'node\\.test-"+status+"', style: \\{([^}]+)\\}"));
    assert.ok(rule);assert.ok(rule[1].includes("'border-color'"));
    assert.ok(!rule[1].includes("'background-color'"));assert.ok(!rule[1].includes("'border-width'"));
  }
  assert.ok(source.includes("layout: 'playful-v1-labels-'"),'旧尺寸布局缓存分开保存');
  assert.ok(source.includes('graphMotion.stop();'),'保存画面与操作前精确归位');
});
test('浏览器导出与CommonJS一致，未创建控制器时不产生动画或事件副作用',()=>{
  const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/graph-motion.js'),'utf8'),{window});
  assert.equal(typeof window.CnmGraphMotion.create,'function');assert.equal(window.CnmGraphMotion.DURATION,Motion.DURATION);
});
console.log('test_graph_motion: '+passed+' passed');
