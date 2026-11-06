import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame,applyMove,isTarget} from '../web/engine.js';
import {dailyKey} from '../web/daily.js';

test('pending hearts show errors and upload when connectivity returns',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/?leaderboard=local'}),{window}=dom;
  const origin='http://127.0.0.1:8787',game=createGame(1,42);game.heartFinds=[];
  for(let i=0;i<game.marks.length;i++)if(game.marks[i]!==2&&isTarget(game,i)){game.heartFinds.push(i);applyMove(game,i,true);}
  const entry={owner:origin+'|local',body:{version:game.generation,day:dailyKey(),level:1,seed:42,finds:game.heartFinds},hearts:3,status:'pending'};
  game.heartCompletion=entry;
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:2,completed:1,installSeed:42,hints:3,reveals:2,game,settings:{autoCross:false,haptics:false},leaderboardProfiles:{[origin]:{localId:'local',id:'online',name:'Amber',token:'a'.repeat(64)}},journeyHearts:{pending:[entry],lastLevel:{[entry.owner]:1}}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let offline=true,attempts=0;
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0,
    fetch:async(url)=>{
      if(url.endsWith('/journey/finish')){attempts++;if(offline)throw new TypeError('offline');return {ok:true,json:async()=>({credited:true,hearts:3,mine:{rank:1,hearts:3},total:1})};}
      return {ok:true,json:async()=>({day:dailyKey(),mine:offline?null:{rank:1,hearts:3},total:offline?0:1,entries:[]})};
    }};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');await settle();const $=id=>document.getElementById(id),saved=()=>JSON.parse(localStorage.getItem('firefly-grove-v1'));
    await $('hearts-leaderboard').onclick();await settle();
    assert.match($('hearts-status').textContent,/Cannot reach the leaderboard/);
    assert.equal(saved().journeyHearts.pending.length,1);
    offline=false;window.dispatchEvent(new window.Event('online'));await settle();
    assert.ok(attempts>=2);assert.equal(saved().journeyHearts.pending.length,0);
    assert.equal(saved().game.heartCompletion.status,'synced');
    assert.match($('hearts-status').textContent,/3 hearts/);
    assert.doesNotMatch($('hearts-home-status').textContent,/awaiting upload/);
  }finally{
    await settle();
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    window.close();
  }
});
