import {createDailyGame,dailyKey} from './puzzle/daily.js';
const VERSION='speed-v1',MAX_RUN=36*60*60*1000;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'86400','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
function reply(data,status=200){return Response.json(data,{status,headers:cors});}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function readBody(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'Send JSON data.');
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'Missing request body.');
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();throw new ApiError(413,'Request is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw new ApiError(400,'Invalid JSON data.');}
}
export function normalizeName(name){
  if(typeof name!=='string')throw new ApiError(400,'Choose a nickname.');
  const clean=name.normalize('NFC').trim().replace(/\s+/g,' ');
  if(!/^[\p{L}\p{N} ._'’-]{2,20}$/u.test(clean))throw new ApiError(400,'Use 2–20 letters, numbers, spaces, or simple punctuation.');
  return clean;
}
export function validateFinds(day,finds){
  if(!Array.isArray(finds)||finds.length<8||finds.length>10)throw new ApiError(400,'A complete run must contain all eight finds and at most two mistakes.');
  const puzzle=createDailyGame(day),found=new Set();let mistakes=0;
  for(const cell of finds){
    if(!Number.isInteger(cell)||cell<0||cell>=64)throw new ApiError(400,'Invalid cell in the run.');
    if(puzzle.solution[Math.floor(cell/8)]===cell%8){if(found.has(cell))throw new ApiError(400,'A firefly was counted more than once.');found.add(cell);}
    else if(++mistakes>=3)throw new ApiError(400,'A run with three mistakes cannot finish.');
    if(found.size===8&&cell!==finds.at(-1))throw new ApiError(400,'The run continued after completion.');
  }
  if(found.size!==8)throw new ApiError(400,'The daily puzzle is not solved.');
  return mistakes;
}
async function authenticate(request,db,required=true){
  const auth=request.headers.get('authorization');
  if(!auth?.startsWith('Bearer ')){if(required)throw new ApiError(401,'Create a player profile to race online.');return null;}
  const token=auth.slice(7);if(!/^[a-f0-9]{64}$/.test(token)){if(required)throw new ApiError(401,'Player profile is not valid on this server.');return null;}
  const player=await db.prepare('SELECT id,name FROM players WHERE token_hash=?').bind(await hash(token)).first();
  if(!player&&required)throw new ApiError(401,'Player profile is not valid on this server.');return player;
}
function playerView(player){return {id:player.id,name:player.name,tag:player.id.slice(0,4).toUpperCase()};}
async function limit(db,key,maximum,period,now){
  const bucket=`${key}:${Math.floor(now/period)}`;
  const row=await db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now+period*2).first();
  if(row.count>maximum)throw new ApiError(429,'Too many requests. Please wait a little before trying again.');
}
function scoreView(row,currentId){return {rank:row.rank,name:row.name,tag:row.player_id.slice(0,4).toUpperCase(),elapsedMs:row.elapsed_ms,mistakes:row.mistakes,isYou:row.player_id===currentId};}
async function board(db,day,playerId){
  const ranked=`SELECT s.*,p.name,ROW_NUMBER() OVER(ORDER BY elapsed_ms,mistakes,finished_at,player_id) AS rank FROM scores s JOIN players p ON p.id=s.player_id WHERE day=?`;
  const [top,total,mine]=await Promise.all([
    db.prepare(`SELECT * FROM (${ranked}) ORDER BY rank LIMIT 50`).bind(day).all(),
    db.prepare('SELECT COUNT(*) AS count FROM scores WHERE day=?').bind(day).first(),
    playerId?db.prepare(`SELECT * FROM (${ranked}) WHERE player_id=?`).bind(day,playerId).first():null
  ]);
  return {day,total:total.count,entries:top.results.map(row=>scoreView(row,playerId)),mine:mine?scoreView(mine,playerId):null};
}
export async function handleLeaderboard(request,db,{now=()=>Date.now(),ip='unknown'}={}){
  try{
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(path==='/api/v1/health')return reply({ok:true,version:VERSION,day:dailyKey(new Date(now()))});
    const time=now(),today=dailyKey(new Date(time));
    if(path==='/api/v1/leaderboard'&&request.method==='GET'){
      const day=url.searchParams.get('day')||today;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||dailyKey(new Date(day+'T00:00:00Z'))!==day||day>today||Date.parse(day+'T00:00:00Z')<time-91*86400000)throw new ApiError(400,'Choose a UTC date within the last 90 days.');
      await limit(db,`read:${await hash(ip)}`,180,60000,time);
      const player=await authenticate(request,db,false);return reply(await board(db,day,player?.id));
    }
    if(path==='/api/v1/players'&&request.method==='POST'){
      await limit(db,`register:${await hash(ip)}`,10,3600000,time);
      const name=normalizeName((await readBody(request)).name),id=crypto.randomUUID();
      const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
      await db.prepare('INSERT INTO players(id,token_hash,name,created_at) VALUES(?,?,?,?)').bind(id,await hash(token),name,time).run();
      return reply({...playerView({id,name}),token},201);
    }
    const player=await authenticate(request,db);
    if(path==='/api/v1/profile'&&request.method==='GET')return reply(playerView(player));
    if(path==='/api/v1/profile'&&request.method==='PUT'){
      await limit(db,`rename:${player.id}`,10,3600000,time);
      const name=normalizeName((await readBody(request)).name);
      await db.prepare('UPDATE players SET name=? WHERE id=?').bind(name,player.id).run();return reply(playerView({...player,name}));
    }
    if(path==='/api/v1/runs'&&request.method==='POST'){
      await limit(db,`start:${player.id}`,60,3600000,time);
      const body=await readBody(request);
      if(body.day!==today||body.version!==VERSION)throw new ApiError(409,'Start a new ranked run on today’s puzzle with the latest app.');
      const id=crypto.randomUUID(),puzzle=createDailyGame(today);
      await db.batch([
        db.prepare("UPDATE runs SET status='retired' WHERE player_id=? AND status='active'").bind(player.id),
        db.prepare('INSERT INTO runs(id,player_id,day,version,status,started_at) VALUES(?,?,?,?,?,?)').bind(id,player.id,today,VERSION,'active',time),
        db.prepare('DELETE FROM rate_limits WHERE key IN(SELECT key FROM rate_limits WHERE expires<? LIMIT 100)').bind(time),
        db.prepare('DELETE FROM runs WHERE id IN(SELECT id FROM runs WHERE started_at<? LIMIT 100)').bind(time-91*86400000)
      ]);
      return reply({id,day:today,version:VERSION,seed:puzzle.seed,size:8,startedAt:time},201);
    }
    if(path==='/api/v1/finish'&&request.method==='POST'){
      await limit(db,`finish:${player.id}`,120,3600000,time);
      const body=await readBody(request);
      if(typeof body.runId!=='string')throw new ApiError(400,'Missing ranked run.');
      let run=await db.prepare('SELECT * FROM runs WHERE id=? AND player_id=?').bind(body.runId,player.id).first();
      if(!run)throw new ApiError(404,'Ranked run not found for this player.');
      if(run.status==='retired')throw new ApiError(409,'This run was replaced by a newer attempt.');
      if(run.status==='active'){
        const elapsed=time-run.started_at;
        if(elapsed<1||elapsed>MAX_RUN)throw new ApiError(409,'This ranked run has expired. Start a fresh attempt.');
        const mistakes=validateFinds(run.day,body.finds);
        await db.batch([
          db.prepare("UPDATE runs SET status='finished',finished_at=?,elapsed_ms=?,mistakes=? WHERE id=? AND status='active'").bind(time,elapsed,mistakes,run.id),
          db.prepare(`INSERT INTO scores(day,player_id,elapsed_ms,mistakes,finished_at) SELECT day,player_id,elapsed_ms,mistakes,finished_at FROM runs WHERE id=? AND status='finished'
            ON CONFLICT(day,player_id) DO UPDATE SET elapsed_ms=excluded.elapsed_ms,mistakes=excluded.mistakes,finished_at=excluded.finished_at
            WHERE excluded.elapsed_ms<scores.elapsed_ms OR (excluded.elapsed_ms=scores.elapsed_ms AND excluded.mistakes<scores.mistakes)`).bind(run.id)
        ]);
        run=await db.prepare('SELECT * FROM runs WHERE id=?').bind(run.id).first();
      }
      const rankings=await board(db,run.day,player.id);
      return reply({day:run.day,elapsedMs:run.elapsed_ms,mistakes:run.mistakes,mine:rankings.mine,total:rankings.total});
    }
    throw new ApiError(404,'Endpoint not found.');
  }catch(error){
    if(error instanceof ApiError)return reply({error:error.message},error.status);
    console.error('Leaderboard request failed',error?.message);return reply({error:'The leaderboard is temporarily unavailable.'},503);
  }
}
