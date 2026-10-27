import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame} from '../web/engine.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

test('journey tools, restart, completion, and the hearts leaderboard preserve scoring history',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:1,completed:0,installSeed:42,hints:3,reveals:10,game:createGame(1,42),settings:{autoCross:false,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
    $('play').click();$('reveal').click();assert.equal(saved().game.heartFinds.length,1);
    $('restart').click();$('confirm-restart').click();assert.equal(saved().game.heartFinds.length,0);
    $('reveal').click();$('reveal').click();await new Promise(resolve=>setTimeout(resolve,5));
    const state=saved(),[entry]=state.journeyHearts.pending;
    assert.equal(state.completed,1);assert.equal(entry.hearts,3);assert.equal(entry.body.finds.length,2);
    assert.equal(validateJourneyCompletion(entry.body).hearts,3);
    assert.match($('journey-heart-status').textContent,/3 hearts awaiting upload/);
    $('journey-hearts-board').click();await new Promise(resolve=>setTimeout(resolve,0));
    assert.ok($('hearts-day'));assert.match($('hearts-status').textContent,/not configured/);
    assert.match($('modal-content').textContent,/Each level counts once/);
    $('close-modal').click();$('back-home').click();assert.match($('hearts-home-status').textContent,/1 completed level/);
  }finally{
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
    window.close();
  }
});
