import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame} from '../web/engine.js';

test('Android rewards require earned callback, retry safely, and grant each reward once',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'https://appassets.androidplatform.net/assets/index.html'}),{window}=dom;
  let request;
  window.FireflyAds={postMessage:text=>{request=JSON.parse(text);if(request.operation==='status')queueMicrotask(()=>reply({ok:true,privacyRequired:true}));}};
  function reply(values){window.FireflyAds.onmessage({data:JSON.stringify({id:request.id,...values})});}
  const game=createGame(1,42);game.lives=0;
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:1,completed:0,installSeed:42,hints:0,reveals:0,game,settings:{autoCross:false,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js?native-rewards');const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
    $('settings').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal($('ad-privacy').hidden,false);
    const privacy=$('ad-privacy').onclick();assert.equal(request.operation,'privacy');reply({ok:true});await privacy;
    $('more-tools').click();$('extra-hint').click();assert.equal($('preview-reward').textContent,'Watch video');
    let pending=$('preview-reward').onclick();assert.equal(request.kind,'hints');assert.equal($('preview-reward').disabled,true);
    await $('preview-reward').onclick();reply({ok:true,earned:false});await pending;assert.equal(saved().hints,0);assert.equal($('preview-reward').disabled,false);
    pending=$('preview-reward').onclick();reply({ok:false,error:'No fill'});await pending;assert.equal(saved().hints,0);assert.match($('modal-content').textContent,/No fill/);
    pending=$('preview-reward').onclick();reply({ok:true,earned:true});await pending;assert.equal(saved().hints,1);
    reply({ok:true,earned:true});assert.equal(saved().hints,1);
    $('settings').click();await new Promise(resolve=>setTimeout(resolve,0));$('more-tools').click();$('extra-reveal').click();pending=$('preview-reward').onclick();assert.equal(request.kind,'reveals');reply({ok:true,earned:true});await pending;assert.equal(saved().reveals,1);
    $('play').click();$('revive').click();pending=$('preview-reward').onclick();assert.equal(request.kind,'life');reply({ok:true,earned:true});await pending;
    assert.equal(saved().game.lives,1);assert.equal(saved().game.heartFinds.at(-1),-1);
  }finally{
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    window.close();
  }
});
