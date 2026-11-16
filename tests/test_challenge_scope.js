#!/usr/bin/env node
/* 直接运行页面中的范围选择和URL解析：单元绝不意外扩大为整册。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../diagnose/engine.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'diagnose/app.js'), 'utf8');
const data = name => JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const topics = data('topics'), dependencies = data('dependencies'), questions = data('questions');
function production(name) {
  const a=source.indexOf('  function '+name+'(');
  assert.ok(a>=0,name);
  const rest=source.slice(a+2), end=/\n  \}/.exec(rest);
  assert.ok(end,name+' closing brace');
  return rest.slice(0,end.index+4);
}
function context(subject='physics') {
  const ownTopics=topics.filter(t=>t.subject===subject);
  const ids=new Set(ownTopics.map(t=>t.id));
  const state={E,URLSearchParams,subject,bookSel:'',chapterSel:'',challengeScope:'book',session:null,
    D:{graph:E.buildGraph(ownTopics,dependencies.filter(d=>ids.has(d.topicId)&&ids.has(d.prerequisiteId)),questions),aliases:{}},
    location:{search:'',pathname:'/diagnose/'},calls:[],errors:[],urls:[]};
  state.history={replaceState(_state,_title,url){state.urls.push(url);state.location.search=url.slice(url.indexOf('?'));}};
  state.startSession=(...args)=>state.calls.push(args);
  state.renderStart=message=>state.errors.push(message);
  vm.createContext(state);
  const volumes=source.slice(source.indexOf('  const VOLUMES ='),source.indexOf('  const RESULT_LABEL ='));
  vm.runInContext(volumes+'\n'+['buildTree','nameOf','selectedChallenge','startChallenge','textbookScopeLabel','resolveTargets'].map(production).join('\n'),state);
  state.D.tree=state.buildTree(ownTopics);
  return state;
}
let unitCount=0;
for(const subject of ['physics','science']) {
  const c=context(subject);
  for(const [volume,book] of Object.entries(c.D.tree)) {
    c.bookSel=volume;c.challengeScope='book';
    const full=c.selectedChallenge();
    assert.deepEqual(Array.from(full.ids),E.gradeTargets(c.D.graph,volume,subject).ids);
    assert.ok(!full.chapter);
    c.session=E.createSession(c.D.graph,full.ids,{mode:'textbook',volume});
    assert.equal(c.textbookScopeLabel(),'整册');
    for(const chapter of book.chapters) {
      const expected=Array.from(chapter.topics,x=>x.t.id);
      c.chapterSel=chapter.key;c.challengeScope='chapter';
      const choice=c.selectedChallenge();
      assert.deepEqual(Array.from(choice.ids),expected);
      assert.equal(choice.chapter,chapter.key);
      const parsed=c.resolveTargets(new URLSearchParams({subject,volume,chapter:chapter.key}));
      assert.deepEqual(Array.from(parsed.ids),expected,'URL must retain complete selected unit');
      assert.equal(parsed.mode,'textbook','旧章节链接也使用严格逐点模式');
      assert.equal(parsed.volume,volume);
      c.session=E.createSession(c.D.graph,parsed.ids,{mode:parsed.mode,volume:parsed.volume});
      assert.equal(c.textbookScopeLabel(),'单元');
      unitCount++;
    }
  }
  c.challengeScope='chapter';c.bookSel='九全';c.chapterSel='不存在';
  assert.equal(c.selectedChallenge(),null,'无效单元不得回退整册');
  for(const chapter of ['', '不存在', subject==='physics'?'一上 第1单元':'九全 第十三章'])
    assert.throws(()=>c.resolveTargets(new URLSearchParams({chapter})),/单元/);
}
const c=context();
const chapter=c.D.tree['九全'].chapters[0], expected=Array.from(chapter.topics,x=>x.t.id);
assert.throws(()=>c.resolveTargets(new URLSearchParams({volume:'八上',chapter:chapter.key})),/不一致/);
const narrowed=c.resolveTargets(new URLSearchParams({chapter:chapter.key,target:'cnp_001'}));
assert.deepEqual(Array.from(narrowed.ids),expected,'显式单元优先于遗留单点参数');
const originalReturn='/explore/?subject=physics&volumes=%E5%85%AB%E4%B8%8A%2C%E4%B9%9D%E5%85%A8#cnp_053';
c.location.search='?'+new URLSearchParams({target:'cnp_001',chapter:'bad',grade:'八',demo:'1',step:'9',resume:'1',retry:'1',level:'pro',seed:'old',confirm:'4',limit:'1',returnTo:originalReturn});
c.startChallenge(chapter);
assert.equal(c.calls.length,1);
assert.deepEqual(Array.from(c.calls[0][0]),expected);
assert.equal(c.calls[0][3],'textbook');assert.equal(c.calls[0][4],'九全');
let url=new URL(c.urls.at(-1),'https://physicalmap.pages.dev');
assert.equal(url.searchParams.get('chapter'),chapter.key);
assert.equal(url.searchParams.get('order'),'book');
assert.equal(url.searchParams.get('returnTo'),originalReturn);
for(const key of ['target','grade','demo','step','resume','retry','level','seed','confirm','limit']) assert.ok(!url.searchParams.has(key),key);
c.challengeScope='book';c.startChallenge();
url=new URL(c.urls.at(-1),'https://physicalmap.pages.dev');
assert.ok(!url.searchParams.has('chapter'),'切回整册清除单元参数');
assert.equal(c.calls.at(-1)[0].length,40);
c.challengeScope='chapter';c.chapterSel='not-real';c.startChallenge();
assert.equal(c.calls.length,2,'无效单元不启动整册或写入进度');
assert.equal(c.errors.length,1);
console.log('test_challenge_scope: '+unitCount+' real units, book/unit selection, strict URL scope and return context passed');
