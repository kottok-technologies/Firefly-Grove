import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardBridge} from '../web/reward-bridge.js';

test('reward bridge accepts only a matching one-shot native response',async()=>{
  assert.equal(rewardBridge({native:null}),null);assert.equal(rewardBridge({native:{}}),null);
  let sent;const native={postMessage:value=>{sent=JSON.parse(value);}},bridge=rewardBridge({native,id:()=> 'request-1'});
  const result=bridge.request('show','life');assert.deepEqual(sent,{id:'request-1',operation:'show',kind:'life'});
  await assert.rejects(bridge.request('show','hints'),/finish the current/);
  for(const value of ['invalid','null','true','{}','{"id":"other","ok":true,"earned":true}'])native.onmessage({data:value});
  native.onmessage({data:JSON.stringify({id:sent.id,ok:true,earned:true})});
  assert.equal((await result).earned,true);
  native.onmessage({data:JSON.stringify({id:sent.id,ok:true,earned:true})});
  const dismissed=bridge.request('show','hints');native.onmessage({data:JSON.stringify({id:sent.id,ok:true,earned:false})});assert.equal((await dismissed).earned,false);
  const failed=bridge.request('show','reveals');native.onmessage({data:JSON.stringify({id:sent.id,ok:false,error:'No fill'})});await assert.rejects(failed,/No fill/);
  const unknown=bridge.request('show','life');native.onmessage({data:JSON.stringify({id:sent.id,ok:false})});await assert.rejects(unknown,/unavailable/);
  const throwing=rewardBridge({native:{postMessage(){throw Error('closed');}},id:()=> 'request-2'});
  await assert.rejects(throwing.request('status'),/unavailable/);await assert.rejects(throwing.request('status'),/unavailable/);
  bridge.cancel();
  const cancelled=bridge.request('show','life');bridge.cancel();assert.equal(sent.operation,'cancel');
  native.onmessage({data:JSON.stringify({id:'request-1',ok:false,error:'Cancelled'})});await assert.rejects(cancelled,/Cancelled/);
  const fragileNative={postMessage(){}},fragile=rewardBridge({native:fragileNative,id:()=> 'fragile'});
  const interrupted=fragile.request('show','life');fragileNative.postMessage=()=>{throw Error('closed');};fragile.cancel();
  fragileNative.onmessage({data:'{"id":"fragile","ok":false}'});await assert.rejects(interrupted,/unavailable/);
});
