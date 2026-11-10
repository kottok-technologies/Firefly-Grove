import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreClient,permissionAllowed,consentCredential,ConsentError} from '../aws-leaderboard/src/kid-core.mjs';
import {consentService} from '../aws-leaderboard/src/kid-consent.mjs';
import {createHandler} from '../aws-leaderboard/src/service.mjs';
const id='11111111-1111-4111-8111-111111111111';
const event={headers:{'x-firefly-consent':'a'.repeat(64)}};
const allowed={sessionId:id,ageStatus:'ADULT',permissions:[{name:'leaderboard-and-rankings',enabled:true,managedBy:'PLAYER'}]};
test('Kai uses only server credentials, validates results and exact saved IDs',async()=>{
  const requests=[],responses=[{type:'challenge',status:'PENDING',challengeId:id},{status:'PENDING'},{status:'PASS',sessionId:id},allowed,{ok:true}];
  const client=createCoreClient({secret:async()=>'kgs_test_fake',fetchImpl:async(url,options)=>{requests.push({url,...options});return {ok:true,json:async()=>responses.shift()};}});
  assert.deepEqual(await client.claim('one-use'),{type:'challenge',status:'PENDING',challengeId:id});
  assert.equal(await client.resolve(id),null);
  assert.equal(await client.resolve(id),id);
  assert.deepEqual(await client.session(id),allowed);
  await client.delete(id);
  assert.equal(requests[0].url,'https://kai-api.test.k-id.com/api/v1/client/claim');
  assert.equal(requests[0].headers.Authorization,'Bearer kgs_test_fake');
  assert.deepEqual(JSON.parse(requests[0].body),{claimToken:'one-use'});
  assert.equal(requests[0].redirect,'error');
  assert(requests[1].url.endsWith('challenge/get-status?challengeId='+id));
  assert.equal(permissionAllowed(allowed,'leaderboard-and-rankings'),true);
  assert.equal(permissionAllowed(allowed,'custom-username'),false);
  assert.equal(permissionAllowed({...allowed,permissions:[...allowed.permissions,...allowed.permissions]},'leaderboard-and-rankings'),false);
  for(const p of [{enabled:false,managedBy:'PLAYER'},{enabled:true,managedBy:'PROHIBITED'},{enabled:true,managedBy:'UNKNOWN'}])
    assert.equal(permissionAllowed({...allowed,permissions:[{name:'leaderboard-and-rankings',...p}]},'leaderboard-and-rankings'),false);
  assert.equal(permissionAllowed({...allowed,ageStatus:'PROHIBITED'},'leaderboard-and-rankings'),false);
});
test('missing secret, bad claims, failed transport and mismatched provider IDs deny access',async()=>{
  await assert.rejects(createCoreClient({secret:async()=>null}).claim('token'),{status:503});
  const client=data=>createCoreClient({secret:async()=>'kgs_test_fake',fetchImpl:async()=>({ok:true,json:async()=>data})});
  await assert.rejects(client({type:'session',status:'PASS',sessionId:'forged'}).claim('token'),{status:503});
  await assert.rejects(client({sessionId:'other',permissions:[]}).session(id),{status:503});
  await assert.rejects(client({status:'PASS',sessionId:'bad'}).resolve(id),{status:503});
  await assert.rejects(client([]).claim('token'),{status:503});
  await assert.rejects(client({}).claim(''),{status:400});
  for(const method of ['session','resolve','delete'])await assert.rejects(client({})[method]('bad'));
  for(const status of [401,503]){
    const c=createCoreClient({secret:async()=>'kgs_test_fake',fetchImpl:async()=>({ok:false,status})});
    await assert.rejects(c.claim('token'),{status:status===401?409:503});
  }
  assert.throws(()=>consentCredential({headers:{}}),{status:403});
});
function fixture(){
  const records=new Map();let claimCalls=0,enabled=true,resolved=false,deleted=false;
  const store={
    consentGet:async key=>records.get(key),
    consentStart:async(key,claimHash)=>{if(records.has(key))return false;records.set(key,{claimHash,state:'processing'});return true;},
    consentClaimed:async(key,hash,result)=>{records.set(key,{claimHash:hash,state:'claimed',[result.type+'Id']:result[result.type+'Id']});},
    consentResolve:async(key,_challenge,sessionId)=>{records.get(key).sessionId=sessionId;},
    consentBind:async(key,playerId)=>{const r=records.get(key);if(r.playerId&&r.playerId!==playerId)throw new ConsentError(403,'wrong owner');r.playerId=playerId;},
    consentRemove:async key=>records.delete(key),
  };
  const provider={ensureConfigured:async()=>{},claim:async()=>{claimCalls++;return {type:'challenge',status:'PENDING',challengeId:id};},resolve:async()=>resolved?id:null,
    session:async()=>({...allowed,permissions:allowed.permissions.map(p=>({...p,enabled}))}),delete:async()=>{deleted=true;}};
  return {store,provider,service:consentService(store,{test:provider}),records,get calls(){return claimCalls;},resolve(){resolved=true;},revoke(){enabled=false;},get deleted(){return deleted;}};
}
test('claim receipts retry safely; server resolves its own challenge and checks current permission per request',async()=>{
  const f=fixture();
  await assert.rejects(f.service.signal(event),{status:403});
  await f.service.claim(event,{claimToken:'token',sessionId:'untrusted'});
  await f.service.claim(event,{claimToken:'token'});
  assert.equal(f.calls,1);
  await assert.rejects(f.service.claim(event,{claimToken:'other'}),{status:409});
  assert.deepEqual(await f.service.signal(event),{accepted:true,ready:false});
  await assert.rejects(f.service.authorize(event,['leaderboard-and-rankings'],'player'),{status:403});
  f.resolve();assert.deepEqual(await f.service.signal(event),{accepted:true,ready:true});
  await f.service.authorize(event,['leaderboard-and-rankings'],'player');
  await assert.rejects(f.service.authorize(event,['leaderboard-and-rankings'],'another'),{status:403});
  f.revoke();await assert.rejects(f.service.authorize(event,['leaderboard-and-rankings'],'player'),{status:403});
  await f.service.remove(event);assert.equal(f.deleted,true);
  await assert.rejects(f.service.signal(event),{status:403});
});
test('consent API never unlocks from client supplied IDs, absent claims, or provider failures',async()=>{
  const f=fixture();const h=createHandler({...f.store,limit:async()=>1,playerByToken:async()=>null},{consent:f.service,enforceConsent:true});
  async function call(path,input={},headers=event.headers){const r=await h({rawPath:'/api/v1/'+path,requestContext:{http:{method:'POST',sourceIp:'test'}},headers:{...headers,'content-type':'application/json'},body:JSON.stringify(input)});return r;}
  assert.equal((await call('consent/claim',{sessionId:id})).statusCode,400);
  assert.equal((await call('consent/session',{sessionId:id})).statusCode,403);
  assert.equal((await call('consent/claim',{claimToken:'token'})).statusCode,200);
  assert.equal((await call('consent/session',{sessionId:'fake'})).statusCode,200);
  assert.equal((await call('players',{name:'Test'},{})).statusCode,403);
  assert.equal((await call('players',{name:'Test'})).statusCode,403);
  assert.equal((await call('consent/unknown')).statusCode,404);
  const disabled=createHandler({limit:async()=>1});
  const result=await disabled({rawPath:'/api/v1/consent/claim',requestContext:{http:{method:'POST'}},headers:event.headers});
  assert.equal(result.statusCode,503);
});

