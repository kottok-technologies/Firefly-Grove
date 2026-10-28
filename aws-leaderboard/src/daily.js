import {generateClassicPuzzle} from './engine.js';

// UTC gives every player the same daily puzzle and an unambiguous reset time.
export const dailyKey=(date=new Date())=>date.toISOString().slice(0,10);
export function dailySeed(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||dailyKey(new Date(day+'T00:00:00Z'))!==day)throw new RangeError('Invalid daily challenge date.');
  let hash=2166136261;
  for(const char of `firefly-speed-v1:${day}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return hash;
}
export function createDailyGame(day){
  const puzzle=generateClassicPuzzle(8,dailySeed(day),1);
  return {...puzzle,dailyDay:day,givens:[],marks:Array(64).fill(0),lives:3,mistakes:0,elapsed:0,elapsedMs:0,startedAt:null,completed:false};
}
export function beginDailyRun(game,now=Date.now()){
  if(game.startedAt===null&&!game.completed&&game.lives>0)game.startedAt=now;
}
export function dailyElapsed(game,now=Date.now()){
  if(game.startedAt===null)return 0;
  return game.completed||game.lives<=0?game.elapsedMs:Math.max(0,now-game.startedAt);
}
export function freezeDailyRun(game,now=Date.now()){
  game.elapsedMs=game.startedAt===null?0:Math.max(0,now-game.startedAt);
  game.elapsed=Math.floor(game.elapsedMs/1000);
}
export function recordDailyResult(records,game,now=Date.now()){
  if(!game.completed||game.lives<=0||game.startedAt===null||game.resultRecorded)return null;
  freezeDailyRun(game,now);
  const previous=records[game.dailyDay];
  const improved=!previous||game.elapsedMs<previous.bestMs;
  const record={bestMs:improved?game.elapsedMs:previous.bestMs,lastMs:game.elapsedMs,finishes:(previous?.finishes||0)+1};
  records[game.dailyDay]=record;game.resultRecorded=true;
  return {...record,improved};
}
export function formatSpeed(ms){
  const centiseconds=Math.floor(Math.max(0,ms)/10);
  return `${String(Math.floor(centiseconds/6000)).padStart(2,'0')}:${String(Math.floor(centiseconds/100)%60).padStart(2,'0')}.${String(centiseconds%100).padStart(2,'0')}`;
}
