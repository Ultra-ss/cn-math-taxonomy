#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const E = require('../diagnose/engine.js');
const source = fs.readFileSync(path.join(__dirname, '../diagnose/app.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start); return source.slice(a,b);
}
class Element {
  constructor(tag) {
    this.tagName=tag.toUpperCase(); this.nodeType=1; this.className=''; this.children=[]; this.attrs={}; this.listeners={}; this.open=false; this._text=''; this.focused=0;
    this.classList={contains:name=>this.className.split(' ').includes(name),toggle:(name,on)=>{ const set=new Set(this.className.split(' ').filter(Boolean)); if(on)set.add(name);else set.delete(name);this.className=[...set].join(' '); }};
  }
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name];}
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...items){for(const item of items){this.children.push(item);item.parentNode=this;}}
  querySelector(selector){return walk(this).find(node=>selector[0]==='#'?node.attrs.id===selector.slice(1):node.classList.contains(selector.slice(1)))||null;}
  querySelectorAll(selector){return walk(this).filter(node=>node.classList.contains(selector.slice(1)));}
  click(){this.listeners.click({currentTarget:this});}
  focus(){this.focused++;}
  setSelectionRange(){}
}
function walk(node){return node.children.flatMap(child=>child.nodeType===1?[child,...walk(child)]:[]);}
const id='cnp_053';
function load(type='choice',phase='ask',fine=false,fields={}) {
  const q={id:id+'_q1',type,difficulty:'standard',prompt:'一杯水吸收热量后温度如何变化？',answer:'B',choices:['A','B','C','D'].map(key=>({key,text:key==='B'?'升高':'保持不变'})),...fields};
  const item={topicId:id,attempt:1,question:q};
  const graph=E.buildGraph([{id,name:'热量 比热容'}],[],Array.from({length:4},(_,i)=>({...q,id:id+'_q'+(i+1),topicId:id})));
  const ctx={
    D:{graph}, E, session:E.createSession(graph,[id],{limit:16,confirm:4,seed:'focused-progress'}), sessionMeta:{label:'旧诊断目标'}, demo:null,
    ui:{key:id+'#1',phase,answer:phase==='ask'?'':'B',verdict:phase==='auto'?{verdict:'correct'}:null},
    resultPanelState:{analysis:true,log:true,more:true},
    document:{createElement:tag=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:String(text)}),getElementById:key=>ctx.page&&ctx.page.querySelector('#'+key)},
    window:{matchMedia:()=>({matches:fine})},
    returnPath:()=>'/explore/?subject=physics&volume=九全#'+id,selectSessionOwner(){},rememberStudyLocation(){},figureEl:()=>null,
    show(page,keepScroll){ctx.page=page;ctx.keepScroll=keepScroll;},
    judgeAndGo(){ctx.submitted=true;},commit(result){ctx.committed=result;},rebuild(){},confirm:()=>true,restart(){},
    feedbackBlock:()=>new Element('div'),
    childBar(){throw new Error('答题页不应渲染档案条');},reasonFor(){throw new Error('答题页不应渲染长策略说明');},textbookProgress(){throw new Error('答题页不应渲染教材统计');}
  };
  vm.createContext(ctx);
  vm.runInContext(section('function displayText(value)','function figureEl(svg)')+section('function questionProgress(item)','function demoBanner()'),ctx);
  ctx.renderQuestion(item);
  return ctx;
}
let passed=0;
function test(name,fn){fn();passed++;console.log('  ok   '+name);}
test('专注答题只构造当前题目与操作，不构造档案条、目标设置或策略说明',()=>{
  const ctx=load();
  assert.equal(ctx.page.className,'testing-page');
  assert.ok(ctx.page.querySelector('.question-card'));
  assert.equal(ctx.page.querySelector('#q-text').textContent,'一杯水吸收热量后温度如何变化？');
  assert.equal(ctx.page.querySelectorAll('.choice').length,4);
  assert.equal(ctx.page.querySelector('.reason'),null);
  assert.equal(ctx.page.querySelector('.notice'),null);
  assert.equal(ctx.page.querySelector('.textbook-progress'),null);
  assert.ok(!ctx.page.textContent.includes('null'));
  assert.equal(ctx.page.querySelector('.question-tools').open,false);
  assert.ok(ctx.page.querySelector('#btn-test-back').getAttribute('href').endsWith('#cnp_053'));
});
test('选择选项仍更新答案与选中状态，提交仍交给真实作答入口',()=>{
  const ctx=load();ctx.page.querySelector('#choice-B').click();
  assert.equal(ctx.ui.answer,'B');assert.equal(ctx.ui.picked,'B');
  assert.ok(ctx.page.querySelector('#choice-B').classList.contains('picked'));
  ctx.page.querySelector('#btn-submit').click();assert.equal(ctx.submitted,true);
});
test('提交后保留简短判定和下一题，解析与更正默认折叠',()=>{
  const ctx=load('choice','auto');
  assert.equal(ctx.page.querySelector('.verdict').textContent,'回答正确');
  assert.equal(ctx.page.querySelector('#question-explanation').open,false);
  assert.ok(ctx.page.querySelector('#btn-flip'));
  ctx.page.querySelector('#btn-next').click();assert.equal(ctx.committed,'correct');
});
test('不会和自评仍提交正确的结果类型，不改变引擎流程',()=>{
  const skip=load('choice','skip');skip.page.querySelector('#btn-next').click();assert.equal(skip.committed,'skip');
  const manual=load('self','self');assert.equal(manual.page.querySelector('#question-explanation').open,true);
  manual.page.querySelector('#btn-wrong').click();assert.equal(manual.committed,'wrong');
});
test('手机数值题不自动聚焦，桌面可聚焦且不滚动',()=>{
  const phone=load('numeric');assert.equal(phone.page.querySelector('#ans').focused,0);
  const desktop=load('numeric','ask',true);assert.equal(desktop.page.querySelector('#ans').focused,1);
});
test('仅复杂选择题标记短屏紧凑版，普通题和数值题不受影响',()=>{
  const questions=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/questions.json'),'utf8'));
  for (const qid of ['cnp_h094_q3','cnp_h023_q3','cnp_h106_q4']) {
    const q=questions.find(item=>item.id===qid);assert.ok(q,qid);
    assert.ok(load(q.type,'ask',false,q).page.querySelector('.question-card').classList.contains('question-dense'),qid);
  }
  assert.equal(load().page.querySelector('.question-card').classList.contains('question-dense'),false);
  assert.equal(load('numeric','ask',false,{prompt:'题'.repeat(180)}).page.querySelector('.question-card').classList.contains('question-dense'),false);
});
test('旧文字仅在展示时转为检测，输入值和原会话不被改写',()=>{
  const ctx=load();
  const title=ctx.h('p',{text:'旧诊断记录'},'诊断结果');assert.equal(title.textContent,'旧检测记录检测结果');
  const input=ctx.h('input',{value:'诊断原始输入'});assert.equal(input.value,'诊断原始输入');
  assert.equal(ctx.sessionMeta.label,'旧诊断目标');
  vm.runInContext(section('function shareScopeText()','function buildShareModel('),ctx);
  assert.equal(ctx.shareScopeText(),'旧检测目标');assert.equal(ctx.sessionMeta.label,'旧诊断目标');
});
test('进入作答启用专注状态，回开始或结果视图恢复全站导航',()=>{
  const toggles=[],scrolls=[];
  const ctx={teardownPath(){},closeShare(){},clearRoot(){},root:{append(){}},document:{body:{classList:{toggle:(...args)=>toggles.push(args)}}},window:{scrollTo:(...args)=>scrolls.push(args)}};
  vm.createContext(ctx);vm.runInContext(section('function show(node, keepScroll)','function cssVar(name)'),ctx);
  const question=new Element('div');question.className='testing-page';ctx.show(question,false);
  const result=new Element('div');result.className='compact-result';ctx.show(result,true);
  assert.deepEqual(toggles,[['testing-active',true],['testing-active',false]]);
  assert.equal(scrolls.length,1);
});

