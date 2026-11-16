#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../diagnose/engine.js');
const Pro = require('../diagnose/pro-challenge.js');
const base = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(base, 'diagnose/app.js'), 'utf8');
const allTopics = JSON.parse(fs.readFileSync(path.join(base, 'data/topics.json')));
const ordinary = JSON.parse(fs.readFileSync(path.join(base, 'data/questions.json')));
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const topics = allTopics.filter(topic => ['cnp_001', 'cnp_029', 'cnp_h001', 'cns_p001'].includes(topic.id));
const juniors = topics.filter(Pro.isJunior);
const ids = new Set(juniors.map(topic => topic.id));
const questions = ordinary.filter(q => ids.has(q.topicId)).map(q => ({...q, level:'pro',origin:'original',difficulty:'challenge',id:q.id.replace(/_q([1-4])$/, (_,n)=>'_q'+(100+Number(n)))}));
assert.equal(questions.length, 8);
assert.ok(Pro.validateBank(topics, ordinary, questions));
assert.equal(Pro.validateBank(topics, ordinary, questions.slice(1)), false, '缺一道题也不得回退或凑数');
assert.equal(Pro.validateBank(topics, ordinary, questions.concat(questions[0])), false, '拒绝重复题号');
assert.equal(Pro.validateBank(topics, ordinary, questions.map((q,i)=>i ? q : {...q,id:'cnp_001_q1'})), false, '专家题号与普通题隔离');
assert.equal(Pro.validateBank(topics, ordinary, null), false);
for(const answer of ['1/2','-2.5','1/2, 3']) {
  assert.ok(Pro.validateBank(topics,ordinary,questions.map((q,i)=>i?q:{...q,type:'numeric',answer})),answer);
}
for(const answer of ['','1/0','3,','NaN','1 m','Infinity']) {
  assert.equal(Pro.validateBank(topics,ordinary,questions.map((q,i)=>i?q:{...q,type:'numeric',answer})),false,answer);
}
for(const patch of [{level:undefined},{origin:undefined},{difficulty:'basic'},{answer:''}]) {
  assert.equal(Pro.validateBank(topics,ordinary,questions.map((q,i)=>i?q:{...q,...patch})),false);
}
const byId = Object.fromEntries(topics.map(topic=>[topic.id,topic]));
assert.ok(Pro.eligible(byId,['cnp_001'],{cnp_001:{status:'mastered'}}));
for (const states of [{}, {cnp_001:{status:'weak'}}, {cnp_001:{status:'shaky'}}]) assert.equal(Pro.eligible(byId,['cnp_001'],states),false);
assert.equal(Pro.eligible(byId,['cnp_h001'],{cnp_h001:{status:'mastered'}}),false);
assert.equal(Pro.eligible(byId,['cns_p001'],{cns_p001:{status:'mastered'}}),false);
assert.equal(Pro.eligible(byId,['cnp_001','cnp_029'],{cnp_001:{status:'mastered'},cnp_029:{status:'mastered'}}),false);

