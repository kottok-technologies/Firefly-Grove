import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {cloudState,encodeCloudSave} from '../web/cloud-state.js';
import {stateFixture} from './cloud-fixture.mjs';

test('previous device progress can be recovered in Settings without replacing its cloud backup',async context=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
  const current=stateFixture(),previous=stateFixture();current.hints=8;previous.hints=1;
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify(current));window.localStorage.setItem('firefly-cloud-before-restore-v1',JSON.stringify(previous));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const remote=encodeCloudSave(cloudState(current,null),{id:'remote'}).text,requests=[];let enabled=true;
  const native=window.FireflyCloud={postMessage(text){
    const request=JSON.parse(text);requests.push(request);let data={available:true,enabled};
    if(request.operation==='read')data={session:'session',saves:[{key:'cloud',data:remote}]};
    if(request.operation==='disconnect'){enabled=false;data={enabled};}
    queueMicrotask(()=>native.onmessage({data:JSON.stringify({id:request.id,ok:true,...data})}));
  }};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,
    matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},setInterval:()=>0};
  const descriptors=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),settle=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');await settle();const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
    $('settings').click();assert.equal($('cloud-recover').hidden,false);
    $('cloud-recover').click();assert.match($('modal-content').textContent,/1 hints/);$('cloud-recovery-cancel').click();assert.equal(saved().hints,8);assert.equal(enabled,true);
    $('cloud-recover').click();context.mock.timers.enable({apis:['setTimeout']});$('cloud-recovery-confirm').click();await settle();
    assert.equal(saved().hints,1);assert.equal(enabled,false);assert.equal(window.localStorage.getItem('firefly-cloud-meta-v1'),null);
    assert.equal(JSON.parse(window.localStorage.getItem('firefly-cloud-before-restore-v1')).hints,8);
    window.document.dispatchEvent(new window.Event('firefly-pause'));await settle();assert.equal(saved().hints,1);
    assert.equal(JSON.parse(remote).state.hints,8);assert.equal(requests.some(request=>request.operation==='write'||request.operation==='delete'),false);
  }finally{
    context.mock.timers.reset();for(const [key,descriptor] of Object.entries(descriptors)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}window.close();
  }
});
