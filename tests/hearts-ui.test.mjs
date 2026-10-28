import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame} from '../web/engine.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

test('journey tools, restart, completion, and the hearts leaderboard preserve scoring history',async context=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:1,completed:0,installSeed:42,hints:3,reveals:10,game:createGame(1,42),settings:{autoCross:false,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
    $('play').click();$('reveal').click();assert.equal(saved().game.heartFinds.length,1);$('hint-continue').click();
    $('restart').click();$('confirm-restart').click();assert.equal(saved().game.heartFinds.length,0);
    $('reveal').click();$('hint-continue').click();context.mock.timers.enable({apis:['setTimeout']});$('reveal').click();context.mock.timers.tick(2000);
    assert.ok($('hint-continue'),'final reveal remains visible until acknowledged');$('hint-continue').click();context.mock.timers.reset();await new Promise(resolve=>setTimeout(resolve,5));
    const state=saved(),[entry]=state.journeyHearts.pending;
    assert.equal(state.completed,1);assert.equal(entry.hearts,3);assert.equal(entry.body.finds.length,2);
    assert.equal(validateJourneyCompletion(entry.body).hearts,3);
    assert.match($('journey-heart-status').textContent,/3 hearts awaiting upload/);
    $('journey-hearts-board').click();await new Promise(resolve=>setTimeout(resolve,0));
    assert.ok($('hearts-day'));assert.match($('hearts-status').textContent,/not configured/);
    assert.match($('modal-content').textContent,/Each level counts once/);
    assert.equal($('landing-screen').hidden,true,'rankings keep the completed board underneath');
    assert.equal($('puzzle-screen').hidden,false);
    assert.equal($('board-complete').hidden,false);
    assert.equal($('board').inert,true);
    assert.ok($('board-wrap').classList.contains('is-complete'));
    assert.equal($('hint').disabled,true);assert.equal($('reveal').disabled,true);
    $('hearts-refresh').click();await new Promise(resolve=>setTimeout(resolve,0));
    $('hearts-day').dispatchEvent(new window.Event('change'));await new Promise(resolve=>setTimeout(resolve,0));
    $('close-modal').click();
    assert.equal($('modal').open,false);assert.equal($('puzzle-screen').hidden,false);
    assert.equal($('board-complete').hidden,false);
    assert.match($('board-next-level').textContent,/Next level/);
    assert.match($('play').textContent,/Play level 2/);
    assert.match($('hearts-home-status').textContent,/1 completed level/);
    assert.equal(saved().completed,1);assert.equal(saved().journeyHearts.pending.length,1);
    $('hearts-leaderboard').click();await new Promise(resolve=>setTimeout(resolve,0));
    $('modal').open=false;$('modal').dispatchEvent(new window.Event('close'));
    assert.equal($('puzzle-screen').hidden,false,'native dismissal keeps the direct next-level action');
    const next=$('board-next-level').onclick();
    await $('board-next-level').onclick();
    await next;
    assert.equal($('puzzle-screen').hidden,false);assert.equal(saved().game.level,2);
    assert.equal(saved().game.completed,false);assert.equal(saved().completed,1);
    assert.equal($('board-complete').hidden,true);assert.equal($('board').inert,false);
    assert.equal($('board-wrap').classList.contains('is-complete'),false);
    assert.equal(saved().journeyHearts.pending.length,1,'continuing does not award the level twice');
  }finally{
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
    window.close();
  }
});
