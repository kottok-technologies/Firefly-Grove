import {ConsentError,consentCredential,permissionAllowed,consentHash} from './kid-core.mjs';
// A random app-specific bearer credential binds a claim to its installation.
// Client session/challenge IDs are never accepted as authorization.
export function consentService(store,providers){
  function providerFor(environment){
    const provider=providers[environment];
    if(!provider)throw new ConsentError(503,'k-ID server verification is not configured yet.');
    return provider;
  }
  async function current(event,liveOnly=false){
    const {key,environment}=consentCredential(event);
    if(liveOnly&&environment!=='live')throw new ConsentError(403,'Complete verification in the live app to use online features.');
    const record=await store.consentGet(key);
    if(!record||record.state!=='claimed')throw new ConsentError(403,'Online permission verification is pending.');
    return {key,record,provider:providerFor(environment)};
  }
  async function resolve(key,record,provider){
    if(record.challengeId&&!record.sessionId){
      const sessionId=await provider.resolve(record.challengeId);
      if(sessionId){await store.consentResolve(key,record.challengeId,sessionId);record={...record,sessionId};}
    }
    return record;
  }
  return {
    async claim(event,input){
      const {key,environment}=consentCredential(event);
      if(typeof input.claimToken!=='string'||!input.claimToken||input.claimToken.length>6000)throw new ConsentError(400,'Invalid claim token.');
      const digest=consentHash(input.claimToken);
      const previous=await store.consentGet(key);
      // A lost HTTP response may safely replay the saved receipt without consuming
      // the provider token a second time. Never replace a different claimed session.
      if(previous){
        if(previous.claimHash===digest&&previous.state==='claimed')return {accepted:true};
        throw new ConsentError(409,'Start a new age check to verify online access.');
      }
      const provider=providerFor(environment);
      await provider.ensureConfigured();
      if(!await store.consentStart(key,digest))throw new ConsentError(409,'Verification is already being processed.');
      const result=await provider.claim(input.claimToken);
      if(['PROHIBITED','FAIL','FAILED','REVOKED'].includes(result.status))throw new ConsentError(403,'Online access was not approved.');
      await store.consentClaimed(key,digest,result);
      return {accepted:true};
    },
    async signal(event){
      const {key,record,provider}=await current(event);
      const resolved=await resolve(key,record,provider);
      return {accepted:true,ready:!!resolved.sessionId};
    },
    async authorize(event,names,playerId,liveOnly=false){
      const {key,record,provider}=await current(event,liveOnly);
      const resolved=record;
      if(!resolved.sessionId)throw new ConsentError(403,'Waiting for parental approval.');
      const session=await provider.session(resolved.sessionId);
      if(!names.every(name=>permissionAllowed(session,name)))throw new ConsentError(403,'This online feature is off. Manage access in Privacy & permissions.');
      if(playerId)await store.consentBind(key,playerId);
      return {key,record:resolved,session};
    },
    async remove(event){
      const {key,record,provider}=await current(event);
      if(record.sessionId)await provider.delete(record.sessionId);
      await store.consentRemove(key);
      return {deleted:true};
    },
  };
}