test('server registration generates a safe name without username permission and rejects later edits',async()=>{
  const f=fixture();await f.service.claim(event,{claimToken:'token'});f.resolve();await f.service.signal(event);
  f.provider.session=async()=>({...allowed,permissions:[...allowed.permissions,{name:'public-profile',enabled:true,managedBy:'GUARDIAN'},{name:'custom-username',enabled:false,managedBy:'GUARDIAN'}]});
  let player;
  const h=createHandler({...f.store,limit:async()=>1,createPlayer:async(p,key)=>{player=p;await f.store.consentBind(key,p.id);},playerByToken:async()=>player},{consent:f.service});
  async function call(path,method,input,extra={}){return h({rawPath:'/api/v1/'+path,requestContext:{http:{method,sourceIp:'test'}},headers:{...event.headers,'content-type':'application/json',...extra},body:JSON.stringify(input)});}
  const registered=await call('players','POST',{name:'Do not publish'});
  assert.equal(registered.statusCode,201);
  assert.match(JSON.parse(registered.body).name,/^Firefly[a-f0-9]{8}$/);
  const renamed=await call('profile','PUT',{name:'Another'},{authorization:'Bearer '+'b'.repeat(64)});
  assert.equal(renamed.statusCode,403);
  assert.match(JSON.parse(renamed.body).error,/feature is off/);
});