function preview(graph,run,phase='ask',verdict='correct',engine=E) {
  const item=E.nextItem(graph,run),before=JSON.stringify(run),question=item&&item.question.id;
  const ctx={E:engine,D:{graph},session:run,ui:{phase,verdict:{verdict}}};
  vm.createContext(ctx);vm.runInContext(section('function questionProgress(item)','function renderQuestion(item)'),ctx);
  const progress=ctx.questionProgress(item);
  assert.equal(JSON.stringify(run),before,'进度预演不得写入真实答案、状态、seed或出题记录');
  assert.equal(E.nextItem(graph,run)?.question.id,question,'下一道真实题目不被预演消耗');
  return progress;
}
function progressGraph(ids=['P','T'],count=4) {
  return E.buildGraph(ids.map(id=>({id,name:id})),ids.includes('P')&&ids.includes('T')?[{topicId:'T',prerequisiteId:'P',strength:'hard'}]:[],
    ids.flatMap(id=>Array.from({length:count},(_,n)=>({id:id+'_q'+(n+1),topicId:id,type:'numeric',difficulty:'standard',prompt:id+'?',answer:'1'}))));
}
test('普通和专家真实四题进度为0/4、1/4、2/4、3/4，提交反馈及时反映已完成题数',()=>{
  const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name),'utf8'));
  const topics=read('topics.json');
  for(const level of ['normal','pro']) {
    const graph=level==='normal'?E.buildGraph(topics,read('dependencies.json'),read('questions.json')):
      E.buildGraph(topics.filter(t=>/^cnp_\d+$/.test(t.id)),[],read('questions-pro.json'));
    let run=E.createSession(graph,[id],{confirm:4,limit:16,seed:'real-four-question-progress'});
    for(let n=0;n<4;n++) {
      const before=preview(graph,run);assert.equal(before.completed,n);assert.equal(before.total,4);assert.equal(before.percent,n*25);
      const feedback=preview(graph,run,'auto');assert.equal(feedback.completed,n+1);assert.equal(feedback.total,4);assert.equal(feedback.percent,(n+1)*25);
      run=E.applyAnswer(graph,run,id,'correct');
    }
    assert.equal(E.nextItem(graph,run),null);assert.equal(E.statusOf(run,id),'mastered');
  }
});
test('小学和高中三题专家包即使设置四题确认，也显示真实0/3到3/3进度',()=>{
  for(const id of ['cns_p001','cnp_h001']) {
    const graph=progressGraph([id],3);
    let run=E.createSession(graph,[id],{confirm:4,seed:'three-question-expert'});
    for(let n=0;n<3;n++) {
      const before=preview(graph,run);assert.equal(before.total,3);assert.equal(before.completed,n);
      assert.equal(before.percent,Math.round(n/3*100));
      const feedback=preview(graph,run,'auto');assert.equal(feedback.total,3);assert.equal(feedback.completed,n+1);
      assert.equal(feedback.percent,Math.round((n+1)/3*100));
      run=E.applyAnswer(graph,run,id,'correct');
    }
    assert.equal(E.nextItem(graph,run),null);assert.equal(E.statusOf(run,id),'mastered');
  }
});
test('进度条公开已完成和预计题数的可访问数值，反馈阶段不必等下一题才更新',()=>{
  const ask=load();let bar=ask.page.querySelector('.progress');
  assert.equal(bar.getAttribute('role'),'progressbar');assert.equal(bar.getAttribute('aria-valuemin'),'0');
  assert.equal(bar.getAttribute('aria-valuenow'),'0');assert.equal(bar.getAttribute('aria-valuemax'),'4');
  assert.ok(ask.page.querySelector('.test-step').textContent.includes('第 1 题 · 预计共 4 题'));
  const feedback=load('choice','auto');bar=feedback.page.querySelector('.progress');
  assert.equal(bar.getAttribute('aria-valuenow'),'1');assert.equal(bar.getAttribute('aria-valuemax'),'4');
  assert.equal(bar.children[0].getAttribute('style'),'width:25%');
});
test('题库少于确认题数时按真实可用题数显示，不使用16题安全上限',()=>{
  for(const count of [1,2,3]) {
    const graph=progressGraph(['T'],count),run=E.createSession(graph,['T'],{confirm:4,limit:16});
    assert.equal(preview(graph,run).total,count);
    const feedback=preview(graph,run,'auto');assert.equal(feedback.completed,1);assert.equal(feedback.total,count);
  }
});
test('错题确认、不会和回溯先修后按实际路线重新估算，有限题量仍正确截止',()=>{
  const graph=progressGraph();let run=E.createSession(graph,['T'],{confirm:4,limit:16});
  const firstWrong=preview(graph,run,'auto','wrong');assert.equal(firstWrong.completed,1);assert.equal(firstWrong.total,2);
  assert.equal(preview(graph,run,'skip').total,2);
  run=E.applyAnswer(graph,run,'T','wrong');
  assert.equal(preview(graph,run).total,2);
  const secondWrong=preview(graph,run,'auto','wrong');assert.equal(secondWrong.completed,2);assert.equal(secondWrong.total,6);
  run=E.applyAnswer(graph,run,'T','wrong');assert.equal(E.nextItem(graph,run).topicId,'P');assert.equal(preview(graph,run).total,6);
  const capped={...run,limit:4};assert.equal(preview(graph,capped).total,4);
});
test('整本、整章和筛查沿真实出题范围估算，每轮截止不把全部知识点硬算作题数',()=>{
  const graph=progressGraph(['P','T','U']);
  for(const [targets,mode,limit,total] of [
    [['P','T','U'],'textbook',40,12], [['P','T'],'textbook',40,8], [['P','T','U'],'textbook',5,5],
    [['P','T'],'screen',40,4]
  ]) {
    const run=E.createSession(graph,targets,{mode,volume:'九全',confirm:4,limit});
    assert.equal(preview(graph,run).total,total);
  }
});
test('撤销和存档回放后同一题进度一致，预演不改变下一题或seed',()=>{
  const graph=progressGraph(['T']);let run=E.createSession(graph,['T'],{confirm:4,limit:16,seed:'resume-progress',avoid:['T_q1']});
  for(let n=0;n<3;n++)run=E.applyAnswer(graph,run,'T','correct');
  assert.equal(preview(graph,run).percent,75);
  const restored=E.replay(graph,run.targets,run.answers,{confirm:run.confirm,limit:run.limit,seed:run.seed,avoid:run.avoid});
  assert.deepEqual(preview(graph,restored),preview(graph,run));
  const undone=E.replay(graph,run.targets,run.answers.slice(0,-1),{confirm:run.confirm,limit:run.limit,seed:run.seed,avoid:run.avoid});
  assert.equal(preview(graph,undone).percent,50);
});
test('异常大的旧会话最多预演60步，无法得出总题数时明确回退为本轮上限',()=>{
  const graph=progressGraph(Array.from({length:61},(_,n)=>'T'+n));
  const run=E.createSession(graph,Object.keys(graph.byId),{mode:'textbook',confirm:4,limit:1000});let calls=0;
  const progress=preview(graph,run,'ask','correct',{...E,applyAnswer(...args){calls++;return E.applyAnswer(...args);}});
  assert.equal(calls,60);assert.equal(progress.capped,true);assert.equal(progress.total,1000);
});
console.log('test_focused_testing: '+passed+' passed');
