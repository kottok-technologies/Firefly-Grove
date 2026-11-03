import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame,isTarget} from '../web/engine.js';
import {createDailyGame,dailyKey} from '../web/daily.js';

test('journey and daily summaries open immediately with motion enabled',async()=>{
  for(const mode of ['journey','daily']){
    const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
    const game=mode==='daily'?createDailyGame(dailyKey()):createGame(4,42);
    if(mode==='daily')game.startedAt=Date.now();
    const targets=game.marks.flatMap((mark,i)=>mark!==2&&isTarget(game,i)?[i]:[]);
    for(const i of targets.slice(0,-1))game.marks[i]=2;
    window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:4,completed:3,installSeed:42,hints:3,reveals:2,game:mode==='journey'?game:null,dailyRun:mode==='daily'?game:null,settings:{autoCross:false,haptics:false}}));
    window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
    const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    try{
      for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
      await import('../web/app.js?completion='+mode);const $=id=>window.document.getElementById(id);
      $(mode==='daily'?'daily-play':'play').click();
      $('board').children[targets.at(-1)].dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0,shiftKey:true}));
      assert.equal($('modal').open,true,mode+': summary must open before yielding to a timer or animation frame');
      assert.ok($(mode==='daily'?'daily-again':'next-level'),mode+': correct summary is visible immediately');
      $('close-modal').click();
      assert.equal($('board-complete').hidden,false,mode+': dismissing the summary keeps the completed-board action');
    }finally{
      await new Promise(resolve=>setTimeout(resolve,0));
      for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
      window.close();
    }
  }
});
