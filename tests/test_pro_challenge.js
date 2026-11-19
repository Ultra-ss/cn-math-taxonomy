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
assert.ok(Pro.validateBank(juniors, ordinary, questions));
assert.equal(Pro.validateBank(juniors, ordinary, questions.slice(1)), false, '缺一道题也不得回退或凑数');
assert.equal(Pro.validateBank(juniors, ordinary, questions.concat(questions[0])), false, '拒绝重复题号');
assert.equal(Pro.validateBank(juniors, ordinary, questions.map((q,i)=>i ? q : {...q,id:'cnp_001_q1'})), false, '专家题号与普通题隔离');
assert.equal(Pro.validateBank(juniors, ordinary, null), false);
for(const answer of ['1/2','-2.5','1/2, 3']) {
  assert.ok(Pro.validateBank(juniors,ordinary,questions.map((q,i)=>i?q:{...q,type:'numeric',answer})),answer);
}
for(const answer of ['','1/0','3,','NaN','1 m','Infinity']) {
  assert.equal(Pro.validateBank(juniors,ordinary,questions.map((q,i)=>i?q:{...q,type:'numeric',answer})),false,answer);
}
for(const patch of [{level:undefined},{origin:undefined},{difficulty:'basic'},{answer:''}]) {
  assert.equal(Pro.validateBank(juniors,ordinary,questions.map((q,i)=>i?q:{...q,...patch})),false);
}
const byId = Object.fromEntries(topics.map(topic=>[topic.id,topic]));
assert.ok(Pro.eligible(byId,['cnp_001'],{cnp_001:{status:'mastered'}}));
for (const states of [{}, {cnp_001:{status:'weak'}}, {cnp_001:{status:'shaky'}}]) assert.equal(Pro.eligible(byId,['cnp_001'],states),false);
assert.equal(Pro.eligible(byId,['cnp_h001'],{cnp_h001:{status:'mastered'}}),true);
assert.equal(Pro.eligible(byId,['cns_p001'],{cns_p001:{status:'mastered'}}),true);
assert.equal(Pro.eligible(byId,['cnp_001','cnp_029'],{cnp_001:{status:'mastered'},cnp_029:{status:'mastered'}}),false);

function expertFixture(id, count=3) {
  return Array.from({length:count},(_,n)=>({id:id+'_q'+(101+n),topicId:id,difficulty:'challenge',type:'choice',
    prompt:id+'专家情境题'+(n+1),choices:[{key:'A',text:'由观察证据支持的判断'},{key:'B',text:'与题设条件不符的判断'}],
    answer:'A',explanation:'结合题设证据逐项判断，A符合条件。',level:'pro',origin:'original'}));
}
for (const id of ['cns_p001','cnp_h001']) {
  const topic=byId[id], bank=expertFixture(id);
  assert.ok(Pro.validateBank([topic],null,bank));
  assert.equal(Pro.validateBank([topic],null,bank.slice(1)),false,'新增专家题每点至少3道');
  assert.ok(Pro.validateBank(topics,null,bank,[id]),'显式按点校验不要求下载其他题库');
  assert.equal(Pro.validateBank(topics,null,bank,['cnp_001']),false,'拒绝其他知识点替换当前题包');
}
assert.equal(Pro.validateBank(topics,ordinary,questions),false,'完整范围校验拒绝漏掉小学或高中');
for (const id of ['../topics','cnp_001/../../questions','cnp_001%2f','__proto__','cns_p001,cnp_001']) {
  assert.equal(Pro.topicURL(id,'physics'),'');
  assert.equal(Pro.topicURL(id,'science'),'');
}
assert.equal(Pro.topicURL('cns_p001','science'),'../data/pro/cns_p001.json');
assert.equal(Pro.topicURL('cns_p001','physics'),'');
assert.equal(Pro.topicURL('cnp_h001','physics'),'../data/pro/cnp_h001.json');
assert.equal(Pro.isSupported({...byId.cns_p001,external:true}),false);
assert.equal(Pro.validateBank(juniors,null,questions.map((q,i)=>i?q:{...q,choices:[q.choices[0],q.choices[0]]})),false);
assert.equal(Pro.validateBank(juniors,null,questions.map((q,i)=>i?q:{...q,prompt:questions[1].prompt})),false);

