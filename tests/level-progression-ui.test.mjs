import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame,levelConfig,isTarget} from '../web/engine.js';

test('an in-progress legacy board retains size, notes and correct Home metadata',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
  const game=createGame(23,42,'journey-v3');game.elapsed=22;game.heartFinds=[];
  game.marks[game.marks.findIndex((_,i)=>!isTarget(game,i))]=1;
  assert.equal(game.size,9);assert.notEqual(levelConfig(23).size,9);
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:23,completed:22,installSeed:42,hints:3,reveals:2,game,settings:{autoCross:false,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');const $=id=>document.getElementById(id);
    assert.match($('play-meta').textContent,/9 . 9/);assert.equal($('home-note').hidden,true);
    $('play').click();assert.equal($('board').children.length,81);
    assert.equal($('difficulty').textContent,levelConfig(23,'journey-v3').label);
    const saved=JSON.parse(localStorage.getItem('firefly-grove-v1'));
    assert.deepEqual(saved.game,game);assert.equal(saved.previousPuzzle,undefined);
  }finally{
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    window.close();
  }
});
