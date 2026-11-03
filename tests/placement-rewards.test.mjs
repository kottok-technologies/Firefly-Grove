import test from 'node:test';
import assert from 'node:assert/strict';
import {placementPrize,rewardClosesAt,placementRewards} from '../web/placement-rewards.js';

test('placement tiers and finalization preserve the full speed-run window',()=>{
  assert.deepEqual([1,2,3,4,10,11,0,-1,NaN,1.5].map(rank=>placementPrize(rank)?.hints||0),[5,3,3,1,1,0,0,0,0,0]);
  assert.equal(new Date(rewardClosesAt('2026-10-27','hearts')).toISOString(),'2026-10-28T00:00:00.000Z');
  assert.equal(new Date(rewardClosesAt('2026-10-27','speed')).toISOString(),'2026-10-29T12:00:00.000Z');
});
test('reward claims coalesce retries, add once, recover failed saves and isolate profiles',async()=>{
  const state={hints:3,reveals:2},profile={id:'player'},receipt={id:'hearts:2026-10-27',hints:5,reveals:3};let calls=0,saves=0,fail=false;
  const options={state,origin:'test',profile,api:async()=>{calls++;return receipt;},persist:()=>{if(fail)throw Error('disk full');saves++;}};
  let manager=placementRewards(options);
  const first=manager.claim('hearts','2026-10-27'),second=manager.claim('hearts','2026-10-27');assert.equal(first,second);
  assert.equal((await first).added,true);assert.equal(state.hints,8);assert.equal(state.reveals,5);assert.equal(calls,1);assert.equal(saves,1);
  manager=placementRewards(options);assert.ok(manager.has(receipt));assert.equal((await manager.claim('hearts','2026-10-27')).added,false);assert.equal(state.hints,8);
  profile.id='other';fail=true;await assert.rejects(manager.claim('hearts','2026-10-27'),/disk full/);assert.equal(state.hints,8);assert.equal(manager.has(receipt),false);
  fail=false;await manager.claim('hearts','2026-10-27');assert.equal(state.hints,13);
  options.api=async()=>{throw Error('offline');};manager=placementRewards(options);await assert.rejects(manager.claim('speed','2026-10-27'),/offline/);
});
