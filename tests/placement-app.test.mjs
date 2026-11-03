import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Home rewards screen saves both prizes and reopening does not add them again',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/?leaderboard=local'}),{window}=dom;
  const origin='http://127.0.0.1:8787';
  window.localStorage.setItem('firefly-grove-v1',JSON.stringify({version:1,level:1,completed:0,installSeed:42,hints:3,reveals:2,game:null,settings:{autoCross:false,haptics:false},leaderboardProfiles:{[origin]:{localId:'local',id:'online',name:'Amber',token:'a'.repeat(64)}}}));
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let claims=0;
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,matchMedia:()=>({matches:true,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0,
    fetch:async(url,options)=>({ok:true,json:async()=>{
      if(url.endsWith('/rewards/claim')){claims++;const {board,day}=JSON.parse(options.body);return {id:board+':'+day,board,day,rank:1,hints:5,reveals:3};}
      if(url.includes('/rewards?'))return {status:'eligible',rank:1,hints:5,reveals:3};
      return {mine:{rank:1},total:1,entries:[]};
    }})};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');const $=id=>document.getElementById(id),saved=()=>JSON.parse(localStorage.getItem('firefly-grove-v1'));
    await $('placement-rewards').onclick();
    $('prize-day').value='2026-01-01';await $('prize-day').onchange();
    const buttons=[...$('prize-entries').querySelectorAll('button')];assert.equal(buttons.length,2);
    await Promise.all(buttons.map(button=>button.onclick()));
    assert.equal(saved().hints,13);assert.equal(saved().reveals,8);assert.equal(claims,2);
    assert.equal($('home-hints').textContent,'13');assert.equal($('hints').textContent,'13');
    await $('prize-refresh').onclick();
    assert.equal($('prize-entries').querySelectorAll('button:not([hidden])').length,0);assert.equal(saved().hints,13);
    $('close-modal').click();await $('hearts-leaderboard').onclick();
    const link=[...$('modal-content').querySelectorAll('button')].find(button=>button.textContent==='Placement rewards for this date');assert.ok(link);await link.onclick();assert.ok($('prize-day'));
  }finally{
    await new Promise(resolve=>setTimeout(resolve,0));
    for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    window.close();
  }
});
