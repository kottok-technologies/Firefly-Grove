import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderPlacementRewards} from '../web/placement-ui.js';

test('reward screen explains unlocks, collects each board, and recovers errors',async()=>{
  const dom=new JSDOM('<main></main>'),previous=globalThis.document;
  globalThis.document=dom.window.document;
  const container=document.querySelector('main');let added=0,fail=true;
  const rewards={has:()=>false,claim:async()=>{if(fail)throw Error('offline');return {receipt:{rank:1,hints:5,reveals:3},added:true};}};
  const render=(day,api=async()=>({mine:{rank:1}}))=>renderPlacementRewards({container,day,api,profile:{},rewards,onAdded:()=>added++});
  try{
    await render('2099-01-01');assert.match(container.textContent,/Rewards unlock/);assert.equal(container.querySelectorAll('button:not([hidden])').length,0);
    container.replaceChildren();await render('2026-01-01');
    const buttons=[...container.querySelectorAll('button')];assert.equal(buttons.length,2);
    await buttons[0].onclick();assert.equal(buttons[0].disabled,false);assert.match(container.textContent,/offline/);
    fail=false;await buttons[0].onclick();assert.equal(added,1);assert.equal(buttons[0].textContent,'Claimed');assert.equal(buttons[0].disabled,true);assert.match(container.textContent,/5 hints and 3 reveals/);
    rewards.claim=async()=>({receipt:{},added:false});await buttons[1].onclick();assert.match(container.textContent,/already in your save/);
    container.replaceChildren();await render('2026-01-01',async()=>({mine:{rank:11}}));assert.match(container.textContent,/Top 10 earn perks/);
    container.replaceChildren();await render('2026-01-01',async()=>({mine:null}));assert.match(container.textContent,/No ranked finish/);
    container.replaceChildren();await render('2026-01-01',async()=>{throw Object.assign(Error('missing'),{status:404});});assert.match(container.textContent,/server update/);
    container.replaceChildren();rewards.has=()=>true;await render('2026-01-01');assert.match(container.textContent,/already in your save/);
    rewards.has=()=>false;container.replaceChildren();container.remove();await render('2026-01-01');assert.doesNotMatch(container.textContent,/You placed/);
  }finally{if(previous)globalThis.document=previous;else delete globalThis.document;dom.window.close();}
});
