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
  constructor(tableName,client=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}}),{now=()=>Date.now()}={}){this.tableName=tableName;this.client=client;this.now=now;this.topCache=new Map();}
  send(Command,input){return this.client.send(new Command({TableName:this.tableName,...input}));}
  async get(Key){return (await this.send(GetCommand,{Key,ConsistentRead:true})).Item||null;}
  async countAhead(board,day,mine,limit){
    // Hearts exclude every equal score; speed includes this player's complete
    // ordered key. Stop as soon as the requested rank ceiling is reached.
    let count=0,cursor;
    do{
      const page=await this.send(QueryCommand,{KeyConditionExpression:'pk=:day AND sk BETWEEN :prefix AND :key',ExpressionAttributeValues:{':day':board==='hearts'?heartPartition(day):'DAY#'+day,':prefix':board==='hearts'?'HEARTS#':'SCORE#',':key':board==='hearts'?heartPrefix(mine.hearts):mine.rankKey},Select:'COUNT',Limit:limit-count,ConsistentRead:true,ExclusiveStartKey:cursor});
      count+=page.Count;cursor=page.LastEvaluatedKey;
    }while(cursor&&count<limit);
    return board==='hearts'?count+1:count;
  }
  async placementRank(board,day,playerId){
    const mine=await this.get(board==='hearts'?heartPlayerKey(day,playerId):bestKey(day,playerId));
    if(!mine)return null;
    const rank=await this.countAhead(board,day,mine,board==='hearts'?10:11);
    return rank<=10?rank:null;
  }
  async standing(board,day,playerId){
    const [mine,meta]=await Promise.all([
      this.get(board==='hearts'?heartPlayerKey(day,playerId):bestKey(day,playerId)),
      this.get({pk:board==='hearts'?heartPartition(day):'DAY#'+day,sk:'META'})
    ]);
    if(!mine)return {day,total:meta?.count||0,mine:null};
    const position=await this.countAhead(board,day,mine,board==='hearts'?1000:1001);
    const rank=position>1000?'1,000+':position;
    return {day,total:meta?.count||0,mine:{rank,rankExact:position<=1000,...(board==='hearts'?{hearts:mine.hearts,levels:mine.levels}:{elapsedMs:mine.elapsedMs,mistakes:mine.mistakes})}};
  }
  topRows(board,day){
    const key=board+':'+day,cached=this.topCache.get(key);
    if(cached&&cached.until>this.now())return cached.promise;
    // Bounded, per-Lambda warm cache. Never cache player identity or own score.
    if(this.topCache.size>=128)this.topCache.delete(this.topCache.keys().next().value);
    const entry={until:this.now()+5000};
    entry.promise=this.send(QueryCommand,{KeyConditionExpression:'pk=:day AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':day':board==='hearts'?heartPartition(day):'DAY#'+day,':prefix':board==='hearts'?'HEARTS#':'SCORE#'},Limit:50,ConsistentRead:true}).then(async result=>({...result,names:await this.playerNames((result.Items||[]).map(row=>row.playerId))})).catch(error=>{if(this.topCache.get(key)===entry)this.topCache.delete(key);throw error;});
    this.topCache.set(key,entry);return entry.promise;
  }
  async getPlacementReward(playerId,board,day){return (await this.get({pk:'PLAYER#'+playerId,sk:'PRIZE#'+board+':'+day}))?.receipt||null;}
  async savePlacementReward(playerId,receipt){
    try{
      await this.send(UpdateCommand,{Key:{pk:'PLAYER#'+playerId,sk:'PRIZE#'+receipt.id},UpdateExpression:'SET receipt=:receipt',ExpressionAttributeValues:{':receipt':receipt},ConditionExpression:'attribute_not_exists(pk)'});
      return receipt;
    }catch(error){
      if(error.name!=='ConditionalCheckFailedException')throw error;
      const saved=await this.getPlacementReward(playerId,receipt.board,receipt.day);
      if(!saved)throw error;
      return saved;
    }
  }
  async playerByToken(tokenHash){const auth=await this.get({pk:'TOKEN#'+tokenHash,sk:'AUTH'});return auth?this.get(playerKey(auth.playerId)):null;}
  async createPlayer(player,consentKey){
    const {tokenHash,...profile}=player;
    await this.send(TransactWriteCommand,{TransactItems:[
      {Put:{TableName:this.tableName,Item:{...playerKey(player.id),...profile},ConditionExpression:'attribute_not_exists(pk)'}},
      {Put:{TableName:this.tableName,Item:{pk:'TOKEN#'+tokenHash,sk:'AUTH',playerId:player.id},ConditionExpression:'attribute_not_exists(pk)'}},
      ...(consentKey?[{Update:{TableName:this.tableName,Key:{pk:'CONSENT#'+consentKey,sk:'AUTH'},UpdateExpression:'SET playerId=:player',ConditionExpression:'attribute_exists(pk) AND attribute_not_exists(playerId)',ExpressionAttributeValues:{':player':player.id}}}]:[])
    ]});
  }
  async rename(id,name){await this.send(UpdateCommand,{Key:playerKey(id),UpdateExpression:'SET #name=:name',ExpressionAttributeNames:{'#name':'name'},ExpressionAttributeValues:{':name':name},ConditionExpression:'attribute_exists(pk)'});this.topCache.clear();}
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
      try{await this.send(TransactWriteCommand,{TransactItems:transact});this.topCache.delete('speed:'+day);return finished;}
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
      try{await this.send(TransactWriteCommand,{TransactItems:transact});this.topCache.delete('hearts:'+day);return {credited:true,hearts,level};}
      catch(error){if(!['TransactionCanceledException','TransactionConflictException'].includes(error.name)||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));}
    }
  }
  async heartsBoard(day,playerId){
    const [top,meta,mine]=await Promise.all([
      this.topRows('hearts',day),
      this.get({pk:heartPartition(day),sk:'META'}),playerId?this.get(heartPlayerKey(day,playerId)):null
    ]);
    const rows=top.Items||[],names=await this.boardNames(top,mine);
    const view=(row,rank)=>({rank,name:names.get(row.playerId)||'Firefly',tag:row.playerId.slice(0,4).toUpperCase(),hearts:row.hearts,levels:row.levels,isYou:row.playerId===playerId});
    let rank=1;
    const entries=rows.map((row,index)=>{if(index&&row.hearts!==rows[index-1].hearts)rank=index+1;return view(row,rank);});
    // The cached public list can lag other Lambda instances by five seconds.
    // Always derive the personal rank from the current stored score.
    const position=mine?await this.countAhead('hearts',day,mine,1000):0;
    const own=mine?{...view(mine,position>1000?'1,000+':position),rankExact:position<=1000}:null;
    return {day,total:meta?.count||0,entries,mine:own};
  }
  async board(day,playerId){
    const [top,meta,mine]=await Promise.all([
      this.topRows('speed',day),
      this.get({pk:'DAY#'+day,sk:'META'}),playerId?this.get(bestKey(day,playerId)):null
    ]);
    const rows=top.Items||[],names=await this.boardNames(top,mine);
    const view=(row,rank)=>({rank,name:names.get(row.playerId)||'Firefly',tag:row.playerId.slice(0,4).toUpperCase(),elapsedMs:row.elapsedMs,mistakes:row.mistakes,isYou:row.playerId===playerId});
    const position=mine?await this.countAhead('speed',day,mine,1001):0;
    return {day,total:meta?.count||0,entries:rows.map((row,index)=>view(row,index+1)),mine:mine?{...view(mine,position>1000?'1,000+':position),rankExact:position<=1000}:null};
  }
  async boardNames(top,mine){
    const names=new Map(top.names);
    if(mine&&!names.has(mine.playerId))names.set(mine.playerId,(await this.get(playerKey(mine.playerId)))?.name||'Firefly');
    return names;
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
