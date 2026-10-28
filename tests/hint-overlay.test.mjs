import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {hintFocus,renderHintBoard} from '../web/hint-overlay.js';

test('hint previews include the occupied line, neighboring firefly, or relevant colors',()=>{
  const game={size:4,marks:Array(16).fill(0),regions:[0,0,1,1,0,0,1,1,2,2,3,3,2,2,3,3]};
  assert.deepEqual(hintFocus(game,{kind:'occupied-row',cells:[5,7]}),[4,5,6,7]);
  assert.deepEqual(hintFocus(game,{kind:'occupied-column',cells:[1,9]}),[1,5,9,13]);
  game.marks[5]=2;
  assert.deepEqual(hintFocus(game,{kind:'touching',cells:[0,2,4,6,8,9,10]}),[0,1,2,4,5,6,8,9,10]);
  assert.deepEqual(hintFocus(game,{kind:'last-in-color',cells:[11],colors:[3]}),[10,11,14,15]);
  assert.deepEqual(hintFocus(game,{kind:'touching',cells:[15]}),[15]);
  assert.deepEqual(hintFocus(game,{cells:[]}),[]);
});

test('the overlay board is inert, static, responsive, and never edits the real board',()=>{
  const dom=new JSDOM('<div id="stage"></div><div id="board" class="board dragging" style="grid-template-columns:repeat(2,1fr)"><button class="cell just-crossed flash" data-cell="0"></button><button class="cell target just-found error" data-cell="1"></button><button class="cell" data-cell="2"></button><button class="cell" data-cell="3"></button></div>');
  const stage=dom.window.document.getElementById('stage'),board=dom.window.document.getElementById('board');
  let width=300,height=200,resize,disconnected=false;
  Object.defineProperties(stage,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
  const previous=globalThis.ResizeObserver;
  globalThis.ResizeObserver=class{constructor(callback){resize=callback;}observe(target){assert.equal(target,stage);}disconnect(){disconnected=true;}};
  try{
    const cleanup=renderHintBoard(stage,board,[0,1],[1]),preview=stage.firstElementChild;
    assert.equal(preview.id,'');assert.equal(preview.inert,true);assert.equal(preview.getAttribute('aria-hidden'),'true');
    assert.equal(preview.style.width,'200px');assert.equal(preview.style.height,'200px');
    assert.equal(preview.querySelectorAll('.hint-context').length,2);assert.equal(preview.querySelectorAll('.hint-effect').length,1);
    assert.equal(preview.querySelectorAll('[data-cell],.flash,.error,.just-found,.just-crossed').length,0);
    for(const cell of preview.children)assert.equal(cell.tabIndex,-1);
    assert.ok(board.querySelector('.just-crossed.flash'));assert.equal(board.children[0].dataset.cell,'0');
    width=100;height=220;resize();assert.equal(preview.style.width,'100px');
    cleanup();assert.equal(disconnected,true);assert.equal(stage.children.length,0);
  }finally{globalThis.ResizeObserver=previous;dom.window.close();}
});
