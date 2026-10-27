import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {DynamoStore,rankKey,improves} from '../aws-leaderboard/src/dynamo-store.mjs';
import {hash} from '../aws-leaderboard/src/service.mjs';

const endpoint=process.env.DYNAMODB_ENDPOINT;
const require=createRequire(new URL('../aws-leaderboard/package.json',import.meta.url));
const {DynamoDBClient,CreateTableCommand,DeleteTableCommand,waitUntilTableExists}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,PutCommand}=require('@aws-sdk/lib-dynamodb');
test('DynamoDB transactions preserve one best score through retries and concurrent finishes',{skip:!endpoint,timeout:90000},async()=>{
  const url=new URL(endpoint);assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Integration tests may only use local DynamoDB');
  const client=new DynamoDBClient({endpoint,region:'us-east-1',credentials:{accessKeyId:'LOCALTESTONLY',secretAccessKey:'LOCALTESTONLY'}}),document=DynamoDBDocumentClient.from(client),table='firefly-ci-'+randomUUID();
  await client.send(new CreateTableCommand({TableName:table,BillingMode:'PAY_PER_REQUEST',AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'},{AttributeName:'sk',AttributeType:'S'}],KeySchema:[{AttributeName:'pk',KeyType:'HASH'},{AttributeName:'sk',KeyType:'RANGE'}]}));
  try{
    await waitUntilTableExists({client,maxWaitTime:30},{TableName:table});const store=new DynamoStore(table,document),day='2026-10-27';
    const player={id:randomUUID(),name:'Amber',tokenHash:hash('test-token'),createdAt:1};await store.createPlayer(player);
    assert.equal((await store.playerByToken(player.tokenHash)).name,'Amber');assert.equal(await store.playerByToken('missing'),null);
    await store.rename(player.id,'Birch');assert.equal((await store.playerByToken(player.tokenHash)).name,'Birch');
    assert.equal(await store.limit('test',2,60000,1000),1);assert.equal(await store.limit('test',2,60000,1000),2);
    const makeRun=()=>({id:randomUUID(),playerId:player.id,day,version:'speed-v1',status:'active',startedAt:1000});
    const finish=(run,elapsedMs,mistakes=0)=>({...run,status:'finished',finishedAt:1000+elapsedMs,elapsedMs,mistakes});
    const replaced=makeRun(),first=makeRun();await store.startRun(replaced);await store.startRun(first);assert.equal((await store.getRun(player.id,replaced.id)).status,'retired');assert.equal(await store.getRun(player.id,'missing'),null);
    await assert.rejects(store.finishRun(finish(replaced,500)),/replaced/);
    const results=await Promise.all([store.finishRun(finish(first,10000,1)),store.finishRun(finish(first,11000,1))]);assert.equal(results[0].elapsedMs,results[1].elapsedMs);
    let board=await store.board(day,player.id);assert.equal(board.total,1);assert.equal(board.mine.rank,1);assert.equal(board.mine.name,'Birch');
    const best=board.mine.elapsedMs,slower=makeRun();await store.startRun(slower);await store.finishRun(finish(slower,20000));assert.equal((await store.board(day,player.id)).mine.elapsedMs,best);
    const faster=makeRun();await store.startRun(faster);await store.finishRun(finish(faster,5000));board=await store.board(day,player.id);assert.equal(board.total,1);assert.equal(board.mine.elapsedMs,5000);
    const top=[];
    for(let index=0;index<52;index++){
      const id=randomUUID(),score={playerId:id,day,elapsedMs:1000+index,mistakes:0,finishedAt:2000+index};
      top.push({pk:'DAY#'+day,sk:rankKey(score),...score});
      await document.send(new PutCommand({TableName:table,Item:{pk:'PLAYER#'+id,sk:'PROFILE',id,name:'Firefly '+index}}));
    }
    for(const row of top)await document.send(new PutCommand({TableName:table,Item:row}));
    await document.send(new PutCommand({TableName:table,Item:{pk:'DAY#'+day,sk:'META',count:53}}));
    board=await store.board(day,player.id);assert.equal(board.entries.length,50);assert.equal(board.mine.rank,53);assert.equal(board.total,53);
    assert.equal((await store.queryAll({KeyConditionExpression:'pk=:day',ExpressionAttributeValues:{':day':'DAY#'+day}})).length,55);
    assert.equal((await store.board('2026-10-26')).total,0);
    assert.ok(improves({elapsedMs:100,mistakes:0},{elapsedMs:100,mistakes:1}));assert.ok(rankKey({elapsedMs:9,mistakes:0,finishedAt:1,playerId:'a'})<rankKey({elapsedMs:10,mistakes:0,finishedAt:1,playerId:'a'}));
  }finally{await client.send(new DeleteTableCommand({TableName:table}));client.destroy();}
});
