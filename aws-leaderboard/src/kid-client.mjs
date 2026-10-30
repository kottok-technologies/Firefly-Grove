import {createHmac,timingSafeEqual} from 'node:crypto';

const endpoints={test:'https://game-api.test.k-id.com/api/v1/',production:'https://game-api.k-id.com/api/v1/'};
const widgetHosts={test:new Set(['family.test.k-id.com']),production:new Set(['family.k-id.com'])};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const unavailable=()=>Error('Parent verification is unavailable. Local play is still available.');

// Server-side only. The caller supplies credentials from secret storage, never the APK.
export function createKidClient({apiKey,environment='test',fetchImpl=fetch}={}){
  if(typeof apiKey!=='string'||!apiKey.trim()||/[\r\n]/.test(apiKey)||!Object.hasOwn(endpoints,environment))throw unavailable();
  async function request(path,body){
    let response,data;
    try{
      response=await fetchImpl(endpoints[environment]+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(!response.ok)throw unavailable();
      const text=await response.text();if(Buffer.byteLength(text)>262144)throw unavailable();
      data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw unavailable();
    }catch{throw unavailable();}
    return data;
  }
  async function start(jurisdiction){
    if(typeof jurisdiction!=='string'||!/^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$/.test(jurisdiction))throw Error('Choose your country or region.');
    // No client-supplied age, DOB, skip flags, redirect, or existing session ID.
    const result=await request('widget/generate-e2e-url',{jurisdiction});
    let url;try{url=new URL(result.url);}catch{throw unavailable();}
    if(!uuid(result.widgetId)||url.protocol!=='https:'||!widgetHosts[environment].has(url.hostname)||url.port||url.username||url.password||url.pathname!=='/widget'||url.hash)throw unavailable();
    return {widgetId:result.widgetId,url:url.href};
  }
  async function widget(widgetId){
    if(!uuid(widgetId))throw unavailable();
    const result=await request('widget/get-status?widgetId='+encodeURIComponent(widgetId));
    if(!['PENDING','PASS','IN_CHALLENGE','FAILED','PROHIBITED','EXPIRED','NOT_FOUND'].includes(result.status))throw unavailable();
    if(result.status==='PASS'&&!uuid(result.sessionId))throw unavailable();
    return {status:result.status,...(result.status==='PASS'?{sessionId:result.sessionId}:{})};
  }
  async function session(sessionId){
    if(!uuid(sessionId))throw unavailable();
    const result=await request('session/get?sessionId='+encodeURIComponent(sessionId));
    if(result.sessionId!==sessionId||!Array.isArray(result.permissions)||result.permissions.length>200)throw unavailable();
    const permissions=result.permissions.map(permission=>{
      if(!permission||typeof permission.name!=='string'||!permission.name||permission.name.length>128||typeof permission.enabled!=='boolean'||!['PLAYER','GUARDIAN','PROHIBITED'].includes(permission.managedBy))throw unavailable();
      return {name:permission.name,enabled:permission.enabled,managedBy:permission.managedBy};
    });
    if(new Set(permissions.map(permission=>permission.name)).size!==permissions.length)throw unavailable();
    // Do not return or persist the provider response's birth date or parent email.
    return {sessionId,status:result.status==='ACTIVE'?'ACTIVE':'RESTRICTED',permissions};
  }
  return {start,widget,session};
}

// Use ONLY with session() results obtained server-side, not game-supplied objects.
// Even a widget PASS can be a restricted Safe Start session: check each permission.
export function kidFeatureAllowed(session,permissionName){
  return typeof permissionName==='string'&&permissionName.length>0&&session?.status==='ACTIVE'&&
    Array.isArray(session.permissions)&&session.permissions.some(permission=>permission?.name===permissionName&&permission.enabled===true&&['PLAYER','GUARDIAN'].includes(permission.managedBy));
}

// Authentication primitive only: handlers must also process events idempotently
// and fetch current server-side permissions rather than trusting event order.
export function validKidWebhook({rawBody,timestamp,signature,secret,now=Date.now()}={}){
  if(!Buffer.isBuffer(rawBody)||rawBody.length>262144||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||typeof signature!=='string'||! /^[a-f0-9]{64}$/.test(signature)||typeof secret!=='string'||secret.length<16||!Number.isFinite(now)||Math.abs(now-Number(timestamp)*1000)>300000)return false;
  const expected=createHmac('sha256',secret).update(timestamp).update(rawBody).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
