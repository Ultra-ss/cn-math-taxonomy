#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/last-location.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/topics.json'), 'utf8'));
const BookSelection = require('../assets/book-selection.js');
const KEY = 'cnmLastLocation.v1';
let passed = 0;
async function test(name, fn) { await fn();passed++;console.log('  ok   '+name); }
function load(options = {}) {
  const store = new Map(Object.entries(options.entries || {}));
  const sessionStore = new Map(Object.entries(options.sessionEntries || {}));
  const redirects = [], calls = [];
  const location = {pathname:'/', search:'', hash:'', replace(href){redirects.push(href);}, assign(href){redirects.push(href);}, ...options.location};
  const nodes = {};
  for (const id of ['continue-learning-location','continue-learning-yes','continue-learning-no']) {
    nodes[id] = {textContent:'', handlers:{}, addEventListener(type, fn){this.handlers[type] = fn;}, click(){this.handlers.click();}};
  }
  const dialog = nodes['continue-learning-dialog'] = {
    open:false, shown:0, showModal(){this.open=true;this.shown++;}, close(){this.open=false;}
  };
  const root = {
    location,
    document:{documentElement:{style:{visibility:'visible'}},getElementById:id=>nodes[id] || null},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    sessionStorage:{getItem:key=>sessionStore.has(key)?sessionStore.get(key):null,setItem:(key,value)=>sessionStore.set(key,value)},
    fetch(url){calls.push(url);return options.fetch ? options.fetch(url) : Promise.resolve({ok:true,json:()=>Promise.resolve(topics)});}
  };
  if (options.denied) Object.defineProperty(root,'localStorage',{get(){throw new Error('Storage denied');}});
  if (options.deniedSession) Object.defineProperty(root,'sessionStorage',{get(){throw new Error('Session denied');}});
  if (options.home) root.document.body={classList:{contains:name=>name==='page-home'}};
  if (options.links) root.document.querySelectorAll=()=>options.links;
  const context = {window:root,module:{exports:{}},URLSearchParams,Promise,Date,setTimeout:options.timer || setTimeout,clearTimeout};
  vm.runInNewContext(source,context,{filename:'assets/last-location.js'});
  return {api:context.module.exports,root,store,sessionStore,redirects,calls,nodes,dialog};
}
function remember(api, fields = {}) {
  assert.equal(api.remember({subject:'physics',volume:'八下',topicId:'cnp_030',view:'local',depth:3,...fields}),true);
  return api.read();
}

