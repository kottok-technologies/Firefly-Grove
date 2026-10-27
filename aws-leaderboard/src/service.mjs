import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createDailyGame,dailyKey} from './daily.js';
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function normalizeName(name){
  if(typeof name!=='string')throw new ApiError(400,'Choose a nickname.');
  const clean=name.normalize('NFC').trim().replace(/\s+/g,' ');
  if(!/^[\p{L}\p{N} ._'’-]{2,20}$/u.test(clean))throw new ApiError(400,'Use 2–20 letters, numbers, spaces, or simple punctuation.');return clean;
}
export function validateFinds(day,finds){
  if(!Array.isArray(finds)||finds.length<8||finds.length>10)throw new ApiError(400,'Find all eight fireflies with at most two mistakes.');
  const game=createDailyGame(day),found=new Set();let mistakes=0;
  for(const [index,cell] of finds.entries()){
    if(!Number.isInteger(cell)||cell<0||cell>=64)throw new ApiError(400,'Invalid cell in the run.');
    if(game.solution[Math.floor(cell/8)]===cell%8){if(found.has(cell))throw new ApiError(400,'A firefly was counted twice.');found.add(cell);}
    else if(++mistakes>=3)throw new ApiError(400,'A failed run cannot finish.');
    if(found.size===8&&index!==finds.length-1)throw new ApiError(400,'The run continued after completion.');
  }
  if(found.size!==8)throw new ApiError(400,'The daily puzzle is not solved.');return mistakes;
}
const playerView=p=>({id:p.id,name:p.name,tag:p.id.slice(0,4).toUpperCase()});
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, PUT, OPTIONS','access-control-allow-headers':'Content-Type, Authorization'};
export function createHandler(store,{now=()=>Date.now()}={}){
  return async event=>{
    const respond=(data,statusCode=200)=>({statusCode,headers,body:JSON.stringify(data)});
    try{
      const method=event.requestContext?.http?.method||event.httpMethod,path=(event.rawPath||event.path||'').replace(/\/$/,'');
      if(method==='OPTIONS')return {statusCode:204,headers,body:''};
      const time=now(),today=dailyKey(new Date(time));
      if(path==='/api/v1/health'&&method==='GET')return respond({ok:true,version:'speed-v1',day:today,provider:'aws'});
      const body=()=>{
        const contentType=event.headers?.['content-type']||event.headers?.['Content-Type']||'';
        if(!contentType.startsWith('application/json'))throw new ApiError(415,'Send JSON data.');
        const bytes=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8');
        if(bytes.length>8192)throw new ApiError(413,'Request is too large.');
        try{const result=JSON.parse(bytes.toString('utf8'));if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result;}catch{throw new ApiError(400,'Invalid JSON data.');}
      };
      const limit=async(key,max,period)=>{if(await store.limit(key,max,period,time)>max)throw new ApiError(429,'Too many requests. Please wait before trying again.');};
      const authenticate=async(required=true)=>{
        const auth=event.headers?.authorization||event.headers?.Authorization||'',token=auth.startsWith('Bearer ')?auth.slice(7):'';
        const player=/^[a-f0-9]{64}$/.test(token)?await store.playerByToken(hash(token)):null;
        if(!player&&required)throw new ApiError(401,'Create a player profile to race online.');return player;
      };
      const ipHash=hash(event.requestContext?.http?.sourceIp||'unknown');
      if(path==='/api/v1/leaderboard'&&method==='GET'){
        const day=event.queryStringParameters?.day||today;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||dailyKey(new Date(day+'T00:00:00Z'))!==day||day>today||Date.parse(day+'T00:00:00Z')<Date.parse(today+'T00:00:00Z')-90*86400000)throw new ApiError(400,'Choose a UTC date within the last 90 days.');
        const player=await authenticate(false);
        await limit('read:'+(player?.id||ipHash),180,60000);
        return respond(await store.board(day,player?.id));
      }
      if(path==='/api/v1/players'&&method==='POST'){
        await limit('register:'+ipHash,10,3600000);
        const name=normalizeName(body().name),id=randomUUID(),token=randomBytes(32).toString('hex');
        await store.createPlayer({id,name,tokenHash:hash(token),createdAt:time});return respond({...playerView({id,name}),token},201);
      }
      const player=await authenticate();
      if(path==='/api/v1/profile'&&method==='GET')return respond(playerView(player));
      if(path==='/api/v1/profile'&&method==='PUT'){
        await limit('rename:'+player.id,10,3600000);const name=normalizeName(body().name);await store.rename(player.id,name);return respond(playerView({...player,name}));
      }
      if(path==='/api/v1/runs'&&method==='POST'){
        await limit('start:'+player.id,60,3600000);const input=body();
        if(input.day!==today||input.version!=='speed-v1')throw new ApiError(409,'Start today’s puzzle with the latest app.');
        const puzzle=createDailyGame(today),run={id:randomUUID(),playerId:player.id,day:today,version:'speed-v1',status:'active',startedAt:time};
        await store.startRun(run);return respond({id:run.id,day:today,version:run.version,seed:puzzle.seed,size:8,startedAt:time},201);
      }
      if(path==='/api/v1/finish'&&method==='POST'){
        await limit('finish:'+player.id,120,3600000);const input=body();
        if(typeof input.runId!=='string'||input.runId.length>64)throw new ApiError(400,'Missing ranked run.');
        let run=await store.getRun(player.id,input.runId);
        if(!run)throw new ApiError(404,'Ranked run not found for this player.');
        if(run.status==='retired')throw new ApiError(409,'This run was replaced by a newer attempt.');
        if(run.status==='active'){
          const elapsedMs=time-run.startedAt;if(elapsedMs<1||elapsedMs>36*3600000)throw new ApiError(409,'This run has expired. Start a new race.');
          const mistakes=validateFinds(run.day,input.finds);
          run=await store.finishRun({...run,status:'finished',finishedAt:time,elapsedMs,mistakes});
        }
        const board=await store.board(run.day,player.id);return respond({day:run.day,elapsedMs:run.elapsedMs,mistakes:run.mistakes,mine:board.mine,total:board.total});
      }
      throw new ApiError(404,'Endpoint not found.');
    }catch(error){
      if(error instanceof ApiError)return respond({error:error.message},error.status);
      console.error('Leaderboard request failed',{name:error.name});return respond({error:'The leaderboard is temporarily unavailable. Please retry.'},503);
    }
  };
}
