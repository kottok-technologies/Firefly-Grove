import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame,findHint,isTarget} from '../web/engine.js';

test('hints demand acknowledgement, spend once, and support Continue and Android Back',async context=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'}),{window}=dom;
  const game=createGame(1,42),expected=findHint(game);
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:1,completed:0,installSeed:42,hints:3,reveals:2,game,settings:{autoCross:false,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');const $=id=>window.document.getElementById(id),saved=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1'));
    $('play').click();$('hint').click();
    assert.equal(saved().hints,2);assert.equal(saved().game.lives,3);
    expected.cells.forEach(i=>assert.equal(saved().game.marks[i],1));
    assert.equal($('full-explanation').textContent,expected.text);assert.ok($('modal').classList.contains('hint-overlay'));
    assert.ok(window.document.body.classList.contains('hint-preview-open'));assert.equal(window.document.activeElement.id,'hint-continue');
    assert.equal($('hint-board-stage').querySelectorAll('.hint-effect').length,expected.cells.length);
    assert.equal($('hint-board-stage').querySelectorAll('.hint-context').length,game.size);
    assert.equal($('board').querySelectorAll('.flash').length,0);assert.equal($('message-details'),null);assert.equal(window.document.querySelector('.message'),null);
    $('hint').click();$('reveal').click();assert.equal(saved().hints,2);assert.equal(saved().reveals,2,'tools cannot spend again while reading');
    $('hint-continue').click();assert.equal($('modal').open,false);assert.equal($('hint-board-stage').children.length,0);
    assert.ok(!window.document.body.classList.contains('hint-preview-open'));
    $('hint').click();assert.equal(saved().hints,1);$('close-modal').click();
    assert.equal($('modal').open,false);assert.equal($('puzzle-screen').hidden,false,'Android Back dismisses the hint without leaving the puzzle');
    $('hint').click();$('modal').open=false;$('modal').dispatchEvent(new window.Event('close'));
    assert.ok(!$('modal').classList.contains('hint-overlay'),'native Escape/close also cleans up');
    context.mock.timers.enable({apis:['setTimeout']});
    const wrong=game.marks.findIndex((_,i)=>!isTarget(game,i));
    $('board').children[wrong].dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0,shiftKey:true}));
    assert.equal(saved().game.lives,2);assert.ok($('game-status').classList.contains('show-toast'));assert.match($('game-status').textContent,/One life lost/);
    const cell=$('board').children[wrong];
    const animationEnd=name=>{const event=new window.Event('animationend',{bubbles:true});Object.defineProperty(event,'animationName',{value:name});cell.dispatchEvent(event);};
    assert.ok(cell.classList.contains('error'));
    animationEnd('mistake');assert.equal(cell.classList.contains('error'),false,'the finished pulse must clean up its class');
    cell.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0}));
    assert.equal(cell.classList.contains('error'),false);assert.equal(saved().game.lives,2);
    cell.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0,shiftKey:true}));
    assert.ok(cell.classList.contains('error'));assert.equal(saved().game.lives,1);
    cell.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0}));
    assert.equal(cell.classList.contains('error'),false,'crossing during a shake also clears it, including with reduced motion');
    animationEnd('cross-cell-confirm');assert.equal(cell.classList.contains('error'),false,'finishing a cross must not replay the mistake');
    assert.equal(saved().game.lives,1);assert.equal(saved().game.mistakes,2);
    context.mock.timers.tick(650);
    cell.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0,shiftKey:true}));
    assert.ok(cell.classList.contains('error'));
    context.mock.timers.tick(649);assert.ok(cell.classList.contains('error'));
    context.mock.timers.tick(1);assert.equal(cell.classList.contains('error'),false,'reduced motion clears the badge without an animation event');
    context.mock.timers.reset();

  }finally{
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
    window.close();
  }
});