async function loading(level, bank, regularOK=true) {
  const requests=[];
  const payloads = {
    '../data/topics.json':topics,
    '../data/dependencies.json':[{topicId:'cnp_029',prerequisiteId:'cnp_001',strength:'hard'}],
    '../data/cn-curriculum-standards.json':{items:[]},
    '../data/id-aliases.json':{aliases:{}},
    '../data/questions.json':ordinary,
    '../data/questions-pro.json':bank
  };
  const context={E,subject:'physics',sessionLevel:level,D:null,window:{CnmProChallenge:Pro},buildTree:()=>({}),
    fetch:async url=>{
      requests.push(url);
      const ok=url.endsWith('/questions.json')?regularOK:url.endsWith('/questions-pro.json')?Array.isArray(bank):true;
      return {ok,status:ok?200:404,json:async()=>payloads[url]};
    }};
  vm.createContext(context);
  vm.runInContext(section('async function loadData()', 'function buildTree(topics)'),context);
  await context.loadData();
  return {context,requests};
}
(async function () {
  const {context:loaded}=await loading('pro',questions);
  const graph=loaded.D.graph;
  assert.equal(loaded.D.level,'pro');
  assert.equal(loaded.D.topics.length,2);
  assert.equal(loaded.D.deps.length,0,'专家挑战不回溯其他知识点或普通题');
  for(const id of ids) assert.ok(graph.bank[id].every(q=>Number(q.id.split('_q')[1])>=101));
  await assert.rejects(()=>loading('pro',questions.slice(1)),/专家题库校验未通过/);
  await assert.rejects(()=>loading('pro',null),/专家题库暂时无法加载/);
  await assert.rejects(()=>loading('pro',questions,false),/专家题库校验未通过/);
  const normal=await loading('normal',null,false);
  assert.equal(normal.context.D.level,'normal');
  assert.ok(!normal.requests.some(url=>url.endsWith('questions-pro.json')),'普通检测不依赖专家题库');

  let run=E.createSession(graph,['cnp_029'],{mode:'target',confirm:4,seed:'expert-replay'});
  for(let i=0;i<4;i++) {
    const item=E.nextItem(graph,run);
    assert.equal(item.topicId,'cnp_029');
    run=E.applyAnswer(graph,run,item.topicId,'correct');
  }
  assert.equal(E.statusOf(run,'cnp_029'),'mastered');
  assert.equal(Object.keys(run.status).length,1,'通过专家检测不会推断其他知识点通过');
  assert.equal(new Set(run.answers.map(a=>a.qid)).size,4);
  const saved={v:2,level:'pro',mode:'target',targets:run.targets,answers:run.answers,limit:run.limit,confirm:run.confirm,
    seed:run.seed,avoid:run.avoid,progressChildId:'alice',label:'专家挑战 · 力'};
  assert.ok(Pro.validAnswers(graph,saved));
  assert.equal(Pro.validAnswers(graph,{...saved,answers:[{id:'cnp_029',qid:'cnp_029_q1',result:'correct'}]}),false);
  assert.equal(Pro.validAnswers(graph,{...saved,answers:[run.answers[0],run.answers[0]]}),false,'同一道专家题不能重复计入通关');
  const recorded=[];
  const statusByOwner={alice:{cnp_029:{status:'mastered'}},bob:{cnp_029:{status:'weak'}}};
  const restore={E,D:loaded.D,window:{CnmProChallenge:Pro,CnmProgress:{statuses:owner=>statusByOwner[owner]||{}}},
    subject:'physics',confirmParam:null,returnToParam:null,session:null,sessionMeta:null,
    safeReturnTo:()=>'',returnPath:()=>'/explore/?subject=physics#cnp_029',nameOf:id=>id,
    syncProgress(){recorded.push(restore.sessionMeta);}};
  // Functions are extracted from the shipped app; no duplicate restore implementation.
  vm.createContext(restore);
  vm.runInContext(section('function restoreSession(saved)', 'function resumeStoredSession()'),restore);
  assert.ok(restore.restoreSession(saved));
  assert.equal(restore.sessionMeta.level,'pro');
  assert.equal(restore.sessionMeta.progressChildId,'alice');
  assert.equal(restore.session.answers.map(a=>a.qid).join(','),saved.answers.map(a=>a.qid).join(','),'刷新保留专家题号');
  assert.equal(restore.restoreSession({...saved,progressChildId:'bob'}),false,'不能借另一档案普通通关进入专家挑战');
  assert.equal(restore.restoreSession({...saved,level:undefined}),false,'普通存档不可套用到专家题库');
  assert.equal(restore.restoreSession({...saved,mode:'textbook'}),false);
  assert.equal(restore.restoreSession({...saved,answers:[{id:'cnp_029',qid:'cnp_029_q1',result:'correct'}]}),false);
  assert.equal(recorded.length,1,'未通过校验的存档不得写进度');

  vm.runInContext(section('function recordKey()', 'function saveToChild('),restore);
  assert.ok(restore.recordKey().startsWith('pro|physics|'));
  restore.sessionMeta.level=undefined;
  assert.ok(restore.recordKey().startsWith('physics|'));
  const errorContext={URLSearchParams,location:{search:'?level=pro'},sessionKey:()=> 'session',
    returnToParam:'/explore/?subject=physics&volumes=八上,八下#cnp_029',
    safeReturnTo:value=>typeof value==='string'&&value.startsWith('/explore/')?value:'',
    lsGet:()=>({level:'pro',returnTo:'/explore/?subject=physics&volume=九全#cnp_053'}),
    returnPath:()=>'/explore/?subject=physics',selectSessionOwner(){},
    h:(tag,attrs,...children)=>({tag,attrs,children}),show:node=>{errorContext.page=node;}};
  vm.createContext(errorContext);
  vm.runInContext(section('function showProError(message)', 'async function init()'),errorContext);
  errorContext.showProError('请先通过普通检测');
  assert.equal(errorContext.page.children[2].attrs.href,errorContext.returnToParam,'门槛提示仍能返回原多册图谱位置');
  errorContext.returnToParam=null;errorContext.location.search='?resume=1';errorContext.showProError('无法恢复');
  assert.equal(errorContext.page.children[2].attrs.href,'/explore/?subject=physics&volume=九全#cnp_053');
  console.log('test_pro_challenge: bank isolation, eligibility, replay and fail-closed loading passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
