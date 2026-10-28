import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudManager} from '../web/cloud.js';
import {cloudState,encodeCloudSave,parseCloudSave} from '../web/cloud-state.js';
import {origin,stateFixture} from './cloud-fixture.mjs';

function fixture({remote=null,enabled=false,available=true,meta=null}={}){
  let state=stateFixture(),choice=null,error=null,gate=null,conflictOnWrite=null,restored=null,restoreError=null;
  const requests=[],timers=new Map(),items=new Map(meta?[['firefly-cloud-meta-v1',meta]]:[]);let timerId=0;
  const storage={getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};
  const bridge={async request(operation,values={}){
    requests.push({operation,...values});
    if(operation==='status')return {available,enabled,account:'Play Account'};
    if(operation==='cancel')return {};
    if(operation==='disconnect'){enabled=false;return {};}
    if(error)throw error;
    if(gate)await gate;
    if(operation==='read')return {session:'session',account:'Play Account',saves:remote||[{key:'cloud',data:''}]};
    if(operation==='write'){
      if(conflictOnWrite){const saves=conflictOnWrite;conflictOnWrite=null;return {session:'conflict-session',saves};}
      remote=[{key:'cloud',data:values.data}];enabled=true;return {enabled};
    }
    if(operation==='adopt'){enabled=true;return {enabled};}
    throw Error('Unexpected operation');
  }};
  const manager=cloudManager({bridge,storage,readState:()=>state,origin,now:()=>100000,
    setTimer:cb=>{timers.set(++timerId,cb);return timerId;},clearTimer:id=>timers.delete(id),
    onConflict:(choices,select,cancel)=>{choice={choices,select,cancel};},
    restore:async value=>{if(restoreError)throw restoreError;restored=value;state=value;}});
  return {manager,storage,requests,timers,get state(){return state;},get choice(){return choice;},get restored(){return restored;},
    get remote(){return remote;},set remote(value){remote=value;},set error(value){error=value;},set gate(value){gate=value;},set conflictOnWrite(value){conflictOnWrite=value;},set restoreError(value){restoreError=value;}};
}
const snapshot=(state,id='remote')=>({key:'cloud',data:encodeCloudSave(cloudState(state,origin),{id}).text});

test('guest play does not write cloud data; explicit linking and later saves keep one complete progression',async()=>{
  const f=fixture();await f.manager.initialize();f.manager.changed();assert.deepEqual(f.requests.map(r=>r.operation),['status']);
  await f.manager.connect();assert.equal(f.manager.status().enabled,true);assert.equal(f.manager.status().account,'Play Account');
  const saved=parseCloudSave(f.remote[0].data);assert.equal(saved.state.leaderboardProfiles[origin].id,'server-player');
  f.state.hints--;f.manager.changed();assert.equal(f.timers.size,1);await f.manager.syncNow();
  assert.equal(parseCloudSave(f.remote[0].data).state.hints,2);assert.equal(f.restored,null);
  assert.equal(parseCloudSave(f.remote[0].data).parent,saved.id);
  await f.manager.syncNow();assert.equal(f.requests.at(-1).operation,'adopt','identical data needs no rewrite');
  f.manager.changed();await f.manager.disconnect();assert.equal(f.timers.size,0);assert.equal(f.manager.status().enabled,false);assert.ok(f.remote[0].data);
});

test('device/cloud conflicts require a choice, never combine tools, and preserve cloud profile identity',async()=>{
  const other=stateFixture();other.hints=8;other.reveals=1;other.leaderboardProfiles[origin].id='restored-player';
  const f=fixture({remote:[snapshot(other)]});await f.manager.initialize();await f.manager.connect();
  assert.equal(f.manager.status().attention,true);assert.equal(f.requests.filter(r=>r.operation==='write').length,0);
  assert.equal(f.choice.choices.length,2);await assert.rejects(f.choice.select('invalid'),/Choose/);
  await f.choice.select('cloud');assert.equal(f.restored.hints,8);assert.equal(f.restored.reveals,1);
  assert.equal(f.restored.leaderboardProfiles[origin].id,'restored-player');assert.equal(f.restored.leaderboardProfiles[origin].token,'a'.repeat(64));
  assert.equal(f.manager.status().attention,false);assert.ok(f.storage.getItem('firefly-cloud-meta-v1'));
  const keep=fixture({remote:[snapshot(other)]});await keep.manager.initialize();await keep.manager.connect();
  keep.state.hints=1;await keep.choice.select('device');assert.equal(parseCloudSave(keep.remote[0].data).state.hints,1);assert.equal(keep.restored,null);
});

