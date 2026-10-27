import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyMove,isTarget} from '../web/engine.js';
import {initializeHeartFinds,heartsManager} from '../web/hearts.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

function complete(level=1){
  const game=createGame(level,42);initializeHeartFinds(game);
  for(let i=0;i<game.marks.length;i++)if(game.marks[i]!==2&&isTarget(game,i)){game.heartFinds.push(i);applyMove(game,i,true);}
  return game;
}
function fixture(){
  let date='2026-10-27',calls=0,fail=null;const state={},profile={localId:'local',id:'server',token:'test'};
  const api=async(path,{body,profile:actual})=>{
    calls++;assert.equal(actual,profile);assert.equal(path,'journey/finish');
    if(fail)throw fail;
    return {credited:true,...validateJourneyCompletion(body),mine:{hearts:3,rank:1},total:1};
  };
  const options={state,profile,origin:'production',api,ensureOnline:async()=>{},persist(){},now:()=>new Date(date+'T12:00:00Z')};
  return {state,options,get calls(){return calls;},set date(value){date=value;},set fail(value){fail=value;},manager:heartsManager(options)};
}

test('in-progress journey migration reconstructs prior finds, mistakes, and restores',()=>{
  for(const mistakes of [0,1,2,3,4,6]){
    const game=createGame(1,42),targets=game.marks.flatMap((mark,i)=>mark!==2&&isTarget(game,i)?[i]:[]);
    game.marks[targets[0]]=2;game.mistakes=mistakes;
    game.lives=mistakes<3?3-mistakes:1;
    initializeHeartFinds(game);const original=game.heartFinds;
    initializeHeartFinds(game);assert.equal(game.heartFinds,original);
    game.heartFinds.push(targets[1]);
    assert.equal(validateJourneyCompletion({version:'journey-v1',level:1,seed:42,finds:game.heartFinds}).hearts,game.lives);
  }
});

test('queued finishes persist, retry safely, and never enqueue a level twice',async()=>{
  const f=fixture();assert.equal(f.manager.queue(createGame(1,42)),null);
  const entry=f.manager.queue(complete());assert.equal(entry.hearts,3);assert.equal(f.manager.queue(complete()),null);
  f.fail=Error('offline');await f.manager.flush();assert.equal(entry.error,'offline');assert.equal(f.manager.pending().length,1);
  const reloaded=heartsManager({...f.options,state:JSON.parse(JSON.stringify(f.state))});
  f.fail=null;await reloaded.flush();assert.equal(reloaded.pending().length,0);assert.equal(f.calls,2);
  const noHistory=complete(2);delete noHistory.heartFinds;assert.equal(reloaded.queue(noHistory),null);
  const dead=complete(2);dead.lives=0;assert.equal(reloaded.queue(dead),null);
});

test('UTC rollover expires pending finishes instead of crediting them to a new day',async()=>{
  const f=fixture(),entry=f.manager.queue(complete());f.date='2026-10-28';await f.manager.flush();
  assert.equal(entry.status,'expired');assert.equal(f.manager.pending().length,0);assert.equal(f.calls,0);
  const next=f.manager.queue(complete(2));await f.manager.flush();assert.equal(next.status,'synced');assert.equal(next.body.day,'2026-10-28');
});

test('account and API environments have separate queues and offline play needs no API',async()=>{
  const f=fixture();f.manager.queue(complete());
  const other=heartsManager({...f.options,origin:'test'});assert.equal(other.pending().length,0);other.queue(complete());
  assert.equal(f.manager.pending().length,1);assert.equal(other.pending().length,1);
  const offline=heartsManager({...f.options,origin:null});offline.queue(complete());await offline.flush();assert.equal(f.calls,0);
  const noAuth=heartsManager({...f.options,ensureOnline:async()=>{throw Error('offline');}});await noAuth.flush();assert.equal(f.calls,0);
});

test('concurrent flushes drain new completions once and handle rejected and duplicate submissions',async()=>{
  const f=fixture();let release,calls=0;const gate=new Promise(resolve=>{release=resolve;});
  const manager=heartsManager({...f.options,async api(){calls++;await gate;return {credited:false,hearts:3,mine:null,total:0};}});
  const entry=manager.queue(complete()),first=manager.flush(),second=manager.flush();
  await Promise.resolve();manager.queue(complete(2));release();await Promise.all([first,second]);
  assert.equal(calls,2);assert.equal(entry.status,'duplicate');assert.equal(manager.pending().length,0);
  for(const status of [400,410]){
    const item=f.manager.queue(complete(status));f.fail=Object.assign(Error('Rejected'),{status});await f.manager.flush();
    assert.equal(item.status,status===400?'rejected':'expired');assert.equal(f.manager.pending().length,0);
  }
});
