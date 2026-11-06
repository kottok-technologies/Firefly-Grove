import {UpdateCommand,DeleteCommand} from '@aws-sdk/lib-dynamodb';
import {ConsentError} from './kid-core.mjs';
const key=id=>({pk:'CONSENT#'+id,sk:'AUTH'});
export function attachConsentStore(store){
  store.consentGet=id=>store.get(key(id));
  store.consentStart=async(id,claimHash)=>{
    try{
      await store.send(UpdateCommand,{Key:key(id),UpdateExpression:'SET #state=:processing, claimHash=:hash, expires=:expires',ExpressionAttributeNames:{'#state':'state'},ExpressionAttributeValues:{':processing':'processing',':hash':claimHash,':expires':Math.floor(Date.now()/1000)+86400},ConditionExpression:'attribute_not_exists(pk)'});
      return true;
    }catch(error){if(error.name==='ConditionalCheckFailedException')return false;throw error;}
  };
  store.consentClaimed=async(id,claimHash,result)=>{
    const name=result.type+'Id';
    await store.send(UpdateCommand,{Key:key(id),UpdateExpression:'SET #state=:claimed, #id=:id REMOVE expires',ExpressionAttributeNames:{'#state':'state','#id':name},ExpressionAttributeValues:{':claimed':'claimed',':id':result[name],':hash':claimHash,':processing':'processing'},ConditionExpression:'claimHash=:hash AND #state=:processing'});
  };
  store.consentResolve=async(id,challengeId,sessionId)=>{
    try{await store.send(UpdateCommand,{Key:key(id),UpdateExpression:'SET sessionId=:session',ConditionExpression:'challengeId=:challenge AND attribute_not_exists(sessionId)',ExpressionAttributeValues:{':session':sessionId,':challenge':challengeId}});}
    catch(error){
      if(error.name!=='ConditionalCheckFailedException')throw error;
      const saved=await store.consentGet(id);
      if(saved?.challengeId!==challengeId||saved?.sessionId!==sessionId)throw new ConsentError(403,'The saved consent changed. Please retry verification.');
    }
  };
  store.consentBind=async(id,playerId)=>{
    try{await store.send(UpdateCommand,{Key:key(id),UpdateExpression:'SET playerId=:player',ConditionExpression:'attribute_exists(pk) AND (attribute_not_exists(playerId) OR playerId=:player)',ExpressionAttributeValues:{':player':playerId}});}
    catch(error){if(error.name==='ConditionalCheckFailedException')throw new ConsentError(403,'This consent belongs to a different player. Complete a new age check.');throw error;}
  };
  store.consentRemove=id=>store.send(DeleteCommand,{Key:key(id)});
  return store;
}
