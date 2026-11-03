import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamoStore} from '../aws-leaderboard/src/dynamo-store.mjs';

// Emulate 1 MB pagination with small pages to verify the *total* bound,
// rather than merely checking the Limit on the first query.
function fixture({before=99999,exists=true}={}){
  let time=0,fail=false;const calls=[];
  const client={async send(command){
    const input=command.input;calls.push({type:command.constructor.name,input});
    if(command.constructor.name==='GetCommand'){
      if(input.Key.sk==='META')return {Item:{count:100000}};
      if(input.Key.sk==='PROFILE')return {Item:{name:input.Key.pk}};
      return {Item:exists?{playerId:'target',rankKey:'SCORE#target',hearts:5,levels:1,elapsedMs:9999,mistakes:0}:undefined};
    }
    if(command.constructor.name==='BatchGetCommand')return {Responses:{test:input.RequestItems.test.Keys.map(key=>({id:key.pk.slice(7),name:key.pk}))}};
    assert.equal(command.constructor.name,'QueryCommand');
    assert.ok(Number.isInteger(input.Limit)&&input.Limit<=1001);
    if(input.Select==='COUNT'){
      const available=before+(input.ExpressionAttributeValues[':prefix']==='SCORE#'?1:0),offset=input.ExclusiveStartKey?.offset||0;
      const count=Math.min(input.Limit,127,available-offset);
      return {Count:count,...(offset+count<available?{LastEvaluatedKey:{offset:offset+count}}:{})};
    }
    if(fail){fail=false;throw Error('temporary database error');}
    return {Items:Array.from({length:50},(_,i)=>({playerId:'leader-'+i,hearts:100-i,levels:1,elapsedMs:100+i,mistakes:0}))};
  }};
  return {calls,store:new DynamoStore('test',client,{now:()=>time}),advance:()=>{time+=5001;},fail:()=>{fail=true;}};
}
test('100,000-entry boards cap all rank pages, reward checks, and completion summaries',async()=>{
  for(const board of ['speed','hearts']){
    const f=fixture(),rankLimit=board==='speed'?1001:1000;
    const result=board==='speed'?await f.store.board('2026-11-01','target'):await f.store.heartsBoard('2026-11-01','target');
    assert.equal(result.mine.rank,'1,000+');assert.equal(result.mine.rankExact,false);assert.equal(result.entries.length,50);
    let remaining=rankLimit;
    for(const call of f.calls.filter(call=>call.input.Select==='COUNT')){assert.equal(call.input.Limit,remaining);remaining-=Math.min(remaining,127);}
    assert.equal(remaining,0);
    f.calls.length=0;assert.equal(await f.store.placementRank(board,'2026-11-01','target'),null);
    assert.deepEqual(f.calls.map(call=>call.type),['GetCommand','QueryCommand']);
    assert.equal(f.calls[1].input.Limit,board==='speed'?11:10);
    f.calls.length=0;const summary=await f.store.standing(board,'2026-11-01','target');assert.equal(summary.mine.rank,'1,000+');assert.equal(summary.entries,undefined);
    assert.ok(f.calls.every(call=>call.type!=='BatchGetCommand'));
    assert.ok(f.calls.filter(call=>call.type==='QueryCommand').every(call=>call.input.Select==='COUNT'));
  }
});
test('rank 1,000 remains exact, and hearts ties preserve eligible ranks outside the visible list',async()=>{
  for(const board of ['speed','hearts']){
    const f=fixture({before:999});const result=await f.store.standing(board,'2026-11-01','target');assert.equal(result.mine.rank,1000);assert.equal(result.mine.rankExact,true);
  }
  const tied=fixture({before:2});assert.equal(await tied.store.placementRank('hearts','2026-11-01','target'),3);
  const edge=fixture({before:9});assert.equal(await edge.store.placementRank('hearts','2026-11-01','target'),10);
  const first=fixture({before:0});assert.equal(await first.store.placementRank('speed','2026-11-01','target'),1);
  const missing=fixture({exists:false});assert.equal(await missing.store.placementRank('speed','2026-11-01','target'),null);assert.equal((await missing.store.standing('hearts','2026-11-01','target')).mine,null);
});
test('shared top-50 cache coalesces concurrent requests, expires, bounds memory and retries failures',async()=>{
  const f=fixture();
  const results=await Promise.all(Array.from({length:20},()=>f.store.board('2026-11-01','target')));
  assert.ok(results.every(result=>result.mine.name==='PLAYER#target'));
  assert.equal(f.calls.filter(call=>call.type==='QueryCommand'&&!call.input.Select).length,1);
  assert.equal(f.calls.filter(call=>call.type==='BatchGetCommand').length,1);
  f.advance();await f.store.topRows('speed','2026-11-01');assert.equal(f.calls.filter(call=>call.type==='BatchGetCommand').length,2);
  f.advance();f.fail();await assert.rejects(f.store.topRows('speed','2026-11-01'),/temporary/);await f.store.topRows('speed','2026-11-01');
  for(let i=0;i<130;i++)await f.store.topRows('speed','day-'+i);
  assert.equal(f.store.topCache.size,128);
});
