import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createKidClient,kidFeatureAllowed,validKidWebhook} from '../aws-leaderboard/src/kid-client.mjs';
const widgetId='11111111-1111-1111-1111-111111111111',sessionId='22222222-2222-2222-2222-222222222222';
const permission={name:'online-rankings',enabled:true,managedBy:'GUARDIAN'};
const response=data=>({ok:true,text:async()=>JSON.stringify(data)});

test('k-ID adapter uses fixed server endpoints, strips sensitive fields and checks permissions',async()=>{
  const calls=[],answers=[{widgetId,url:'https://family.test.k-id.com/widget?token=opaque'},
    {status:'PASS',sessionId},{sessionId,status:'ACTIVE',dateOfBirth:'2018-01-01',parentEmail:'private@example.com',permissions:[permission]}];
  const client=createKidClient({apiKey:'server-test-key',fetchImpl:async(url,options)=>{calls.push({url,options});return response(answers.shift());}});
  assert.deepEqual(await client.start('US-CA'),{widgetId,url:'https://family.test.k-id.com/widget?token=opaque'});
  assert.deepEqual(JSON.parse(calls[0].options.body),{jurisdiction:'US-CA'});assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers.Authorization,'Bearer server-test-key');assert.ok(calls[0].url.startsWith('https://game-api.test.k-id.com/api/v1/'));
  assert.deepEqual(await client.widget(widgetId),{status:'PASS',sessionId});
  const session=await client.session(sessionId);assert.deepEqual(session,{sessionId,status:'ACTIVE',permissions:[permission]});
  assert.equal(kidFeatureAllowed(session,'online-rankings'),true);assert.equal(kidFeatureAllowed(session,'cloud-saves'),false);
  assert.equal(kidFeatureAllowed({...session,status:'REVOKED'},'online-rankings'),false);
  assert.equal(kidFeatureAllowed({...session,permissions:[{...permission,managedBy:'PROHIBITED'}]},'online-rankings'),false);
  assert.equal(kidFeatureAllowed({...session,permissions:[{...permission,enabled:false}]},'online-rankings'),false);
  assert.equal(kidFeatureAllowed(null,'online-rankings'),false);assert.equal(kidFeatureAllowed(session,''),false);
  assert.equal(kidFeatureAllowed({status:'ACTIVE'},'online-rankings'),false);
  assert.equal(kidFeatureAllowed({...session,permissions:[null,{...permission,managedBy:'unknown'}]},'online-rankings'),false);
  const production=createKidClient({apiKey:'key',environment:'production',fetchImpl:async(url)=>{assert.ok(url.startsWith('https://game-api.k-id.com/'));return response({widgetId,url:'https://family.k-id.com/widget?token=opaque'});}});
  await production.start('GB');
});

test('k-ID refuses redirects, malformed responses, unknown states and forged host/session values',async()=>{
  for(const options of [{},{apiKey:' '},{apiKey:'bad\nkey'},{apiKey:'key',environment:'http://other.test'}])assert.throws(()=>createKidClient(options));
  const clientFor=data=>createKidClient({apiKey:'key',fetchImpl:async()=>response(data)});
  await assert.rejects(clientFor({}).start('us-ca'),/country or region/);
  for(const url of ['http://family.test.k-id.com/widget','https://family.test.k-id.com.evil.example/widget','https://user:pass@family.test.k-id.com/widget','https://family.test.k-id.com:444/widget','https://family.test.k-id.com/other','https://family.test.k-id.com/widget#other','not a URL'])await assert.rejects(clientFor({widgetId,url}).start('US-CA'));
  await assert.rejects(clientFor({widgetId:'bad',url:'https://family.test.k-id.com/widget'}).start('US-CA'));
  for(const operation of ['widget','session'])await assert.rejects(clientFor({})[operation]('not-an-id'));
  for(const status of ['PENDING','IN_CHALLENGE','FAILED','PROHIBITED','EXPIRED','NOT_FOUND'])assert.deepEqual(await clientFor({status}).widget(widgetId),{status});
  for(const data of [{status:'invented'},{status:'PASS',sessionId:'bad'}])await assert.rejects(clientFor(data).widget(widgetId));
  for(const data of [{sessionId:'wrong',permissions:[]},{sessionId,permissions:null},{sessionId,permissions:Array(201).fill(permission)},
    {sessionId,permissions:[null]},{sessionId,permissions:[{...permission,enabled:'true'}]},
    {sessionId,permissions:[{...permission,managedBy:'unknown'}]},{sessionId,permissions:[permission,permission]}])await assert.rejects(clientFor(data).session(sessionId));
  assert.equal((await clientFor({sessionId,status:'REVOKED',permissions:[]}).session(sessionId)).status,'RESTRICTED');
  for(const result of [{ok:false},{ok:true,text:async()=>'{bad'},response(null),response([]),{ok:true,text:async()=>'x'.repeat(262145)}]){
    const client=createKidClient({apiKey:'key',fetchImpl:async()=>result});await assert.rejects(client.widget(widgetId),/unavailable/);
  }
  await assert.rejects(createKidClient({apiKey:'key',fetchImpl:async()=>{throw Error('PRIVATE provider details');}}).widget(widgetId),error=>!error.message.includes('PRIVATE'));
});

test('k-ID webhook authentication checks raw bytes, freshness and exact signatures',()=>{
  const rawBody=Buffer.from('{ "eventType": "Session.Delete" }'),timestamp='1793390400',secret='test-webhook-secret-only',now=Number(timestamp)*1000;
  const signature=createHmac('sha256',secret).update(timestamp).update(rawBody).digest('hex');
  const input={rawBody,timestamp,signature,secret,now};assert.equal(validKidWebhook(input),true);
  for(const change of [{rawBody:Buffer.from('{}')},{rawBody:'text'},{rawBody:Buffer.alloc(262145)},{timestamp:'bad'},{signature:'bad'},
    {signature:'0'.repeat(64)},{secret:'short'},{now:now+300001},{now:now-300001},{now:NaN}])assert.equal(validKidWebhook({...input,...change}),false);
  assert.equal(validKidWebhook(),false);
});
