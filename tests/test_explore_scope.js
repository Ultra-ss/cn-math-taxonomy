#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const BookSelection = require('../assets/book-selection.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'explore/app.js'), 'utf8');
const allTopics = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
const dependencies = JSON.parse(fs.readFileSync(path.join(root, 'data/dependencies.json'), 'utf8'));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start); return source.slice(a, b);
}
function element() {
  const attrs = new Map();
  return {textContent:'',hidden:false,value:'',scrollTop:0,
    setAttribute(k,v){attrs.set(k,String(v));},removeAttribute(k){attrs.delete(k);},getAttribute(k){return attrs.get(k);}};
}
const nodes = Object.fromEntries(['q','detail','book-title','book-diagnose','mobile-book-title','book-note','book-view','book-challenge-hint','mobile-book-challenge-hint'].map(id=>[id,element()]));
const records=[], changes=[];
const ctx = {
  URL, URLSearchParams, Set, Map,
  CN:['','一','二','三','四','五','六','七','八','九'],
  EN_BOOK:{10:['必修一'],11:['必修二'],12:['必修三'],13:['选必一'],14:['选必二'],15:['选必三']},
  window:{CnmBookSelection:BookSelection,CnmLastLocation:{remember(record){records.push(record);}}},
  location:{origin:'https://physicalmap.pages.dev',pathname:'/explore/',href:'https://physicalmap.pages.dev/explore/',search:'',hash:''},
  document:{querySelectorAll:()=>[]},$:id=>nodes[id],
  subject:'physics',selectedVolumes:[],volume:'',stage:'',grade:'',domain:'',query:'',showWholeBook:true,upDepth:2,
  aliasHitIds:new Set(),selected:null,currentAlias:null,explicitNodeSelection:null,ancestorsOpen:false,
  mobileScroll:{detail:0},graphNeedsRender:false,labelLimit:()=>8,
  readHash:()=>ctx.hashValue || '',resolveId:id=>ctx.byId.has(id)?{id,alias:null}:null,
  closeNodeDiagnosis(){},rememberViewport(){},renderList(){},renderDetail(){},syncMobileTopic(){},
  graphCamera:null,
  syncControls(){},highlight(){},closeDrawerIfMobile(){},writeHash(id){ctx.lastHash=id;},renderGraph(restoreSavedCamera){ctx.rendered=(ctx.rendered||0)+1;ctx.lastCameraRestore=restoreSavedCamera;},
  history:{replaceState(_a,_b,url){changes.push(url);const parsed=new URL(url,ctx.location.origin);ctx.location.search=parsed.search;ctx.location.href=parsed.href;}}
};
function setSubject(subject) {
  ctx.subject=subject;ctx.topics=allTopics.filter(topic=>topic.subject===subject);
  ctx.byId=new Map(ctx.topics.map(topic=>[topic.id,topic]));
  ctx.deps=dependencies.filter(edge=>ctx.byId.has(edge.topicId)&&ctx.byId.has(edge.prerequisiteId));
}
setSubject('physics');
vm.createContext(ctx);
vm.runInContext(section('function booksForSubject()', 'function currentChild()')+
  section('function graphReturnTo()', 'function gradeWord(')+
  section('function passFilter(topic)', 'function chapterProgressKey(')+
  section('function select(raw, source', 'function zoomBy(')+
  section('function rememberLocation()', 'function restoreLocation(')+
  section('function applyQuery()', 'function bind()')+
  section('function cameraContext()', 'function captureViewport()')+
  section('function buildFullElements(', 'function renderGraph('),ctx);

ctx.location.search='?subject=physics&volumes=八下,八上,八上,三下';ctx.applyQuery();
assert.deepEqual(Array.from(ctx.selectedVolumes),['八上','八下']);assert.equal(ctx.volume,'');
assert.equal(ctx.topics.filter(ctx.passFilter).length,52);
assert.equal(ctx.firstScopedTopic().id,'cnp_001');
const union=ctx.scopedNodeSet(new Set(['cnp_001']));
assert.equal(union.size,52);assert.ok(union.has('cnp_001'));assert.ok(union.has('cnp_029'));assert.ok(!union.has('cnp_053'));
ctx.topicElement=id=>({group:'nodes',data:{id}});
ctx.edgeElement=(id,sourceId,targetId)=>({group:'edges',data:{id,source:sourceId,target:targetId}});
const elements=ctx.buildFullElements(union,{}), edges=elements.filter(element=>element.group==='edges');
assert.ok(edges.some(edge=>edge.data.source==='cnp_002'&&edge.data.target==='cnp_029'),'保留八上到八下的真实跨册依赖');
assert.ok(edges.every(edge=>union.has(edge.data.source)&&union.has(edge.data.target)),'不绘制未选择教材的节点和边');

