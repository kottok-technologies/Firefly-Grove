export const CLOUD_FORMAT='firefly-cloud-v1';
export const CLOUD_LIMIT=2500000;
const fields=['version','installSeed','level','completed','hints','reveals','settings','game','puzzleKeys','dailyRecords','dailyRun'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function invalid(){throw Error('This cloud save is damaged or uses an unsupported version. Your device save is unchanged.');}
function clone(value){return JSON.parse(JSON.stringify(value), (key,item)=>{
  if(['__proto__','prototype','constructor'].includes(key))invalid();return item;
});}
function validateGame(game,daily=false){
  if(game===null||game===undefined)return;
  if(!plain(game)||!integer(game.size,4,10))invalid();
  const n=game.size,count=n*n;
  for(const [field,length,max] of [['regions',count,n-1],['solution',n,n-1],['marks',count,2]]){
    if(!Array.isArray(game[field])||game[field].length!==length||game[field].some(v=>!integer(v,0,max)))invalid();
  }
  const targets=game.solution.map((column,row)=>row*n+column);
  if(new Set(game.solution).size!==n||new Set(targets.map(i=>game.regions[i])).size!==n||game.solution.some((c,r)=>r&&Math.abs(c-game.solution[r-1])<=1))invalid();
  if(!Array.isArray(game.givens)||new Set(game.givens).size!==game.givens.length||game.givens.some(i=>!targets.includes(i)||game.marks[i]!==2))invalid();
  if(!integer(game.lives,0,3)||!integer(game.mistakes,0,1000000)||!Number.isFinite(game.elapsed)||game.elapsed<0)invalid();
  if(game.marks.some((mark,i)=>mark===2&&!targets.includes(i))||typeof game.completed!=='boolean'||game.completed!==targets.every(i=>game.marks[i]===2))invalid();
  if(game.heartFinds!==undefined&&(!Array.isArray(game.heartFinds)||game.heartFinds.length>512||game.heartFinds.some(i=>!integer(i,-1,count-1))))invalid();
  if(daily){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(game.dailyDay)||!(game.startedAt===null||Number.isFinite(game.startedAt))||!Number.isFinite(game.elapsedMs)||game.elapsedMs<0)invalid();
  }else if(!integer(game.level,1,1000000)||!integer(game.seed,0,0xffffffff)||game.generation!==undefined&&!['journey-v1','journey-v2','journey-v3'].includes(game.generation))invalid();
}
function validateState(state){
  if(!plain(state)||state.version!==1||!integer(state.installSeed,0,0xffffffff)||!integer(state.level,1,1000000)||!integer(state.completed,0,1000000))invalid();
  if(!integer(state.hints,0,1000000)||!integer(state.reveals,0,1000000)||!plain(state.settings)||typeof state.settings.autoCross!=='boolean'||typeof state.settings.haptics!=='boolean')invalid();
  validateGame(state.game);validateGame(state.previousPuzzle);validateGame(state.dailyRun,true);
  if(!Array.isArray(state.puzzleKeys)||state.puzzleKeys.some(key=>typeof key!=='string'||key.length>203||!/^\d{1,2}:[0-9a-z]+$/.test(key)))invalid();
  if(!plain(state.dailyRecords))invalid();
  for(const [day,record] of Object.entries(state.dailyRecords)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!plain(record)||!Number.isFinite(record.bestMs)||record.bestMs<0||!Number.isFinite(record.lastMs)||record.lastMs<0||!integer(record.finishes,1,1000000))invalid();
  }
  if(!plain(state.leaderboardProfiles))invalid();
  for(const [origin,profile] of Object.entries(state.leaderboardProfiles)){
    if(!/^https:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$/.test(origin)||!plain(profile)||typeof profile.localId!=='string'||profile.localId.length>64||typeof profile.name!=='string'||profile.name.length>100)invalid();
    if(profile.token!==undefined&&(!/^[a-f0-9]{64}$/.test(profile.token)||typeof profile.id!=='string'||profile.id.length>64))invalid();
  }
  if(state.journeyHearts!==undefined){
    const ledger=state.journeyHearts;
    if(!plain(ledger)||!Array.isArray(ledger.pending)||!plain(ledger.lastLevel))invalid();
    for(const level of Object.values(ledger.lastLevel))if(!integer(level,0,1000000))invalid();
    for(const entry of ledger.pending){
      const body=entry?.body;
      if(!plain(entry)||typeof entry.owner!=='string'||!plain(body)||!['journey-v1','journey-v2','journey-v3'].includes(body.version)||!integer(body.level,1,1000000)||!integer(body.seed,0,0xffffffff)||!/^\d{4}-\d{2}-\d{2}$/.test(body.day)||!Array.isArray(body.finds)||body.finds.length>512||body.finds.some(i=>!integer(i,-1,99)))invalid();
    }
  }
  return state;
}
// A single private save contains one complete progression, including the guest
// credential needed to recover the same AWS profile. Test environments and
// active ranked-run tickets are never copied into the production cloud slot.
export function cloudState(state,origin){
  const selected=Object.fromEntries(fields.filter(key=>state[key]!==undefined).map(key=>[key,state[key]]));
  selected.puzzleKeys ||= [];selected.dailyRecords ||= {};
  selected.leaderboardProfiles={};
  if(/^https:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$/.test(origin)&&state.leaderboardProfiles?.[origin])selected.leaderboardProfiles[origin]=state.leaderboardProfiles[origin];
  const owner=origin+'|'+state.leaderboardProfiles?.[origin]?.localId;
  selected.journeyHearts={pending:state.journeyHearts?.pending.filter(entry=>entry.owner===owner)||[],lastLevel:{}};
  if(state.journeyHearts?.lastLevel[owner]!==undefined)selected.journeyHearts.lastLevel[owner]=state.journeyHearts.lastLevel[owner];
  const result=clone(selected);
  if(result.dailyRun){delete result.dailyRun.online;delete result.dailyRun.rankedFinds;}
  return validateState(result);
}
export function encodeCloudSave(state,{id=crypto.randomUUID(),parent=null,savedAt=new Date().toISOString()}={}){
  validateState(state);
  const save={format:CLOUD_FORMAT,id,parent,savedAt,state},text=JSON.stringify(save);
  if(new TextEncoder().encode(text).length>CLOUD_LIMIT)throw Error('Your save is too large for cloud backup. Your device save is unchanged.');
  return {save,text};
}
export function parseCloudSave(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>CLOUD_LIMIT)invalid();
  let save;try{save=JSON.parse(text,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))invalid();return value;});}catch{invalid();}
  if(!plain(save)||save.format!==CLOUD_FORMAT||typeof save.id!=='string'||!save.id.length||save.id.length>64||!(save.parent===null||typeof save.parent==='string'&&save.parent.length<=64)||typeof save.savedAt!=='string'||!Number.isFinite(Date.parse(save.savedAt)))invalid();
  validateState(save.state);return save;
}
export const cloudSummary=save=>({level:save.state.level,completed:save.state.completed,hints:save.state.hints,reveals:save.state.reveals,savedAt:save.savedAt});
export function parseDeviceBackup(text,origin){
  let state;try{state=clone(JSON.parse(text));}catch{invalid();}
  if(!plain(state))invalid();cloudState(state,origin);return state;
}
