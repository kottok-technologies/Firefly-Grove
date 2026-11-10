import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {createHash} from 'node:crypto';
const baseUrls=Object.freeze({test:'https://kai-api.test.k-id.com/api/v1/',live:'https://kai-api.k-id.com/api/v1/'});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export class ConsentError extends Error{constructor(status,message){super(message);this.status=status;}}
export const consentHash=token=>createHash('sha256').update(token).digest('hex');
export function consentCredential(event){
  const token=event.headers?.['x-firefly-consent']||event.headers?.['X-Firefly-Consent']||'';
  if(typeof token!=='string'||!/^(?:live\.)?[a-f0-9]{64}$/.test(token))throw new ConsentError(403,'Complete online permission verification in the app.');
  return {key:consentHash(token),environment:token.startsWith('live.')?'live':'test'};
}
export function createCoreClient({environment='test',secret=environmentSecret(environment),fetchImpl=fetch}={}){
  if(environment!=='test'&&environment!=='live')throw new Error('Invalid Kai environment.');
  async function requireKey(){
    const key=await secret();
    if(typeof key!=='string'||!key.startsWith('kgs_'+environment+'_'))throw new ConsentError(503,'k-ID server verification is not configured yet.');
    return key;
  }
  async function request(path,body){
    const key=await requireKey();
    const response=await fetchImpl(baseUrls[environment]+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new ConsentError(response.status>=500?503:409,'Online verification could not be completed. Please retry the age check.');
    const data=await response.json();
    if(!data||typeof data!=='object'||Array.isArray(data))throw new ConsentError(503,'Invalid verification response.');
    return data;
  }
  return {
    async ensureConfigured(){await requireKey();},
    async claim(claimToken){
      if(typeof claimToken!=='string'||claimToken.length<1||claimToken.length>6000)throw new ConsentError(400,'Invalid claim token.');
      const result=await request('client/claim',{claimToken});
      if(!['session','challenge'].includes(result.type)||typeof result.status!=='string'||!uuid(result[result.type+'Id']))throw new ConsentError(503,'Invalid claim response.');
      return {type:result.type,status:result.status,[result.type+'Id']:result[result.type+'Id']};
    },
    async resolve(challengeId){
      if(!uuid(challengeId))throw new ConsentError(403,'Invalid saved challenge.');
      const result=await request('challenge/get-status?challengeId='+encodeURIComponent(challengeId));
      if(result.status!=='PASS')return null;
      if(!uuid(result.sessionId))throw new ConsentError(503,'Invalid challenge response.');
      return result.sessionId;
    },
    async session(sessionId){
      if(!uuid(sessionId))throw new ConsentError(403,'Invalid saved session.');
      const result=await request('session/get?sessionId='+encodeURIComponent(sessionId));
      if(result.sessionId!==sessionId||!Array.isArray(result.permissions))throw new ConsentError(503,'Invalid session response.');
      return result;
    },
    async delete(sessionId){if(!uuid(sessionId))throw new ConsentError(400,'Invalid saved session.');await request('session/delete',{sessionId});},
  };
}
export function environmentSecret(environment='test'){
  const secretVariable=environment==='live'?'KID_SECRET_KEY':'KID_TEST_SECRET_KEY';
  const arnVariable=environment==='live'?'KID_LIVE_SECRET_ARN':'KID_SECRET_ARN';
  let cached,until=0;
  return async()=>{
    if(process.env[secretVariable])return process.env[secretVariable];
    const secretId=process.env[arnVariable];
    if(!secretId)return null;
    if(cached&&Date.now()<until)return cached;
    const result=await new SecretsManagerClient({}).send(new GetSecretValueCommand({SecretId:secretId}));
    cached=result.SecretString;until=Date.now()+60000;return cached;
  };
}
export function permissionAllowed(session,name){
  const matches=session.permissions.filter(p=>p.name===name);
  return !['PROHIBITED','FAIL','FAILED','DELETED','REVOKED','PENDING'].includes(session.ageStatus)&&
    typeof session.ageStatus==='string'&&matches.length===1&&matches[0].enabled===true&&['PLAYER','GUARDIAN'].includes(matches[0].managedBy);
}
