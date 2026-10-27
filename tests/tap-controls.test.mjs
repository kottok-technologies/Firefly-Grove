import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createGame,isTarget} from '../web/engine.js';

test('taps respond immediately, allow slower doubles, and stay separate from drags and keyboard input',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'});
  const {window}=dom,game=createGame(1,42);
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,installSeed:42,level:1,completed:0,hints:3,reveals:2,game,settings:{autoCross:false,haptics:false}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let clock=100;
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,
    matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},
    setInterval:()=>0,setTimeout:()=>0,clearTimeout:()=>{},performance:{now:()=>clock}};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');
    const $=id=>window.document.getElementById(id),board=$('board');
    const snapshot=()=>JSON.parse(window.localStorage.getItem('firefly-grove-v1')).game;
    const tap=(cell,at,detail=1)=>{clock=at;board.children[cell].dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail}));};
    $('play').click();
    const [a,b,c]=game.marks.flatMap((mark,i)=>!mark&&!isTarget(game,i)?[i]:[]);
    const target=game.marks.findIndex((mark,i)=>!mark&&isTarget(game,i));

    tap(a,100);
    assert.equal(snapshot().marks[a],1,'single tap saves its cross synchronously');
    assert.ok(board.children[a].classList.contains('marked'),'cross is rendered without waiting for double-tap timeout');
    assert.equal(snapshot().lives,3);
    tap(a,650);
    assert.equal(snapshot().lives,2,'550ms double tap is a find attempt');
    assert.equal(snapshot().marks[a],0,'wrong find restores the note from before the first tap');

    tap(target,900,0);assert.equal(snapshot().marks[target],1);assert.equal(snapshot().lives,2);
    tap(target,1000);assert.equal(snapshot().marks[target],0);
    tap(target,1600);assert.equal(snapshot().marks[target],2,'600ms double tap finds the hidden firefly');
    tap(target,1700);assert.equal(snapshot().marks[target],2,'found fireflies stay protected');

    tap(b,2000);tap(b,2601);
    assert.equal(snapshot().marks[b],0,'tap after the window erases the cross immediately');
    assert.equal(snapshot().lives,2);
    tap(a,3000);tap(b,3100);tap(a,3200);
    assert.equal(snapshot().marks[a],0);assert.equal(snapshot().marks[b],1);
    assert.equal(snapshot().lives,2,'quick taps on different cells never find fireflies');

    tap(a,4000);window.dispatchEvent(new window.Event('blur'));tap(a,4200);
    assert.equal(snapshot().marks[a],0,'losing focus ends the double-tap gesture');
    tap(a,5000);$('back-home').click();$('play').click();tap(a,5200);
    assert.equal(snapshot().marks[a],0,'navigation cannot complete an old double tap');
    tap(a,6000,0);tap(a,6100,0);
    assert.equal(snapshot().marks[a],0,'keyboard activation remains a single toggle');

    // Pointer strokes still paint/erase notes, and their synthetic click is ignored.
    board.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});
    board.hasPointerCapture=()=>false;board.setPointerCapture=()=>{};
    const point=cell=>({clientX:(cell%4+.5)*100,clientY:(Math.floor(cell/4)+.5)*100});
    const pointer=(type,cell,destination)=>{
      const event=new window.MouseEvent(type,{bubbles:true,cancelable:true,buttons:type==='pointerup'?0:1,...point(cell)});
      Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true},pointerType:{value:'touch'}});
      destination.dispatchEvent(event);
    };
    pointer('pointerdown',a,board.children[a]);pointer('pointermove',c,window);pointer('pointerup',c,window);
    tap(c,7000);
    assert.equal(snapshot().marks[a],1);assert.equal(snapshot().marks[c],1);
    assert.equal(snapshot().lives,2,'dragging and its trailing click never attempt a find');
    pointer('pointerdown',a,board.children[a]);pointer('pointermove',c,window);pointer('pointerup',c,window);
    tap(c,7100);
    assert.equal(snapshot().marks[a],0);assert.equal(snapshot().marks[c],0);
    assert.equal(snapshot().marks[target],2);assert.equal(snapshot().lives,2);
    tap(a,8000,0);tap(a,9000);tap(a,9550);
    assert.equal(snapshot().marks[a],1,'wrong double tap on an existing cross preserves that cross');
    assert.equal(snapshot().lives,1);
  }finally{
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
    window.close();
  }
});
