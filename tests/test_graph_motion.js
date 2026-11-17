#!/usr/bin/env node
/* 持续独立漂浮：长时运行、输入暂停恢复、基点精确归位和生命周期。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Motion = require('../assets/graph-motion.js');
let passed = 0;
function test(name, fn) { fn();passed++;console.log('  ok   '+name); }
function target(extra={}) {
  const listeners=new Map();
  return {...extra,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){if(listeners.has(type))listeners.get(type).delete(fn);},
    fire(type,event={}){for(const fn of [...(listeners.get(type)||[])])fn(event);},
    listenerCount(){return [...listeners.values()].reduce((n,set)=>n+set.size,0);}};
}
function fixture({zoom=1,count=12,reduced=false,hidden=false,offscreen=false,paused=false}={}) {
  const container=target({clientWidth:390,clientHeight:500,dataset:{}}),doc=target({hidden}),win=target({PointerEvent:function(){}});
  const media=target({matches:reduced}),frames=new Map(),timers=new Map();let serial=0,clock=0,mutations=0,pan={x:0,y:0};
  const nodes=Array.from({length:count},(_,i)=>{
    let point={x:100+i%9*16,y:80+Math.floor(i/9)*10};const original={...point};
    return {original,id:()=>`cnp_${String(i+1).padStart(3,'0')}`,visible:()=>true,
      renderedPosition:()=>({x:point.x*zoom+pan.x+(offscreen&&i===count-1?10000:0),y:point.y*zoom+pan.y}),
      position(value){if(value){point={...value};mutations++;}return {...point};}};
  });
  const coreListeners=new Map();let dead=false,disposing=false;
  const graph={nodes:()=>nodes,zoom:()=>zoom,pan:()=>({...pan}),destroyed:()=>dead,
    batch(fn){if(disposing)throw new Error('renderer already removed');fn();},
    on(types,fn){types.split(' ').forEach(t=>{if(!coreListeners.has(t))coreListeners.set(t,new Set());coreListeners.get(t).add(fn);});},
    off(types,fn){types.split(' ').forEach(t=>{if(coreListeners.has(t))coreListeners.get(t).delete(fn);});},
    emit(type){for(const fn of [...(coreListeners.get(type)||[])])fn();},
    setPan(value){pan={...value};this.emit('pan');},setZoom(value){zoom=value;this.emit('zoom');},destroy(){disposing=true;this.emit('destroy');dead=true;}};
  const api=Motion.create({container,document:doc,window:win,paused,matchMedia:()=>media,
    requestFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id),
    setTimer(fn,ms){const id=++serial;timers.set(id,{fn,at:clock+ms});return id;},clearTimer:id=>timers.delete(id)});
  function advance(ms){clock+=ms;for(let i=0;i<100;i++){const hit=[...timers].find(([,t])=>t.at<=clock);if(!hit)break;timers.delete(hit[0]);hit[1].fn();}}
  function step(time){assert.ok(time>=clock);advance(time-clock);const current=[...frames.values()];frames.clear();current.forEach(fn=>fn(time));}
  function exact(){nodes.forEach(node=>assert.deepEqual(node.position(),node.original));}
  function snapshot(){return nodes.map(node=>node.position());}
  function warm(){api.start(graph);step(clock);step(clock+1100);}
  return {api,container,doc,win,media,nodes,graph,frames,timers,step,advance,exact,snapshot,warm,mutations:()=>mutations,now:()=>clock};
}
test('连续相邻编号也有不同方向，25秒后仍持续漂浮且未更改相机',()=>{
  const f=fixture({count:24});f.warm();const first=f.snapshot(),camera={zoom:f.graph.zoom(),pan:f.graph.pan()};
  f.step(2300);const second=f.snapshot();
  const directions=new Set(second.map((p,i)=>Math.sign(p.x-first[i].x)+','+Math.sign(p.y-first[i].y)));
  assert.ok(directions.size>=4,'相邻编号必须呈现多种独立运动方向');
  for(const t of [5000,11000,19000,25000])f.step(t);
  assert.equal(f.api.active(),true);assert.equal(f.container.dataset.motion,'running');assert.equal(f.frames.size,1);
  assert.notDeepEqual(f.snapshot(),second);assert.deepEqual({zoom:f.graph.zoom(),pan:f.graph.pan()},camera);
  f.api.stop();f.exact();assert.equal(f.frames.size+f.timers.size,0);
});
test('慢速运动的屏幕位移始终不超过3像素，缩放不同仍满足同样上限',()=>{
  for(const zoom of [.5,1,2.8]) {
    const f=fixture({zoom});f.api.start(f.graph);f.step(0);
    for(let t=1100;t<=70000;t+=743){f.step(t);f.nodes.forEach(n=>{
      assert.ok(Math.abs((n.position().x-n.original.x)*zoom)<=2.801);
      assert.ok(Math.abs((n.position().y-n.original.y)*zoom)<=2.301);
    });}
    f.api.stop();f.exact();
  }
});
test('正常漂浮速度平缓，相邻编号的X与Y速度并不绑定为同一方向',()=>{
  const f=fixture({count:24});f.warm();f.step(7000);const a=f.snapshot();f.step(7100);const b=f.snapshot();
  const velocity=b.map((p,i)=>({x:(p.x-a[i].x)/.1,y:(p.y-a[i].y)/.1}));
  velocity.forEach(p=>{assert.ok(Math.abs(p.x)<2.6);assert.ok(Math.abs(p.y)<1.7);});
  for(const axis of ['x','y']){assert.ok(velocity.some(p=>p[axis]>.1));assert.ok(velocity.some(p=>p[axis]<-.1));}
  assert.ok(velocity.some(p=>p.x*p.y<0));assert.ok(velocity.some(p=>p.x*p.y>0));
});
test('缩放操作期间保持原有屏幕漂移幅度，不把世界坐标偏移放大成大跳动',()=>{
  const f=fixture({zoom:.5});f.warm();
  const before=f.nodes.map(n=>({x:(n.position().x-n.original.x)*.5,y:(n.position().y-n.original.y)*.5}));
  f.graph.setZoom(2.8);
  f.nodes.forEach((n,i)=>{assert.ok(Math.abs((n.position().x-n.original.x)*2.8-before[i].x)<1e-9);assert.ok(Math.abs((n.position().y-n.original.y)*2.8-before[i].y)<1e-9);});
  f.advance(Motion.IDLE_DELAY);f.step(f.now());f.step(f.now()+1100);
  f.nodes.forEach(n=>assert.ok(Math.abs((n.position().x-n.original.x)*2.8)<=2.801));
  f.api.stop();f.exact();
});
test('按下时冻结当前姿态而不跳回基点，最后一个指针抬起700ms后平滑恢复',()=>{
  const f=fixture();f.warm();const pose=f.snapshot();
  f.container.fire('pointerdown',{pointerId:1});f.container.fire('pointerdown',{pointerId:2});
  f.step(1500);assert.deepEqual(f.snapshot(),pose);assert.equal(f.api.active(),false);
  f.doc.fire('pointerup',{pointerId:1});f.advance(1000);assert.equal(f.api.active(),false);
  f.doc.fire('pointerup',{pointerId:2});f.advance(Motion.IDLE_DELAY-1);assert.equal(f.api.active(),false);
  f.advance(1);assert.equal(f.api.active(),true);f.step(f.now());assert.deepEqual(f.snapshot(),pose,'恢复第一帧不跳动');
  f.step(f.now()+1200);assert.notDeepEqual(f.snapshot(),pose);f.api.stop();f.exact();
});
test('滚轮、键盘、pan/zoom短暂停住后自动继续，非画布pointerup不制造重复帧',()=>{
  for(const event of ['wheel','keydown','pan','zoom']) {
    const f=fixture();f.warm();const pose=f.snapshot();
    if(event==='wheel')f.container.fire(event);else if(event==='keydown')f.doc.fire(event);else f.graph.emit(event);
    assert.equal(f.api.active(),false);f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true);
    f.step(f.now());assert.deepEqual(f.snapshot(),pose);f.step(f.now()+1100);assert.notDeepEqual(f.snapshot(),pose);
    for(let i=0;i<20;i++)f.doc.fire('pointerup',{pointerId:i+20});
    f.advance(1000);assert.equal(f.frames.size,1);assert.equal(f.timers.size,0);
    f.api.stop();f.exact();
  }
});
test('手动暂停与弹窗暂停互不覆盖，恢复后持续运行，fit重启也保留手动选择',()=>{
  const f=fixture();f.warm();const pose=f.snapshot();f.api.setPaused(true);f.step(8000);
  assert.deepEqual(f.snapshot(),pose);assert.equal(f.container.dataset.motion,'paused');
  f.api.hold('dialog');f.api.setPaused(false);f.advance(1000);assert.equal(f.api.active(),false);
  f.api.release('dialog');f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true);
  f.api.setPaused(true);f.api.stop();f.exact();f.api.start(f.graph);assert.equal(f.api.active(),false);
  assert.equal(f.container.dataset.motion,'paused');f.api.setPaused(false);f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true);
});
test('减少动态效果可随时停用和恢复，初始静态设置不阻止用户以后恢复',()=>{
  const f=fixture({reduced:true});f.api.start(f.graph);assert.equal(f.api.active(),false);assert.equal(f.mutations(),0);
  f.media.matches=false;f.media.fire('change');f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true);
  f.step(f.now());f.step(f.now()+1200);const pose=f.snapshot();f.media.matches=true;f.media.fire('change');
  f.step(f.now()+8000);assert.deepEqual(f.snapshot(),pose);assert.equal(f.container.dataset.motion,'reduced');
  f.media.matches=false;f.media.fire('change');f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true);
});
test('切后台或失焦丢失pointerup也能恢复，且不会解除弹窗或手动暂停',()=>{
  for(const hidden of ['visibilitychange','pagehide','blur']){
    const f=fixture();f.warm();f.container.fire('pointerdown',{pointerId:1});
    if(hidden==='visibilitychange'){f.doc.hidden=true;f.doc.fire(hidden);f.doc.hidden=false;f.doc.fire(hidden);}
    else{f.win.fire(hidden);f.win.fire(hidden==='blur'?'focus':'pageshow');}
    f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true,hidden);
    f.api.hold('dialog');f.container.fire('pointerdown',{pointerId:2});f.doc.hidden=true;f.doc.fire('visibilitychange');
    f.doc.hidden=false;f.doc.fire('visibilitychange');f.advance(1000);assert.equal(f.api.active(),false,'保留弹窗暂停');
    f.api.release('dialog');f.advance(Motion.IDLE_DELAY);assert.equal(f.api.active(),true);
  }
});
test('手机隐藏视图不占用RAF，恢复时即使release先于CSS显示也能续动',()=>{
  const f=fixture();f.warm();f.api.hold('view');f.container.clientWidth=0;f.api.release('view');
  assert.equal(f.frames.size,0);f.container.clientWidth=390;f.advance(Motion.IDLE_DELAY);
  assert.equal(f.api.active(),true);f.step(f.now());f.step(f.now()+1200);
  f.container.clientWidth=0;f.step(f.now()+100);assert.equal(f.frames.size,0);assert.equal(f.api.active(),false);
  const pending=fixture();pending.api.hold('view');pending.container.clientWidth=0;pending.api.start(pending.graph);
  assert.equal(pending.api.active(),false,'首次附着保留提前触发的视图暂停');
  pending.container.clientWidth=390;pending.api.release('view');pending.advance(Motion.IDLE_DELAY);assert.equal(pending.api.active(),true);
  const pressed=fixture();pressed.container.fire('pointerdown',{pointerId:1});pressed.api.start(pressed.graph);
  assert.equal(pressed.api.active(),false,'首次附着不能清除按住状态');
  pressed.doc.fire('pointerup',{pointerId:1});pressed.advance(Motion.IDLE_DELAY);assert.equal(pressed.api.active(),true);
});
test('所有可见框参与漂浮，平移后选择新视口且不累加旧偏移',()=>{
  const f=fixture({count:269,zoom:.5,offscreen:true});f.warm();
  const moved=f.nodes.filter(n=>n.position().x!==n.original.x||n.position().y!==n.original.y);
  assert.equal(moved.length,268);assert.deepEqual(f.nodes.at(-1).position(),f.nodes.at(-1).original);
  f.graph.setPan({x:-10000,y:0});f.advance(Motion.IDLE_DELAY);f.step(f.now());f.step(f.now()+1100);
  assert.notDeepEqual(f.nodes.at(-1).position(),f.nodes.at(-1).original);
  f.nodes.slice(0,-1).forEach(n=>assert.deepEqual(n.position(),n.original));
  f.graph.setPan({x:0,y:0});f.advance(Motion.IDLE_DELAY);f.step(f.now());f.step(f.now()+1100);
  f.api.stop();f.exact();
});
test('Cytoscape移除renderer但未标destroyed时不再归位；destroy清掉RAF、idle和监听器',()=>{
  const f=fixture();f.warm();assert.doesNotThrow(()=>f.graph.destroy());assert.equal(f.frames.size+f.timers.size,0);
  assert.doesNotThrow(()=>f.api.destroy());assert.equal(f.api.start(f.graph),false);
  const g=fixture();g.warm();g.container.fire('wheel');g.api.destroy();g.exact();
  assert.equal(g.frames.size+g.timers.size,0);assert.equal(g.container.listenerCount()+g.doc.listenerCount()+g.win.listenerCount()+g.media.listenerCount(),0);
});
const source=fs.readFileSync(path.join(__dirname,'../explore/app.js'),'utf8');
test('实际节点只改通过边框颜色，选中轻微增大而普通/专家状态不改变几何和填充',()=>{
  assert.match(source,/'background-color': 'data\(bg\)'/);assert.match(source,/'border-width': 3/);
  assert.match(source,/selector: 'node.current', style: \{ width: boxW \* 1\.05, height: 42/);
  for(const status of ['passed']){
    const rule=source.match(new RegExp("selector: 'node\\.test-"+status+"', style: \\{([^}]+)\\}"));
    assert.ok(rule[1].includes("'border-color'"));assert.ok(!rule[1].includes("'background-color'"));assert.ok(!rule[1].includes("'border-width'"));
  }
  const expertRule=source.match(/selector: 'node\.test-expert', style: \{([^}]+)\}/)[1];
  assert.ok(!expertRule.includes("'border-color'"),'专家卡片保留原学段或当前节点边框，只用柔光表达成就');
  const capture=source.slice(source.indexOf('function captureViewport()'),source.indexOf('function saveLiveCamera()'));
  assert.ok(!capture.includes('graphMotion.stop'),'相机读取不永久终止持续漂浮');
  assert.ok(source.includes("layout: 'playful-v2-floating-labels-'"));
});
test('浏览器API与CommonJS一致，不创建控制器就没有事件和存储副作用',()=>{
  const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/graph-motion.js'),'utf8'),{window});
  assert.equal(typeof window.CnmGraphMotion.create,'function');assert.equal(window.CnmGraphMotion.IDLE_DELAY,700);
});
for(const resultGraph of [false,true])test((resultGraph?'检测结果路径':'知识图谱')+'切换主题只重着色，节点、相机与样式数量保持不变',()=>{
  const cytoscape=require('../assets/vendor/cytoscape.min.js');
  const app=resultGraph?fs.readFileSync(path.join(__dirname,'../diagnose/app.js'),'utf8'):source;
  function section(start,end){const a=app.indexOf(start),b=app.indexOf(end,a);assert.ok(a>=0&&b>a);return app.slice(a,b);}
  function palette(dark){
    const names=['primary','primaryBg','junior','juniorBg','senior','seniorBg','currentBg','currentBorder','passedBorder','expertBorder','expertGlow','text','edge','edgeSoft','bad','badBg'];
    const colors=Object.fromEntries(names.map((name,i)=>[name,'#'+(dark?0x554422+i*0x20301:0xaabbcc-i*0x30201).toString(16).padStart(6,'0')]));
    for(const name of ['passedBadge','failedBadge','expertBadge'])colors[name]='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="10" fill="'+colors.text+'"/></svg>');
    return colors;
  }
  let colors=palette(false);
  const extracted=resultGraph?section('function toneOf(', 'function pathNodeElement(')+section('function pathGraphStyles(', 'function mountPathGraph(')
    :section('function expertGlowStyle(', 'function theme()')+section('function graphStyles(', 'function renderGraph(');
  // 提取函数与真实vendor在同一realm运行，保持plain-object API和浏览器一致。
  const ctx=new Function('theme','FONT','window','var cy=null,pathCy=null,graphStyleContext={narrow:false,dense:false},pathStyleContext={narrow:false,heavy:false};'+extracted+
    ';return {styles:'+(resultGraph?'pathGraphStyles':'graphStyles')+',sync:'+(resultGraph?'syncPathTheme':'syncGraphTheme')+',attach:function(graph){cy=graph;pathCy=graph;},current:function(){return '+(resultGraph?'pathCy':'cy')+';}};')(()=>colors,'sans-serif',{CnmGraphHalo:require('../assets/graph-halo.js')});
  const style=ctx.styles,sync=ctx.sync;
  const graph=cytoscape({headless:true,styleEnabled:true,layout:{name:'preset'},elements:[
    {data:{id:'a',label:'科学'},position:{x:20,y:30},classes:'primary grade'},
    {data:{id:'b',label:'专家',testStatus:'mastered'},position:{x:210,y:130},classes:'junior current test-expert expert-unlocked'},
    {data:{id:'c',label:'高中'},position:{x:400,y:210},classes:'senior test-passed'},
    {data:{id:'d',label:'薄弱'},position:{x:590,y:320},classes:'junior root test-failed'},
    {data:{id:'e',label:'已通过'},position:{x:770,y:420},classes:'junior test-passed expert-unlocked'},
    {data:{id:'ab',source:'a',target:'b'},classes:'soft'},
    {data:{id:'bc',source:'b',target:'c'},classes:'hard'}
  ].map(element=>({...element,data:{bg:'#ffffff',border:'#000000',color:'#333333',...element.data}})),style:style(colors,false,false)});
  ctx.attach(graph);sync();graph.zoom(1.37);graph.pan({x:88,y:-49});
  const geometry=()=>graph.nodes().map(n=>({id:n.id(),x:n.position('x'),y:n.position('y'),w:n.width(),h:n.height(),classes:n.classes()}));
  const before=JSON.parse(JSON.stringify(geometry())),camera={zoom:graph.zoom(),pan:{...graph.pan()}},rules=graph.style().json().length;
  for(let i=0;i<30;i++){
    colors=palette(i%2===0);sync();
    assert.equal(ctx.current(),graph);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry())),before);
    assert.deepEqual({zoom:graph.zoom(),pan:{...graph.pan()}},camera);
    assert.equal(graph.style().json().length,rules,'主题切换不能累加stylesheet');
    assert.equal(graph.$id('a').data('bg'),colors.primaryBg);assert.equal(graph.$id('b').data('bg'),colors.currentBg);
    assert.equal(graph.$id('d').data('bg'),resultGraph?colors.badBg:colors.juniorBg);
    assert.equal(graph.$id('ab').data('color'),colors.edgeSoft);assert.equal(graph.$id('bc').data('color'),colors.edge);
    if(!resultGraph){
      assert.equal(graph.$id('b').pstyle('background-image').value[1],colors.expertBadge);
      assert.ok(decodeURIComponent(graph.$id('b').pstyle('background-image').value[0]).includes(colors.expertGlow));
      assert.equal(graph.$id('e').pstyle('background-image').value[1],colors.passedBadge);
    }
  }
  graph.destroy();assert.doesNotThrow(sync);
});
console.log('test_graph_motion: '+passed+' passed');
