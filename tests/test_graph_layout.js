#!/usr/bin/env node
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cytoscape=require('../assets/vendor/cytoscape.min.js');
const dagre=require('../assets/vendor/dagre.min.js');
const Layout=require('../assets/graph-layout.js');
const plugin={module:{exports:{}},exports:{},require(name){assert.equal(name,'dagre');return dagre;}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/vendor/cytoscape-dagre.js'),'utf8'),plugin);
cytoscape.use(plugin.module.exports);
const rows=require('../data/topics.json'), edges=require('../data/dependencies.json');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('  ok   '+name);}
function cyGraph(elements){return cytoscape({headless:true,styleEnabled:true,layout:{name:'preset'},elements,
  style:[{selector:'node',style:{width:156,height:40,'border-width':2}},{selector:'node[label]',style:{label:'data(label)'}},{selector:'.current',style:{width:163.8,height:42}}]});}
function small(width=156){const cy=cyGraph([{data:{id:'a'}},{data:{id:'b'}},{data:{id:'ab',source:'a',target:'b'}}]);cy.nodes().style('width',width);return cy;}
const base={rankDir:'TB',rankSep:64,nodeSep:26,edgeSep:12,ranker:'network-simplex',fit:false,animate:false,nodeDimensionsIncludeLabels:false,spacingFactor:1.05};
function realElements(subject,keep){const topics=rows.filter(t=>t.subject===subject&&keep(t)),ids=new Set(topics.map(t=>t.id));return [
  ...topics.map((t,i)=>({data:{id:t.id,label:t.name},classes:i===0?'current':''})),
  ...edges.filter(e=>ids.has(e.topicId)&&ids.has(e.prerequisiteId)).map((e,i)=>({data:{id:'e'+i,source:e.prerequisiteId,target:e.topicId}}))];}
