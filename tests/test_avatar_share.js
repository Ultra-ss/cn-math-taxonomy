#!/usr/bin/env node
'use strict';
const assert=require('assert');
const Share=require('../assets/avatar-share.js');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('  ok   '+name);}
function fixture(flags={}){
  const text=[],images=[],paints=[],links=[],downloads=[],revoked=[],timers=new Map();let serial=0,blobSerial=0;
  const ctx={font:'',fillStyle:'',textAlign:'',textBaseline:'',
    beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},stroke(){},save(){},restore(){},clip(){},fillRect(){},
    createLinearGradient(){return{addColorStop(){}};},
    measureText(value){const size=Number((this.font.match(/(\d+)px/)||[])[1])||16;
      return{width:Array.from(value).reduce((sum,char)=>sum+(char.charCodeAt(0)>127?1:.56)*size,0)};},
    fillText(value,x,y){text.push({value,x,y,font:this.font,width:this.measureText(value).width});},
    drawImage(...args){if(flags.paintError)throw Error('canvas');paints.push(args);}
  };
  const canvas={width:0,height:0,getContext(){if(flags.contextThrows)throw Error('privacy');return flags.noContext?null:ctx;},
    toBlob(fn,type){if(flags.blobError)throw Error('SecurityError');if(!flags.waitBlob)fn(flags.emptyBlob?null:new Blob(['png-art'],{type}));}};
  class Image {
    constructor(){this.naturalWidth=flags.blankImage?0:512;this.naturalHeight=512;images.push(this);}
    set src(value){this.url=value;if(!flags.delayImage)queueMicrotask(()=>this.complete());}
    complete(){if(flags.imageError){if(this.onerror)this.onerror(Error('image'));}else if(this.onload)this.onload();}
    decode(){return flags.decodeError?Promise.reject(Error('decode')):Promise.resolve();}
  }
  const env={Image,location:{href:'https://physicalmap.pages.dev/children/',origin:'https://physicalmap.pages.dev'},
    document:{fonts:{ready:flags.waitFonts?new Promise(()=>{}):Promise.resolve()},body:{appendChild(link){links.push(link);}},
      createElement(tag){if(tag==='canvas')return canvas;assert.equal(tag,'a');return{setAttribute(){},remove(){this.removed=true;},click(){if(flags.clickError)throw Error('click');downloads.push({href:this.href,filename:this.download});}};}},
    URL:{createObjectURL(blob){assert.equal(blob.type,'image/png');return 'blob:avatar-'+(++blobSerial);},revokeObjectURL(url){revoked.push(url);}},
    setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}
  };
  Object.defineProperty(env,'localStorage',{get(){throw Error('must not read storage');}});
  Object.defineProperty(env,'CnmChildren',{get(){throw Error('must not read profile');}});
  const input={image:'/assets/avatars/skin-01.svg',username:'小满',createdAt:'2026-11-17T12:00:00.000Z',collectedSkins:3};
  function run(ms){for(const[id,item]of [...timers])if(item.ms<=ms){timers.delete(id);item.fn();}}
  return{api:Share.create(env),env,input,ctx,canvas,text,images,paints,links,downloads,revoked,timers,run};
}
(async()=>{
await test('标题含真实昵称，注册日期可读，访客或损坏日期不虚构时间',()=>{
  const a=Share.metadata({username:' 小满 ',createdAt:'2026-11-17T12:00:00Z'});
  assert.equal(a.title,'小满的物理图谱个人秀');assert.equal(a.registration,'注册时间：2026年11月17日');
  assert.equal(a.filename,'小满-物理图谱个人秀.png');assert.equal(a.width,1200);assert.equal(a.height,1600);
  assert.equal(Share.metadata({username:'本机访客'}).registration,'本机访客 · 未注册');
  assert.equal(Share.metadata({username:'甲',createdAt:'bad'}).registration,'注册时间：未记录');
});
await test('用户输入仅作为Canvas文本，安全文件名并限制昵称长度，不修改输入',()=>{
  const input={username:'../<猫>:\\?*\u0000\u202E名字超过十二个字',createdAt:null};const before={...input};
  const info=Share.metadata(input);assert.deepEqual(input,before);assert.ok(Array.from(info.username).length<=12);
  assert.ok(!/[\\/:*?"<>|\u0000-\u001f\u202a-\u202e]/.test(info.filename));assert.ok(!info.filename.startsWith('.'));
  assert.equal(Share.metadata({username:''}).username,'本机访客');
});
await test('皮肤套数接受0到10的整数，旧调用和非法输入安全回退为0且不修改输入',()=>{
  for(const count of [0,3,10]) {
    const input={collectedSkins:count},before={...input},info=Share.metadata(input);
    assert.equal(info.collectedSkins,count);assert.equal(info.collectionLabel,'已收集皮肤：'+count+' 套');assert.deepEqual(input,before);
  }
  for(const collectedSkins of [undefined,null,-1,11,1.5,NaN,Infinity,'3']) {
    assert.equal(Share.metadata({collectedSkins}).collectionLabel,'已收集皮肤：0 套');
  }
});
await test('长昵称标题分为两行，完整标题和用户名仍在图像宽度内',()=>{
  const f=fixture(),info=Share.metadata({username:'春风化雨热爱科学的小朋友'}),layout=Share.titleLayout(f.ctx,info);
  assert.equal(layout.lines.length,2);assert.equal(layout.lines.join(''),info.title);
  f.ctx.font='700 '+layout.size+'px sans-serif';for(const line of layout.lines)assert.ok(f.ctx.measureText(line).width<=layout.maxWidth);
});
await test('渲染真实尺寸PNG，用户名下一行显示皮肤套数，再显示注册时间，文字不溢出',async()=>{
  const f=fixture(),blob=await f.api.render(f.input);assert.equal(blob.type,'image/png');assert.ok(blob.size>0);
  assert.deepEqual([f.canvas.width,f.canvas.height],[1200,1600]);
  assert.deepEqual(f.paints[0].slice(1),[143,365,914,914]);
  assert.ok(f.text.some(t=>t.value==='小满的物理图谱个人秀'&&t.y<365));
  assert.ok(f.text.some(t=>t.value==='用户名：小满'&&t.y>1279));
  assert.ok(f.text.some(t=>t.value==='注册时间：2026年11月17日'&&t.y>1376));
  const name=f.text.find(t=>t.value==='用户名：小满'),count=f.text.find(t=>t.value==='已收集皮肤：3 套'),date=f.text.find(t=>t.value==='注册时间：2026年11月17日');
  assert.ok(count&&count.y-name.y>=40&&date.y-count.y>=40&&date.y<1482);
  assert.ok(f.text.every(t=>t.width<=952));assert.equal(f.images[0].crossOrigin,'anonymous');assert.equal(f.timers.size,0);
});
await test('图片、昵称和皮肤套数在请求开始时捕获，await期间修改账号输入不会导错个人秀',async()=>{
  const f=fixture({delayImage:true}),promise=f.api.download(f.input);
  f.input.username='另一个账号';f.input.image='/assets/avatars/skin-10.svg';f.input.createdAt=null;f.input.collectedSkins=10;
  f.images[0].complete();const result=await promise;
  assert.equal(result.filename,'小满-物理图谱个人秀.png');assert.ok(f.images[0].url.endsWith('/skin-01.svg'));
  assert.ok(f.text.some(t=>t.value==='用户名：小满'));assert.ok(!f.text.some(t=>t.value.includes('另一个账号')));
  assert.ok(f.text.some(t=>t.value==='已收集皮肤：3 套'));assert.ok(!f.text.some(t=>t.value==='已收集皮肤：10 套'));
});
await test('下载通过独立PNG Blob，临时链接移除，URL等待浏览器接管后再释放',async()=>{
  const f=fixture(),result=await f.api.download(f.input);assert.equal(result.ok,true);
  assert.deepEqual(f.downloads,[{href:'blob:avatar-1',filename:'小满-物理图谱个人秀.png'}]);assert.equal(f.links[0].removed,true);
  assert.deepEqual(f.revoked,[]);f.run(1000);assert.deepEqual(f.revoked,[]);f.run(1200);assert.deepEqual(f.revoked,['blob:avatar-1']);
});
await test('并行下载保持各自昵称和URL生命周期，不读取任何本地账号或存储',async()=>{
  const f=fixture();await Promise.all([f.api.download({...f.input,username:'甲',collectedSkins:0}),f.api.download({...f.input,username:'乙',collectedSkins:10})]);
  assert.deepEqual(f.downloads.map(d=>d.filename),['甲-物理图谱个人秀.png','乙-物理图谱个人秀.png']);
  assert.ok(f.text.some(t=>t.value==='已收集皮肤：0 套'));assert.ok(f.text.some(t=>t.value==='已收集皮肤：10 套'));
  f.run(1200);assert.deepEqual(f.revoked,['blob:avatar-1','blob:avatar-2']);
});
await test('拒绝跨域或执行型图片地址，加载失败和decode失败不得导出空形象',async()=>{
  for(const image of ['https://other.test/cat.svg','data:image/svg+xml,<svg/>','javascript:alert(1)','']){
    const f=fixture();await assert.rejects(f.api.download({...f.input,image}),/图片地址无效/);assert.equal(f.images.length,0);assert.equal(f.downloads.length,0);
  }
  for(const flags of [{imageError:true},{decodeError:true},{blankImage:true}]){
    const f=fixture(flags);await assert.rejects(f.api.download(f.input),/图片暂未加载成功/);assert.equal(f.downloads.length,0);assert.equal(f.paints.length,0);assert.equal(f.timers.size,0);
  }
});
await test('字体等待有上限，图片加载超时可取消，均不会永远挂起',async()=>{
  const f=fixture({waitFonts:true}),promise=f.api.render(f.input);f.run(1800);await promise;assert.equal(f.timers.size,0);
  const g=fixture({delayImage:true}),failed=g.api.render(g.input);g.run(10000);await assert.rejects(failed,/图片暂未加载成功/);assert.equal(g.downloads.length,0);
  const h=fixture({waitBlob:true}),encoding=h.api.render(h.input);
  for(let i=0;i<8;i++)await Promise.resolve();
  h.run(15000);await assert.rejects(encoding,/PNG 生成失败/);assert.equal(h.timers.size,0);
});
await test('Canvas或PNG下载失败显示中文原因，失败后也清理临时URL',async()=>{
  for(const flags of [{noContext:true},{contextThrows:true},{paintError:true},{emptyBlob:true},{blobError:true},{clickError:true}]){
    const f=fixture(flags);await assert.rejects(f.api.download(f.input),/浏览器|图片|PNG/);assert.equal(f.links.every(link=>link.removed),true);
    f.run(1200);if(flags.clickError)assert.deepEqual(f.revoked,['blob:avatar-1']);
  }
});
console.log('test_avatar_share: '+passed+' passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
