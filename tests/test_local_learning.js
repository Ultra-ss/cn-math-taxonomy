#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/local-learning.js'), 'utf8');
const PHYSICS = 'cnpDiagnose.session.v2', SCIENCE = 'cnsDiagnose.session.v1';
const date = '2026-11-16T08:00:00.000Z', later = '2026-11-16T09:00:00.000Z';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function session(extra = {}) {
  return {v:2, mode:'target', targets:['cnp_053'], limit:16, confirm:3, seed:'round-a', label:'热量 比热容',
    savedAt:date, answers:[], progressChildId:null, ...extra};
}
function answer(id, result = 'wrong') { return {id, qid:id+'_q1', result}; }
function load(options = {}) {
  const raw = new Map(Object.entries(options.storage || {}).map(([key,value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const before = JSON.stringify([...raw]);
  const children = options.children || {a:{id:'a',name:'甲'}, b:{id:'b',name:'乙'}};
  const env = {
    localStorage:{getItem(key){if(options.blocked)throw new Error('blocked');return raw.get(key) ?? null;},
      setItem(){throw new Error('只读概览不能写入');},removeItem(){throw new Error('只读概览不能删除');}},
    CnmChildren:{get(id){return Object.prototype.hasOwnProperty.call(children,id)?children[id]:null;},
      latestStatus(id){return (options.latest || {})[id] || {};},
      hasRecord(id,key){return (options.records || []).includes(id+'|'+key);}},
    CnmProgress:{statuses(id,subject){return (options.progress || {})[(id || 'guest')+':'+subject] || {};}}
  };
  vm.runInNewContext(source,{window:env},{filename:'assets/local-learning.js'});
  return {api:env.CnmLocalLearning,unchanged(){assert.equal(JSON.stringify([...raw]),before);}};
}
function ids(rows) { return plain(rows).map(row=>row.id).sort(); }

test('孩子弱点只合并本人记录、本人进度与本人会话，旧全局汇总单独展示',()=>{
  const {api,unchanged}=load({latest:{a:{cnp_053:{status:'weak',at:date,subject:'physics'}},b:{cnp_071:{status:'weak',at:date,subject:'physics'}}},
    progress:{'a:physics':{cnp_055:{status:'shaky',at:date}},'guest:physics':{cnp_060:{status:'weak',at:date}}},
    storage:{[PHYSICS]:session({progressChildId:'b',answers:[answer('cnp_056')]}),'cnmBlind.local.v1':{v:1,byId:{cnp_099:{subject:'physics',status:'weak',lastAt:date}}}}});
  assert.deepEqual(ids(api.weakPoints({childId:'a'})),['cnp_053','cnp_055']);
  assert.deepEqual(ids(api.weakPoints({childId:'b'})),['cnp_056','cnp_071']);
  assert.deepEqual(ids(api.weakPoints({childId:null})),['cnp_060']);
  assert.deepEqual(ids(api.legacyWeakPoints()),['cnp_099']);unchanged();
});
test('旧会话答错不会覆盖后来已掌握的直接结论',()=>{
  const {api}=load({latest:{a:{cnp_053:{status:'weak',at:date,subject:'physics'}}},
    progress:{'a:physics':{cnp_053:{status:'mastered',at:later}}},
    storage:{[PHYSICS]:session({progressChildId:'a',savedAt:later,answers:[answer('cnp_053')]})}});
  assert.deepEqual(ids(api.weakPoints({childId:'a'})),[]);
});
test('新的薄弱结论替代旧掌握；无法归属的旧会话不记到访客',()=>{
  const old=session({answers:[answer('cnp_055')]});delete old.progressChildId;
  const {api}=load({latest:{a:{cnp_053:{status:'mastered',at:date,subject:'physics'}}},
    progress:{'a:physics':{cnp_053:{status:'weak',at:later}}},storage:{[PHYSICS]:old}});
  assert.deepEqual(ids(api.weakPoints({childId:'a'})),['cnp_053']);
  assert.deepEqual(ids(api.weakPoints({childId:null})),[]);
});
test('旧学科与错科声明不会进入当前两科弱点，学科过滤精确',()=>{
  const {api}=load({latest:{a:{cnm_001:{status:'weak',subject:'math'},cnp_053:{status:'weak',subject:'science'},
    cns_001:{status:'shaky',subject:'science',at:date},cnp_055:{status:'weak',subject:'physics',at:date}}}});
  assert.deepEqual(ids(api.weakPoints({childId:'a'})),['cnp_055','cns_001']);
  assert.deepEqual(ids(api.weakPoints({childId:'a',subject:'physics'})),['cnp_055']);
  assert.deepEqual(ids(api.weakPoints({childId:'missing'})),[]);
});
test('旧全局台账不含掌握、错科或不支持的学科，也不会混入个人弱点',()=>{
  const {api,unchanged}=load({storage:{'cnmBlind.local.v1':{v:1,byId:{
    cnp_053:{subject:'physics',status:'weak'},cnp_054:{subject:'physics',status:'mastered'},
    cnp_055:{subject:'science',status:'weak'},cnm_001:{subject:'math',status:'weak'}}}}});
  assert.deepEqual(ids(api.legacyWeakPoints()),['cnp_053']);
  assert.deepEqual(ids(api.weakPoints({childId:null})),[]);unchanged();
});
test('保存的检测只返回安全摘要与继续入口，区分孩子、访客和旧归属',()=>{
  const science=session({targets:['cns_001'],progressChildId:null,label:'旧诊断记录',answers:[answer('cns_001','correct')]});
  const {api,unchanged}=load({storage:{[PHYSICS]:session({progressChildId:'a',answers:[answer('cnp_053')]}),[SCIENCE]:science}});
  const rows=plain(api.savedSessions());assert.equal(rows.length,2);
  const physics=rows.find(row=>row.subject==='physics'),sc=rows.find(row=>row.subject==='science');
  assert.equal(physics.ownerLabel,'甲');assert.equal(physics.answered,1);assert.equal(physics.completed,false);
  assert.equal(physics.href,'../diagnose/?subject=physics&resume=1');assert.ok(!('answers' in physics));
  assert.equal(sc.ownerLabel,'本机访客');assert.equal(sc.label,'旧检测记录');unchanged();
  const legacy=session();delete legacy.progressChildId;
  assert.equal(load({storage:{[PHYSICS]:legacy}}).api.savedSessions()[0].ownerLabel,'归属未记录');
  assert.equal(load({storage:{[PHYSICS]:session({progressChildId:'removed'})}}).api.savedSessions()[0].ownerLabel,'原档案已删除');
});
test('完成识别使用本人的记录，其他人的全局结果不能标成本人完成',()=>{
  const key='physics|round-a|cnp_053';
  const saved=session({progressChildId:'a'});
  const ledger={v:1,byId:{cnp_053:{subject:'physics',status:'mastered',lastKey:key}}};
  assert.equal(load({storage:{[PHYSICS]:saved,'cnmBlind.local.v1':ledger}}).api.savedSessions()[0].completed,false);
  assert.equal(load({records:['a|'+key],storage:{[PHYSICS]:saved}}).api.savedSessions()[0].completed,true);
  assert.equal(load({storage:{[PHYSICS]:session(),'cnmBlind.local.v1':ledger}}).api.savedSessions()[0].completed,true);
});
test('可恢复的旧会话即使未保存题号仍提供继续入口，并保留原数据',()=>{
  const saved=session({answers:[{id:'cnp_053',result:'wrong'}]});
  const {api,unchanged}=load({storage:{[PHYSICS]:saved}});
  const rows=plain(api.savedSessions());assert.equal(rows.length,1);assert.equal(rows[0].answered,1);
  assert.equal(rows[0].href,'../diagnose/?subject=physics&resume=1');
  assert.deepEqual(ids(api.weakPoints({childId:null})),['cnp_053']);unchanged();
});
test('损坏或不兼容会话安全忽略并保留原数据',()=>{
  for(const saved of ['{bad',session({v:9}),session({targets:['cns_001']}),session({answers:[{...answer('cnp_053'),qid:'cns_001_q1'}]}),
    session({progressChildId:{id:'a'}}),session({savedAt:'invalid'}),session({limit:'16'})]){
    const {api,unchanged}=load({storage:{[PHYSICS]:saved}});assert.deepEqual(plain(api.savedSessions()),[]);unchanged();
  }
});
test('存储不可用时各个只读入口仍可正常打开',()=>{
  const {api,unchanged}=load({blocked:true});
  assert.deepEqual(plain(api.savedSessions()),[]);assert.deepEqual(plain(api.weakPoints()),[]);assert.deepEqual(plain(api.legacyWeakPoints()),[]);unchanged();
});
console.log('test_local_learning: '+passed+' passed');
