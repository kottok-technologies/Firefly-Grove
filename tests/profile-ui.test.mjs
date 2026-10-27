import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Settings edits the generated profile and racing no longer asks for a nickname',async()=>{
  const dom=new JSDOM(await readFile(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/'});
  const {window}=dom;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const values={window,document:window.document,location:window.location,localStorage:window.localStorage,navigator:window.navigator,
    matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},setInterval:()=>0};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    await import('../web/app.js');
    const $=id=>window.document.getElementById(id);
    $('settings').click();
    const initial=JSON.parse(window.localStorage.getItem('firefly-grove-v1')).leaderboardProfile;
    assert.equal($('race-name').value,initial.name);assert.equal($('player-id').textContent,initial.localId);
    $('race-name').value='  Little   Light ';
    await $('profile-form').onsubmit({preventDefault(){}});
    assert.equal($('profile-error').textContent,'Username saved.');
    const saved=JSON.parse(window.localStorage.getItem('firefly-grove-v1')).leaderboardProfile;
    assert.equal(saved.localId,initial.localId);assert.equal(saved.name,'Little Light');
    $('close-modal').click();$('settings').click();assert.equal($('race-name').value,'Little Light');
    $('close-modal').click();$('daily-play').click();
    const race=[...$('modal-content').querySelectorAll('button')].find(button=>button.textContent==='Race online →');
    await race.onclick();
    assert.equal($('race-name'),null);assert.match($('race-error').textContent,/not configured/);
    $('race-home').click();$('leaderboard').click();assert.equal($('ranking-name'),null);
  }finally{
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
    window.close();
  }
});