ctx.showWholeBook=false;
const local=ctx.scopedNodeSet(new Set(['cnp_002','cnp_029','cnp_053']));
assert.deepEqual(Array.from(local),['cnp_002','cnp_029']);
ctx.showWholeBook=true;ctx.bootSelection();
assert.equal(ctx.selected,'cnp_001');assert.deepEqual(Array.from(ctx.selectedVolumes),['八上','八下']);
ctx.select('cnp_029','user');
assert.equal(ctx.selected,'cnp_029');assert.equal(ctx.volume,'');
assert.deepEqual(Array.from(ctx.selectedVolumes),['八上','八下'],'同组换节点不退回单册');
assert.deepEqual(Array.from(records.at(-1).volumes),['八上','八下']);assert.equal(records.at(-1).volume,'');
assert.deepEqual(Array.from(ctx.cameraContext().volumes),['八上','八下']);
ctx.syncBook();assert.equal(nodes['book-diagnose'].hidden,true,'组合图不伪装成仅检测第一本教材');
assert.equal(nodes['book-view'].hidden,false);assert.equal(nodes['book-title'].textContent,'已选 2 本教材');
assert.equal(nodes['book-note'].textContent,'所选教材共有 52 个知识点');
assert.equal(nodes['book-challenge-hint'].hidden,false);assert.equal(nodes['mobile-book-challenge-hint'].hidden,false);
const back=new URL(ctx.graphReturnTo(),ctx.location.origin);
assert.equal(back.searchParams.get('volumes'),'八上,八下');assert.ok(!back.searchParams.has('volume'));assert.equal(back.hash,'#cnp_029');
const diagnosis=new URL(ctx.withReturn('../diagnose/?subject=physics&target=cnp_029&retry=1'),ctx.location.origin);
assert.equal(new URL(diagnosis.searchParams.get('returnTo'),ctx.location.origin).searchParams.get('volumes'),'八上,八下');

// 只有用户显式跳到组合外的节点，才切换为该节点的教材。
ctx.select('cnp_053','hash');
assert.deepEqual(Array.from(ctx.selectedVolumes),['九全']);assert.equal(ctx.volume,'九全');
assert.equal(nodes['book-note'].textContent,'本册共有 40 个知识点');
assert.equal(nodes['book-challenge-hint'].hidden,false);assert.equal(nodes['mobile-book-challenge-hint'].hidden,false);
assert.ok(!('volumes' in records.at(-1)));assert.ok(!('volumes' in ctx.cameraContext()));
assert.equal(new URL(changes.at(-1),ctx.location.origin).searchParams.get('volume'),'九全');
assert.ok(!new URL(changes.at(-1),ctx.location.origin).searchParams.has('volumes'));

ctx.location.search='?subject=physics&volumes=八下,八上&view=local&depth=all';ctx.applyQuery();
ctx.hashValue='cnp_029';ctx.bootSelection();assert.equal(ctx.selected,'cnp_029');
assert.deepEqual(Array.from(ctx.selectedVolumes),['八上','八下']);assert.equal(ctx.showWholeBook,false);assert.equal(ctx.upDepth,'all');
ctx.chooseBook('八下');assert.deepEqual(Array.from(ctx.selectedVolumes),['八下']);assert.equal(ctx.selected,'cnp_029');
ctx.chooseBook('');assert.deepEqual(Array.from(ctx.selectedVolumes),BookSelection.allowed('physics'));assert.equal(ctx.volume,'');
assert.equal(ctx.selected,'cnp_029','没有学习记录时保留有效的当前知识点');
assert.equal(ctx.lastCameraRestore,false,'显式全部教材应重新对准目标，不套用拖远的旧相机');
assert.equal(ctx.isAllBookScope(),true);assert.equal(nodes['book-title'].textContent,'全部教材');
assert.equal(nodes['book-note'].textContent,'全部教材共有 269 个知识点');
assert.equal(nodes['book-challenge-hint'].hidden,true);assert.equal(nodes['mobile-book-challenge-hint'].hidden,true);
ctx.setBookScope([]);
const neighborhood=new Set(['cnp_001','cnp_053']);assert.equal(ctx.scopedNodeSet(neighborhood),neighborhood,'无册次范围仍是原局部图');

