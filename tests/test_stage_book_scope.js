#!/usr/bin/env node
'use strict';
// Exercise the production scope transitions against the real topic/edge data.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BookSelection = require('../assets/book-selection.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'explore/app.js'), 'utf8');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
const edges = JSON.parse(fs.readFileSync(path.join(root, 'data/dependencies.json'), 'utf8'));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function element() {
  const attrs = new Map();
  return { textContent:'', hidden:false, value:'', scrollTop:0, open:false,
    children:[], dataset:{}, setAttribute(k,v) { attrs.set(k,String(v)); },
    removeAttribute(k) { attrs.delete(k); }, getAttribute(k) { return attrs.get(k); },
    replaceChildren(...items) { this.children=items; }, append(...items) { this.children.push(...items); },
    querySelectorAll() { return []; }, contains() { return false; }, focus() {} };
}
function load(subject = 'physics') {
  const nodes = new Map(), writes = [], locations = [];
  const ctx = {
    URL, URLSearchParams, Set, Map,
    CN:['','一','二','三','四','五','六','七','八','九'],
    EN_BOOK:{10:['必修一'],11:['必修二'],12:['必修三'],13:['选必一'],14:['选必二'],15:['选必三']},
    window:{CnmBookSelection:BookSelection,
      CnmChildren:{setBookSelection(sub,values) { writes.push({subject:sub, volumes:Array.from(values)}); return {ok:true}; }},
      CnmLastLocation:{resume() { return ctx.recent || null; }, remember(record) { locations.push(record); },
        rememberLearning() { throw new Error('Scope changes must never fabricate learning records'); }}},
    location:{origin:'https://physicalmap.pages.dev',pathname:'/explore/',href:'https://physicalmap.pages.dev/explore/',search:'',hash:''},
    document:{querySelectorAll:()=>[],activeElement:null},
    $:id=>{ if(!nodes.has(id)) nodes.set(id,element()); return nodes.get(id); },
    subject, selectedVolumes:[], volume:'', stage:'', grade:'', domain:'', query:'',
    showWholeBook:true, upDepth:2, aliasHitIds:new Set(), selected:null, currentAlias:null,
    explicitNodeSelection:null, ancestorsOpen:false, mobileScroll:{detail:0}, graphNeedsRender:false,
    graphCamera:null, locationOwner:'guest',
    readHash:()=>ctx.hash || '', resolveId:id=>ctx.byId.has(id)?{id,alias:null}:null,
    closeNodeDiagnosis(){}, rememberViewport(){}, renderList(){}, renderDetail(){}, syncMobileTopic(){},
    syncControls(){}, highlight(){}, closeDrawerIfMobile(){}, closeBookPicker(){},
    prepareCameraTransition(){return null;},focusExistingBook(){return false;},
    writeHash(id) { ctx.location.hash='#'+id; },
    renderGraph(restore) { ctx.renders++; ctx.lastRestore=restore; }, renders:0,
    topicElement:id=>({group:'nodes',data:{id}}),
    edgeElement:(id,sourceId,targetId)=>({group:'edges',data:{id,source:sourceId,target:targetId}}),
    history:{replaceState(_a,_b,url) { const parsed=new URL(url,ctx.location.origin); Object.assign(ctx.location,{search:parsed.search,href:parsed.href,hash:parsed.hash}); }}
  };
  ctx.topics=rows.filter(t=>t.subject===subject);
  ctx.byId=new Map(ctx.topics.map(t=>[t.id,t]));
  ctx.deps=edges.filter(e=>ctx.byId.has(e.topicId)&&ctx.byId.has(e.prerequisiteId));
  vm.createContext(ctx);
  vm.runInContext(section('function booksForSubject()', 'function currentChild()')+
    section('function graphReturnTo()', 'function gradeWord(')+
    section('function passFilter(topic)', 'function chapterProgressKey(')+
    section('function select(raw, source', 'function zoomBy(')+
    section('function rememberLocation()', 'function restoreLocation(')+
    section('function applyQuery()', 'function bind()')+
    section('function buildFullElements(', 'function graphStyles('),ctx);
  return {ctx,writes,locations,nodes};
}
function scope(ctx) { return Array.from(ctx.selectedVolumes); }
function network(ctx, expected) {
  const ids=ctx.scopedNodeSet(new Set([ctx.selected]));
  const expectedIds=ctx.topics.filter(expected).map(t=>t.id).sort();
  assert.deepEqual(Array.from(ids).sort(),expectedIds,'Graph nodes are exactly the chosen textbook network');
  const result=ctx.buildFullElements(ids,{});
  const resultEdges=result.filter(e=>e.group==='edges');
  const expectedEdges=ctx.deps.filter(e=>ids.has(e.topicId)&&ids.has(e.prerequisiteId));
  assert.equal(resultEdges.length,expectedEdges.length,'All real dependencies within the scope remain visible');
  assert.ok(resultEdges.every(e=>ids.has(e.data.source)&&ids.has(e.data.target)),'No edge leaks another stage or book');
  return ids.size;
}
let passed=0;
function test(name, fn) { fn(); passed++; console.log('  ok   '+name); }
test('physics stage options are three junior, six senior and nine total textbooks',()=>{
  const {ctx}=load();
  assert.deepEqual(Array.from(ctx.booksForStage('j'),x=>x[0]),['八上','八下','九全']);
  assert.deepEqual(Array.from(ctx.booksForStage('h'),x=>x[0]),BookSelection.allowed('physics').slice(3));
  assert.deepEqual(Array.from(ctx.booksForStage(''),x=>x[0]),BookSelection.allowed('physics'));
});
test('stage buttons switch the actual complete graph: 92 junior, 177 senior and 269 total',()=>{
  const {ctx,writes}=load();
  ctx.showWholeBook=false;ctx.domain='能量';ctx.query='obsolete';ctx.grade='9';
  ctx.recent={subject:'physics',topicId:'cnp_071'};
  ctx.chooseStage('j');
  assert.equal(ctx.stage,'j');assert.equal(ctx.showWholeBook,true);assert.equal(ctx.domain,'');assert.equal(ctx.query,'');
  assert.equal(ctx.selected,'cnp_071');assert.equal(network(ctx,t=>t.grade>=7&&t.grade<=9),92);
  assert.equal(ctx.lastRestore,false,'A stage change does not restore an unrelated old camera');
  ctx.recent={subject:'physics',topicId:'cnp_h020'};ctx.chooseStage('h');
  assert.equal(ctx.stage,'h');assert.equal(ctx.selected,'cnp_h020');assert.equal(network(ctx,t=>t.grade>=10),177);
  ctx.chooseStage('');assert.equal(ctx.stage,'');assert.equal(network(ctx,()=>true),269);
  assert.equal(ctx.selected,'cnp_h020');
  assert.deepEqual(writes.map(x=>x.volumes.length),[3,6,9]);
});
test('single and multiple junior books produce exact unions and preserve URL and diagnosis-return scope',()=>{
  const {ctx,locations,writes}=load();ctx.chooseStage('j');
  ctx.chooseBooks(['九全'],true,'j');assert.deepEqual(scope(ctx),['九全']);assert.equal(ctx.stage,'j');
  assert.equal(network(ctx,t=>t.grade===9),40);
  let back=new URL(ctx.graphReturnTo(),ctx.location.origin);
  assert.equal(back.searchParams.get('volume'),'九全');assert.equal(back.searchParams.get('stage'),'j');
  ctx.chooseBooks(['九全','八上','九全'],true,'j');assert.deepEqual(scope(ctx),['八上','九全']);
  assert.equal(network(ctx,t=>ctx.volumeOf(t)==='八上'||ctx.volumeOf(t)==='九全'),68);
  const diagnosis=new URL(ctx.withReturn('../diagnose/?subject=physics&target=cnp_053'),ctx.location.origin);
  back=new URL(diagnosis.searchParams.get('returnTo'),ctx.location.origin);
  assert.equal(back.searchParams.get('volumes'),'八上,九全');assert.equal(back.searchParams.get('stage'),'j');
  assert.equal(back.searchParams.get('view'),'book');
  assert.deepEqual(Array.from(locations.at(-1).volumes),['八上','九全']);
  assert.deepEqual(writes.at(-1),{subject:'physics',volumes:['八上','九全']});
  ctx.chooseBooks(['八上','八下','九全'],true,'j');assert.equal(network(ctx,t=>t.grade<=9),92);
});
test('empty or entirely out-of-stage checkbox selections cannot silently expand into an all-books graph',()=>{
  const {ctx,writes}=load();ctx.chooseStage('j');ctx.chooseBooks(['九全'],true,'j');
  const before={scope:scope(ctx),selected:ctx.selected,stage:ctx.stage,writeCount:writes.length,renders:ctx.renders};
  ctx.chooseBooks([],true,'j');
  assert.deepEqual({scope:scope(ctx),selected:ctx.selected,stage:ctx.stage,writeCount:writes.length,renders:ctx.renders},before);
  ctx.chooseBooks(['必修一'],true,'j');
  assert.deepEqual({scope:scope(ctx),selected:ctx.selected,stage:ctx.stage,writeCount:writes.length,renders:ctx.renders},before);
});
test('out-of-scope recent learning does not drag a stage transition back into a different book',()=>{
  const {ctx}=load();ctx.setBookScope(['九全']);ctx.selected='cnp_071';
  ctx.recent={subject:'physics',topicId:'cnp_h020'};ctx.chooseStage('j');
  assert.equal(ctx.selected,'cnp_071');assert.equal(ctx.stage,'j');assert.equal(network(ctx,t=>t.grade<=9),92);
  ctx.recent={subject:'science',topicId:'cns_p001'};ctx.chooseStage('h');
  assert.equal(ctx.selected,'cnp_h001');assert.equal(ctx.stage,'h');assert.equal(network(ctx,t=>t.grade>=10),177);
});
test('stage-only and contradictory URLs normalize before boot and never write textbook preferences',()=>{
  for(const [search,books,size] of [
    ['?subject=physics&stage=j',['八上','八下','九全'],92],
    ['?subject=physics&stage=h',BookSelection.allowed('physics').slice(3),177],
    ['?subject=physics&stage=h&volumes=九全,必修一',['必修一'],27],
    ['?subject=physics&stage=j&volume=必修一',['八上','八下','九全'],92]
  ]) {
    const {ctx,writes}=load();ctx.location.search=search;ctx.applyQuery();ctx.bootSelection();
    assert.deepEqual(scope(ctx),books,search);assert.equal(ctx.showWholeBook,true);
    assert.equal(ctx.scopedNodeSet(new Set([ctx.selected])).size,size,search);
    assert.ok(ctx.selected&&ctx.byId.has(ctx.selected));assert.deepEqual(writes,[],'URL restore is not a new explicit selection');
  }
});
test('an explicit three-book junior URL restores the same network, focus and local-view preference',()=>{
  const {ctx,writes}=load();
  ctx.location.search='?subject=physics&stage=j&volumes=九全,八上,八下&view=local&depth=all';
  ctx.hash='cnp_071';ctx.applyQuery();ctx.bootSelection();
  assert.deepEqual(scope(ctx),['八上','八下','九全']);assert.equal(ctx.selected,'cnp_071');
  assert.equal(ctx.stage,'j');assert.equal(ctx.showWholeBook,false);assert.equal(ctx.upDepth,'all');
  assert.deepEqual(writes,[]);
});
test('science stage and multiple textbooks retain the twelve-book primary network',()=>{
  const {ctx,writes}=load('science');ctx.chooseStage('p');
  assert.equal(ctx.booksForStage('p').length,12);assert.equal(network(ctx,()=>true),269);
  ctx.chooseBooks(['六下','一上'],true,'p');assert.deepEqual(scope(ctx),['一上','六下']);
  assert.equal(network(ctx,t=>ctx.volumeOf(t)==='一上'||ctx.volumeOf(t)==='六下'),43);
  assert.deepEqual(writes.at(-1),{subject:'science',volumes:['一上','六下']});
});
console.log('test_stage_book_scope: '+passed+' passed');
