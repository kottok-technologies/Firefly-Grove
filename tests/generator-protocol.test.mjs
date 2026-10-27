import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGeneratorMessage} from '../web/generator-protocol.js';
const origin='https://appassets.androidplatform.net';
test('generator accepts its dedicated channel or creator origin and rejects other origins',()=>{
  for(const sender of ['',origin])assert.deepEqual(validateGeneratorMessage({origin:sender,data:{level:1,seed:0}},origin),{mode:'journey',level:1,seed:0});
  for(const sender of ['https://evil.example',origin+'.evil.example','null',undefined])assert.equal(validateGeneratorMessage({origin:sender,data:{level:1,seed:0}},origin),null);
  assert.deepEqual(validateGeneratorMessage({origin:'',data:{mode:'daily',day:'2026-10-27'}},origin),{mode:'daily',day:'2026-10-27'});
});
test('generator rejects malformed messages and invalid levels, dates or seeds',()=>{
  for(const data of [null,[],{},'bad',{mode:'other',level:1,seed:1},{level:-1,seed:1},{level:1.5,seed:1},{level:1,seed:-1},{level:1,seed:2**32},{mode:'daily',day:'<script>'}])assert.equal(validateGeneratorMessage({origin:'',data},origin),null);
});