function model(cy){return cy.elements().map(n=>({id:n.id(),data:{...n.data()},classes:n.classes(),width:n.isNode()?n.width():null}));}
function storage(){const map=new Map(),writes=[];return {map,writes,getItem:k=>map.get(k)||null,setItem(k,v){map.set(k,v);writes.push(k);}};}
function fakeWorkerFactory({never=false,error=false,invalid=false,manual=false}={}){
 const workers=[];
 function factory(){const worker={terminated:false,messages:[],terminate(){this.terminated=true;},postMessage(message){this.messages.push(message);if(manual||never)return;Promise.resolve().then(()=>{if(error){this.onerror(new Error('blocked worker'));return;}this.onmessage({data:{id:message.id,positions:invalid?{}:Layout.compute(message.data,dagre)}});});}};workers.push(worker);return worker;}
 return {workers,factory};
}
function equalPositions(a,b){for(const id of Object.keys(a)){assert.ok(Math.abs(a[id].x-b[id].x)<1e-6,id+' x');assert.ok(Math.abs(a[id].y-b[id].y)<1e-6,id+' y');}}
(async()=>{
 await test('worker coordinates + preset exactly match current Dagre plugin for real full, stage, book and science graphs',()=>{
  for(const [subject,keep] of [['physics',()=>true],['physics',t=>t.grade<=9],['physics',t=>t.grade===9],['science',t=>t.grade===1]]){
   const elements=realElements(subject,keep),a=cyGraph(elements),b=cyGraph(elements),opts={...base};if(a.nodes().length>80)Object.assign(opts,{rankSep:48,nodeSep:18,edgeSep:8,ranker:'longest-path',spacingFactor:1.02});
   const before=model(b),data=Layout.snapshot(b,opts),input=JSON.stringify(data),raw=Layout.compute(data,dagre);
   assert.equal(JSON.stringify(data),input,'pure computation does not mutate input');
   a.layout({name:'dagre',...opts}).run();b.layout({name:'preset',...opts,positions:n=>raw[n.id()]}).run();
   const actual=Object.fromEntries(a.nodes().map(n=>[n.id(),{...n.position()}])),candidate=Object.fromEntries(b.nodes().map(n=>[n.id(),{...n.position()}]));
   equalPositions(actual,candidate);assert.deepEqual(model(b),before);assert.equal(Object.keys(raw).length,b.nodes().length);a.destroy();b.destroy();
  }
 });
 await test('warm layouts are reused across clients/pages while progress classes and caller mutations cannot corrupt geometry',async()=>{
  const st=storage(),fake=fakeWorkerFactory(),cy=small(),one=Layout.create({storage:st,workerFactory:fake.factory,dagre});
  const first=await one.run(cy,base);assert.equal(first.source,'worker');assert.equal(fake.workers[0].messages.length,1);
  first.positions.a.x=999999;cy.nodes().addClass('test-expert');cy.nodes().data('testStatus','mastered');
  const second=await one.run(cy,base);assert.equal(second.cached,true);assert.notEqual(second.positions.a.x,999999);
  one.destroy();const two=Layout.create({storage:st,workerFactory:()=>{throw new Error('cache hit must not start worker');},dagre});
  const restored=await two.run(cy,base);assert.equal(restored.source,'cache');equalPositions(restored.positions,second.positions);
  assert.deepEqual(new Set(st.writes),new Set([Layout.KEY]));two.destroy();cy.destroy();
 });
 await test('dimensions, ordered topology and algorithm options invalidate cache instead of mixing stage/book geometry',async()=>{
  const st=storage(),fake=fakeWorkerFactory(),cy=small(),api=Layout.create({storage:st,workerFactory:fake.factory,dagre});
  assert.equal((await api.run(cy,base)).cached,false);assert.equal((await api.run(cy,base)).cached,true);
  cy.getElementById('a').addClass('current');assert.equal((await api.run(cy,base)).cached,false);
  assert.equal((await api.run(cy,{...base,rankDir:'LR'})).cached,false);
  cy.add({data:{id:'c'}});assert.equal((await api.run(cy,base)).cached,false);
  cy.add({data:{id:'bc',source:'b',target:'c'}});assert.equal((await api.run(cy,base)).cached,false);
  assert.equal(fake.workers[0].messages.length,5);api.destroy();cy.destroy();
 });
 await test('LRU stays bounded and validates cached point IDs and numbers before returning positions',async()=>{
  const st=storage(),fake=fakeWorkerFactory(),api=Layout.create({storage:st,workerFactory:fake.factory,dagre,maxEntries:2});const graphs=[small(100),small(110),small(120)];
  await api.run(graphs[0],base);await api.run(graphs[1],base);await api.run(graphs[0],base);await api.run(graphs[2],base);
  const saved=JSON.parse(st.getItem(Layout.KEY));assert.equal(saved.entries.length,2);assert.ok(st.getItem(Layout.KEY).length<=Layout.MAX_BYTES);
  api.destroy();saved.entries[0].positions.a.x=null;st.setItem(Layout.KEY,JSON.stringify(saved));
  const next=Layout.create({storage:st,workerFactory:fake.factory,dagre});assert.equal((await next.run(graphs[0],base)).source,'worker');
  assert.equal((await next.run(graphs[1],base)).source,'worker','least recently used geometry was evicted');next.destroy();graphs.forEach(c=>c.destroy());
 });
 await test('unsupported workers, import failures, bad replies and timeouts yield then use the same main-thread fallback',async()=>{
  const cy=small(),expected=Layout.compute(Layout.snapshot(cy,base),dagre);
  for(const failure of ['unsupported','construction','error','invalid','timeout']){
   const fake=fakeWorkerFactory({error:failure==='error',invalid:failure==='invalid',never:failure==='timeout'});
   const api=Layout.create({storage:null,dagre,timeout:5,workerFactory:failure==='construction'?()=>{throw new Error('CSP');}:failure==='unsupported'?()=>null:fake.factory});
   let settled=false;const job=api.run(cy,base).then(result=>{settled=true;return result;});assert.equal(settled,false,'fallback yields before blocking calculation');
   const result=await job;assert.equal(result.source,'main');equalPositions(result.positions,expected);api.destroy();
  }cy.destroy();
 });
 await test('new scenes and abort signals terminate old worker jobs, ignore stale replies and do not cache cancelled data',async()=>{
  const st=storage(),fake=fakeWorkerFactory({manual:true}),api=Layout.create({storage:st,workerFactory:fake.factory,dagre}),cy=small();
  const first=api.run(cy,base).then(()=>{throw new Error('cancelled result');},e=>e);const old=fake.workers[0];
  const next=api.run(cy,{...base,rankDir:'LR'});assert.equal((await first).name,'AbortError');assert.equal(old.terminated,true);
  old.onmessage({data:{id:old.messages[0].id,positions:Layout.compute(old.messages[0].data,dagre)}});assert.equal(st.getItem(Layout.KEY),null);
  const current=fake.workers[1],message=current.messages[0];current.onmessage({data:{id:message.id,positions:Layout.compute(message.data,dagre)}});assert.equal((await next).source,'worker');
  const controller=new AbortController(),abort=api.run(cy,{...base,rankDir:'BT',signal:controller.signal}).catch(e=>e);controller.abort();assert.equal((await abort).name,'AbortError');assert.equal(current.terminated,true);
  assert.equal(JSON.parse(st.getItem(Layout.KEY)).entries.length,1);api.destroy();cy.destroy();
 });
 await test('pagehide and destroy release workers without touching learning data; malformed/unavailable cache is optional',async()=>{
  const listeners=new Map(),win={addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t)},fake=fakeWorkerFactory({manual:true}),cy=small();
  const api=Layout.create({window:win,workerFactory:fake.factory,storage:{getItem(){throw new Error('privacy');},setItem(){throw new Error('quota');}},dagre});
  const pending=api.run(cy,base).catch(e=>e);listeners.get('pagehide')();assert.equal((await pending).name,'AbortError');assert.equal(fake.workers[0].terminated,true);
  const next=api.run(cy,base),worker=fake.workers[1],message=worker.messages[0];worker.onmessage({data:{id:message.id,positions:Layout.compute(message.data,dagre)}});assert.equal((await next).source,'worker');
  api.destroy();assert.equal(listeners.size,0);assert.equal((await api.run(cy,base).catch(e=>e)).name,'AbortError');cy.destroy();
 });
 await test('actual worker adapter imports only bundled libraries and returns finite complete positions or explicit error',()=>{
  const sent=[],context={self:{},importScripts(...urls){assert.deepEqual(urls,['vendor/dagre.min.js','graph-layout.js']);context.self.dagre=dagre;context.self.CnmGraphLayout=Layout;}};context.self.postMessage=m=>sent.push(m);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/graph-layout-worker.js'),'utf8'),context);
  const cy=small(),data=Layout.snapshot(cy,base);context.self.onmessage({data:{id:7,data}});assert.equal(sent[0].id,7);assert.equal(Object.keys(sent[0].positions).length,2);
  context.self.onmessage({data:{id:8,data:{}}});assert.equal(sent[1].id,8);assert.ok(sent[1].error);cy.destroy();
 });
 console.log('test_graph_layout: '+passed+' passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
