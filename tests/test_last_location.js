#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/last-location.js'), 'utf8');
const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/topics.json'), 'utf8'));
const KEY = 'cnmLastLocation.v1';
let passed = 0;
async function test(name, fn) { await fn();passed++;console.log('  ok   '+name); }
function load(options = {}) {
  const store = new Map(Object.entries(options.entries || {}));
  const redirects = [], calls = [];
  const location = {pathname:'/', search:'', hash:'', replace(href){redirects.push(href);}, ...options.location};
  const root = {
    location,
    document:{documentElement:{style:{visibility:'visible'}}},
    localStorage:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    fetch(url){calls.push(url);return options.fetch ? options.fetch(url) : Promise.resolve({ok:true,json:()=>Promise.resolve(topics)});}
  };
  if (options.denied) Object.defineProperty(root,'localStorage',{get(){throw new Error('Storage denied');}});
  const context = {window:root,module:{exports:{}},URLSearchParams,Promise,Date,setTimeout:options.timer || setTimeout,clearTimeout};
  vm.runInNewContext(source,context,{filename:'assets/last-location.js'});
  return {api:context.module.exports,root,store,redirects,calls};
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
  await test('明确首页、学科、册次、年级、知识点与筛选链接始终优先',()=>{
    const {api}=load();
    for (const search of ['?home=1','?subject=physics','?subject=science','?subject=','?volume=八上','?grade=8','?q=力','?stage=j','?domain=能量','?view=local','?depth=3','?target=cnp_001','?chapter=八上 第一章','?returnTo=/explore/']) {
      for (const mode of ['home','explore']) assert.equal(api.shouldResume(mode,{search,hash:''}),false,search);
    }
    assert.equal(api.shouldResume('home',{search:'',hash:'#cnp_001'}),false);
    assert.equal(api.shouldResume('explore',{search:'',hash:'#cns_p001'}),false);
    assert.equal(api.shouldResume('home',{search:'?source=pwa',hash:''}),true);
    assert.equal(api.shouldResume('explore',{search:'?source=pwa',hash:''}),true);
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
  await test('首页和PWA入口验证数据后才恢复，并只发一次导航',async()=>{
    const {api,root,calls,redirects}=load({location:{pathname:'/school/',search:'?source=pwa'}});remember(api);
    const pending=api.resumeHome();assert.equal(root.document.documentElement.style.visibility,'hidden');
    assert.equal(await pending,true);assert.equal(await api.resumeHome(),true);
    assert.equal(calls.length,1);assert.equal(calls[0],'/school/data/topics.json');assert.equal(redirects.length,1);
    assert.equal(new URL(redirects[0],'https://physicalmap.pages.dev').pathname,'/school/explore/');
  });
  await test('首次或显式首页不隐藏页面，也不额外请求元数据',async()=>{
    const fresh=load();assert.equal(await fresh.api.resumeHome(),false);assert.equal(fresh.calls.length,0);
    const home=load({location:{search:'?home=1'}});remember(home.api);assert.equal(await home.api.resumeHome(),false);assert.equal(home.calls.length,0);assert.equal(home.root.document.documentElement.style.visibility,'visible');
  });
  await test('网络失败、错误数据、过期ID和超时均还原首页可见性',async()=>{
    for (const fetch of [()=>Promise.reject(new Error('network')),()=>Promise.resolve({ok:false}),()=>Promise.resolve({ok:true,json:()=>({bad:true})})]) {
      const app=load({fetch});remember(app.api);assert.equal(await app.api.resumeHome(),false);assert.equal(app.redirects.length,0);assert.equal(app.root.document.documentElement.style.visibility,'visible');
    }
    const stale=load();remember(stale.api,{topicId:'cnp_999'});assert.equal(await stale.api.resumeHome(),false);assert.equal(stale.store.has(KEY),false);assert.equal(stale.root.document.documentElement.style.visibility,'visible');
    const timeout=load({fetch:()=>new Promise(()=>{}),timer:fn=>setTimeout(fn,0)});remember(timeout.api);assert.equal(await timeout.api.resumeHome(),false);assert.equal(timeout.root.document.documentElement.style.visibility,'visible');
  });
  await test('全站品牌与首页链接显式home=1，恢复模块早于首页样式和app',()=>{
    for (const file of ['index.html','explore/index.html','diagnose/index.html','children/index.html','children/history.html','wrongbook/index.html']) {
      const html=fs.readFileSync(path.join(ROOT,file),'utf8');
      const brand=/<a class="brand" href="([^"]+)"/.exec(html);
      const home=/<a\b[^>]*href="([^"]+)"[^>]*>首页<\/a>/.exec(html);
      assert.ok(brand&&home,file);
      for (const match of [brand,home]) assert.equal(new URL(match[1].replace(/&amp;/g,'&'),'https://physicalmap.pages.dev/').searchParams.get('home'),'1',file);
    }
    const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    assert.ok(html.indexOf('assets/last-location.js')>html.indexOf("location.replace('explore/"));
    assert.ok(html.indexOf('assets/last-location.js')<html.indexOf('assets/site.css'));
    const explore=fs.readFileSync(path.join(ROOT,'explore/index.html'),'utf8');
    assert.ok(explore.indexOf('assets/last-location.js')<explore.indexOf('src="app.js"'));
  });
  console.log(passed+' passed');
})().catch(error=>{console.error(error);process.exit(1);});
