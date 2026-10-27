import {leaderboardConfig} from './leaderboard-config.js';
export const LEADERBOARD_ORIGIN=(['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('leaderboard')==='local')?'http://127.0.0.1:8787':leaderboardConfig.origin;
export async function raceApi(path,{method='GET',body,profile}={}){
  if(!LEADERBOARD_ORIGIN)throw Error('Online racing is not configured yet. Offline practice is available.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(LEADERBOARD_ORIGIN+'/api/v1/'+path,{method,signal:controller.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(profile?.token?{Authorization:'Bearer '+profile.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'The leaderboard is unavailable.');return data;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw Error('Cannot reach the leaderboard. Check your connection and try again.');throw error;}
  finally{clearTimeout(timer);}
}