async function loading(level, bank, regularOK=true, options={}) {
  const requests=options.requests||[], proofOwners=[], topicId=options.target||'cnp_029', activeSubject=options.subject||'physics';
  const query=options.query||'?subject='+activeSubject+'&level='+level+'&target='+topicId;
  const saved=options.saved||null;
  const payloads = {
    '../data/topics.json':topics,
    '../data/dependencies.json':[{topicId:'cnp_029',prerequisiteId:'cnp_001',strength:'hard'}],
    '../data/cn-curriculum-standards.json':{items:[]},
    '../data/id-aliases.json':{aliases:{}},
    '../data/questions.json':ordinary,
    ['../data/pro/'+topicId+'.json']:bank
  };
  const context={E,subject:activeSubject,sessionLevel:level,D:null,
    URLSearchParams,location:{search:query},lsGet:()=>saved,sessionKey:()=> 'session',CC:{current:()=>({id:options.currentOwner||'alice'}),get:id=>['alice','bob'].includes(id)?{id}:null},
    window:{CnmProChallenge:Pro,CnmProgress:{statuses:owner=>{proofOwners.push(owner);return options.ownerStatuses?options.ownerStatuses[owner]||{}:options.statuses||{[topicId]:{status:'mastered'}};}}},buildTree:()=>({}),
    fetch:async url=>{
      requests.push(url);
      const ok=url.endsWith('/questions.json')?regularOK:url.includes('/pro/')?Array.isArray(bank):true;
      return {ok,status:ok?200:404,json:async()=>payloads[url]};
    }};
  vm.createContext(context);
  vm.runInContext(section('async function loadData()', 'function buildTree(topics)'),context);
  await context.loadData();
  return {context,requests,proofOwners};
}
(async function () {
  const localBank=questions.filter(q=>q.topicId==='cnp_029');
  const {context:loaded,requests:expertRequests}=await loading('pro',localBank);
  const graph=loaded.D.graph;
  assert.equal(loaded.D.level,'pro');
  assert.equal(loaded.D.topics.length,1);
  assert.deepEqual(expertRequests,['../data/topics.json','../data/pro/cnp_029.json'],'专家进入只读取元数据和当前题包');
  assert.equal(Object.keys(loaded.D.graph.bank).length,1,'不为其他点生成普通fallback题');
  assert.equal(loaded.D.deps.length,0,'专家挑战不回溯其他知识点或普通题');
  assert.ok(graph.bank.cnp_029.every(q=>Number(q.id.split('_q')[1])>=101));
  await assert.rejects(()=>loading('pro',localBank.slice(1)),/专家题库校验未通过/);
  await assert.rejects(()=>loading('pro',null),/专家题库暂时无法加载/);
  await loading('pro',localBank,false); // 专家加载完全不依赖普通总题库。
  await assert.rejects(()=>loading('pro',localBank,true,{statuses:{}}),/请先通过/);
  await assert.rejects(()=>loading('pro',localBank,true,{query:'?level=pro&target=../topics'}),/请从当前账号/);
  for(const [id,sub] of [['cns_p001','science'],['cnp_h001','physics']]) {
    const bank=expertFixture(id),one=await loading('pro',bank,false,{target:id,subject:sub});
    assert.equal(one.context.D.topics[0].id,id);
    assert.deepEqual(one.requests,['../data/topics.json','../data/pro/'+id+'.json']);
    const restored={level:'pro',targets:[id],progressChildId:'alice'};
    const resume=await loading('pro',bank,false,{target:id,subject:sub,query:'?subject='+sub+'&resume=1',saved:restored});
    assert.deepEqual(resume.requests,one.requests,'无target的刷新续答仍只加载存档知识点');
    const ownerStatuses={alice:{[id]:{status:'mastered'}},bob:{}};
    const owned=await loading('pro',bank,true,{target:id,subject:sub,currentOwner:'bob',query:'?resume=1',saved:restored,ownerStatuses});
    assert.deepEqual(owned.proofOwners,['alice'],'明确续答使用存档账号A的普通通过佐证，不能借当前B');
    await assert.rejects(()=>loading('pro',bank,true,{target:id,subject:sub,currentOwner:'bob',saved:restored,ownerStatuses}),/请先通过/,'全新URL目标仅使用当前账号B，不能借A的记录');
    const invalidRequests=[];
    await assert.rejects(()=>loading('pro',bank,true,{target:id,subject:sub,query:'?resume=1',saved:{...restored,progressChildId:'orphan'},requests:invalidRequests}),/没有对应的账号/);
    assert.deepEqual(invalidRequests,[],'孤立存档不请求题包或修改账号');
    await assert.rejects(()=>loading('pro',bank,true,{target:id,subject:sub,query:'?resume=1',saved:{...restored,subject:sub==='science'?'physics':'science'}}),/请从当前账号/);
  }
  const normal=await loading('normal',null,false);
  assert.equal(normal.context.D.level,'normal');
  assert.ok(!normal.requests.some(url=>url.includes('/pro/')||url.endsWith('questions-pro.json')),'普通检测不依赖专家题库');

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
  const restore={E,D:loaded.D,CC:{current:()=>({id:'bob'}),get:id=>['alice','bob'].includes(id)?{id}:null},window:{CnmProChallenge:Pro,CnmProgress:{statuses:owner=>statusByOwner[owner]||{}}},
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
  assert.equal(restore.restoreSession({...saved,progressChildId:'orphan'}),false,'删除账号的孤立专家存档不可恢复');
  assert.equal(restore.restoreSession({...saved,subject:'science'}),false,'跨学科存档不可恢复');
  assert.equal(restore.restoreSession({...saved,answers:[{id:'cnp_029',qid:'cnp_029_q1',result:'correct'}]}),false);
  assert.equal(recorded.length,1,'未通过校验的存档不得写进度');
  const ownerChanges=[];
  restore.lsGet=()=>saved; restore.sessionKey=()=> 'session';
  restore.selectSessionOwner=()=>{assert.equal(restore.sessionMeta.progressChildId,'alice');ownerChanges.push('alice');};
  vm.runInContext(section('function resumeStoredSession()', 'function restart()'),restore);
  assert.equal(restore.resumeStoredSession(),'restored','切到B后明确继续A的专家存档，仍验证并恢复A');
  assert.deepEqual(ownerChanges,['alice']);
  const writesAfterValid=recorded.length;
  restore.lsGet=()=>({...saved,answers:[{id:'cnp_029',qid:'cnp_029_q1',result:'correct'}]});
  assert.equal(restore.resumeStoredSession(),'invalid');
  assert.deepEqual(ownerChanges,['alice'],'损坏专家存档不得切换账号');
  assert.equal(recorded.length,writesAfterValid,'损坏专家存档不得写入任何账号进度');
  // 准备后续原有recordKey测试；resumeStoredSession失败已清掉内存会话。
  assert.ok(restore.restoreSession(saved));

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
