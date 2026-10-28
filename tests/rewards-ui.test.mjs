import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame,isTarget} from '../web/engine.js';

test('care packages skip completion five, award at ten, and keep existing inventory',async()=>{
  for(const completed of [4,9]){
    const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
    const game=createGame(completed+1,42),targets=game.marks.flatMap((mark,i)=>mark!==2&&isTarget(game,i)?[i]:[]);
    for(const i of targets.slice(0,-1))game.marks[i]=2;
    window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:completed+1,completed,installSeed:42,hints:3,reveals:2,game,settings:{autoCross:false,haptics:false}}));
    window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
    const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    try{
      for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
      await import('../web/app.js?rewards='+completed);const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
      assert.equal(saved().hints,3);assert.equal(saved().reveals,2);
      assert.equal($('progress').style.width,completed*10+'%');
      assert.match($('milestone-text').textContent,new RegExp('^'+(10-completed)+' more'));
      $('care-package').click();assert.match($('modal-content').textContent,/Every ten completed levels/);$('close-modal').click();
      $('play').click();$('board').children[targets.at(-1)].dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0,shiftKey:true}));
      await new Promise(resolve=>setTimeout(resolve,5));
      const reward=completed===9;
      assert.equal(saved().completed,completed+1);assert.equal(saved().hints,reward?5:3);assert.equal(saved().reveals,reward?3:2);
      assert.equal($('win-reward').hidden,!reward);
      assert.equal($('progress').style.width,reward?'0%':'50%');
      assert.match($('milestone-text').textContent,reward?/^10 more levels/:/^5 more levels/);
      $('close-modal').click();
      assert.equal($('board-complete').hidden,false,'closing the result leaves a next-level overlay');
      assert.ok($('board-wrap').classList.contains('is-complete'));
      await $('board-next-level').onclick();
      assert.equal(saved().game.level,completed+2);assert.equal(saved().completed,completed+1);
      assert.equal(saved().hints,reward?5:3);assert.equal(saved().reveals,reward?3:2);
      assert.equal($('board-complete').hidden,true);
    }finally{
      for(const [key,descriptor] of Object.entries(previous)){
        if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
      }
      window.close();
    }
  }
});