(async()=>{
  await test('首次使用没有记录，模块同时提供Node接口',()=>{
    const {api}=load();assert.equal(api.KEY,KEY);assert.equal(api.read(),null);
    assert.equal(require('../assets/last-location.js').KEY,KEY);
  });
  await test('只保存知识点数据，恢复地址保持当前站点前缀',()=>{
    const {api,store}=load();const record=remember(api);
    assert.equal(record.topicId,'cnp_030');assert.equal(record.volume,'八下');
    assert.deepEqual(Object.keys(JSON.parse(store.get(KEY))).sort(),['v','subject','volume','topicId','view','depth','at'].sort());
    for (const [pathname,prefix] of [['/','/'],['/index.html','/'],['/school/','/school/'],['/school/index.html','/school/'],['/school/explore/','/school/'],['/school/explore/index.html','/school/']]) {
      const url=new URL(api.exploreURL(record,pathname),'https://physicalmap.pages.dev');
      assert.equal(url.pathname,prefix+'explore/');assert.equal(url.hash,'#cnp_030');
      assert.equal(url.searchParams.get('volume'),'八下');assert.equal(url.searchParams.get('view'),'local');assert.equal(url.searchParams.get('depth'),'3');
    }
  });
  await test('科学、高中与全部教材位置都能验证真实知识点',()=>{
    const {api}=load();
    for (const fields of [{subject:'science',volume:'三下',topicId:'cns_p086',depth:'all'},{volume:'必修二',topicId:'cnp_h028'},{volume:'',topicId:'cnp_071'}]) {
      const record=remember(api,fields);assert.equal(api.resolve(topics).topicId,record.topicId);
    }
  });
  await test('恢复URL从物理教材范围推断学段，跨学段与全部教材保持全部且不改学习存档',()=>{
    const {api,store}=load();
    for (const [fields,stage] of [
      [{volume:'八下',topicId:'cnp_030'},'j'],
      [{volume:'',volumes:['八上','九全'],topicId:'cnp_071'},'j'],
      [{volume:'',volumes:['八上','八下','九全'],topicId:'cnp_071'},'j'],
      [{volume:'必修一',topicId:'cnp_h001'},'h'],
      [{volume:'',volumes:['必修一','选必三'],topicId:'cnp_h001'},'h'],
      [{volume:'',volumes:BookSelection.allowed('physics').slice(3),topicId:'cnp_h001'},'h'],
      [{volume:'',volumes:['八上','必修一'],topicId:'cnp_001'},null],
      [{volume:'',volumes:BookSelection.allowed('physics'),topicId:'cnp_030'},null],
      [{volume:'',topicId:'cnp_071'},null],
      [{subject:'science',volume:'三下',topicId:'cns_p086'},null]
    ]) {
      const record=remember(api,fields),before=Object.fromEntries(store);
      const url=new URL(api.exploreURL(record,'/school/'),'https://physicalmap.pages.dev');
      assert.equal(url.searchParams.get('stage'),stage,JSON.stringify(fields));
      assert.equal(url.hash,'#'+record.topicId);assert.equal(url.searchParams.get('view'),record.view);
      assert.equal(url.searchParams.get('depth'),String(record.depth));
      assert.deepEqual(Object.fromEntries(store),before,'推断只改变URL，不写回学习或浏览记录');
      assert.ok(!Object.hasOwn(api.read(),'stage'),'旧存储格式保持不变');
    }
  });
  await test('物理和科学分别保留位置，多本范围不会在切科时互相覆盖，兼容旧版唯一存档',()=>{
    const old=load();const physics=remember(old.api);
    const app=load({entries:{[KEY]:old.store.get(KEY)}});
    remember(app.api,{subject:'science',volume:'',volumes:['三下','三上'],topicId:'cns_p086'});
    assert.equal(app.api.read().subject,'science');
    assert.equal(app.api.read('physics').topicId,physics.topicId);
    assert.deepEqual(Array.from(app.api.read('science').volumes),['三上','三下']);
    remember(app.api,{topicId:'cnp_031'});
    assert.equal(app.api.read('physics').topicId,'cnp_031');assert.equal(app.api.read('science').topicId,'cns_p086');
    assert.equal(app.api.read('english'),null);
    const next=load({entries:Object.fromEntries(app.store)});
    assert.equal(next.api.read('physics').topicId,'cnp_031');assert.equal(next.api.read('science').topicId,'cns_p086');
  });
  await test('失效的某科位置只清理相同候选，不删除另一科或更新后的存档',()=>{
    const app=load();const stale=remember(app.api,{topicId:'cnp_999'});
    remember(app.api,{subject:'science',volume:'三下',topicId:'cns_p086'});
    assert.equal(app.api.resolve(topics,app.api.read('physics')),null);
    assert.equal(app.api.read('science').topicId,'cns_p086');assert.equal(app.api.read().subject,'science');
    assert.equal(app.store.has(KEY+'.physics'),false);
    remember(app.api,{topicId:'cnp_031'});assert.equal(app.api.resolve(topics,stale),null);
    assert.equal(app.api.read('physics').topicId,'cnp_031');
    app.store.set(KEY+'.science',app.store.get(KEY+'.physics'));
    assert.equal(app.api.read('science'),null,'侧键内容不能冒充另一学科');
  });
  await test('跨科归档的旧快照不会覆盖另一窗口较新的同科位置',()=>{
    const app=load();const old=remember(app.api,{subject:'science',volume:'三下',topicId:'cns_p086'});
    const newer={...old,topicId:'cns_p087',at:new Date(Date.parse(old.at)+1000).toISOString()};
    const get=app.root.localStorage.getItem;let interleaved=false;
    app.root.localStorage.getItem=key=>{
      const value=get(key);
      if(key===KEY&&!interleaved) {
        interleaved=true;
        app.store.set(KEY,JSON.stringify(newer));app.store.set(KEY+'.science',JSON.stringify(newer));
      }
      return value;
    };
    remember(app.api);
    assert.equal(app.api.read('physics').topicId,'cnp_030');assert.equal(app.api.read('science').topicId,'cns_p087');
  });
  await test('只有带当前学科的导航续看入口恢复该科，显式教材与分享参数仍优先',()=>{
    const {api}=load();
    for(const subject of ['science','physics']) {
      assert.equal(api.shouldResume('explore',{search:'?subject='+subject+'&resume=1',hash:''}),true);
      assert.equal(api.shouldResume('home',{search:'?subject='+subject+'&resume=1',hash:''}),false);
      for(const suffix of ['&volume=三下','&volumes=三上,三下','&grade=3','&q=天气','&view=local','&depth=2','&target=cns_p086','&chapter=某单元','&returnTo=/explore/']) {
        assert.equal(api.shouldResume('explore',{search:'?subject='+subject+'&resume=1'+suffix,hash:''}),false,suffix);
      }
      assert.equal(api.shouldResume('explore',{search:'?subject='+subject+'&resume=1',hash:'#cns_p086'}),false);
    }
    assert.equal(api.shouldResume('explore',{search:'?subject=bad&resume=1',hash:''}),false);
  });
  await test('共享导航跟随当前学科，并在个人中心等页面继承；裸首页仍默认物理',()=>{
    function link(href,graph=false) {
      const attrs=new Map([['href',href]]);if(graph)attrs.set('data-resume-graph','');
      return {getAttribute:key=>attrs.get(key)||null,setAttribute:(key,value)=>attrs.set(key,value),hasAttribute:key=>attrs.has(key)};
    }
    const graph=link('explore/',true),home=link('./?home=1'),center=link('children/'),external=link('https://pansgo.com');
    const app=load({home:true,location:{search:'?subject=science'},links:[graph,home,center,external]});
    let url=new URL(graph.getAttribute('href'),'https://physicalmap.pages.dev');
    assert.equal(url.searchParams.get('subject'),'science');assert.equal(url.searchParams.get('resume'),'1');
    assert.equal(new URL(home.getAttribute('href'),'https://physicalmap.pages.dev').searchParams.get('home'),'1');
    assert.equal(new URL(center.getAttribute('href'),'https://physicalmap.pages.dev').searchParams.get('subject'),'science');
    assert.equal(external.getAttribute('href'),'https://pansgo.com');
    const neutral=load({location:{pathname:'/children/'},sessionEntries:Object.fromEntries(app.sessionStore),links:[graph]});
    assert.equal(neutral.api.currentSubject(),'science');
    app.api.syncNavigation('physics');url=new URL(graph.getAttribute('href'),'https://physicalmap.pages.dev');
    assert.equal(url.searchParams.get('subject'),'physics');assert.equal(url.searchParams.getAll('subject').length,1);
    const freshHome=load({home:true,sessionEntries:Object.fromEntries(neutral.sessionStore)});
    assert.equal(freshHome.api.currentSubject(),'physics');
    const denied=load({denied:true,deniedSession:true,location:{search:'?subject=science'},links:[graph]});
    assert.equal(denied.api.currentSubject(),'science');assert.ok(graph.getAttribute('href').includes('subject=science'));
  });
  await test('真实图谱恢复函数选择本学科存档，没有本科存档时不借用其他学科',()=>{
    const app=load();remember(app.api);
    remember(app.api,{subject:'science',volume:'',volumes:['三上','三下'],topicId:'cns_p086'});
    const appSource=fs.readFileSync(path.join(ROOT,'explore/app.js'),'utf8');
    const a=appSource.indexOf('function restoreLocation(allTopics)'),b=appSource.indexOf('function showLoadError(',a);
    for(const subject of ['physics','science']) {
      let restored='';const ctx={window:{CnmLastLocation:app.api},subject,
        location:{pathname:'/explore/',search:'?subject='+subject+'&resume=1',hash:''},
        history:{replaceState(_a,_b,value){restored=value;}},configureSubject(){},applyQuery(){}};
      vm.runInNewContext(appSource.slice(a,b)+';restoreLocation(rows);',{...ctx,rows:topics});
      const url=new URL(restored,'https://physicalmap.pages.dev');assert.equal(url.searchParams.get('subject'),subject);
      assert.equal(url.hash,subject==='physics'?'#cnp_030':'#cns_p086');
    }
    const physicsOnly=load();remember(physicsOnly.api);let called=false;
    const ctx={window:{CnmLastLocation:physicsOnly.api},subject:'science',location:{search:'?subject=science&resume=1',hash:''},
      history:{replaceState(){called=true;}},configureSubject(){},applyQuery(){},rows:topics};
    vm.runInNewContext(appSource.slice(a,b)+';restoreLocation(rows);',ctx);assert.equal(called,false);
    ctx.location={search:'?subject=physics&volume=九全',hash:'#cnp_071'};
    vm.runInNewContext(appSource.slice(a,b)+';restoreLocation(rows);',ctx);assert.equal(called,false);
  });
  await test('明确首页、学科、册次、年级、知识点与筛选链接始终优先',()=>{
    const {api}=load();
    for (const search of ['?home=1','?subject=physics','?subject=science','?subject=','?volume=八上','?volumes=八上,八下','?volumes=','?volumes=bad','?grade=8','?q=力','?stage=j','?domain=能量','?view=local','?depth=3','?target=cnp_001','?chapter=八上 第一章','?returnTo=/explore/']) {
      for (const mode of ['home','explore']) assert.equal(api.shouldResume(mode,{search,hash:''}),false,search);
    }
    assert.equal(api.shouldResume('home',{search:'',hash:'#cnp_001'}),false);
    assert.equal(api.shouldResume('explore',{search:'',hash:'#cns_p001'}),false);
    assert.equal(api.shouldResume('home',{search:'?source=pwa',hash:''}),true);
    assert.equal(api.shouldResume('explore',{search:'?source=pwa',hash:''}),true);
  });
  await test('多本范围规范排序去重，旧单本存储结构保持兼容',()=>{
    const {api,store}=load();
    const record=remember(api,{volume:'',volumes:['九全','八下','八上','八下']});
    assert.equal(record.volume,'');assert.deepEqual(Array.from(record.volumes),['八上','八下','九全']);
    assert.equal(api.resolve(topics).topicId,'cnp_030');
    const url=new URL(api.exploreURL(record,'/school/explore/'),'https://physicalmap.pages.dev');
    assert.equal(url.pathname,'/school/explore/');assert.equal(url.searchParams.get('volumes'),'八上,八下,九全');
    assert.equal(url.searchParams.has('volume'),false);assert.equal(url.hash,'#cnp_030');
    const next=load({entries:{[KEY]:store.get(KEY)}});assert.deepEqual(Array.from(next.api.read().volumes),['八上','八下','九全']);
    const single=remember(api,{volume:'',volumes:['八下','八下']});
    assert.equal(single.volume,'八下');assert.equal(Object.prototype.hasOwnProperty.call(single,'volumes'),false);
    assert.equal(new URL(api.exploreURL(single),'https://physicalmap.pages.dev').searchParams.get('volume'),'八下');
  });
  await test('科学与高中多本可以恢复，知识点必须属于所选教材之一',()=>{
    const {api,store}=load();
    for(const fields of [
      {volume:'',volumes:['必修二','八下'],topicId:'cnp_h028'},
      {subject:'science',volume:'',volumes:['三下','二下','三上'],topicId:'cns_p086'}
    ]) {remember(api,fields);assert.equal(api.resolve(topics).topicId,fields.topicId);}
    remember(api,{volume:'',volumes:['八上','必修二'],topicId:'cnp_030'});
    assert.equal(api.resolve(topics),null);assert.equal(store.has(KEY),false);
  });
  await test('多本存储拒绝空、稀疏、错科和矛盾范围，非法保存保留原位置',()=>{
    const {api,store}=load();const valid=remember(api);const before=store.get(KEY);
    for(const volumes of [[],null,'八上,八下',['八上','三下'],['八上','bad'],['八上',''],['八上',2],new Array(2)]){
      assert.equal(api.remember({...valid,volume:'',volumes}),false,JSON.stringify(volumes));
      assert.equal(store.get(KEY),before);
      store.set(KEY,JSON.stringify({...valid,volume:'',volumes}));assert.equal(api.read(),null);store.set(KEY,before);
    }
    assert.equal(api.remember({...valid,volumes:['八上','八下']}),false,'多本不能同时带非空单册');
    const inherited=Object.assign(Object.create({volumes:['八上','八下']}),valid,{volume:''});
    assert.equal(api.remember(inherited),false);
    const broken={...valid};Object.defineProperty(broken,'volumes',{get(){throw new Error('bad getter');}});
    assert.equal(api.remember(broken),false);assert.equal(store.get(KEY),before);
  });
  await test('多本继续弹窗列出范围并恢复整组，旧候选不会清掉新窗口的新范围',async()=>{
    const app=load();remember(app.api,{volume:'',volumes:['八下','八上']});
    assert.equal(await app.api.resumeHome(),true);
    assert.ok(app.nodes['continue-learning-location'].textContent.includes('八年级上册、八年级下册'));
    app.nodes['continue-learning-yes'].click();
    const url=new URL(app.redirects[0],'https://physicalmap.pages.dev');
    assert.equal(url.searchParams.get('volumes'),'八上,八下');assert.equal(url.hash,'#cnp_030');
    let respond;const deferred=load({fetch:()=>new Promise(done=>{respond=done;})});
    remember(deferred.api,{volume:'',volumes:['八上','必修二']});const pending=deferred.api.resumeHome();
    remember(deferred.api,{volume:'',volumes:['八下','九全']});respond({ok:true,json:()=>topics});await pending;
    assert.deepEqual(Array.from(deferred.api.read().volumes),['八下','九全']);
  });
  await test('损坏数据和跨科、非法册次均不会形成恢复候选',()=>{
    const {api,store}=load();const valid=remember(api);
    for (const raw of ['bad json','[]','null',JSON.stringify({url:'https://evil.example/'}),...[
      {v:2},{subject:'english'},{topicId:'cns_p001'},{volume:'一年级'},{view:'https://evil.example/'},{depth:99},{at:'bad-date'}
    ].map(fields=>JSON.stringify({...valid,...fields}))]) {
      store.set(KEY,raw);assert.equal(api.read(),null,raw);
    }
    store.set(KEY,JSON.stringify({...valid,url:'https://evil.example/'}));
    assert.ok(!JSON.stringify(api.read()).includes('evil.example'));
    for (const pathname of ['https://evil.example/','//evil.example/','/\\evil.example/','/school/../']) assert.equal(new URL(api.exploreURL(api.read(),pathname),'https://physicalmap.pages.dev').origin,'https://physicalmap.pages.dev');
  });
  await test('失效知识点、错误册次清除同一候选，不覆盖其他窗口的新位置',async()=>{
    const {api,store}=load();remember(api,{topicId:'cnp_999'});assert.equal(api.resolve(topics),null);assert.equal(store.has(KEY),false);
    remember(api,{topicId:'cnp_030',volume:'八上'});assert.equal(api.resolve(topics),null);assert.equal(store.has(KEY),false);
    let respond;const deferred=load({fetch:()=>new Promise(done=>{respond=done;})});
    remember(deferred.api,{topicId:'cnp_999'});const pending=deferred.api.resumeHome();
    remember(deferred.api,{topicId:'cnp_031'});respond({ok:true,json:()=>topics});await pending;
    assert.equal(deferred.api.read().topicId,'cnp_031');
  });
  await test('存储禁用时安全回退，保存失败不影响页面浏览',async()=>{
    const {api,root}=load({denied:true});assert.equal(api.read(),null);
    assert.equal(api.remember({subject:'physics',volume:'八上',topicId:'cnp_001'}),false);
    assert.equal(await api.resumeHome(),false);assert.equal(root.document.documentElement.style.visibility,'visible');
  });
  await test('首页和PWA入口验证数据后弹出继续提示，点击前不跳转且首页始终可见',async()=>{
    const {api,root,calls,redirects,nodes,dialog}=load({location:{pathname:'/school/',search:'?source=pwa'}});remember(api);
    const pending=api.resumeHome();assert.equal(root.document.documentElement.style.visibility,'visible');
    assert.equal(await pending,true);assert.equal(await api.resumeHome(),true);
    assert.equal(calls.length,1);assert.equal(calls[0],'/school/data/topics.json');assert.equal(redirects.length,0);
    assert.equal(dialog.open,true);assert.equal(dialog.shown,1);
    assert.ok(nodes['continue-learning-location'].textContent.includes('初高中物理 · 八年级下册'));
    assert.ok(nodes['continue-learning-location'].textContent.includes(topics.find(t=>t.id==='cnp_030').name));
    nodes['continue-learning-yes'].click();assert.equal(redirects.length,1);assert.equal(dialog.open,false);
    assert.equal(new URL(redirects[0],'https://physicalmap.pages.dev').pathname,'/school/explore/');
    assert.equal(new URL(redirects[0],'https://physicalmap.pages.dev').hash,'#cnp_030');
  });
  await test('暂不继续关闭提示并保留记录，下次重新打开仍可继续',async()=>{
    const first=load();const record=remember(first.api);
    assert.equal(await first.api.resumeHome(),true);first.nodes['continue-learning-no'].click();
    assert.equal(first.dialog.open,false);assert.equal(first.redirects.length,0);assert.equal(first.api.read().topicId,record.topicId);
    const next=load({entries:{[KEY]:first.store.get(KEY)}});assert.equal(await next.api.resumeHome(),true);assert.equal(next.dialog.open,true);
  });
  await test('首次或显式首页不隐藏页面，也不额外请求元数据',async()=>{
    const fresh=load();assert.equal(await fresh.api.resumeHome(),false);assert.equal(fresh.calls.length,0);
    const home=load({location:{search:'?home=1'}});remember(home.api);assert.equal(await home.api.resumeHome(),false);assert.equal(home.calls.length,0);assert.equal(home.root.document.documentElement.style.visibility,'visible');
  });
  await test('网络失败、错误数据、过期ID和超时不弹窗，首页始终可见',async()=>{
    for (const fetch of [()=>Promise.reject(new Error('network')),()=>Promise.resolve({ok:false}),()=>Promise.resolve({ok:true,json:()=>({bad:true})})]) {
      const app=load({fetch});remember(app.api);assert.equal(await app.api.resumeHome(),false);assert.equal(app.redirects.length,0);assert.equal(app.dialog.open,false);assert.equal(app.root.document.documentElement.style.visibility,'visible');
    }
    const stale=load();remember(stale.api,{topicId:'cnp_999'});assert.equal(await stale.api.resumeHome(),false);assert.equal(stale.store.has(KEY),false);assert.equal(stale.root.document.documentElement.style.visibility,'visible');
    const timeout=load({fetch:()=>new Promise(()=>{}),timer:fn=>setTimeout(fn,0)});remember(timeout.api);assert.equal(await timeout.api.resumeHome(),false);assert.equal(timeout.root.document.documentElement.style.visibility,'visible');
  });
  await test('账号与访客最近做题各自保留，泛浏览不覆盖学习点，未做题账号不借用旧全局位置',()=>{
    const app=load();const profiles={v:1,current:'a',children:[{id:'a'},{id:'b'}]};
    remember(app.api,{topicId:'cnp_030'});
    app.store.set('cnmChildren.v1',JSON.stringify(profiles));assert.equal(app.api.owner(),'a');assert.equal(app.api.read(),null);
    remember(app.api,{topicId:'cnp_031'});
    assert.equal(app.api.rememberLearning({subject:'physics',volume:'八下',topicId:'cnp_032',view:'book',depth:2}),true);
    remember(app.api,{topicId:'cnp_033'});assert.equal(app.api.read('physics').topicId,'cnp_032');
    assert.equal(app.api.resume(topics,'physics').topicId,'cnp_032');
    profiles.current='b';app.store.set('cnmChildren.v1',JSON.stringify(profiles));assert.equal(app.api.resume(topics,'physics'),null);
    app.api.rememberLearning({subject:'physics',volume:'九全',topicId:'cnp_071',view:'book',depth:2});
    app.api.rememberLearning({subject:'physics',volume:'八下',topicId:'cnp_034',view:'local',depth:3},'a');
    assert.equal(app.api.read('physics').topicId,'cnp_071','旧A检测继续时只更新A，当前B不被改变');
    profiles.current='a';app.store.set('cnmChildren.v1',JSON.stringify(profiles));assert.equal(app.api.read('physics').topicId,'cnp_034');
    profiles.current=null;app.store.set('cnmChildren.v1',JSON.stringify(profiles));assert.equal(app.api.read('physics').topicId,'cnp_030');
    assert.equal(app.api.rememberLearning({subject:'physics',volume:'八下',topicId:'cnp_035'},'__proto__'),false);
  });
  await test('新版学习点跨学科独立恢复，多册上下文保留，主页无children模块也识别账号',async()=>{
    const app=load({entries:{'cnmChildren.v1':JSON.stringify({current:'a',children:[{id:'a'}]})}});
    app.api.rememberLearning({subject:'physics',volume:'',volumes:['八下','九全'],topicId:'cnp_030',view:'book',depth:3});
    app.api.rememberLearning({subject:'science',volume:'三下',topicId:'cns_p086',view:'local',depth:2});
    assert.equal(app.api.read('physics').topicId,'cnp_030');assert.equal(app.api.read('science').topicId,'cns_p086');
    assert.deepEqual(Array.from(app.api.resume(topics,'physics').volumes),['八下','九全']);
    assert.equal(await app.api.resumeHome(),true);assert.ok(app.nodes['continue-learning-location'].textContent.includes('小学科学'));
    const next=load({entries:Object.fromEntries(app.store)});assert.equal(next.api.owner(),'a');assert.equal(next.api.read('physics').topicId,'cnp_030');
  });
  await test('较新或同时间的全教材浏览只恢复范围与视图，保留真实学习点和时间且不写学习记录',()=>{
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'book',depth:2,at:'2026-11-18T08:00:00.000Z'};
    for(const at of [study.at,'2026-11-18T09:00:00.000Z']) {
      const browse={...study,volume:'',volumes:BookSelection.allowed('physics'),topicId:'cnp_h001',view:'local',depth:'all',at};
      const app=load({entries:{'cnmChildren.v1':JSON.stringify({current:'a',children:[{id:'a'}]}),
        [KEY+'.learning.a']:JSON.stringify(study),[KEY+'.learning.a.physics']:JSON.stringify(study),
        [KEY+'.account.a']:JSON.stringify(browse),[KEY+'.account.a.physics']:JSON.stringify(browse)}});
      const before=Object.fromEntries(app.store),rec=app.api.resume(topics,'physics');
      assert.equal(rec.topicId,study.topicId);assert.equal(rec.at,study.at);assert.equal(rec.subject,study.subject);assert.equal(rec.v,study.v);
      assert.equal(rec.volume,'');assert.deepEqual(Array.from(rec.volumes),BookSelection.allowed('physics'));
      assert.equal(rec.view,'local');assert.equal(rec.depth,'all');
      assert.deepEqual(JSON.parse(JSON.stringify(app.api.read('physics'))),study,'真实学习存档的单册上下文没有被浏览改写');
      assert.deepEqual(Object.fromEntries(app.store),before,'恢复显示范围不产生新写入或伪造学习时间');
    }
  });
  await test('较旧的全教材、部分教材和单册浏览均不覆盖较新的真实学习上下文',()=>{
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'book',depth:2,at:'2026-11-18T08:00:00.000Z'};
    const candidates=[
      {...study,volume:'',volumes:BookSelection.allowed('physics'),topicId:'cnp_h001',at:'2026-11-18T07:00:00.000Z'},
      {...study,volume:'',volumes:['八下','九全'],topicId:'cnp_071',at:'2026-11-18T09:00:00.000Z'},
      {...study,volume:'九全',topicId:'cnp_071',at:'2026-11-18T09:00:00.000Z'}
    ];
    for(const candidate of candidates) {
      const app=load({entries:{[KEY+'.learning.guest']:JSON.stringify(study),[KEY]:JSON.stringify(candidate)}});
      const before=Object.fromEntries(app.store);
      assert.deepEqual(JSON.parse(JSON.stringify(app.api.resume(topics,'physics'))),study);
      assert.deepEqual(Object.fromEntries(app.store),before);
    }
  });
  await test('全教材浏览范围按账号和学科隔离，科学12册与物理9册各自恢复',()=>{
    const profiles={current:'a',children:[{id:'a'},{id:'b'}]};
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'book',depth:2,at:'2026-11-18T08:00:00.000Z'};
    const science={...study,subject:'science',volume:'三下',topicId:'cns_p086'};
    const browse={...study,volume:'',volumes:BookSelection.allowed('physics'),topicId:'cnp_h001',view:'local',depth:3,at:'2026-11-18T09:00:00.000Z'};
    const app=load({entries:{'cnmChildren.v1':JSON.stringify(profiles),
      [KEY+'.learning.a']:JSON.stringify(study),[KEY+'.learning.a.science']:JSON.stringify(science),
      [KEY+'.learning.b']:JSON.stringify(study),[KEY+'.account.a']:JSON.stringify(browse)}});
    assert.deepEqual(Array.from(app.api.resume(topics,'physics').volumes),BookSelection.allowed('physics'));
    assert.deepEqual(JSON.parse(JSON.stringify(app.api.resume(topics,'science'))),science,'物理全范围不借给科学');
    app.store.set(KEY+'.account.a.science',JSON.stringify({...science,volume:'',volumes:BookSelection.allowed('science'),view:'local',depth:'all',at:browse.at}));
    const rec=app.api.resume(topics,'science');assert.equal(rec.topicId,science.topicId);assert.equal(rec.at,science.at);
    assert.deepEqual(Array.from(rec.volumes),BookSelection.allowed('science'));assert.equal(rec.view,'local');assert.equal(rec.depth,'all');
    profiles.current='b';app.store.set('cnmChildren.v1',JSON.stringify(profiles));
    assert.deepEqual(JSON.parse(JSON.stringify(app.api.resume(topics,'physics'))),study,'A的全范围不借给B');
    assert.equal(app.api.resume(topics,'science'),null);
    profiles.current=null;app.store.set('cnmChildren.v1',JSON.stringify(profiles));assert.equal(app.api.resume(topics,'physics'),null,'账号全范围不借给访客');
  });
  await test('已有账号从归属明确的最近答题记录恢复，不会认领别人的会话或全局浏览',()=>{
    const profile=JSON.stringify({current:'a',children:[{id:'a'},{id:'b'}]});
    const app=load({entries:{'cnmChildren.v1':profile,
      'cnmProgress.v1':JSON.stringify({v:1,byChild:{a:{runs:[{subject:'physics',at:'2026-11-16T09:00:00Z',states:{cnp_071:{status:'mastered',at:'2026-11-16T09:00:00Z'}}}]},b:{runs:[{states:{cnp_030:{at:'2026-11-17T12:00:00Z'}}}]}}}),
      'cnpDiagnose.session.v2':JSON.stringify({progressChildId:'b',savedAt:'2026-11-17T12:00:00Z',answers:[{id:'cnp_030',result:'correct'}]}),
      'cnmChildren.records.v1':JSON.stringify({a:[{savedAt:'2026-11-18T12:00:00Z',updatedAt:'2026-11-18T12:00:00Z',asked:1,targets:['cnp_031','cnp_032']}]})}});
    app.api.rememberLearning({subject:'physics',volume:'九全',topicId:'cnp_999'});
    const rec=app.api.resume(topics,'physics');assert.equal(rec.topicId,'cnp_071');assert.equal(rec.volume,'九全');assert.equal(app.api.read('physics').topicId,'cnp_071');
    const old=load({entries:{'cnmChildren.v1':profile,'cnpDiagnose.session.v2':JSON.stringify({progressChildId:'a',savedAt:'2026-11-17T12:00:00Z',answers:[{id:'cnp_030',result:'correct'},{id:'cnp_031',result:'wrong'}]})}});
    assert.equal(old.api.resume(topics,'physics').topicId,'cnp_031');
    const unknown=load({entries:{'cnmChildren.v1':profile,'cnpDiagnose.session.v2':JSON.stringify({savedAt:'2026-11-17T12:00:00Z',answers:[{id:'cnp_030',result:'correct'}]})}});
    assert.equal(unknown.api.resume(topics,'physics'),null,'未归属旧全局检测不自动写给当前账号');
  });
  await test('编辑教材范围优先于旧学习范围，范围外位置回退到所选教材且不改真实学习存档',()=>{
    const study={v:1,subject:'physics',volume:'八上',topicId:'cnp_001',view:'local',depth:2,at:'2026-11-18T08:00:00.000Z'};
    const browse={...study,volume:'八下',topicId:'cnp_032',at:'2026-11-18T09:00:00.000Z'};
    const profiles={current:'a',children:[{id:'a'}],bookSelections:{a:{physics:{volumes:['八下','九全'],at:'2026-11-18T10:00:00.000Z'}}}};
    const app=load({entries:{'cnmChildren.v1':JSON.stringify(profiles),[KEY+'.learning.a']:JSON.stringify(study),[KEY+'.account.a']:JSON.stringify(browse)}});
    const before=Object.fromEntries(app.store),record=app.api.resume(topics,'physics');
    assert.equal(record.topicId,browse.topicId);assert.equal(record.view,'book');
    assert.deepEqual(Array.from(record.volumes),['八下','九全']);
    assert.deepEqual(Object.fromEntries(app.store),before,'图谱恢复不改位置、学习进度或选书偏好');
    app.api.remember({subject:'physics',volume:'必修一',topicId:'cnp_h001',view:'local',depth:3});
    const afterBrowse=Object.fromEntries(app.store),resumed=app.api.resume(topics,'physics');
    assert.equal(resumed.topicId,'cnp_029','范围内无可用浏览位置时回到所选教材首个知识点');
    assert.deepEqual(Array.from(resumed.volumes),['八下','九全'],'普通浏览不能盖掉明确选书范围');
    assert.deepEqual(Object.fromEntries(app.store),afterBrowse);assert.equal(app.store.get(KEY+'.learning.a'),JSON.stringify(study));
    profiles.bookSelections.a.physics={volumes:['九全'],at:'2026-11-18T11:00:00.000Z'};
    app.store.set('cnmChildren.v1',JSON.stringify(profiles));
    const latest=app.api.resume(topics,'physics');assert.equal(latest.volume,'九全');assert.equal(latest.volumes,undefined);
    assert.equal(topics.find(topic=>topic.id===latest.topicId).grade,9,'新的明确选择立即成为导航范围');
  });
  await test('明确多选与全教材选择保留范围内最近学习点，空选择只让图谱显示全网且不重新选书',()=>{
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'local',depth:3,at:'2026-11-18T08:00:00.000Z'};
    for(const selected of [['八下','九全'],BookSelection.allowed('physics'),[]]) {
      const pref={volumes:selected,at:'2026-11-18T07:00:00.000Z'};
      const app=load({entries:{'cnmChildren.v1':JSON.stringify({current:null,children:[],bookSelections:{guest:{physics:pref}}}),[KEY+'.learning.guest']:JSON.stringify(study)}});
      const before=Object.fromEntries(app.store),record=app.api.resume(topics,'physics');
      assert.equal(record.topicId,study.topicId);assert.equal(record.at,study.at);assert.equal(record.depth,3);
      assert.equal(record.view,'book');assert.deepEqual(Array.from(record.volumes),selected.length?selected:BookSelection.allowed('physics'));
      assert.deepEqual(Object.fromEntries(app.store),before,'即使书单为空也不写回all或学习范围');
      assert.deepEqual(Array.from(app.api.preferredSelection('physics').volumes),selected);
    }
  });
  await test('教材范围一致时保留局部视图，较新浏览只提供视图而不替换真实学习点和时间',()=>{
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'local',depth:3,at:'2026-11-18T08:00:00.000Z'};
    const profiles={current:null,children:[],bookSelections:{guest:{physics:{volumes:['八下'],at:'2026-11-18T07:00:00.000Z'}}}};
    const app=load({entries:{'cnmChildren.v1':JSON.stringify(profiles),[KEY+'.learning.guest']:JSON.stringify(study)}});
    let before=Object.fromEntries(app.store),record=app.api.resume(topics,'physics');
    assert.equal(record.view,'local');assert.equal(record.depth,3);assert.equal(record.topicId,study.topicId);assert.equal(record.at,study.at);
    assert.deepEqual(Object.fromEntries(app.store),before);
    const browse={...study,topicId:'cnp_035',view:'book',depth:'all',at:'2026-11-18T09:00:00.000Z'};
    app.store.set(KEY,JSON.stringify(browse));before=Object.fromEntries(app.store);record=app.api.resume(topics,'physics');
    assert.equal(record.view,'book');assert.equal(record.depth,'all');assert.equal(record.topicId,study.topicId);assert.equal(record.at,study.at);
    assert.deepEqual(Object.fromEntries(app.store),before,'同范围恢复不改存储');
    profiles.bookSelections.guest.physics.volumes=['八下','九全'];
    app.store.set('cnmChildren.v1',JSON.stringify(profiles));
    app.store.set(KEY,JSON.stringify({...browse,volume:'',volumes:['八下','九全'],view:'local',depth:2}));
    before=Object.fromEntries(app.store);record=app.api.resume(topics,'physics');
    assert.equal(record.view,'local');assert.equal(record.depth,2);assert.equal(record.topicId,study.topicId);assert.equal(record.at,study.at);
    assert.deepEqual(Object.fromEntries(app.store),before);
  });
  await test('编辑成新教材范围时使用全图，旧局部视图不缩小新范围且不改学习记录',()=>{
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'local',depth:3,at:'2026-11-18T08:00:00.000Z'};
    const pref={volumes:['八下','九全'],at:'2026-11-18T10:00:00.000Z'};
    const app=load({entries:{'cnmChildren.v1':JSON.stringify({current:null,children:[],bookSelections:{guest:{physics:pref}}}),
      [KEY+'.learning.guest']:JSON.stringify(study),[KEY]:JSON.stringify({...study,topicId:'cnp_035',at:'2026-11-18T09:00:00.000Z'})}});
    const before=Object.fromEntries(app.store),record=app.api.resume(topics,'physics');
    assert.equal(record.view,'book');assert.deepEqual(Array.from(record.volumes),pref.volumes);
    assert.equal(record.topicId,study.topicId);assert.equal(record.at,study.at);assert.deepEqual(Object.fromEntries(app.store),before);
  });
  await test('教材偏好按账号与学科隔离，无学习点时进入对应范围首点并保持无学习存档',()=>{
    const profiles={current:'a',children:[{id:'a'},{id:'b'}],bookSelections:{
      a:{physics:{volumes:['九全'],at:'2026-11-18T10:00:00.000Z'},science:{volumes:['三下'],at:'2026-11-18T11:00:00.000Z'}},
      b:{physics:{volumes:['必修一'],at:'2026-11-18T12:00:00.000Z'}},guest:{physics:{volumes:['八上'],at:'2026-11-18T13:00:00.000Z'}}}};
    const app=load({entries:{'cnmChildren.v1':JSON.stringify(profiles)}}),before=Object.fromEntries(app.store);
    assert.equal(app.api.resume(topics,'physics').volume,'九全');assert.equal(app.api.resume(topics,'science').volume,'三下');
    assert.equal(app.api.resume(topics).subject,'science','没有既往学习点时以最近编辑学科为准');
    assert.equal(app.api.preferredSelection('physics','b').volumes[0],'必修一');
    assert.equal(app.api.preferredSelection('physics','unknown'),null);
    assert.deepEqual(Object.fromEntries(app.store),before);
    profiles.current='b';app.store.set('cnmChildren.v1',JSON.stringify(profiles));
    assert.equal(app.api.resume(topics,'physics').volume,'必修一');assert.equal(app.api.resume(topics,'science'),null);
    profiles.current=null;app.store.set('cnmChildren.v1',JSON.stringify(profiles));assert.equal(app.api.resume(topics,'physics').volume,'八上');
    assert.equal(Array.from(app.store.keys()).some(key=>key.startsWith(KEY)),false,'浏览有效教材首点不伪造学习记录');
  });
  await test('损坏教材偏好被忽略，旧位置仍可恢复，合法偏好返回副本',()=>{
    const study={v:1,subject:'physics',volume:'八下',topicId:'cnp_032',view:'book',depth:2,at:'2026-11-18T08:00:00.000Z'};
    for(const pref of [null,[],{volumes:'八上',at:study.at},{volumes:['bad'],at:study.at},{volumes:['三下'],at:study.at},
      {volumes:[null],at:study.at},{volumes:['九全'],at:'bad-date'},{volumes:['九全']},{at:study.at}]) {
      const app=load({entries:{'cnmChildren.v1':JSON.stringify({current:'a',children:[{id:'a'}],bookSelections:{a:{physics:pref}}}),[KEY+'.learning.a']:JSON.stringify(study)}});
      const before=Object.fromEntries(app.store);
      assert.equal(app.api.preferredSelection('physics'),null);assert.equal(app.api.resume(topics,'physics').topicId,study.topicId);
      assert.deepEqual(Object.fromEntries(app.store),before);
    }
    const app=load({entries:{'cnmChildren.v1':JSON.stringify({children:[],bookSelections:{guest:{physics:{volumes:['九全'],at:study.at}}}})}});
    const selection=app.api.preferredSelection('physics');selection.volumes.push('八上');
    assert.deepEqual(Array.from(app.api.preferredSelection('physics').volumes),['九全']);
    assert.equal(app.api.preferredSelection('__proto__'),null);
  });
  await test('有教材偏好时从旧作答恢复只构造显示位置，不额外写入迁移学习存档',()=>{
    const app=load({entries:{'cnmChildren.v1':JSON.stringify({current:'a',children:[{id:'a'}],bookSelections:{a:{physics:{volumes:['八下','九全'],at:'2026-11-18T12:00:00Z'}}}}),
      'cnpDiagnose.session.v2':JSON.stringify({progressChildId:'a',savedAt:'2026-11-18T08:00:00Z',answers:[{id:'cnp_032',result:'correct'}]})}});
    const before=Object.fromEntries(app.store),record=app.api.resume(topics,'physics');
    assert.equal(record.topicId,'cnp_032');assert.deepEqual(Array.from(record.volumes),['八下','九全']);
    assert.deepEqual(Object.fromEntries(app.store),before);assert.equal(app.api.read('physics'),null);
  });
  await test('全站品牌与首页链接显式home=1，首页先渲染再启动继续提示',()=>{
    for (const file of ['index.html','explore/index.html','diagnose/index.html','children/index.html','children/history.html','wrongbook/index.html']) {
      const html=fs.readFileSync(path.join(ROOT,file),'utf8');
      const brand=/<a class="brand" href="([^"]+)"/.exec(html);
      const home=/<a\b[^>]*href="([^"]+)"[^>]*>首页<\/a>/.exec(html);
      assert.ok(brand&&home,file);
      for (const match of [brand,home]) assert.equal(new URL(match[1].replace(/&amp;/g,'&'),'https://physicalmap.pages.dev/').searchParams.get('home'),'1',file);
    }
    const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    assert.match(html, /<dialog[^>]+id="continue-learning-dialog"[^>]+aria-labelledby="continue-learning-title"/);
    assert.match(html, /id="continue-learning-yes" autofocus/);
    assert.ok(html.indexOf('continue-learning-dialog')<html.indexOf('assets/last-location.js'));
    assert.ok(html.indexOf('assets/last-location.js')<html.indexOf('assets/home.js'));
    assert.ok(html.indexOf('assets/home.js')<html.indexOf('window.__cnmHomeResume'));
    const explore=fs.readFileSync(path.join(ROOT,'explore/index.html'),'utf8');
    assert.ok(explore.indexOf('assets/last-location.js')<explore.indexOf('src="app.js"'));
  });
  console.log(passed+' passed');
})().catch(error=>{console.error(error);process.exit(1);});
