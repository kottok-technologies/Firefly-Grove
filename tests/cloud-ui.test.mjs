import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {cloudState,encodeCloudSave} from '../web/cloud-state.js';
import {stateFixture,origin} from './cloud-fixture.mjs';

test('Settings links, pauses, and restores cloud progress with an explicit choice and local recovery copy',async context=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify(stateFixture()));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let remote='',enabled=false;const requests=[];
  const native=window.FireflyCloud={postMessage(text){
    const request=JSON.parse(text);requests.push(request);let result={};
    if(request.operation==='status')result={available:true,enabled};
    if(request.operation==='read')result={session:'session',account:'Play <img src=x>',saves:[{key:'cloud',data:remote}]};
    if(request.operation==='write'){remote=request.data;enabled=true;result={enabled};}
    if(request.operation==='disconnect')enabled=false;
    queueMicrotask(()=>native.onmessage({data:JSON.stringify({id:request.id,ok:true,...result})}));
  }};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,
    matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');await settle();const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
    $('settings').click();assert.equal($('cloud-connect').disabled,false);assert.match($('cloud-status').textContent,/off/);
    $('cloud-connect').click();await settle();assert.equal($('cloud-connect').hidden,true);assert.equal($('cloud-sync').hidden,false);
    assert.match($('cloud-status').textContent,/Play <img src=x>/);assert.equal($('modal-content').querySelector('img'),null);
    $('cloud-disconnect').click();await settle();assert.equal($('cloud-connect').hidden,false);assert.ok(remote);
    $('cloud-connect').click();await settle();assert.equal($('cloud-connect').hidden,true);
    const incoming=stateFixture();incoming.hints=8;incoming.reveals=1;
    remote=encodeCloudSave(cloudState(incoming,origin),{id:'other-device'}).text;
    $('cloud-sync').click();await settle();assert.equal($('cloud-choices').children.length,2);assert.equal(saved().hints,3);
    $('close-modal').click();await settle();assert.equal(saved().hints,3);assert.equal($('modal').open,false);
    $('settings').click();$('cloud-sync').click();await settle();
    context.mock.timers.enable({apis:['setTimeout']});
    [...$('cloud-choices').children].find(button=>button.textContent.startsWith('Use cloud save')).click();await settle();
    assert.equal(saved().hints,8);assert.equal(saved().reveals,1);assert.equal(saved().leaderboardProfiles[origin].id,'server-player');
    assert.equal(JSON.parse(window.localStorage.getItem('firefly-cloud-before-restore-v1')).hints,3);
    window.document.dispatchEvent(new window.Event('firefly-pause'));await settle();assert.equal(saved().hints,8,'old runtime cannot overwrite the restored save while reloading');
    window.document.dispatchEvent(new window.Event('firefly-resume'));await settle();assert.equal(JSON.parse(remote).state.hints,8,'lifecycle callbacks cannot push the pre-restore state back to the cloud');
    context.mock.timers.reset();assert.equal(requests.some(request=>request.operation==='delete'),false);
  }finally{
    context.mock.timers.reset();
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    window.close();
  }
});
