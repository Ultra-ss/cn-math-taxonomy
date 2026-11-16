#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
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
  const ctx={
    D:{graph:{byId:{[id]:{id,name:'热量 比热容'}}}}, E:{}, session:{answers:[],limit:16}, sessionMeta:{label:'旧诊断目标'}, demo:null,
    ui:{key:id+'#1',phase,answer:phase==='ask'?'':'B',verdict:phase==='auto'?{verdict:'correct'}:null},
    resultPanelState:{analysis:true,log:true,more:true},
    document:{createElement:tag=>new Element(tag),createTextNode:text=>({nodeType:3,textContent:String(text)}),getElementById:key=>ctx.page&&ctx.page.querySelector('#'+key)},
    window:{matchMedia:()=>({matches:fine})},
    returnPath:()=>'/explore/?subject=physics&volume=九全#'+id,selectSessionOwner(){},figureEl:()=>null,
    show(page,keepScroll){ctx.page=page;ctx.keepScroll=keepScroll;},
    judgeAndGo(){ctx.submitted=true;},commit(result){ctx.committed=result;},rebuild(){},confirm:()=>true,restart(){},
    feedbackBlock:()=>new Element('div'),
    childBar(){throw new Error('答题页不应渲染档案条');},reasonFor(){throw new Error('答题页不应渲染长策略说明');},textbookProgress(){throw new Error('答题页不应渲染教材统计');}
  };
  vm.createContext(ctx);
  vm.runInContext(section('function displayText(value)','function figureEl(svg)')+section('function renderQuestion(item)','function demoBanner()'),ctx);
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
console.log('test_focused_testing: '+passed+' passed');
