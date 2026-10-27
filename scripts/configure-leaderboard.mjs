import {writeFile} from 'node:fs/promises';
export async function configureLeaderboard(origin){
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/^\w+\.execute-api\.us-east-1\.amazonaws\.com$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash)throw Error('Expected a production AWS HTTPS API origin in us-east-1.');
  const health=await fetch(url.origin+'/api/v1/health',{signal:AbortSignal.timeout(15000)});
  if(!health.ok)throw Error('API health check failed.');const result=await health.json();
  if(result.ok!==true||result.provider!=='aws'||result.version!=='speed-v1')throw Error('Unexpected API version or provider.');
  const board=await fetch(url.origin+'/api/v1/leaderboard',{signal:AbortSignal.timeout(15000)});
  if(!board.ok||!Array.isArray((await board.json()).entries))throw Error('Leaderboard database check failed.');
  await writeFile(new URL('../web/leaderboard-config.js',import.meta.url),'// Public endpoint generated after a verified Terraform deployment.\nexport const leaderboardConfig='+JSON.stringify({origin:url.origin})+';\n');
  console.log('Leaderboard endpoint configured:',url.origin);
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/configure-leaderboard.mjs'))await configureLeaderboard(process.argv[2]);
