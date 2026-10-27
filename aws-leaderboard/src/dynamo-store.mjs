import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,UpdateCommand,TransactWriteCommand,QueryCommand,BatchGetCommand} from '@aws-sdk/lib-dynamodb';
import {ApiError} from './service.mjs';
export const rankKey=score=>'SCORE#'+String(score.elapsedMs).padStart(12,'0')+'#'+score.mistakes+'#'+String(score.finishedAt).padStart(15,'0')+'#'+score.playerId;
export const improves=(next,previous)=>!previous||next.elapsedMs<previous.elapsedMs||(next.elapsedMs===previous.elapsedMs&&next.mistakes<previous.mistakes);
const playerKey=id=>({pk:'PLAYER#'+id,sk:'PROFILE'});
const runKey=(playerId,id)=>({pk:'PLAYER#'+playerId,sk:'RUN#'+id});
const activeKey=id=>({pk:'PLAYER#'+id,sk:'ACTIVE'});
const bestKey=(day,id)=>({pk:'DAY#'+day,sk:'PLAYER#'+id});
const expiry=day=>Math.floor(Date.parse(day+'T00:00:00Z')/1000)+92*86400;
const heartPartition=day=>'HEARTDAY#'+day;
const heartPlayerKey=(day,id)=>({pk:heartPartition(day),sk:'PLAYER#'+id});
const heartPrefix=hearts=>'HEARTS#'+String(9999999999-hearts).padStart(10,'0');
const heartRankKey=(hearts,id)=>heartPrefix(hearts)+'#'+id;
export class DynamoStore{
  constructor(tableName,client=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}})){this.tableName=tableName;this.client=client;}
  send(Command,input){return this.client.send(new Command({TableName:this.tableName,...input}));}
  async get(Key){return (await this.send(GetCommand,{Key,ConsistentRead:true})).Item||null;}
  async playerByToken(tokenHash){const auth=await this.get({pk:'TOKEN#'+tokenHash,sk:'AUTH'});return auth?this.get(playerKey(auth.playerId)):null;}
  async createPlayer(player){
    const {tokenHash,...profile}=player;
    await this.send(TransactWriteCommand,{TransactItems:[
      {Put:{TableName:this.tableName,Item:{...playerKey(player.id),...profile},ConditionExpression:'attribute_not_exists(pk)'}},
      {Put:{TableName:this.tableName,Item:{pk:'TOKEN#'+tokenHash,sk:'AUTH',playerId:player.id},ConditionExpression:'attribute_not_exists(pk)'}}
    ]});
  }
  async rename(id,name){await this.send(UpdateCommand,{Key:playerKey(id),UpdateExpression:'SET #name=:name',ExpressionAttributeNames:{'#name':'name'},ExpressionAttributeValues:{':name':name},ConditionExpression:'attribute_exists(pk)'});}
  async limit(key,maximum,period,time){
    const result=await this.send(UpdateCommand,{Key:{pk:'LIMIT#'+key+'#'+Math.floor(time/period),sk:'LIMIT'},UpdateExpression:'SET expires=:expires ADD #count :one',ExpressionAttributeNames:{'#count':'count'},ExpressionAttributeValues:{':expires':Math.ceil((time+2*period)/1000),':one':1},ReturnValues:'UPDATED_NEW'});return result.Attributes.count;
  }
  async startRun(run){await this.send(TransactWriteCommand,{TransactItems:[
    {Put:{TableName:this.tableName,Item:{...activeKey(run.playerId),runId:run.id,expires:expiry(run.day)}}},
    {Put:{TableName:this.tableName,Item:{...runKey(run.playerId,run.id),...run,expires:expiry(run.day)},ConditionExpression:'attribute_not_exists(pk)'}}
  ]});}
  async getRun(playerId,id){
    const run=await this.get(runKey(playerId,id));if(!run||run.status!=='active')return run;
    const active=await this.get(activeKey(playerId));return active?.runId===id?run:{...run,status:'retired'};
  }
  async finishRun(finished){
    const {playerId,day,id}=finished;
    for(let attempt=0;attempt<5;attempt++){
      const run=await this.getRun(playerId,id);
      if(run?.status==='finished')return run;
      if(!run||run.status!=='active')throw new ApiError(409,'This race was replaced by a newer attempt.');
      const previous=await this.get(bestKey(day,playerId)),better=improves(finished,previous),key=rankKey(finished);
      const transact=[
        {ConditionCheck:{TableName:this.tableName,Key:activeKey(playerId),ConditionExpression:'runId=:id',ExpressionAttributeValues:{':id':id}}},
        {Put:{TableName:this.tableName,Item:{...runKey(playerId,id),...finished,expires:expiry(day)},ConditionExpression:'#status=:active',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active'}}}
      ];
      if(better){
        const score={playerId,day,elapsedMs:finished.elapsedMs,mistakes:finished.mistakes,finishedAt:finished.finishedAt,rankKey:key,expires:expiry(day)};
        transact.push({Put:{TableName:this.tableName,Item:{...bestKey(day,playerId),...score},ConditionExpression:previous?'rankKey=:previous':'attribute_not_exists(pk)',...(previous?{ExpressionAttributeValues:{':previous':previous.rankKey}}:{})}});
        transact.push({Put:{TableName:this.tableName,Item:{pk:'DAY#'+day,sk:key,...score}}});
        if(previous)transact.push({Delete:{TableName:this.tableName,Key:{pk:'DAY#'+day,sk:previous.rankKey}}});
        else transact.push({Update:{TableName:this.tableName,Key:{pk:'DAY#'+day,sk:'META'},UpdateExpression:'SET expires=:expires ADD #count :one',ExpressionAttributeNames:{'#count':'count'},ExpressionAttributeValues:{':one':1,':expires':expiry(day)}}});
      }
      try{await this.send(TransactWriteCommand,{TransactItems:transact});return finished;}
      catch(error){if(!['TransactionCanceledException','TransactionConflictException'].includes(error.name))throw error;if(attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}
    }
  }
  async queryAll(input){const rows=[];let cursor;do{const page=await this.send(QueryCommand,{...input,ExclusiveStartKey:cursor,ConsistentRead:true});rows.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;}while(cursor);return rows;}
  async finishJourney(completion){
    const {playerId,day,level,hearts}=completion;
    const receiptKey={pk:'PLAYER#'+playerId,sk:'HEART_LEVEL#'+level};
    for(let attempt=0;attempt<5;attempt++){
      const receipt=await this.get(receiptKey);
      if(receipt)return {credited:false,hearts:receipt.hearts,level};
      const previous=await this.get(heartPlayerKey(day,playerId));
      const total=(previous?.hearts||0)+hearts,rankKey=heartRankKey(total,playerId);
      const score={playerId,day,hearts:total,levels:(previous?.levels||0)+1,rankKey,expires:expiry(day)};
      const transact=[
        {Put:{TableName:this.tableName,Item:{...receiptKey,...completion},ConditionExpression:'attribute_not_exists(pk)'}},
        {Put:{TableName:this.tableName,Item:{...heartPlayerKey(day,playerId),...score},ConditionExpression:previous?'rankKey=:previous':'attribute_not_exists(pk)',...(previous?{ExpressionAttributeValues:{':previous':previous.rankKey}}:{})}},
        {Put:{TableName:this.tableName,Item:{pk:heartPartition(day),sk:rankKey,...score}}}
      ];
      if(previous)transact.push({Delete:{TableName:this.tableName,Key:{pk:heartPartition(day),sk:previous.rankKey}}});
      else transact.push({Update:{TableName:this.tableName,Key:{pk:heartPartition(day),sk:'META'},UpdateExpression:'SET expires=:expires ADD #count :one',ExpressionAttributeNames:{'#count':'count'},ExpressionAttributeValues:{':one':1,':expires':expiry(day)}}});
      try{await this.send(TransactWriteCommand,{TransactItems:transact});return {credited:true,hearts,level};}
      catch(error){if(!['TransactionCanceledException','TransactionConflictException'].includes(error.name)||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}
    }
  }
  async heartsBoard(day,playerId){
    const [top,meta,mine]=await Promise.all([
      this.send(QueryCommand,{KeyConditionExpression:'pk=:day AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':day':heartPartition(day),':prefix':'HEARTS#'},Limit:50,ConsistentRead:true}),
      this.get({pk:heartPartition(day),sk:'META'}),playerId?this.get(heartPlayerKey(day,playerId)):null
    ]);
    const rows=top.Items||[],ids=[...new Set([...rows.map(row=>row.playerId),...(mine?[mine.playerId]:[])])];
    const names=await this.playerNames(ids);
    const view=(row,rank)=>({rank,name:names.get(row.playerId)||'Firefly',tag:row.playerId.slice(0,4).toUpperCase(),hearts:row.hearts,levels:row.levels,isYou:row.playerId===playerId});
    let rank=1;
    const entries=rows.map((row,index)=>{if(index&&row.hearts!==rows[index-1].hearts)rank=index+1;return view(row,rank);});
    let own=entries.find(entry=>entry.isYou)||null;
    if(mine&&!own){
      let count=0,cursor;
      do{const page=await this.send(QueryCommand,{KeyConditionExpression:'pk=:day AND sk BETWEEN :prefix AND :key',ExpressionAttributeValues:{':day':heartPartition(day),':prefix':'HEARTS#',':key':heartPrefix(mine.hearts)},Select:'COUNT',ConsistentRead:true,ExclusiveStartKey:cursor});count+=page.Count;cursor=page.LastEvaluatedKey;}while(cursor);
      own=view(mine,count+1);
    }
    return {day,total:meta?.count||0,entries,mine:own};
  }
  async rank(day,key){
    let count=0,cursor;do{const page=await this.send(QueryCommand,{KeyConditionExpression:'pk=:day AND sk BETWEEN :prefix AND :key',ExpressionAttributeValues:{':day':'DAY#'+day,':prefix':'SCORE#',':key':key},Select:'COUNT',ConsistentRead:true,ExclusiveStartKey:cursor});count+=page.Count;cursor=page.LastEvaluatedKey;}while(cursor);return count;
  }
  async board(day,playerId){
    const [top,meta,mine]=await Promise.all([
      this.send(QueryCommand,{KeyConditionExpression:'pk=:day AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':day':'DAY#'+day,':prefix':'SCORE#'},Limit:50,ConsistentRead:true}),
      this.get({pk:'DAY#'+day,sk:'META'}),playerId?this.get(bestKey(day,playerId)):null
    ]);
    const rows=top.Items||[],ids=[...new Set([...rows.map(row=>row.playerId),...(mine?[mine.playerId]:[])])],names=await this.playerNames(ids);
    const view=(row,rank)=>({rank,name:names.get(row.playerId)||'Firefly',tag:row.playerId.slice(0,4).toUpperCase(),elapsedMs:row.elapsedMs,mistakes:row.mistakes,isYou:row.playerId===playerId});
    const position=mine?(rows.findIndex(row=>row.playerId===playerId)+1||await this.rank(day,mine.rankKey)):0;
    return {day,total:meta?.count||0,entries:rows.map((row,index)=>view(row,index+1)),mine:mine?view(mine,position):null};
  }
  async playerNames(ids){
    const names=new Map();
    let pending=ids.map(playerKey);
    for(let attempt=0;pending.length&&attempt<4;attempt++){
      const result=await this.client.send(new BatchGetCommand({RequestItems:{[this.tableName]:{Keys:pending,ConsistentRead:true}}}));
      for(const player of result.Responses?.[this.tableName]||[])names.set(player.id,player.name);
      pending=result.UnprocessedKeys?.[this.tableName]?.Keys||[];
      if(pending.length)await new Promise(resolve=>setTimeout(resolve,30*(attempt+1)));
    }
    if(pending.length)throw Error('Profile lookup throttled');
    return names;
  }
}
