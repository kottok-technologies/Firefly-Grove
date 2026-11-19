import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame} from '../web/engine.js';
import {TRAINING_SEED} from '../web/training.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

test('level one uses the same board and walks through the rules before level two',async()=>{
  const {window}=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'});
  const key='firefly-grove-v1';
  window.localStorage.setItem(key,JSON.stringify({version:1,level:1,completed:0,installSeed:987654321,hints:3,reveals:2,game:null,settings:{autoCross:true,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  try{
    for(const [name,value] of Object.entries(values))Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
    await import('../web/app.js?training-ui');
    const $=id=>window.document.getElementById(id);
    const state=()=>JSON.parse(window.localStorage.getItem(key));
    const tap=(index,detail=1)=>$('board').children[index].dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail}));
    const step=(position,index,rule)=>{
      assert.equal($('training-progress').textContent,'Training '+position+' of 6');
      assert.match($('training-instruction').textContent,rule);
      assert.equal($('board').querySelector('.training-next')?.dataset.cell,String(index));
    };

    await $('play').onclick();
    const expected=createGame(1,TRAINING_SEED);
    assert.deepEqual(state().game.regions,expected.regions);
    assert.deepEqual(state().game.givens,expected.givens);
    assert.equal($('journey-tools').hidden,true);
    step(1,0,/row holds one/);
    tap(1);tap(1,2);
    assert.deepEqual(state().game.marks,expected.marks);
    assert.equal(state().game.lives,3);

    tap(0);tap(0,2);
    assert.equal(state().game.marks[0],1,'a quick second tap cannot undo a completed step');
    step(2,14,/column holds one/);
    tap(14);
    $('back-home').click();
    await $('play').onclick();
    step(3,8,/color holds one/);
    tap(8);
    step(4,7,/diagonally/);
    tap(7);
    step(5,11,/one square of this color/);
    assert.equal(state().game.marks.filter(mark=>mark===1).length,4,'auto-cross does not skip lessons');
    tap(11);
    assert.equal(state().game.marks[11],0,'a single tap does not reveal a firefly');
    tap(11,2);
    step(6,13,/where they meet/);
    tap(13,0);
    assert.equal($('training-guide').hidden,true);
    assert.equal($('modal').open,true);
    assert.ok($('next-level'));
    assert.equal(state().level,2);
    assert.equal(state().game.completed,true);
    assert.deepEqual(state().game.heartFinds,[11,13]);
    assert.equal(validateJourneyCompletion(state().game.heartCompletion.body).hearts,3);
  }finally{
    await new Promise(resolve=>setTimeout(resolve,0));
    for(const [name,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
    window.close();
  }
});
