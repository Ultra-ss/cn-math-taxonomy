#!/usr/bin/env node
'use strict';
const assert=require('assert');
const Rewards=require('../assets/avatar-rewards.js');
const KEY=Rewards.KEY;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('  ok   '+name);}
function fixture({totals={a:100,b:50,guest:0},indices=[],entries={},locks=false,children={}}={}){
  const map=new Map(Object.entries(entries)),events=[];let serial=0,fail=false,writes=0;
  const storage={getItem:key=>map.has(key)?map.get(key):null,setItem(key,value){if(fail)throw Error('quota');writes++;map.set(key,value);}};
  const options={storage,locks,children:{get:id=>children[id]||null},progress:{achievements:id=>({total:totals[id||'guest']||0})},
    now:()=> '2026-11-17T10:00:00.000Z',newId:()=> 'event-'+(++serial),
    randomIndex:size=>{const n=indices.length?indices.shift():size===100?99:0;assert.ok(n<size);return n;},emit:id=>events.push(id)};
  const api=Rewards.create(options);
  return {api,map,events,totals,options,get writes(){return writes;},fail(value){fail=value;}};
}
function box(draws=[],equipped='default'){return {draws,equipped,equippedAt:'2026-11-17T10:00:00.000Z'};}
function draw(id,piece,skinId='skin-01'){return {id,skinId,piece,cost:1,at:'2026-11-17T10:00:00.000Z'};}
(async()=>{
await test('新账号默认白猫无写入；每3星折1个月亮，历史总积分不扣除',()=>{
  const f=fixture({totals:{a:27,guest:0}}),s=f.api.summary('a');
  assert.equal(s.totalStars,27);assert.equal(s.totalMoons,9);assert.equal(s.availableMoons,9);assert.equal(s.catId,'cat-snow');assert.equal(s.spentMoons,0);assert.equal(s.equipped,'default');
  assert.equal(Object.keys(s.collections).length,10);assert.equal(s.collections['skin-01'].count,0);assert.equal(f.writes,0);
});
await test('每套前两次保底不同，第三次可重复；重复消耗月亮而不增加拼图',async()=>{
  const f=fixture({indices:[0,0,0,0,0]});
  const a=await f.api.draw('a','skin-01'),b=await f.api.draw('a','skin-01'),c=await f.api.draw('a','skin-01');
  assert.deepEqual([a.piece,b.piece,c.piece],[0,1,0]);assert.deepEqual([a.duplicate,b.duplicate,c.duplicate],[false,false,true]);
  const s=f.api.summary('a');assert.deepEqual(s.collections['skin-01'].pieces,[0,1]);assert.equal(s.collections['skin-01'].draws,3);
  assert.equal(s.spentMoons,3);assert.equal(s.availableMoons,30);assert.equal(s.totalStars,100);assert.equal(f.totals.a,100);
  const otherA=await f.api.draw('a','skin-02'),otherB=await f.api.draw('a','skin-02');assert.deepEqual([otherA.piece,otherB.piece],[0,1]);
});
await test('集齐九块自动解锁，才能穿戴；满套再抽不扣月亮，默认头像可随时恢复',async()=>{
  const f=fixture();
  assert.equal((await f.api.equip('a','skin-01')).code,'locked_skin');assert.equal(f.writes,0);
  let last;for(let i=0;i<9;i++)last=await f.api.draw('a','skin-01');
  assert.equal(last.unlocked,true);assert.equal(last.summary.collections['skin-01'].count,9);
  const prior=f.map.get(KEY);assert.equal((await f.api.draw('a','skin-01')).code,'already_unlocked');assert.equal(f.map.get(KEY),prior);
  assert.equal((await f.api.equip('a','skin-01')).ok,true);assert.equal(f.api.summary('a').equipped,'skin-01');
  const reloaded=Rewards.create(f.options);assert.equal(reloaded.summary('a').equipped,'skin-01');
  assert.equal((await reloaded.equip('a','default')).ok,true);assert.equal(reloaded.summary('a').spentMoons,9);assert.equal(reloaded.summary('a').equipped,'default');
});
await test('账号A/B和访客分别消费、收集、穿戴，不写档案或学习进度键',async()=>{
  const f=fixture({totals:{a:20,b:5,guest:5},entries:{'cnmChildren.v1':'profile-data','cnmProgress.v1':'learning-data'}});
  await f.api.draw('a','skin-01');await f.api.draw('b','skin-02');await f.api.draw(null,'skin-03');
  assert.equal(f.api.summary('a').availableMoons,5);assert.equal(f.api.summary('b').availableMoons,0);assert.equal(f.api.summary(null).availableMoons,0);
  assert.equal(f.api.summary('b').collections['skin-01'].count,0);assert.equal(f.api.summary(null).collections['skin-03'].count,1);
  assert.equal(f.map.get('cnmChildren.v1'),'profile-data');assert.equal(f.map.get('cnmProgress.v1'),'learning-data');
  assert.deepEqual(f.events,['a','b','guest']);
});
await test('不足一个月亮时不产生扣费或空账本，非法输入不会覆盖原数据',async()=>{
  const f=fixture({totals:{a:2}});assert.equal((await f.api.draw('a','skin-01')).code,'insufficient_moons');assert.equal(f.writes,0);
  assert.equal((await f.api.draw('__proto__','skin-01')).code,'invalid_owner');
  assert.equal((await f.api.draw('a','skin-11')).code,'invalid_skin');assert.equal((await f.api.equip('a','x')).code,'invalid_skin');
  assert.equal((await f.api.draw('a','skin-01','bad id')).code,'invalid_request');assert.equal(f.writes,0);
});
await test('额度写入失败时消费和拼图一起失败，不发事件，不破坏已有记录',async()=>{
  const f=fixture();await f.api.draw('a','skin-01');const before=f.map.get(KEY),events=f.events.length;
  f.fail(true);const result=await f.api.draw('a','skin-01');assert.equal(result.code,'storage_unavailable');
  assert.equal(f.map.get(KEY),before);assert.equal(f.events.length,events);assert.equal(f.api.summary('a').spentMoons,1);
  f.fail(false);assert.equal((await f.api.draw('a','skin-01')).piece,1);
});
await test('损坏记录与不可用存储安全失败，不重置账本；无积分或随机源不扣款',async()=>{
  for(const raw of ['{broken','[]',JSON.stringify({v:2,byOwner:{}})]){
    const f=fixture({entries:{[KEY]:raw}});assert.equal(f.api.summary('a').ok,false);assert.equal((await f.api.draw('a','skin-01')).code,'invalid_store');assert.equal(f.map.get(KEY),raw);
  }
  const denied=Rewards.create({storage:{getItem(){throw Error('denied');}},locks:false});assert.equal(denied.summary('a').code,'storage_unavailable');
  const f=fixture(),missing=Rewards.create({...f.options,progress:{achievements(){throw Error('missing');}}});
  assert.equal((await missing.draw('a','skin-01')).code,'progress_unavailable');assert.equal(f.writes,0);
  const noRandom=Rewards.create({...f.options,randomIndex:()=>null});assert.equal((await noRandom.draw('a','skin-01')).code,'random_unavailable');assert.equal(f.writes,0);
});
await test('同一兑换请求重试幂等，回放保留原片且不再扣款，冲突请求拒绝',async()=>{
  const f=fixture(),first=await f.api.draw('a','skin-01','stable-request'),again=await f.api.draw('a','skin-01','stable-request');
  assert.equal(again.ok,true);assert.equal(again.replayed,true);assert.equal(again.piece,first.piece);assert.equal(f.api.summary('a').spentMoons,1);assert.equal(f.writes,1);
  assert.equal((await f.api.draw('a','skin-02','stable-request')).code,'request_conflict');assert.equal(f.writes,1);
});
await test('Web Locks覆盖全账本，多窗口最后一个月亮只能消费一次且不同账号不会互相覆盖',async()=>{
  let queue=Promise.resolve();const names=[];
  const locks={request(name,opts,fn){names.push(name);const pending=queue.then(fn);queue=pending.catch(()=>{});return pending;}};
  const f=fixture({totals:{a:3,b:3},locks}),other=Rewards.create({...f.options,newId:()=> 'other-event'});
  const results=await Promise.all([f.api.draw('a','skin-01'),other.draw('a','skin-01')]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='insufficient_moons').length,1);assert.equal(f.api.summary('a').spentMoons,1);
  await other.draw('b','skin-02');assert.equal(f.api.summary('b').spentMoons,1);assert.equal(f.api.summary('a').spentMoons,1);assert.ok(names.every(name=>name===KEY));
});
await test('第三次起重复概率精确10%，重复只选已拥有，非重复只选未拥有',async()=>{
  const existing={v:1,byOwner:{a:box([draw('prior-one',0),draw('prior-two',1)])}};
  let duplicates=0;
  for(let chance=0;chance<100;chance++){
    const f=fixture({entries:{[KEY]:JSON.stringify(existing)},indices:[chance,0]});
    const result=await f.api.draw('a','skin-01');
    assert.equal(result.ok,true);assert.equal(result.duplicate,chance<10);
    assert.equal(result.piece,chance<10?0:2);assert.equal(result.summary.spentMoons,3);
    if(result.duplicate)duplicates++;
  }
  assert.equal(duplicates,10);
  for(let index=0;index<7;index++){
    const f=fixture({entries:{[KEY]:JSON.stringify(existing)},indices:[99,index]});
    assert.equal((await f.api.draw('a','skin-01')).piece,index+2);
  }
  for(let index=0;index<2;index++){
    const f=fixture({entries:{[KEY]:JSON.stringify(existing)},indices:[0,index]});
    assert.equal((await f.api.draw('a','skin-01')).piece,index);
  }
});
await test('crypto概率和片号都拒绝超出整倍数区间，缺少概率随机数不扣月亮',async()=>{
  const f=fixture();await f.api.draw('a','skin-01');await f.api.draw('a','skin-01');
  let values=[4294967295,10,4294967295,6];
  const api=Rewards.create({...f.options,randomIndex:undefined,crypto:{getRandomValues(array){array[0]=values.shift();return array;}}});
  const result=await api.draw('a','skin-01');assert.equal(result.piece,8);assert.equal(result.duplicate,false);assert.equal(values.length,0);
  const before=f.map.get(KEY),noChance=Rewards.create({...f.options,randomIndex:()=>null});
  assert.equal((await noChance.draw('a','skin-01')).code,'random_unavailable');assert.equal(f.map.get(KEY),before);
});
await test('备份合并超额消费时余额归零而保留所有消费与收集，不能再次抽取',async()=>{
  const store={v:1,byOwner:{a:box([draw('one',0),draw('two',1),draw('three',0)])}};
  const f=fixture({totals:{a:5},entries:{[KEY]:JSON.stringify(store)}}),s=f.api.summary('a');
  assert.equal(s.availableMoons,0);assert.equal(s.spentMoons,3);assert.equal(s.collections['skin-01'].count,2);
  assert.equal((await f.api.draw('a','skin-01')).code,'insufficient_moons');assert.equal(f.map.get(KEY),JSON.stringify(store));
});
await test('账本验证拒绝重复事件、非法片/费用/日期和未解锁穿戴，完整皮肤可合法导入',()=>{
  const valid={v:1,byOwner:{a:box(Array.from({length:9},(_,n)=>draw('event-'+n,n)),'skin-01')}};
  assert.equal(Rewards.validateStore(valid),true);
  const mutate=fn=>{const copy=JSON.parse(JSON.stringify(valid));fn(copy);assert.equal(Rewards.validateStore(copy),false);};
  mutate(s=>s.byOwner.a.draws[1].id=s.byOwner.a.draws[0].id);mutate(s=>s.byOwner.a.draws[1].piece=9);
  mutate(s=>s.byOwner.a.draws[1].cost=2);mutate(s=>s.byOwner.a.draws[1].at='tomorrow');mutate(s=>s.byOwner.a.draws[1].skinId='x');
  mutate(s=>s.byOwner.a.draws.pop());mutate(s=>s.byOwner.a.equippedAt='bad');
  assert.equal(Rewards.validateStore(JSON.parse('{"v":1,"byOwner":{"__proto__":{"draws":[],"equipped":"default","equippedAt":"2026-11-17"}}}')),false);
});
await test('三星兑换边界与旧余额重算保留消费记录，不返还已花月亮',()=>{
  for(const [stars,moons] of [[0,0],[2,0],[3,1],[5,1],[6,2],[25,8],[27,9]]){
    const f=fixture({totals:{a:stars}}),score=f.api.summary('a');
    assert.equal(score.totalStars,stars);assert.equal(score.totalMoons,moons);assert.equal(score.availableMoons,moons);
  }
  const legacy={v:1,byOwner:{a:box([draw('old-first',0),draw('old-second',1)])}};
  const f=fixture({totals:{a:25},entries:{[KEY]:JSON.stringify(legacy)}}),score=f.api.summary('a');
  assert.equal(score.totalStars,25);assert.equal(score.totalMoons,8);assert.equal(score.spentMoons,2);assert.equal(score.availableMoons,6);
  assert.equal(score.catId,'cat-snow');assert.equal(f.map.get(KEY),JSON.stringify(legacy));assert.equal(f.writes,0);
});
await test('注册猫咪身份优先于旧账本并按账号显示；猫咪锁定不影响已解锁服装、历史消费或积分',async()=>{
  const legacy={v:1,byOwner:{a:{...box(Array.from({length:9},(_,n)=>draw('legacy-'+n,n)),'skin-01'),catId:'cat-snow',catAt:'2026-11-17T10:00:00.000Z'}}};
  const children={a:{catId:'cat-ginger'},b:{catId:'cat-tuxedo'}};
  const f=fixture({children,totals:{a:27,b:0,guest:0},entries:{[KEY]:JSON.stringify(legacy),'cnmProgress.v1':'progress-unchanged'}});
  assert.deepEqual(Rewards.CAT_IDS,['cat-snow','cat-ginger','cat-tuxedo','cat-blue','cat-mocha']);
  for(const catId of Rewards.CAT_IDS)assert.equal((await f.api.setCat('a',catId)).code,'cat_locked');
  const result=f.api.summary('a');assert.equal(result.catId,'cat-ginger');
  assert.equal(result.equipped,'skin-01');assert.equal(result.spentMoons,9);assert.equal(result.availableMoons,0);
  assert.equal(result.collections['skin-01'].unlocked,true);assert.equal(f.map.get('cnmProgress.v1'),'progress-unchanged');
  assert.equal((await f.api.setCat('b','cat-snow')).code,'cat_locked');
  assert.equal((await f.api.setCat(null,'cat-ginger')).code,'cat_locked');
  const fresh=Rewards.create(f.options);assert.equal(fresh.summary('a').catId,'cat-ginger');assert.equal(fresh.summary('b').catId,'cat-tuxedo');
  assert.equal(fresh.summary(null).catId,'cat-snow');assert.equal(fresh.summary('b').spentMoons,0);
  assert.equal(f.writes,0);assert.deepEqual(f.events,[]);assert.equal(f.map.get(KEY),JSON.stringify(legacy));
  assert.equal(Rewards.validateStore(JSON.parse(f.map.get(KEY))),true);
});
await test('旧setCat接口只拒绝更换，不访问存储或发事件；账本猫字段仍验证以兼容旧备份',async()=>{
  const store={v:1,byOwner:{a:{...box(),catId:'cat-ginger',catAt:'2026-11-17T10:00:00.000Z'}}};
  const f=fixture({entries:{[KEY]:JSON.stringify(store)}}),before=f.map.get(KEY),events=f.events.length;
  assert.equal((await f.api.setCat('a','other-cat')).code,'invalid_cat');assert.equal(f.map.get(KEY),before);
  assert.equal((await f.api.setCat('__proto__','cat-snow')).code,'invalid_owner');
  f.fail(true);assert.equal((await f.api.setCat('a','cat-tuxedo')).code,'cat_locked');assert.equal(f.map.get(KEY),before);assert.equal(f.events.length,events);assert.equal(f.writes,0);
  for(const change of [s=>delete s.byOwner.a.catAt,s=>delete s.byOwner.a.catId,s=>s.byOwner.a.catId='unknown',s=>s.byOwner.a.catAt='bad']){
    const copy=JSON.parse(before);change(copy);assert.equal(Rewards.validateStore(copy),false);
  }
  const bad=fixture({entries:{[KEY]:'broken'}});assert.equal((await bad.api.setCat('a','cat-ginger')).code,'cat_locked');assert.equal(bad.map.get(KEY),'broken');
  const denied=Rewards.create({storage:{getItem(){throw Error('must not read');},setItem(){throw Error('must not write');}}});
  assert.equal((await denied.setCat('a','cat-snow')).code,'cat_locked');
});
await test('旧窗口尝试换猫与正常兑换并发，固定身份、衣服与消费均保留',async()=>{
  let queue=Promise.resolve();const names=[];
  const locks={request(name,opts,fn){names.push(name);const task=queue.then(fn);queue=task.catch(()=>{});return task;}};
  const f=fixture({totals:{a:3},locks,children:{a:{catId:'cat-ginger'}}}),other=Rewards.create(f.options);
  const [picked,exchanged]=await Promise.all([f.api.setCat('a','cat-tuxedo'),other.draw('a','skin-01')]);
  assert.equal(picked.code,'cat_locked');assert.equal(exchanged.ok,true);assert.equal(f.api.summary('a').catId,'cat-ginger');assert.equal(f.api.summary('a').spentMoons,1);
  assert.equal(f.writes,1);assert.deepEqual(f.events,['a']);
  assert.ok(names.every(name=>name===KEY));
});
await test('访客固定白猫；缺少档案模块时旧账号仍沿用账本形象，抽取和换装不改变猫',async()=>{
  const legacy={v:1,byOwner:{a:{...box(),catId:'cat-tuxedo',catAt:'2026-11-17T10:00:00.000Z'},guest:{...box(),catId:'cat-ginger',catAt:'2026-11-17T10:00:00.000Z'}}};
  const f=fixture({entries:{[KEY]:JSON.stringify(legacy)}});
  assert.equal(f.api.summary('a').catId,'cat-tuxedo');assert.equal(f.api.summary(null).catId,'cat-snow');
  await f.api.draw('a','skin-01');assert.equal(f.api.summary('a').catId,'cat-tuxedo');
  await f.api.equip('a','default');assert.equal(f.api.summary('a').catId,'cat-tuxedo');
  assert.equal(f.api.summary('a').spentMoons,1);
});
await test('新注册仅提供四猫，旧白猫与五种身份的全部服装仍能正确查询',()=>{
  const catalog=require('../assets/avatar-catalog.js');
  assert.deepEqual(catalog.cats.map(c=>c.id),['cat-ginger','cat-tuxedo','cat-blue','cat-mocha']);
  assert.equal(catalog.getCat('cat-snow').name,'奶油白猫');
  const directories={'cat-snow':'','cat-ginger':'ginger/','cat-tuxedo':'tuxedo/','cat-blue':'blue/','cat-mocha':'mocha/'};
  for(const [catId,directory] of Object.entries(directories)) {
    assert.equal(catalog.getCat(catId).id,catId);
    for(const id of ['default',...Rewards.SKIN_IDS]) {
      const art=catalog.get(id,catId);
      assert.equal(art.catId,catId);assert.equal(art.id,id);
      assert.equal(art.image,'/assets/avatars/'+directory+id+'.svg');
    }
  }
  assert.equal(catalog.get('default','unknown').catId,'cat-snow');
});
await test('新两猫各自兑换解锁穿戴并重载保留身份，月亮与拼图不串账号',async()=>{
  const f=fixture({totals:{a:27,b:27},children:{a:{catId:'cat-blue'},b:{catId:'cat-mocha'}}});
  for(const [id,catId] of [['a','cat-blue'],['b','cat-mocha']]) {
    for(let n=0;n<9;n++)assert.equal((await f.api.draw(id,'skin-01')).ok,true);
    assert.equal((await f.api.equip(id,'skin-01')).ok,true);
    const before=f.map.get(KEY),writes=f.writes;
    assert.equal((await f.api.setCat(id,'cat-tuxedo')).code,'cat_locked');
    assert.equal(f.map.get(KEY),before);assert.equal(f.writes,writes);
    const summary=Rewards.create(f.options).summary(id);
    assert.equal(summary.catId,catId);assert.equal(summary.equipped,'skin-01');
    assert.equal(summary.collections['skin-01'].count,9);
    assert.equal(summary.availableMoons,0);assert.equal(summary.spentMoons,9);assert.equal(summary.totalStars,27);
  }
  const legacy={v:1,byOwner:{a:{...box(),catId:'cat-blue',catAt:'2026-11-17T10:00:00.000Z'},b:{...box(),catId:'cat-mocha',catAt:'2026-11-17T10:00:00.000Z'}}};
  assert.equal(Rewards.validateStore(legacy),true);
  const oldContext=fixture({entries:{[KEY]:JSON.stringify(legacy)}});
  assert.equal(oldContext.api.summary('a').catId,'cat-blue');assert.equal(oldContext.api.summary('b').catId,'cat-mocha');
});
console.log('test_avatar_rewards: '+passed+' passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
