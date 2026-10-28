import {isTarget} from './engine.js';
import {dailyKey} from './daily.js';

export function initializeHeartFinds(game){
  if(Array.isArray(game.heartFinds))return;
  // Migrate a puzzle already in progress without resetting its notes or lives.
  const finds=game.marks.flatMap((mark,i)=>mark===2&&!game.givens.includes(i)?[i]:[]);
  const wrong=game.marks.findIndex((_,i)=>!isTarget(game,i));
  let lives=3;
  for(let mistake=0;mistake<game.mistakes;mistake++){
    if(!lives){finds.push(-1);lives=1;}
    finds.push(wrong);lives--;
  }
  if(!lives&&game.lives)finds.push(-1);
  game.heartFinds=finds;
}

export function heartsManager({state,origin,profile,ensureOnline,api,persist,now=()=>new Date()}){
  const ledger=state.journeyHearts ||= {pending:[],lastLevel:{}};
  const owner=String(origin)+'|'+profile.localId;
  let uploading=null;
  function queue(game){
    if(!game.completed||game.lives<1||!Array.isArray(game.heartFinds)||game.level<=(ledger.lastLevel[owner]||0))return null;
    const entry={owner,body:{version:game.generation||'journey-v1',day:dailyKey(now()),level:game.level,seed:game.seed,finds:[...game.heartFinds]},hearts:game.lives,status:'pending'};
    ledger.lastLevel[owner]=game.level;ledger.pending.push(entry);persist();return entry;
  }
  function pending(){return ledger.pending.filter(entry=>entry.owner===owner);}
  async function flush(){
    if(uploading)return uploading;
    uploading=(async()=>{
      for(const entry of pending()){
        if(entry.body.day<dailyKey(now())){
          entry.status='expired';entry.error='This level did not sync before the daily reset.';
          ledger.pending.splice(ledger.pending.indexOf(entry),1);persist();
        }
      }
      if(!origin||!pending().length)return;
      try{await ensureOnline();}catch{return;}
      while(pending().length){
        const entry=pending()[0];
        try{
          const result=await api('journey/finish',{method:'POST',profile,body:entry.body});
          entry.status=result.credited?'synced':'duplicate';
          entry.result={credited:result.credited,hearts:result.hearts,mine:result.mine,total:result.total};
          delete entry.error;ledger.pending.splice(ledger.pending.indexOf(entry),1);persist();
        }catch(error){
          entry.error=error.message;
          // Retain the replay during a staggered app/server rollout. An older
          // server reports an unknown puzzle version as this specific 400.
          if(['journey-v2','journey-v3'].includes(entry.body.version)&&error.status===400&&error.message==='Invalid journey puzzle.'){
            entry.error='Heart rankings need the updated server. Your completion is saved for retry.';
            persist();break;
          }
          if([400,410].includes(error.status)){
            entry.status=error.status===410?'expired':'rejected';
            ledger.pending.splice(ledger.pending.indexOf(entry),1);persist();continue;
          }
          persist();break;
        }
      }
    })().finally(()=>{uploading=null;});
    return uploading;
  }
  return {queue,flush,pending};
}
