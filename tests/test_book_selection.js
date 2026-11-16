#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const api = require('../assets/book-selection.js');
const PHYSICS = ['八上','八下','九全','必修一','必修二','必修三','选必一','选必二','选必三'];
const SCIENCE = ['一上','一下','二上','二下','三上','三下','四上','四下','五上','五下','六上','六下'];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
test('浏览器与Node接口一致，教材列表是独立副本',()=>{
  const ctx={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/book-selection.js'),'utf8'),ctx);
  assert.equal(typeof ctx.window.CnmBookSelection.fromParams,'function');
  assert.deepEqual(api.allowed('physics'),PHYSICS);assert.deepEqual(api.allowed('science'),SCIENCE);
  const changed=api.allowed('physics');changed.pop();assert.deepEqual(api.allowed('physics'),PHYSICS);
  assert.deepEqual(api.allowed('english'),[]);
});
test('当前学科的教材按课本顺序去重，不受勾选顺序影响',()=>{
  assert.deepEqual(api.normalize('physics',['必修三','八下','八上','八下','bad','三下']),['八上','八下','必修三']);
  assert.deepEqual(api.normalize('science',['六下','二上','一下','八下','二上']),['一下','二上','六下']);
  for(const value of [null,'八上,八下',{},42])assert.deepEqual(api.normalize('physics',value),[]);
  assert.deepEqual(api.normalize('math',PHYSICS),[]);
});
test('多本URL支持CSV与重复参数，混入无效项不扩大所选范围',()=>{
  assert.deepEqual(api.fromParams(new URLSearchParams('subject=physics&volumes=九全,%20八上%20,bad&volumes=八下,八上'),'physics'),['八上','八下','九全']);
  assert.deepEqual(api.fromParams(new URLSearchParams('volumes=八上,三下,二上'),'science'),['二上','三下']);
  assert.deepEqual(api.fromParams(new URLSearchParams('volumes=https://evil.example/,bad'),'physics'),[]);
  assert.deepEqual(api.fromParams(null,'physics'),[]);
});
test('兼容旧单本参数，多本有效时优先，空或无效多本可回退旧单本',()=>{
  for(const query of ['volume=八下','volumes=&volume=八下','volumes=bad,三下&volume=八下'])
    assert.deepEqual(api.fromParams(new URLSearchParams(query),'physics'),['八下']);
  assert.deepEqual(api.fromParams(new URLSearchParams('volumes=八上,九全&volume=八下'),'physics'),['八上','九全']);
});
test('写入仅切换两种教材参数，保留其他筛选与返回上下文',()=>{
  const params=new URLSearchParams('subject=physics&volume=八下&volumes=九全&volumes=必修一&view=local&depth=3&q=力');
  assert.equal(api.writeParams(params,'physics',['九全','八上','八上']),params);
  assert.equal(params.has('volume'),false);assert.deepEqual(params.getAll('volumes'),['八上,九全']);
  assert.equal(params.get('subject'),'physics');assert.equal(params.get('view'),'local');assert.equal(params.get('depth'),'3');assert.equal(params.get('q'),'力');
  api.writeParams(params,'physics',['八下','八下']);assert.equal(params.get('volume'),'八下');assert.equal(params.has('volumes'),false);
  api.writeParams(params,'physics',[]);assert.equal(params.has('volume'),false);assert.equal(params.has('volumes'),false);
});
test('序列化的多本链接往返保持白名单与固定教材顺序',()=>{
  for(const subject of ['physics','science']){
    const chosen=api.allowed(subject).reverse();const params=new URLSearchParams({subject});
    api.writeParams(params,subject,chosen);
    const url=new URL('/explore/?'+params,'https://physicalmap.pages.dev');
    assert.equal(url.origin,'https://physicalmap.pages.dev');assert.deepEqual(api.fromParams(url.searchParams,subject),api.allowed(subject));
  }
});
console.log('test_book_selection: '+passed+' passed');
