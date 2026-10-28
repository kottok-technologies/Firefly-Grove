import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,hash,normalizeName,validateFinds} from '../aws-leaderboard/src/service.mjs';
import {createDailyGame} from '../web/daily.js';
import {createGame,isTarget} from '../web/engine.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

const day='2026-10-27',finds=createDailyGame(day).solution.map((column,row)=>row*8+column);
function fixture(){
  let now=Date.parse(day+'T12:00:00Z');
  const players=new Map(),tokens=new Map(),runs=new Map(),active=new Map(),scores=new Map(),limits=new Map(),heartReceipts=new Map(),heartScores=new Map();
  const store={
    async finishJourney(score){const key=score.playerId+':'+score.level;if(heartReceipts.has(key))return {credited:false};heartReceipts.set(key,score);const dayKey=score.day+score.playerId,previous=heartScores.get(dayKey);heartScores.set(dayKey,{...score,hearts:(previous?.hearts||0)+score.hearts,levels:(previous?.levels||0)+1});return {credited:true,hearts:score.hearts};},
    async heartsBoard(date,id){let rank=1;const ranked=[...heartScores.values()].filter(row=>row.day===date).sort((a,b)=>b.hearts-a.hearts||a.playerId.localeCompare(b.playerId));const entries=ranked.map((row,index)=>{if(index&&row.hearts!==ranked[index-1].hearts)rank=index+1;return {rank,name:players.get(row.playerId).name,hearts:row.hearts,levels:row.levels,isYou:row.playerId===id};});return {day:date,total:entries.length,entries:entries.slice(0,50),mine:entries.find(entry=>entry.isYou)||null};},
    async createPlayer(p){players.set(p.id,p);tokens.set(p.tokenHash,p.id);},
    async playerByToken(token){return players.get(tokens.get(token))||null;},
    async rename(id,name){players.get(id).name=name;},
    async limit(key,_maximum,period,time){const bucket=key+Math.floor(time/period),count=(limits.get(bucket)||0)+1;limits.set(bucket,count);return count;},
    async startRun(run){runs.set(run.id,{...run});active.set(run.playerId,run.id);},
    async getRun(player,id){const run=runs.get(id);return !run||run.playerId!==player?null:run.status==='active'&&active.get(player)!==id?{...run,status:'retired'}:{...run};},
    async finishRun(run){const previous=runs.get(run.id);if(previous.status==='finished')return previous;runs.set(run.id,{...run});const key=run.day+run.playerId,best=scores.get(key);if(!best||run.elapsedMs<best.elapsedMs||(run.elapsedMs===best.elapsedMs&&run.mistakes<best.mistakes))scores.set(key,run);return run;},
    async board(date,id){const ranked=[...scores.values()].filter(row=>row.day===date).sort((a,b)=>a.elapsedMs-b.elapsedMs||a.mistakes-b.mistakes||a.finishedAt-b.finishedAt||a.playerId.localeCompare(b.playerId)).map((row,index)=>({rank:index+1,name:players.get(row.playerId).name,tag:row.playerId.slice(0,4).toUpperCase(),elapsedMs:row.elapsedMs,mistakes:row.mistakes,isYou:row.playerId===id}));return {day:date,total:ranked.length,entries:ranked.slice(0,50),mine:ranked.find(row=>row.isYou)||null};}
  };
  const handler=createHandler(store,{now:()=>now});
  return {store,advance(ms){now+=ms;},async call(path,{body,player,method=body?'POST':'GET',headers={},...event}={}){
    const url=new URL('https://test.invalid/api/v1/'+path),response=await handler({rawPath:url.pathname,queryStringParameters:Object.fromEntries(url.searchParams),requestContext:{http:{method,sourceIp:'192.0.2.1'}},headers:{...(body?{'content-type':'application/json'}:{}),...(player?{authorization:'Bearer '+player.token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),...event});return {...response,data:response.body?JSON.parse(response.body):null};
  }};
}
async function register(f,name='Amber'){const result=await f.call('players',{body:{name}});assert.equal(result.statusCode,201);return result.data;}
const start=(f,player)=>f.call('runs',{player,body:{day,version:'speed-v1'}});

test('AWS API authenticates profiles, normalizes nicknames and supports renames',async()=>{
  const f=fixture(),player=await register(f,'  Little   Light ');assert.equal(player.name,'Little Light');assert.equal(player.token.length,64);assert.notEqual(hash(player.token),player.token);
  assert.equal((await f.call('profile')).statusCode,401);
  assert.equal((await f.call('profile',{headers:{Authorization:'Bearer bad'}})).statusCode,401);
  assert.equal((await f.call('profile',{player})).data.name,'Little Light');
  assert.equal((await f.call('profile',{method:'PUT',player,body:{name:'Birch'}})).data.name,'Birch');
  assert.equal((await f.call('profile',{headers:{Authorization:'Bearer '+player.token}})).data.name,'Birch');
  for(const name of [null,'x','<script>'])assert.throws(()=>normalizeName(name));
  assert.equal((await f.call('players',{body:{name:'<script>'}})).statusCode,400);
});
test('AWS finish uses server time, enforces ownership and retries idempotently',async()=>{
  const f=fixture(),a=await register(f),b=await register(f,'Birch'),run=(await start(f,a)).data;f.advance(20000);
  assert.equal((await f.call('finish',{player:b,body:{runId:run.id,finds}})).statusCode,404);
  assert.equal((await f.call('finish',{player:a,body:{runId:run.id,finds:finds.slice(1)}})).statusCode,400);
  const finish=()=>f.call('finish',{player:a,body:{runId:run.id,finds,elapsedMs:1}});
  const result=await finish();assert.equal(result.statusCode,200);assert.equal(result.data.elapsedMs,20000);assert.equal(result.data.mine.rank,1);
  f.advance(5000);assert.equal((await finish()).data.elapsedMs,20000);
  const next=(await start(f,a)).data;f.advance(30000);await f.call('finish',{player:a,body:{runId:next.id,finds}});
  const board=(await f.call('leaderboard?day='+day,{player:a})).data;assert.equal(board.total,1);assert.equal(board.mine.elapsedMs,20000);
});
test('AWS run replacement, expiry, malformed input and request limits are enforced',async()=>{
  const f=fixture(),player=await register(f),first=(await start(f,player)).data;await start(f,player);f.advance(1000);
  assert.equal((await f.call('finish',{player,body:{runId:first.id,finds}})).statusCode,409);
  const fresh=(await start(f,player)).data;f.advance(37*3600000);
  assert.equal((await f.call('finish',{player,body:{runId:fresh.id,finds}})).statusCode,409);
  assert.equal((await f.call('runs',{player,body:{day,version:'old'}})).statusCode,409);
  assert.equal((await f.call('finish',{player,body:{runId:1}})).statusCode,400);
  assert.equal((await f.call('players',{body:{name:'x'.repeat(9000)}})).statusCode,413);
  assert.equal((await f.call('players',{body:'bad',headers:{'content-type':'text/plain'}})).statusCode,415);
  assert.equal((await f.call('players',{body:{},isBase64Encoded:true,bodyRaw:'bad',...{body:'%%%'}})).statusCode,400);
  for(let index=0;index<10;index++)await f.call('players',{body:{name:'Firefly'}});
  assert.equal((await f.call('players',{body:{name:'Firefly'}})).statusCode,429);
});
test('AWS validation rejects illegal solutions and handles dates, CORS and failures',async()=>{
  const f=fixture();assert.equal(validateFinds(day,finds),0);
  const wrong=Array.from({length:64},(_,i)=>i).filter(i=>!finds.includes(i));assert.equal(validateFinds(day,[wrong[0],...finds]),1);
  for(const moves of [[],[...finds,wrong[0]],[...finds.slice(0,7),finds[0]],[99,...finds],[-1,...finds],[...wrong.slice(0,3),...finds]])assert.throws(()=>validateFinds(day,moves));
  assert.equal((await f.call('leaderboard?day=2026-02-30')).statusCode,400);assert.equal((await f.call('leaderboard?day=2026-10-28')).statusCode,400);assert.equal((await f.call('leaderboard?day=2026-01-01')).statusCode,400);
  const health=await f.call('health');assert.equal(health.data.provider,'aws');assert.equal(health.headers['access-control-allow-origin'],'*');assert.equal((await f.call('health',{method:'OPTIONS'})).statusCode,204);
  const player=await register(f);assert.equal((await f.call('unknown',{player})).statusCode,404);
  f.store.board=async()=>{throw new Error('sensitive internal detail');};const failed=await f.call('leaderboard');assert.equal(failed.statusCode,503);assert.doesNotMatch(failed.body,/sensitive/);
});

const journey=(level=1,mistakes=0,seed=42)=>{
  const game=createGame(level,seed),wrong=game.marks.findIndex((_,i)=>!isTarget(game,i));
  const targets=game.marks.flatMap((mark,i)=>mark!==2&&isTarget(game,i)?[i]:[]);
  return {version:game.generation,day,level,seed,finds:[...Array(mistakes).fill(wrong),...targets]};
};
test('journey completion derives hearts from replay, including reveals and valid revives',()=>{
  for(const level of [1,4,7,13,23,33])for(let mistakes=0;mistakes<3;mistakes++)assert.equal(validateJourneyCompletion(journey(level,mistakes)).hearts,3-mistakes);
  const revived=journey(),wrong=createGame(1,42).marks.findIndex((_,i)=>!isTarget(createGame(1,42),i));
  revived.finds=[wrong,wrong,wrong,-1,...revived.finds];assert.equal(validateJourneyCompletion(revived).hearts,1);
  for(const value of [{level:0},{level:1000001},{level:1.5},{seed:-1},{seed:2**32},{version:'old'},{finds:null},{finds:[]},{finds:Array(513).fill(0)},{finds:[-2]},{finds:[1000]},{finds:[1.1]},{finds:[-1]}, {finds:[wrong,wrong,wrong,...journey().finds]}, {finds:[...journey().finds,wrong]}, {finds:[journey().finds[0]]}, {finds:[journey().finds[0],journey().finds[0]]}])assert.throws(()=>validateJourneyCompletion({...journey(),...value}));
});
test('daily journey hearts add once per level, share ranks on ties, and reset at UTC midnight',async()=>{
  const f=fixture(),a=await register(f,'Amber'),b=await register(f,'Birch');
  assert.equal((await f.call('journey/finish',{body:journey()})).statusCode,401);
  const finish=(player,body)=>f.call('journey/finish',{player,body});
  let result=await finish(a,{...journey(1,1),hearts:999});assert.equal(result.data.hearts,2);assert.equal(result.data.mine.hearts,2);
  assert.equal((await finish(a,journey(1))).data.credited,false);
  await finish(a,journey(2));await finish(b,journey(1));await finish(b,journey(2,1));
  let board=(await f.call('hearts',{player:a})).data;
  assert.deepEqual(board.entries.map(entry=>entry.rank),[1,1]);assert.equal(board.mine.hearts,5);assert.equal(board.mine.levels,2);
  await f.call('profile',{method:'PUT',player:a,body:{name:'Fern'}});assert.equal((await f.call('hearts',{player:a})).data.mine.name,'Fern');
  assert.equal((await f.call('hearts?day=2026-10-28')).statusCode,400);
  assert.equal((await finish(a,{...journey(),day:'2026-10-26'})).statusCode,410);
  assert.equal((await finish(a,{...journey(),finds:[]})).statusCode,400);
  f.advance(24*3600000);assert.equal((await f.call('hearts')).data.total,0);
  assert.equal((await finish(a,{...journey(),day:'2026-10-28'})).data.credited,false,'replaying a level on a later day gives no extra hearts');
  await finish(a,{...journey(3),day:'2026-10-28'});board=(await f.call('hearts',{player:a})).data;
  assert.equal(board.mine.hearts,3);assert.equal(board.mine.levels,1);
  assert.equal((await f.call('hearts?day='+day,{player:a})).data.mine.hearts,5);
});