test('automatic sync reports conflicts without opening dialogs or overwriting a newer remote save',async()=>{
  const initial=cloudState(stateFixture(),origin),remote=snapshot(initial,'first');
  const f=fixture({remote:[remote],enabled:true,meta:JSON.stringify({base:'first'})});
  await f.manager.initialize();assert.equal(f.choice,null);assert.equal(f.requests.at(-1).operation,'adopt');
  const changed=structuredClone(initial);changed.hints=9;f.remote=[snapshot(changed,'second')];f.state.reveals=1;
  f.manager.changed();const callback=[...f.timers.values()][0];callback();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(f.manager.status().attention,true);assert.equal(f.choice,null);assert.equal(f.restored,null);
  await f.manager.syncNow();assert.equal(f.choice.choices.length,2);
  await f.choice.cancel();assert.equal(f.state.reveals,1);assert.equal(parseCloudSave(f.remote[0].data).state.hints,9);
  assert.match(f.manager.status().message,/unchanged/);
});

test('SDK conflicts, stale metadata, cancellations, corrupt data and failed restores preserve local data',async()=>{
  const different=stateFixture();different.hints=10;
  const f=fixture({remote:[snapshot(different)],meta:'bad json'});await f.manager.initialize();await f.manager.connect();
  await f.choice.cancel();assert.equal(f.manager.status().enabled,false);assert.equal(f.restored,null);
  await f.manager.connect();
  f.conflictOnWrite=[snapshot(different,'a'),{...snapshot({...different,hints:12},'b'),key:'alternative'}];
  await f.choice.select('cloud');assert.equal(f.choice.choices.length,3);assert.equal(f.restored,null);assert.equal(f.storage.getItem('firefly-cloud-meta-v1'),'bad json');
  f.restoreError=Error('Device storage full');await assert.rejects(f.choice.select('alternative'),/storage full/);
  assert.equal(f.restored,null);assert.equal(f.state.hints,3);assert.equal(f.storage.getItem('firefly-cloud-meta-v1'),'bad json');
  const corrupt=fixture({remote:[{key:'cloud',data:'corrupt'}]});await corrupt.manager.initialize();await corrupt.manager.connect();assert.match(corrupt.manager.status().message,/damaged/);assert.equal(corrupt.requests.at(-1).operation,'cancel');
  const failure=fixture({remote:[snapshot(different)]});await failure.manager.initialize();await failure.manager.connect();failure.error=Error('offline');await assert.rejects(failure.choice.select('device'),/offline/);assert.equal(failure.state.hints,3);
});

test('account changes, missing SDK configuration, concurrent work and edits during sync remain safe',async()=>{
  const off=fixture({available:false,enabled:true});await off.manager.initialize();await off.manager.connect();assert.equal(off.requests.length,1);assert.equal(off.manager.status().enabled,false);
  const noBridge=cloudManager({bridge:null,storage:{getItem(){throw Error('unavailable');}},readState:stateFixture,origin});await noBridge.initialize();await noBridge.connect();await noBridge.disconnect();assert.equal(noBridge.status().enabled,false);
  const f=fixture({enabled:true});f.error=Object.assign(Error('Account changed'),{enabled:false});await f.manager.initialize();assert.equal(f.manager.status().enabled,false);assert.match(f.manager.status().message,/Account changed/);
  f.error=null;let release;f.gate=new Promise(resolve=>{release=resolve;});const first=f.manager.connect();
  await f.manager.connect();await assert.rejects(f.manager.disconnect(),/finish/);assert.equal(f.requests.filter(r=>r.operation==='read').length,2);
  f.state.hints=1;f.manager.changed();release();await first;assert.equal(parseCloudSave(f.remote[0].data).state.hints,1);assert.equal(f.timers.size,1);
  const failedStatus=fixture();failedStatus.requests.length=0; // Initialization errors are user-visible, never fatal.
  const errors=cloudManager({bridge:{request:async()=>{throw Error('WebView unavailable');}},storage:failedStatus.storage,readState:stateFixture,origin});await errors.initialize();assert.match(errors.status().message,/WebView unavailable/);
});

test('a background flush during an in-flight write immediately saves the latest move afterward',async()=>{
  const items=new Map(),storage={getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value)};
  const state=stateFixture();let remote='',started,release,writes=0;
  const began=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const manager=cloudManager({storage,origin,readState:()=>state,bridge:{async request(operation,values){
    if(operation==='status')return {available:true,enabled:false};
    if(operation==='read')return {session:'session',saves:[{key:'cloud',data:remote}]};
    if(operation==='write'){writes++;if(writes===1){started();await gate;}remote=values.data;return {};}
    if(operation==='adopt')return {};
    throw Error('Unexpected request');
  }}});
  await manager.initialize();const connecting=manager.connect();await began;
  state.hints=1;manager.changed();await manager.flush();release();await connecting;
  assert.equal(writes,2);assert.equal(parseCloudSave(remote).state.hints,1);
});
