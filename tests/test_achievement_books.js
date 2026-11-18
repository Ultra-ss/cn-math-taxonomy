#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Books = require('../assets/achievement-books.js');
const Scope = require('../assets/book-selection.js');
const E = require('../diagnose/engine.js');
const root = path.resolve(__dirname,'..');
const topics = JSON.parse(fs.readFileSync(path.join(root,'data/topics.json'),'utf8'));
let passed = 0;
function test(name,fn) { fn();passed++;console.log('  ok   '+name); }
function selection(volume, topicId='cnp_053', subject='physics') { return {subject,volume,topicId}; }
function model(selected,normal={},pro={},rows=topics) { return Books.build({topics:rows,selection:selected,normal,pro}); }
const normal = {cnp_053:{status:'mastered'},cnp_054:{status:'weak'},cnp_055:{status:'shaky'},
  cnp_056:{status:'mastered',src:'inferred'},cns_p001:{status:'mastered'}};
const pro = {cnp_053:{status:'mastered'},cnp_054:{status:'mastered'},cnp_057:{status:'mastered'}};

test('按当前单册展示知识点，只有普通直接通过计入完成，专家必须双层通过',()=>{
  const result=model(selection('九全'),normal,pro),book=result.books[0];
  assert.equal(result.subject,'physics');assert.deepEqual(result.volumes,['九全']);
  assert.equal(book.title,'九年级全一册');assert.equal(book.total,40);
  assert.equal(book.completed,1);assert.equal(book.remaining,39);assert.equal(book.expert,1);
  assert.equal(book.firstTopicId,'cnp_053');
  assert.equal(book.chapters[0].title,'第十三章 内能');
  assert.equal(book.chapters[0].total,3);assert.equal(book.chapters[0].completed,1);
  const rows=book.chapters.flatMap(ch=>ch.topics),by=Object.fromEntries(rows.map(t=>[t.id,t]));
  assert.equal(by.cnp_053.status,'mastered');assert.equal(by.cnp_053.expert,true);
  assert.equal(by.cnp_054.status,'weak');assert.equal(by.cnp_054.expert,false);
  assert.equal(by.cnp_055.status,'shaky');assert.equal(by.cnp_056.status,'unknown');
  assert.equal(by.cnp_057.status,'unknown');assert.equal(by.cnp_057.expert,false);
});
test('多选教材去重并按固定教材顺序显示，各册完成数不混在一起',()=>{
  const selected={subject:'physics',volume:'',volumes:['九全','八下','九全'],topicId:'cnp_053'};
  const result=model(selected,{...normal,cnp_029:{status:'mastered'}});
  assert.deepEqual(result.volumes,['八下','九全']);assert.equal(result.total,64);
  assert.deepEqual(result.books.map(b=>[b.title,b.completed,b.total]),[['八年级下册',1,24],['九年级全一册',1,40]]);
  assert.equal(result.completed,2);assert.equal(result.remaining,62);
});
test('全部教材范围正确区分物理9册和科学12册，章节与现有引擎分组一致',()=>{
  for(const [subject,id,count] of [['physics','cnp_053',9],['science','cns_p001',12]]) {
    const result=model(selection('',id,subject));
    assert.equal(result.books.length,count);assert.equal(result.total,269);
    assert.deepEqual(result.volumes,Scope.allowed(subject));
    for(const book of result.books) {
      const expected=topics.filter(t=>t.subject===subject && !t.external && Books.bookOf(t)===book.volume);
      const groups=new Set(expected.map(t=>{const p=E.parseChapter(t.chapter);return [p.chapterNo,p.chapterName].filter(Boolean).join(' ');}));
      assert.deepEqual(book.chapters.map(ch=>ch.title),[...groups]);
      assert.equal(book.total,expected.length);assert.equal(book.remaining,expected.length);
      assert.deepEqual(book.chapters.flatMap(ch=>ch.topics.map(t=>t.id)),expected.map(t=>t.id));
    }
  }
});
test('小学单元和高中完整册名正确，章外通过不算入当前选择',()=>{
  const science=model(selection('一上','cns_p001','science'),normal).books[0];
  assert.equal(science.title,'一年级上册');assert.equal(science.chapters[0].title,'第1单元 周围的植物');
  assert.equal(science.completed,1);assert.equal(science.total,15);
  const senior=model(selection('必修一','cnp_h001'),{...normal,cnp_h001:{status:'mastered'}}).books[0];
  assert.equal(senior.title,'必修第一册');assert.equal(senior.completed,1);assert.equal(senior.total,27);
  assert.equal(Books.titleOf('physics','选必三'),'选择性必修第三册');
});
test('无选择、错科、失效知识点、非法册次均为空，不能扩大为全部教材',()=>{
  const invalid=[null,{},selection('不存在'),selection('八上'),selection('一上'),
    selection('九全','cns_p001'),selection('九全','cnp_missing'),{subject:'physics',topicId:'cnp_053'},
    {subject:'physics',volume:'',volumes:[],topicId:'cnp_053'},
    {subject:'physics',volume:'',volumes:['九全','一上'],topicId:'cnp_053'},
    {subject:'physics',volume:'九全',volumes:['九全','八上'],topicId:'cnp_053'},
    {subject:'physics',volume:'',volumes:'九全',topicId:'cnp_053'}];
  for(const value of invalid) assert.deepEqual(model(value).books,[],JSON.stringify(value));
  assert.deepEqual(model(selection('九全'),{},{},[]).books,[]);
  const sparse=[];sparse.length=1;assert.deepEqual(model({...selection(''),volumes:sparse}).books,[]);
});
test('切换档案只使用传入本人状态，不修改数据或继承对象里的伪状态',()=>{
  const before=JSON.stringify(topics), selected=selection('九全');
  const a=model(selected,normal,pro),b=model(selected,{});
  assert.equal(a.completed,1);assert.equal(b.completed,0);assert.equal(b.expert,0);
  const inherited=Object.create({cnp_053:{status:'mastered'}});
  assert.equal(model(selected,inherited).completed,0);
  assert.equal(JSON.stringify(topics),before);assert.deepEqual(selected,selection('九全'));
  assert.equal(model(selected,normal,pro,topics.concat(topics[0])).total,40,'重复数据不增加题点计数');
});
test('浏览器导出的API与CommonJS一致，不访问浏览器存储',()=>{
  const source=fs.readFileSync(path.join(root,'assets/achievement-books.js'),'utf8');
  const window={CnmBookSelection:Scope};
  Object.defineProperty(window,'localStorage',{get(){throw new Error('must not read storage');}});
  vm.runInNewContext(source,{window,Number,Array,Object,Set});
  const result=window.CnmAchievementBooks.build({topics,selection:selection('九全'),normal,pro});
  assert.equal(result.completed,1);assert.equal(result.expert,1);
  assert.deepEqual(Object.keys(window.CnmAchievementBooks).sort(),Object.keys(Books).sort());
});
test('个人中心沿用图谱多选；无图谱时只采用本档案可验证的最近检测教材',()=>{
  const source=fs.readFileSync(path.join(root,'children/page.js'),'utf8');
  const a=source.indexOf('  function achievementSelection('),b=source.indexOf('  function closeBooksEditor(',a);
  assert.ok(a>=0 && b>a);
  let graph=null;
  const saved=new Map(),ctx={achievementTopics:topics,window:{CnmAchievementBooks:Books,CnmLastLocation:{resolve:()=>graph}},
    localStorage:{getItem:key=>saved.get(key)||null}};
  vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
  const session=(owner,volume,targets,at)=>({v:2,mode:'textbook',progressChildId:owner,volume,targets,savedAt:at});
  const physical=session('alice','九全',['cnp_053','cnp_054'],'2026-11-17T10:00:00Z');
  const scientific=session('alice','一上',['cns_p001'],'2026-11-17T11:00:00Z');
  saved.set('cnpDiagnose.session.v2',JSON.stringify(physical));
  assert.equal(ctx.achievementSelection('alice').record.volume,'九全');
  assert.equal(ctx.achievementSelection('bob'),null,'其他档案的检测不能作为当前选择');
  assert.equal(ctx.achievementSelection(null),null,'孩子检测不能归给访客');
  saved.set('cnsDiagnose.session.v1',JSON.stringify(scientific));
  assert.equal(ctx.achievementSelection('alice').record.subject,'science','只取最近一份本档案检测');
  graph={subject:'physics',volume:'',volumes:['八上','九全'],topicId:'cnp_053'};
  assert.deepEqual(ctx.achievementSelection('alice').record,graph,'图谱多选保持完整');
  graph=null;saved.clear();
  const legacy={...physical};delete legacy.progressChildId;saved.set('cnpDiagnose.session.v2',JSON.stringify(legacy));
  assert.equal(ctx.achievementSelection(null),null,'旧无归属检测不自动归入访客');
  for(const record of [{...physical,volume:'八上'}, {...physical,targets:['cnp_053','cns_p001']}, {...physical,savedAt:'bad'}, {...physical,targets:['missing']}]) {
    saved.set('cnpDiagnose.session.v2',JSON.stringify(record));assert.equal(ctx.achievementSelection('alice'),null);
  }
  const prefs={alice:{physics:{volumes:['八下','九全'],at:'2026-11-18T10:00:00Z'},science:{volumes:['一上'],at:'2026-11-18T10:00:00Z'}}};
  ctx.window.CnmChildren={bookSelection(subject,id){return prefs[id]&&prefs[id][subject]||null;}};
  graph={subject:'physics',volume:'八上',topicId:'cnp_001'};
  let chosen=ctx.achievementSelection('alice','physics');
  assert.equal(chosen.from,'selection');assert.deepEqual(Array.from(chosen.record.volumes),['八下','九全']);
  assert.equal(model(chosen.record).books.length,2,'偏好以真实范围内知识点生成视图，不添加旧教材');
  assert.equal(ctx.achievementSelection('alice','science').record.subject,'science');
  prefs.alice.physics.volumes=[];chosen=ctx.achievementSelection('alice','physics');
  assert.deepEqual(model(chosen.record).books,[],'显式删空不得回退旧图谱或检测教材');
  assert.equal(ctx.achievementSelection('bob','physics').record.volume,'八上','账号选择不会借给其他账号');
});
console.log('test_achievement_books: '+passed+' passed');
