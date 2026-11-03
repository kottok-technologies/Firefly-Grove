// Local-only performance fixture. Never accepts an AWS endpoint or credentials.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {DynamoStore,rankKey} from '../aws-leaderboard/src/dynamo-store.mjs';
const require=createRequire(new URL('../aws-leaderboard/package.json',import.meta.url));
const {DynamoDBClient,CreateTableCommand,DeleteTableCommand,waitUntilTableExists}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,BatchWriteCommand}=require('@aws-sdk/lib-dynamodb');
const endpoint=new URL(process.env.DYNAMODB_ENDPOINT||'http://127.0.0.1:8000');
assert.ok(['localhost','127.0.0.1'].includes(endpoint.hostname)&&endpoint.protocol==='http:'&&!endpoint.username&&!endpoint.password&&endpoint.pathname==='/'&&!endpoint.search&&!endpoint.hash,'Benchmark requires a local-only DynamoDB endpoint');
const players=Number(process.argv[2]||100000);
assert.ok(Number.isInteger(players)&&players>=1001&&players<=200000,'Choose 1001–200000 players per board');
const client=new DynamoDBClient({endpoint:endpoint.href,region:'us-east-1',credentials:{accessKeyId:'LOCALTESTONLY',secretAccessKey:'LOCALTESTONLY'}}),document=DynamoDBDocumentClient.from(client);
const table='firefly-benchmark-'+randomUUID(),day='2026-11-01',target='benchmark-player';
const score={playerId:target,day,elapsedMs:players+2000,mistakes:0,finishedAt:1};score.rankKey=rankKey(score);
const heartRank=hearts=>'HEARTS#'+String(9999999999-hearts).padStart(10,'0');
function* items(){
  for(let i=0;i<players;i++){
    const id='player-'+String(i).padStart(6,'0'),speed={playerId:id,day,elapsedMs:1000+i,mistakes:0,finishedAt:1};speed.rankKey=rankKey(speed);
    yield {pk:'DAY#'+day,sk:speed.rankKey,...speed};
    yield {pk:'HEARTDAY#'+day,sk:heartRank(players-i)+'#'+id,playerId:id,day,hearts:players-i,levels:1};
    if(i<50)yield {pk:'PLAYER#'+id,sk:'PROFILE',id,name:'Benchmark '+i};
  }
  yield {pk:'DAY#'+day,sk:score.rankKey,...score};
  yield {pk:'DAY#'+day,sk:'PLAYER#'+target,...score};
  yield {pk:'HEARTDAY#'+day,sk:heartRank(0)+'#'+target,playerId:target,day,hearts:0,levels:1};
  yield {pk:'HEARTDAY#'+day,sk:'PLAYER#'+target,playerId:target,day,hearts:0,levels:1};
  yield {pk:'PLAYER#'+target,sk:'PROFILE',id:target,name:'Benchmark target'};
  for(const prefix of ['DAY#','HEARTDAY#'])yield {pk:prefix+day,sk:'META',count:players+1};
}
let created=false;
try{
  await client.send(new CreateTableCommand({TableName:table,BillingMode:'PAY_PER_REQUEST',AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'},{AttributeName:'sk',AttributeType:'S'}],KeySchema:[{AttributeName:'pk',KeyType:'HASH'},{AttributeName:'sk',KeyType:'RANGE'}]}));created=true;
  await waitUntilTableExists({client,maxWaitTime:30},{TableName:table});
  const source=items();let seeded=0;
  const started=performance.now();
  await Promise.all(Array.from({length:8},async()=>{
    for(;;){
      let requests=[];for(let i=0;i<25;i++){const next=source.next();if(next.done)break;requests.push({PutRequest:{Item:next.value}});}
      if(!requests.length)return;
      const count=requests.length;
      for(let retry=0;requests.length;retry++){
        if(retry>=10)throw Error('Local seed throttled repeatedly');
        const result=await document.send(new BatchWriteCommand({RequestItems:{[table]:requests}}));requests=result.UnprocessedItems?.[table]||[];
        if(requests.length)await new Promise(resolve=>setTimeout(resolve,20*(retry+1)));
      }
      seeded+=count;if(seeded%20000===0)console.log('Seeded '+seeded+' local rows');
    }
  }));
  const report={playersPerBoard:players+1,rows:seeded,seedMs:Math.round(performance.now()-started),scenarios:[]};
  let queries=[];
  const store=new DynamoStore(table,{send:async command=>{const result=await document.send(command);if(command.constructor.name==='QueryCommand')queries.push({limit:command.input.Limit,evaluated:result.ScannedCount||0});return result;}});
  async function measure(name,work,maxRows){
    queries=[];const begin=performance.now();await work();
    const evaluated=queries.reduce((total,item)=>total+item.evaluated,0);
    assert.ok(evaluated<=maxRows,name+' exceeded its query budget');
    assert.ok(queries.every(item=>Number.isInteger(item.limit)&&item.limit<=1001),'Every query must be bounded');
    report.scenarios.push({name,ms:Math.round(performance.now()-begin),queries:queries.length,evaluated,maxRows});
  }
  await measure('speed reward rejection',async()=>assert.equal(await store.placementRank('speed',day,target),null),11);
  await measure('hearts reward rejection',async()=>assert.equal(await store.placementRank('hearts',day,target),null),10);
  await measure('speed completion summary',async()=>assert.equal((await store.standing('speed',day,target)).mine.rank,'1,000+'),1001);
  await measure('hearts completion summary',async()=>assert.equal((await store.standing('hearts',day,target)).mine.rank,'1,000+'),1000);
  for(const board of ['speed','hearts']){
    await measure(board+' 50 concurrent board reads',async()=>{
      const boards=await Promise.all(Array.from({length:50},()=>board==='speed'?store.board(day,target):store.heartsBoard(day,target)));
      assert.ok(boards.every(result=>result.entries.length===50&&result.mine.rank==='1,000+'));
    },50+50*(board==='speed'?1001:1000));
  }
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await writeFile(new URL('../artifacts/leaderboard-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{if(created)await client.send(new DeleteTableCommand({TableName:table}));client.destroy();}