test('live claims use the live host and never send a test secret',async()=>{
  const requests=[];
  const fetchImpl=async(url,options)=>{
    requests.push([url,options.headers.Authorization]);
    return {ok:true,json:async()=>({type:'session',status:'PASS',sessionId:id})};
  };
  const wrong=createCoreClient({environment:'live',secret:async()=>'kgs_test_fake',fetchImpl});
  await assert.rejects(wrong.claim('token'),{status:503});
  assert.deepEqual(requests,[]);
  const live=createCoreClient({environment:'live',secret:async()=>'kgs_live_fake',fetchImpl});
  assert.equal((await live.claim('token')).sessionId,id);
  assert.deepEqual(requests,[['https://kai-api.k-id.com/api/v1/client/claim','Bearer kgs_live_fake']]);
});

test('live proof cannot reuse a test receipt, and production enforcement requires live consent',async()=>{
  const f=fixture();
  const liveEvent={headers:{'x-firefly-consent':'live.'+'a'.repeat(64)}};
  const calls=[];
  const live={
    ensureConfigured:async()=>{},
    claim:async token=>{calls.push(token);return {type:'session',status:'PASS',sessionId:id};},
    session:async()=>({...allowed,permissions:[...allowed.permissions,{name:'public-profile',enabled:true,managedBy:'PLAYER'}]}),
  };
  const consent=consentService(f.store,{test:f.provider,live});
  await consent.claim(event,{claimToken:'test-token'});
  await assert.rejects(consent.signal(liveEvent),{status:403});
  const handler=createHandler({...f.store,limit:async()=>1,board:async()=>({entries:[]})},{consent,enforceConsent:true});
  const rankings=headers=>handler({rawPath:'/api/v1/leaderboard',requestContext:{http:{method:'GET'}},headers});
  assert.equal((await rankings(event.headers)).statusCode,403);
  assert.equal((await rankings(liveEvent.headers)).statusCode,403);
  assert.equal((await rankings({})).statusCode,403);
  await consent.claim(liveEvent,{claimToken:'live-token'});
  assert.deepEqual(calls,['live-token']);
  assert.deepEqual(await consent.signal(liveEvent),{accepted:true,ready:true});
  assert.equal((await rankings(liveEvent.headers)).statusCode,200);
  assert.equal(f.records.size,2);
});

test('a missing live secret does not reserve a claim receipt',async()=>{
  const f=fixture();
  const liveEvent={headers:{'x-firefly-consent':'live.'+'b'.repeat(64)}};
  const consent=consentService(f.store,{live:createCoreClient({environment:'live',secret:async()=>null})});
  await assert.rejects(consent.claim(liveEvent,{claimToken:'live-token'}),{status:503});
  assert.equal(f.records.size,0);
});

test('server environment provides separate live and test Kai keys', async context => {
  for (const [name, value] of Object.entries({KID_SECRET_KEY: 'kgs_live_fake', KID_TEST_SECRET_KEY: 'kgs_test_fake'})) {
    const previous = process.env[name];
    process.env[name] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push([url, options.headers.Authorization, options.method]);
    return {ok: true, json: async () => url.includes('get-status') ? {status: 'PASS', sessionId: id} : allowed};
  };
  const live = createCoreClient({environment: 'live', fetchImpl});
  const development = createCoreClient({fetchImpl});
  assert.equal(await live.resolve(id), id);
  assert.deepEqual(await live.session(id), allowed);
  await live.delete(id);
  await development.session(id);
  assert.deepEqual(requests, [
    ['https://kai-api.k-id.com/api/v1/challenge/get-status?challengeId='+id, 'Bearer kgs_live_fake', 'GET'],
    ['https://kai-api.k-id.com/api/v1/session/get?sessionId='+id, 'Bearer kgs_live_fake', 'GET'],
    ['https://kai-api.k-id.com/api/v1/session/delete', 'Bearer kgs_live_fake', 'POST'],
    ['https://kai-api.test.k-id.com/api/v1/session/get?sessionId='+id, 'Bearer kgs_test_fake', 'GET'],
  ]);
});
