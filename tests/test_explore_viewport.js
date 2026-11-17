#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/explore-viewport.js'), 'utf8');
const KEY = 'cnmExplore.viewport.v1';
const scene = {subject:'physics', volume:'八下', topicId:'cnp_030', view:'book', depth:2, layout:'labels-8'};
const state = {zoom:0.9375, centerX:1234.25, centerY:-678.125, width:390, height:613, expanded:false};
function load(options={}) {
  const entries = new Map(Object.entries(options.entries || {}));
  const root = {sessionStorage:{
    getItem(key) { if (options.failRead) throw new Error('read denied'); return entries.has(key) ? entries.get(key) : null; },
    setItem(key,value) { if (options.failWrite) throw new Error('quota'); entries.set(key,value); },
    removeItem(key) { if (options.failClear) throw new Error('clear denied'); entries.delete(key); }
  }};
  if (options.denied) Object.defineProperty(root, 'sessionStorage', {get(){throw new Error('storage denied');}});
  if(options.owner) root.CnmLastLocation={owner:()=>options.owner.value};
  const ctx={window:root,module:{exports:{}}};
  vm.runInNewContext(source, ctx, {filename:'assets/explore-viewport.js'});
  return {api:ctx.module.exports,entries};
}
const plain=value=>JSON.parse(JSON.stringify(value));
let passed=0;
function test(name,fn){fn();passed++;console.log('  ok   '+name);}
test('空标签页没有相机，浏览器与Node接口均可用',()=>{
  const {api}=load();assert.equal(api.KEY,KEY);assert.equal(api.read(scene),null);
  const node=require('../assets/explore-viewport.js');assert.equal(node.KEY,KEY);assert.equal(node.read(scene),null);
});
test('保存模型中心、精确缩放和折叠状态，重新加载模块后仍可读取',()=>{
  const {api,entries}=load();assert.equal(api.save(scene,{...state,expanded:true}),true);
  assert.deepEqual(plain(api.read(scene)),{...state,expanded:true});
  const next=load({entries:Object.fromEntries(entries)});assert.deepEqual(plain(next.api.read(scene)),{...state,expanded:true});
  const changed=next.api.read(scene);changed.zoom=9;assert.equal(next.api.read(scene).zoom,state.zoom,'读取结果为独立副本');
});
test('检测返回的五字段上下文和节点几何均须精确一致',()=>{
  const {api,entries}=load();api.save(scene,state);const before=entries.get(KEY);
  for(const fields of [
    {subject:'science',volume:'三下',topicId:'cns_p086'}, {volume:'八上'}, {topicId:'cnp_031'},
    {view:'local'}, {depth:3}, {depth:'all'}, {layout:'labels-10'}
  ]) assert.equal(api.read({...scene,...fields}),null,JSON.stringify(fields));
  assert.equal(entries.get(KEY),before,'不匹配时不删旧场景');assert.deepEqual(plain(api.read(scene)),state);
});
test('每个学科各保留最近场景，科学和物理互不覆盖，同科换教材仍须匹配',()=>{
  const {api,entries}=load();api.save(scene,state);
  const science={...scene,subject:'science',volume:'三下',topicId:'cns_p086'}, scienceState={...state,zoom:1.125,centerX:400,centerY:200};
  assert.equal(api.save(science,scienceState),true);
  assert.deepEqual(plain(api.read(scene)),state);assert.deepEqual(plain(api.read(science)),scienceState);
  for(const fields of [{volume:'必修二',topicId:'cnp_h028'},{volume:'',topicId:'cnp_071'}]) {
    const next={...scene,...fields};assert.equal(api.save(next,state),true);assert.deepEqual(plain(api.read(next)),state);assert.equal(api.read(scene),null);
    assert.deepEqual(plain(api.read(science)),scienceState);
  }
  assert.equal(entries.size,3);
  const next=load({entries:Object.fromEntries(entries)});assert.deepEqual(plain(next.api.read(science)),scienceState);
});
test('旧主键相机兼容读取，首次切学科前归档旧画面，旧页面同科新保存仍优先',()=>{
  const legacy={v:1,context:scene,camera:state};
  const {api,entries}=load({entries:{[KEY]:JSON.stringify(legacy)}});
  assert.deepEqual(plain(api.read(scene)),state);
  const science={...scene,subject:'science',volume:'三下',topicId:'cns_p086'};
  assert.equal(api.save(science,{...state,zoom:1.25}),true);assert.deepEqual(plain(api.read(scene)),state);
  const newer={...scene,topicId:'cnp_031'};
  entries.set(KEY,JSON.stringify({v:1,context:newer,camera:{...state,zoom:1.5}}));
  assert.equal(api.read(scene),null,'不能用较旧的同科旁路存档覆盖旧页面的新场景');
  assert.equal(api.read(newer).zoom,1.5);
  api.save(science,state);assert.equal(api.read(scene),null);assert.equal(api.read(newer).zoom,1.5);
});
test('旁路相机仍严格验证学科和场景，主键损坏可读取有效的本学科相机',()=>{
  const saved={v:1,context:scene,camera:state};
  const {api,entries}=load({entries:{[KEY]:'broken',[KEY+'.physics']:JSON.stringify(saved)}});
  assert.deepEqual(plain(api.read(scene)),state);
  assert.equal(api.read({...scene,topicId:'cnp_031'}),null);
  const science={...scene,subject:'science',volume:'三下',topicId:'cns_p086'};
  entries.set(KEY+'.science',JSON.stringify(saved));assert.equal(api.read(science),null,'错科旁路不能恢复');
  entries.set(KEY+'.physics',JSON.stringify({...saved,camera:{...state,zoom:0}}));assert.equal(api.read(scene),null);
});
test('账号相机与访客隔离，切账号不能套用另一人的同节点视角',()=>{
  const owner={value:'guest'}, app=load({owner});app.api.save(scene,state);
  owner.value='a';assert.equal(app.api.read(scene),null);app.api.save(scene,{...state,zoom:1.1});
  owner.value='b';assert.equal(app.api.read(scene),null);app.api.save(scene,{...state,zoom:1.4});
  owner.value='a';assert.equal(app.api.read(scene).zoom,1.1);app.api.clear();assert.equal(app.api.read(scene),null);
  owner.value='b';assert.equal(app.api.read(scene).zoom,1.4);
  owner.value='guest';assert.equal(app.api.read(scene).zoom,state.zoom);
});
test('可选布局为空与省略等价，expanded省略默认为收起',()=>{
  const {api}=load();const noLayout={...scene};delete noLayout.layout;const noExpanded={...state};delete noExpanded.expanded;
  assert.equal(api.save(noLayout,noExpanded),true);assert.deepEqual(plain(api.read({...noLayout,layout:''})),state);
});
test('多本场景按集合匹配，点击顺序不同仍恢复同一画面',()=>{
  const {api,entries}=load();
  const group={...scene,volume:'',volumes:['九全','八下','八上','八下']};
  assert.equal(api.save(group,state),true);
  assert.deepEqual(JSON.parse(entries.get(KEY)).context.volumes,['八上','八下','九全']);
  assert.deepEqual(plain(api.read({...group,volumes:['八下','九全','八上']})),state);
  assert.equal(api.read({...group,volumes:['八上','八下']}),null,'同一知识点换一组教材不能套旧画面');
  assert.equal(api.read({...scene,volume:''}),null,'没有范围不等于多本');
  const single={...scene,volume:'',volumes:['八下','八下']};
  assert.equal(api.save(single,state),true);assert.deepEqual(plain(api.read(scene)),state);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(entries.get(KEY)).context,'volumes'),false);
});
test('科学多本与明确全选范围可保存，全选不等于无范围',()=>{
  const {api}=load();
  const science={...scene,subject:'science',volume:'',topicId:'cns_p086',volumes:['三下','三上','一下']};
  assert.equal(api.save(science,state),true);assert.deepEqual(plain(api.read({...science,volumes:['一下','三上','三下']})),state);
  const all={...scene,volume:'',volumes:['八上','八下','九全','必修一','必修二','必修三','选必一','选必二','选必三']};
  assert.equal(api.save(all,state),true);assert.equal(api.read({...scene,volume:''}),null);
});
test('非法或矛盾多本上下文不覆盖有效场景',()=>{
  const {api,entries}=load();api.save(scene,state);const before=entries.get(KEY);
  for(const volumes of [[],null,'八上,八下',['八上','三下'],['八上','bad'],['八上',''],['八上',2],new Array(2)]){
    assert.equal(api.save({...scene,volume:'',volumes},state),false,JSON.stringify(volumes));
    assert.equal(api.read({...scene,volume:'',volumes}),null);
    assert.equal(entries.get(KEY),before);
  }
  assert.equal(api.save({...scene,volumes:['八上','八下']},state),false);
  const inherited=Object.assign(Object.create({volumes:['八上','八下']}),scene,{volume:''});
  assert.equal(api.save(inherited,state),false);assert.equal(entries.get(KEY),before);
});
test('拒绝未知学科、跨科节点、非法册次、非数值层数或任意URL',()=>{
  const {api,entries}=load();api.save(scene,state);const before=entries.get(KEY);
  for(const fields of [
    {subject:'english'}, {topicId:'cns_p086'}, {volume:'三下'}, {volume:'https://example.org/'},
    {topicId:'https://example.org/'}, {topicId:'cnp_030\n'}, {view:'graph'}, {depth:'2'},
    {depth:Infinity}, {layout:'https://example.org/'}, {layout:'a'.repeat(101)}, {layout:[]}
  ]) {assert.equal(api.save({...scene,...fields},state),false,JSON.stringify(fields));assert.equal(api.read({...scene,...fields}),null);}
  const invalidScience={...scene,subject:'science',topicId:'cns_p086',volume:'八下'};
  assert.equal(api.save(invalidScience,state),false);
  assert.equal(entries.get(KEY),before,'非法保存不覆盖已有有效相机');
});
test('拒绝NaN、Infinity、数值字符串、极端坐标和隐藏容器，保留原记录',()=>{
  const {api,entries}=load();api.save(scene,state);const before=entries.get(KEY);
  const cases=[
    {zoom:NaN},{zoom:Infinity},{zoom:'1'},{zoom:0},{zoom:-1},{zoom:10.01},{zoom:0.001},
    {centerX:1e9},{centerY:-1e9},{centerX:'12'},{centerY:null},{centerX:Infinity},
    {width:0},{height:0},{width:-10},{height:Infinity},{width:20001},{height:'844'},{expanded:1}
  ];
  for(const fields of cases) assert.equal(api.save(scene,{...state,...fields}),false,String(Object.keys(fields)[0]));
  assert.equal(api.save(scene,[]),false);assert.equal(api.save(scene,null),false);
  assert.equal(entries.get(KEY),before);
  assert.equal(api.save(scene,{...state,zoom:0.01,centerX:-1e6,centerY:1e6,width:1,height:20000}),true,'合法边界可保存');
});
test('损坏、超长或不完整记录安全回退，不操作其他本机数据',()=>{
  const record={v:1,context:scene,camera:state};
  for(const raw of ['{broken','[]','null','"https://example.org/"','x'.repeat(4097),JSON.stringify({...record,v:2}),
    JSON.stringify({...record,context:[]}),JSON.stringify({...record,camera:{...state,zoom:null}}),
    JSON.stringify({...record,camera:{...state,width:0}})]) {
    const {api,entries}=load({entries:{[KEY]:raw,'cnmProgress.v1':'untouched'}});
    assert.equal(api.read(scene),null);assert.equal(entries.get('cnmProgress.v1'),'untouched');
  }
});
test('不采纳额外字段、继承字段或会抛错的对象属性',()=>{
  const {api,entries}=load();
  assert.equal(api.save({...scene,url:'https://example.org/'},{...state,pan:{x:0,y:0}}),true);
  const raw=JSON.parse(entries.get(KEY));assert.deepEqual(Object.keys(raw),['v','context','camera']);
  assert.ok(!entries.get(KEY).includes('example.org'));assert.ok(!Object.prototype.hasOwnProperty.call(raw.camera,'pan'));
  assert.equal(api.save(Object.create(scene),state),false);
  const broken={...state};Object.defineProperty(broken,'zoom',{get(){throw new Error('bad getter');}});
  assert.equal(api.save(scene,broken),false);
});
test('存储禁用、读写失败和删除失败均不抛错，不改写学习记录',()=>{
  for(const option of ['denied','failWrite']) {const {api}=load({[option]:true});assert.equal(api.save(scene,state),false);}
  for(const option of ['denied','failRead']) {const {api}=load({[option]:true});assert.equal(api.read(scene),null);}
  for(const option of ['denied','failClear']) {const {api}=load({[option]:true});assert.equal(api.clear(),false);}
  const {api,entries}=load({entries:{[KEY]:'old',[KEY+'.physics']:'physics',[KEY+'.science']:'science','cnmLastLocation.v1':'last-topic','cnmProgress.v1':'marks'}});
  assert.equal(api.clear(),true);for(const key of [KEY,KEY+'.physics',KEY+'.science'])assert.equal(entries.has(key),false);
  assert.equal(entries.get('cnmLastLocation.v1'),'last-topic');assert.equal(entries.get('cnmProgress.v1'),'marks');
});
console.log('test_explore_viewport: '+passed+' passed');
