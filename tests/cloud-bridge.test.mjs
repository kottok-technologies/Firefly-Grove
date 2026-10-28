import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudBridge} from '../web/cloud-bridge.js';

test('native cloud replies are correlated, bounded in time, and never evaluated as code',async()=>{
  const sent=[],timers=new Map();let count=0;
  const native={postMessage:text=>sent.push(JSON.parse(text))};
  const bridge=cloudBridge({native,id:()=>`id-${++count}`,setTimer:cb=>{timers.set(count,cb);return count;},clearTimer:id=>timers.delete(id)});
  assert.equal(cloudBridge({native:null}),null);assert.equal(cloudBridge({native:{}}),null);
  const first=bridge.request('status'),second=bridge.request('read',{interactive:true});
  native.onmessage({data:'bad'});native.onmessage({data:JSON.stringify({id:'unknown',ok:true})});
  native.onmessage({data:JSON.stringify({id:sent[1].id,ok:true,available:true})});assert.equal((await second).available,true);
  native.onmessage({data:JSON.stringify({id:sent[0].id,ok:true,enabled:false})});assert.equal((await first).enabled,false);assert.equal(timers.size,0);
  const failed=bridge.request('read');const rejected=assert.rejects(failed,error=>error.message==='Cancelled'&&error.enabled===false);
  native.onmessage({data:JSON.stringify({id:sent.at(-1).id,ok:false,error:'Cancelled',enabled:false})});await rejected;
  const timed=bridge.request('status'),timeout=assert.rejects(timed,/did not respond/);[...timers.values()][0]();await timeout;
  assert.equal(sent.at(-1).operation,'cancel');
  native.onmessage({data:JSON.stringify({id:sent.at(-2).id,ok:true})});
  await assert.rejects(cloudBridge({native:{postMessage(){throw Error('closed');}}}).request('status'),/unavailable/);
  const generic=bridge.request('read'),genericError=assert.rejects(generic,/could not complete/);native.onmessage({data:JSON.stringify({id:sent.at(-1).id,ok:false})});await genericError;
});