setSubject('science');ctx.location.search='?subject=science&volumes=一下,一上,八上';ctx.applyQuery();
assert.deepEqual(Array.from(ctx.selectedVolumes),['一上','一下']);assert.equal(ctx.topics.filter(ctx.passFilter).length,30);
assert.equal(ctx.scopedNodeSet(new Set()).size,30);ctx.hashValue='';ctx.bootSelection();
assert.equal(ctx.selected,'cns_p001');
assert.equal(new URL(ctx.graphReturnTo(),ctx.location.origin).searchParams.get('volumes'),'一上,一下');

// 全册组合仍采用所选范围，包含全部教材时不会落回无范围的祖先折叠模式。
setSubject('physics');ctx.setBookScope(BookSelection.allowed('physics'));ctx.showWholeBook=true;
assert.equal(ctx.hasBookScope(),true);assert.equal(ctx.scopedNodeSet(new Set()).size,269);
assert.equal(ctx.selectedVolumes.length,9);
ctx.syncBook();assert.equal(nodes['book-challenge-hint'].hidden,true,'混合初高中教材不显示仅初中适用的两轮说明');
ctx.setBookScope(['必修一']);ctx.syncBook();assert.equal(nodes['book-note'].textContent,'本册共有 27 个知识点');
assert.equal(nodes['book-challenge-hint'].hidden,true);assert.equal(nodes['mobile-book-challenge-hint'].hidden,true);
setSubject('science');ctx.setBookScope(['一上']);ctx.syncBook();assert.equal(nodes['book-note'].textContent,'本册共有 15 个知识点');
assert.equal(nodes['book-challenge-hint'].hidden,true);assert.equal(nodes['mobile-book-challenge-hint'].hidden,true);
setSubject('physics');
ctx.window.CnmLastLocation.resume=()=>({subject:'physics',volume:'必修一',topicId:'cnp_h020',view:'local',depth:3});
ctx.selected='cnp_071';ctx.setBookScope(['九全']);ctx.chooseBook('');
assert.equal(ctx.selected,'cnp_h020','全教材恢复本账号最近学习点，而不是当前浏览点');
assert.equal(ctx.isAllBookScope(),true);assert.equal(ctx.showWholeBook,true,'不被学习记录的旧单册/局部视图缩小范围');
assert.equal(ctx.scopedNodeSet(new Set([ctx.selected])).size,269);
assert.deepEqual(Array.from(records.at(-1).volumes),BookSelection.allowed('physics'));
assert.equal(new URL(ctx.graphReturnTo(),ctx.location.origin).searchParams.get('volumes'),BookSelection.allowed('physics').join(','));
ctx.window.CnmLastLocation.resume=()=>({subject:'science',topicId:'cns_p001'});
ctx.selected=null;ctx.setBookScope([]);ctx.hashValue='';ctx.stage='';ctx.grade='';ctx.domain='';ctx.query='';ctx.bootSelection();
assert.equal(ctx.selected,'cnp_001','全新或错学科记录不产生空白，默认全部教材第一点');assert.equal(ctx.isAllBookScope(),true);
setSubject('science');ctx.selected=null;ctx.setBookScope([]);ctx.window.CnmLastLocation.resume=()=>null;ctx.chooseBook('');
assert.equal(ctx.selected,'cns_p001');assert.deepEqual(Array.from(ctx.selectedVolumes),BookSelection.allowed('science'));
assert.equal(ctx.scopedNodeSet(new Set()).size,ctx.topics.length);assert.equal(ctx.lastCameraRestore,false);
console.log('test_explore_scope: multi-book union/edges, local scope, selection, URLs, memory/camera and legacy choices passed');
