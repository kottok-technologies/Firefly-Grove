import {env} from 'cloudflare:workers';
import {handleLeaderboard} from '../../../../lib/leaderboard.js';
export const dynamic='force-dynamic';
function handle(request:Request){
  if(!env.DB)return Response.json({error:'Leaderboard database is unavailable.'},{status:503});
  return handleLeaderboard(request,env.DB,{ip:request.headers.get('CF-Connecting-IP')||'local'});
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const OPTIONS=handle;
