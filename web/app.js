import {createMotion} from './motion.js';
import {createFireflyPlayer,FOUND_DURATION} from './firefly-player.js';
import {cloudBridge} from './cloud-bridge.js';
import {cloudManager} from './cloud.js';
import {parseDeviceBackup} from './cloud-state.js';
import {hintFocus,renderHintBoard} from './hint-overlay.js';
import {initializeHeartFinds,heartsManager} from './hearts.js';
import {profileManager} from './profile.js';
import {renderDialog} from './dialogs.js';
import {raceApi,LEADERBOARD_ORIGIN} from './leaderboard-client.js';
import { createGame, applyMove, findHint, isTarget, levelConfig } from './engine.js';
import { cellsAlongSegment, paintNotes } from './gestures.js';
import {dailyKey,createDailyGame,beginDailyRun,dailyElapsed,freezeDailyRun,recordDailyResult,formatSpeed} from './daily.js';
const $ = id => document.getElementById(id);
const STORAGE = 'firefly-grove-v1';
const DOUBLE_TAP_MS = 600;
const CARE_PACKAGE_LEVELS = 10;
const palette = ['#d9e5ba','#e6c2a9','#c6dcd6','#e7d9a4','#cfc9e2','#b8d4ac','#e4c7ce','#bfcde0','#e3c49a','#c1dfc2','#d7d3ac','#c9bee0','#dbbcae','#b8d9dd'];
const fly = '<span class="firefly-arrival"><img class="firefly-sprite" src="./assets/firefly.png?v=3" alt="" aria-hidden="true" draggable="false" width="256" height="256" decoding="async"></span>';
const cross = '<svg class="cross-mark" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke-linecap="round"><g stroke="#fffdec" stroke-width="6"><path class="cross-line" pathLength="1" d="M8 8 24 24"/><path class="cross-line cross-second" pathLength="1" d="M24 8 8 24"/></g><g stroke="#234536" stroke-width="3.5"><path class="cross-line" pathLength="1" d="M8 8 24 24"/><path class="cross-line cross-second" pathLength="1" d="M24 8 8 24"/></g></svg>';
const defaults = () => ({ version:1, installSeed:crypto.getRandomValues(new Uint32Array(1))[0], level:1, completed:0, hints:3, reveals:2, game:null, settings:{ autoCross:false, haptics:true } });
let state;
let cloud=null,cloudChoiceCancel=null,restoringCloud=false,nativePaused=false;
try { state=JSON.parse(localStorage.getItem(STORAGE)); if(state?.version!==1 || !Number.isInteger(state.level) || !state.settings) state=null; } catch {}
state ||= defaults();
delete state.settings.targetMode;
state.puzzleKeys ||= [];
state.dailyRecords ||= {};
// Keep test-server identities separate from real online profiles.
state.leaderboardProfiles ||= {};
const profiles=profileManager({profiles:state.leaderboardProfiles,origin:LEADERBOARD_ORIGIN,api:raceApi,persist:()=>save()});
state.leaderboardProfile=profiles.profile;
const hearts=heartsManager({state,origin:LEADERBOARD_ORIGIN,profile:profiles.profile,ensureOnline:profiles.ensureOnline,api:raceApi,persist:()=>save()});
const puzzleKey = puzzle => puzzle.size + ':' + puzzle.regions.map(r=>r.toString(36)).join('');
let game=state.game, busy=false, tick=Date.now(), pendingTap=null, worker=null, isPlaying=false;
let renderedGame=null, idleTimer=null;
let mode='journey';
if(game&&!game.completed)initializeHeartFinds(game);
let drag=null,suppressDragClick=false;
const mistakeTimers=new WeakMap();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const motion=createMotion(document,reducedMotion);
const fireflies=createFireflyPlayer();
function stopIdle(){
  clearTimeout(idleTimer);idleTimer=null;
  fireflies.stop('idle');
}
function finishCellMotion(){
  fireflies.stop('found');
  $('board').querySelectorAll('.just-found,.just-crossed').forEach(cell=>cell.classList.remove('just-found','just-crossed'));
}
function scheduleIdle(){
  clearTimeout(idleTimer);
  if(!isPlaying||game?.completed||nativePaused||document.hidden||reducedMotion.matches||$('modal').open)return;
  idleTimer=setTimeout(()=>{
    const sprites=[...$('board').querySelectorAll('.target:not(.just-found) .firefly-sprite:not([data-firefly-motion])')];
    if(sprites.length){
      const sprite=sprites[Math.floor(Math.random()*sprites.length)];
      fireflies.play(sprite,'idle');
    }
    scheduleIdle();
  },2400+Math.random()*4200);
}
reducedMotion.addEventListener('change',()=>{
  stopIdle();
  finishCellMotion();
  scheduleIdle();
});
if(game&&!game.completed&&game.size!==levelConfig(game.level).size){
  state.previousPuzzle=game;game=null;
  $('home-note').hidden=false;
  $('home-note').textContent='Your level will use the new smaller grid. Your tools and milestone progress are kept.';
}
let activeHint=null,messageTimer=null;
const modal=$('modal');
function save(){ if(restoringCloud)return;if(mode==='daily')state.dailyRun=game;else state.game=game; try { localStorage.setItem(STORAGE,JSON.stringify(state));cloud?.changed(); } catch { message('Your browser cannot save progress. Keep this tab open to continue your game.',true); } }
function message(text,important=false){
  const status=$('game-status');status.textContent=text;
  clearTimeout(messageTimer);status.classList.toggle('show-toast',important);
  if(important)messageTimer=setTimeout(()=>status.classList.remove('show-toast'),4000);
}
function finishHint(){
  if(!activeHint)return;
  const hint=activeHint;activeHint=null;hint.cleanup();
  document.body.classList.remove('hint-preview-open');modal.classList.remove('hint-overlay');
  modal.removeAttribute('aria-labelledby');modal.removeAttribute('aria-describedby');
  if(hint.game===game&&isPlaying&&!reducedMotion.matches)for(const i of hint.foundCells)playFound($('board').children[i]);
  if(hint.onContinue){if(hint.foundCells.length&&!reducedMotion.matches)setTimeout(hint.onContinue,FOUND_DURATION+40);else hint.onContinue();}
}
function showHint(hint,kind){
  dialog('hintDetails');finishCellMotion();
  $('hint-title').textContent=kind==='reveals'?'A FIREFLY REVEALED':'A LITTLE GUIDANCE';
  $('full-explanation').textContent=hint.text;
  for(const color of hint.colors||[]){
    const chip=document.createElement('span');chip.className='hint-color';chip.style.background=palette[color];chip.textContent='Color '+(color+1);$('hint-colors').append(chip);
  }
  modal.classList.add('hint-overlay');modal.setAttribute('aria-labelledby','hint-title');modal.setAttribute('aria-describedby','full-explanation');
  document.body.classList.add('hint-preview-open');
  activeHint={game,foundCells:hint.target?hint.cells:[],cleanup:renderHintBoard($('hint-board-stage'),$('board'),hintFocus(game,hint),hint.cells)};
  $('hint-continue').onclick=close;$('hint-continue').focus();
}
function dialog(name,values){cancelTap();cancelDrag();stopIdle();$('game-status').classList.remove('show-toast');const replacing=modal.open;renderDialog($('modal-content'),name,values);if(!modal.open)modal.showModal();if(replacing)motion.enter($('modal-content'));}
function cancelCloudChoice(){const cancel=cloudChoiceCancel;cloudChoiceCancel=null;if(cancel)void cancel();}
function close(){cancelCloudChoice();modal.close();finishHint();tick=Date.now();scheduleIdle();}
$('close-modal').onclick=()=>{if(!isPlaying||!game||game.lives>0)close();};
modal.addEventListener('close',()=>{if(!modal.open){cancelCloudChoice();finishHint();tick=Date.now();scheduleIdle();}});
modal.addEventListener('cancel',e=>{if(isPlaying&&game?.lives<=0||cloudChoiceCancel&&cloud?.status().working)e.preventDefault();});
function cancelTap(){pendingTap=null;}
function cancelDrag(){
  const previous=drag;drag=null;
  $('board').classList.remove('dragging');
  if(previous&&$('board').hasPointerCapture(previous.id))$('board').releasePointerCapture(previous.id);
  if(previous?.changed)save();
}
function renderHome(){
  const config=levelConfig(state.level);
  const journey=state.game;
  $('play-label').textContent=journey&&!journey.completed?`Continue level ${journey.level}`:state.level===1?'Begin training':`Play level ${state.level}`;
  $('play-meta').textContent=`${config.size} × ${config.size} · ${config.givens===2?'Two starter fireflies':config.givens===1?'One starter firefly':config.label}`;
  $('hearts-home-status').textContent=hearts.pending().length?`${hearts.pending().length} completed ${hearts.pending().length===1?'level':'levels'} awaiting upload today`:'Earn 1–3 hearts for each journey level you finish.';
  $('home-hints').textContent=state.hints;$('home-reveals').textContent=state.reveals;
  $('progress').style.width=`${state.completed%CARE_PACKAGE_LEVELS/CARE_PACKAGE_LEVELS*100}%`;
  $('milestone-text').textContent=`${CARE_PACKAGE_LEVELS-state.completed%CARE_PACKAGE_LEVELS} more ${CARE_PACKAGE_LEVELS-state.completed%CARE_PACKAGE_LEVELS===1?'level':'levels'} to your next care package.`;
  const day=dailyKey(),record=state.dailyRecords[day],run=state.dailyRun?.dailyDay===day?state.dailyRun:null;
  $('daily-date').textContent=new Date(day+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  $('daily-best').textContent=record?`Personal best ${formatSpeed(record.bestMs)} · ${record.finishes} ${record.finishes===1?'finish':'finishes'}`:'Set your first time today';
  $('daily-label').textContent=run?.completed?'Replay today’s puzzle':run?.lives<=0?'Try today again':run?.startedAt!=null?'Continue daily run':'Daily speed challenge';
  const previous=state.dailyRun;
  $('daily-previous').hidden=!(previous&&previous.dailyDay!==day&&previous.startedAt!==null&&!previous.completed&&previous.lives>0);
  if(!$('daily-previous').hidden)$('daily-previous').textContent=`Continue unfinished run · ${previous.dailyDay}`;
}
function showHome(){
  cancelTap();cancelDrag();close();isPlaying=false;stopIdle();finishCellMotion();
  motion.screen(()=>{document.body.classList.remove('playing');$('puzzle-screen').hidden=true;$('landing-screen').hidden=false;$('play').focus();return $('landing-screen');},'back');
  tick=Date.now();save();renderHome();
}
window.returnToLanding=()=>{if(!isPlaying)return false;showHome();return true;};
$('back-home').onclick=showHome;
$('play').onclick=async()=>{
  if(busy)return;
  cancelTap();cancelDrag();save();mode='journey';game=state.game;
  isPlaying=true;motion.screen(()=>{$('landing-screen').hidden=true;$('puzzle-screen').hidden=false;document.body.classList.add('playing');return $('puzzle-screen');});tick=Date.now();
  if(!game||game.completed)await newLevel();else{render();message('Welcome back. Every row, column, and color holds exactly one firefly.');}
  scheduleIdle();
  if(isPlaying&&game?.lives<=0)showLoss();
};
async function enterDaily(day,fresh=false,ranked=false){
  if(busy)return;
  cancelTap();cancelDrag();save();mode='daily';
  game=!fresh&&state.dailyRun?.dailyDay===day?state.dailyRun:null;
  isPlaying=true;motion.screen(()=>{$('landing-screen').hidden=true;$('puzzle-screen').hidden=false;document.body.classList.add('playing');return $('puzzle-screen');});tick=Date.now();
  if(!game||game.completed||game.lives<=0)await newDailyRun(day,ranked);
  else{beginDailyRun(game);render();save();message('Daily speed run: no tools or automatic crosses. The clock keeps running if you leave.');}
  scheduleIdle();
}
$('daily-play').onclick=()=>{
  if(busy)return;
  const day=dailyKey(),run=state.dailyRun;
  if(run?.dailyDay===day&&run.startedAt!==null&&!run.completed&&run.lives>0){enterDaily(day);return;}
  dialog('dailyIntro');
  $('daily-start').onclick=()=>{close();enterDaily(dailyKey(),true);};
  const ranked=document.createElement('button');ranked.className='primary';ranked.textContent='Race online →';ranked.onclick=async()=>{ranked.disabled=true;try{await profiles.ensureOnline();close();enterDaily(dailyKey(),true,true);}catch(error){dialog('raceStartError');$('race-error').textContent=error.message;$('race-home').onclick=showHome;}finally{ranked.disabled=false;}};$('daily-start').before(ranked);$('daily-start').textContent='Practice offline';$('daily-start').className='secondary';
};
$('daily-previous').onclick=()=>{if(state.dailyRun)enterDaily(state.dailyRun.dailyDay);};
async function newDailyRun(day,ranked=!!game?.online){
  cancelTap();cancelDrag();busy=true;game=null;renderedGame=null;
  $('board-wrap').classList.add('is-generating');
  $('board-complete').hidden=true;$('board-wrap').classList.remove('is-complete');
  $('board').replaceChildren();$('loading').hidden=false;
  $('level-prefix').textContent='Daily';$('level').textContent='';$('chapter').textContent='DAILY SPEED CHALLENGE';
  try{
    game=await new Promise((resolve,reject)=>{
      try{worker=new Worker('./generator-worker.js',{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.game);};worker.onerror=()=>{worker.terminate();reject(Error('worker'));};worker.postMessage({mode:'daily',day});}
      catch(error){reject(error);}
    });
  }catch{game=createDailyGame(day);}
  if(ranked){
    try{
      const ticket=await raceApi('runs',{method:'POST',profile:state.leaderboardProfile,body:{day,version:'speed-v1'}});
      if(ticket.day!==day||ticket.seed!==game.seed||ticket.size!==game.size)throw Error('Puzzle version mismatch. Update the app to race online.');
      game.online={runId:ticket.id,profileId:state.leaderboardProfile.id,status:'active'};game.rankedFinds=[];
    }catch(error){busy=false;$('loading').hidden=true;game=null;dialog('raceStartError');$('race-error').textContent=error.message;$('race-home').onclick=showHome;return;}
  }
  if(isPlaying)beginDailyRun(game);
  finishLoad();message('The clock is running. Find all eight fireflies—no tools, just your logic.');
}
$('board-next-level').onclick=async()=>{
  if(!isPlaying||busy||modal.open||!game?.completed)return;
  await newLevel();
};
$('care-package').onclick=()=>dialog('carePackage',{progress:`You have completed ${state.completed} levels. ${CARE_PACKAGE_LEVELS-state.completed%CARE_PACKAGE_LEVELS} more to your next package.`});
new ResizeObserver(([entry])=>{
  const side=Math.floor(Math.min(entry.contentRect.width,entry.contentRect.height));
  $('board-wrap').style.width=`${Math.max(0,side)}px`;
}).observe($('board-space'));
function render(){
  renderHome();
  if(!game)return;
  const daily=mode==='daily';
  $('level-prefix').textContent=daily?'Daily':'Level';$('level').textContent=daily?'':game.level;
  $('difficulty').textContent=daily?(game.online?'Ranked':'Practice'):levelConfig(game.level).label;
  $('chapter').textContent=daily?`${game.dailyDay} · UTC`:game.level<=6?'THE FIRST GLOW':'INTO THE GROVE';
  $('journey-tools').hidden=daily;$('daily-rules').hidden=!daily;
  $('hint').disabled=$('reveal').disabled=daily||busy||game.completed;
  $('board-complete').hidden=!game.completed||busy;
  $('board-wrap').classList.toggle('is-complete',game.completed&&!busy);
  $('board').inert=game.completed;
  $('board-complete-title').textContent=daily?'Daily complete':'Level complete';
  $('board-next-level').textContent=daily?'Play again →':'Next level →';
  $('board-next-level').disabled=busy;
  $('time').classList.toggle('speed-time',daily);
  $('daily-run-best').textContent=state.dailyRecords[game.dailyDay]?.bestMs!=null?`Best ${formatSpeed(state.dailyRecords[game.dailyDay].bestMs)}`:'Your first time awaits';
  $('size').textContent=`${game.size} × ${game.size}`;$('total').textContent=game.size;
  $('found').textContent=game.marks.filter(v=>v===2).length;
  $('lives').innerHTML=Array.from({length:3},(_,i)=>`<span class="${i>=game.lives?'lost-heart':''}">♥</span>`).join('');
  $('lives').setAttribute('aria-label',`${game.lives} lives remaining`);
  $('hints').textContent=state.hints||'+';$('reveals').textContent=state.reveals||'+';
  const board=$('board');board.style.gridTemplateColumns=`repeat(${game.size},1fr)`;board.style.setProperty('--size',game.size);
  const fresh=renderedGame!==game||board.children.length!==game.marks.length;
  if(fresh){
    stopIdle();renderedGame=game;
    board.innerHTML=game.regions.map((r,i)=>{
      const row=Math.floor(i/game.size), col=i%game.size;
      return `<button class="cell ${game.givens.includes(i)?'given':''} ${col<game.size-1&&game.regions[i+1]!==r?'region-right':''} ${row<game.size-1&&game.regions[i+game.size]!==r?'region-bottom':''}" style="--region:${palette[r]}" data-cell="${i}">${cross}</button>`;
    }).join('');
  }
  let crossIndex=0;
  game.marks.forEach((value,i)=>{
    const cell=board.children[i], previous=Number(cell.dataset.mark??-1);
    if(previous===value)return;
    cell.dataset.mark=value;
    cell.classList.toggle('marked',value===1);cell.classList.toggle('target',value===2);
    cell.classList.remove('just-found','just-crossed','error');
    cell.style.setProperty('--mark-delay',`${!fresh&&value===1?Math.min(crossIndex++*22,120):0}ms`);
    const row=Math.floor(i/game.size),col=i%game.size;
    cell.setAttribute('aria-label',`Row ${row+1}, column ${col+1}, color ${game.regions[i]+1}${value===1?', crossed out':value===2?', firefly':''}`);
    cell.setAttribute('aria-pressed',String(value!==0));
    if(value===2){cell.insertAdjacentHTML('beforeend',fly);if(!fresh&&!reducedMotion.matches)playFound(cell);}
    if(value===1&&!fresh&&!reducedMotion.matches)cell.classList.add('just-crossed');
  });
  if(fresh)scheduleIdle();
  updateTime();
}
function playFound(cell){
  const sprite=cell.querySelector('.firefly-sprite');if(!sprite)return;
  cell.classList.add('just-found');fireflies.play(sprite,'found',()=>cell.classList.remove('just-found'));
}
function updateTime(){if(game)$('time').textContent=mode==='daily'?formatSpeed(dailyElapsed(game)):`${String(Math.floor(game.elapsed/60)).padStart(2,'0')}:${String(game.elapsed%60).padStart(2,'0')}`;}
async function newLevel(restart=false){
  if(mode==='daily')return newDailyRun(game?.dailyDay||dailyKey());
  cancelTap();cancelDrag();busy=true;$('board-wrap').classList.add('is-generating');$('board-complete').hidden=true;$('board-wrap').classList.remove('is-complete');$('loading').hidden=false;$('hint').disabled=$('reveal').disabled=true;
  if(restart){game={...game,marks:Array(game.size**2).fill(0),lives:3,mistakes:0,elapsed:0,completed:false,heartFinds:[],heartCompletion:null};game.givens.forEach(i=>game.marks[i]=2);finishLoad();return;}
  let seed=(state.installSeed+Math.imul(state.level,2654435761))>>>0;
  try{
    game=await new Promise((resolve,reject)=>{
      try{worker=new Worker('./generator-worker.js',{type:'module'});worker.onmessage=({data})=>{if(data.error){worker.terminate();reject(Error(data.error));return;}if(state.puzzleKeys.includes(puzzleKey(data.game))){seed=(seed+7919)>>>0;worker.postMessage({level:state.level,seed});return;}worker.terminate();resolve(data.game);};worker.onerror=()=>{worker.terminate();reject(Error('worker'));};worker.postMessage({level:state.level,seed});}
      catch(error){reject(error);}
    });
  }catch{await new Promise(r=>setTimeout(r,40));do{game=createGame(state.level,seed);seed=(seed+7919)>>>0;}while(state.puzzleKeys.includes(puzzleKey(game)));}
  state.puzzleKeys.push(puzzleKey(game));
  finishLoad();
}
function finishLoad(){$('board-wrap').classList.remove('is-generating');if(mode==='journey')initializeHeartFinds(game);busy=false;$('home-note').hidden=true;$('loading').hidden=true;$('hint').disabled=$('reveal').disabled=false;tick=Date.now();render();motion.enter($('board-wrap'),'board');save();message(game.givens.length?`${game.givens.length===2?'Two fireflies have':'One firefly has'} already settled in. Let's find their friends.`:'A fresh patch of the grove. Take your time and follow the colors.');}
function showMistake(cell){
  clearTimeout(mistakeTimers.get(cell));
  cell.classList.remove('error');
  void cell.offsetWidth; // Restart the pulse for a repeated incorrect find.
  cell.classList.add('error');
  mistakeTimers.set(cell,setTimeout(()=>{cell.classList.remove('error');mistakeTimers.delete(cell);},650));
}
function vibrate(){if(state.settings.haptics)navigator.vibrate?.(50);}
function autoCross(){if(mode==='daily'||!state.settings.autoCross)return;const n=game.size,targets=game.marks.flatMap((v,i)=>v===2?[i]:[]);game.marks.forEach((v,i)=>{if(!v&&!isTarget(game,i)&&targets.some(t=>Math.floor(t/n)===Math.floor(i/n)||t%n===i%n||game.regions[t]===game.regions[i]||(Math.abs(Math.floor(t/n)-Math.floor(i/n))<=1&&Math.abs(t%n-i%n)<=1)))game.marks[i]=1;});}
function move(i,target){
  if(!isPlaying||busy||modal.open)return;
  const result=applyMove(game,i,target);
  if(result==='ignored')return;
  if(target&&mode==='journey')game.heartFinds.push(i);
  if(target&&mode==='daily'&&game.online?.status==='active')game.rankedFinds.push(i);
  if(mode==='daily'&&game.lives===0)freezeDailyRun(game);
  if(result==='mistake'){vibrate();message('No firefly here. One life lost.',true);}
  else {autoCross();if(target)message('A little light found. Every row, column, and color has just one.');}
  render();save();
  if(result==='mistake')showMistake($('board').children[i]);
  if(game?.lives===0)showLoss();else if(result==='won')win();
}
$('board').addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||drag||!isPlaying||busy||modal.open||!game||game.completed||game.lives<=0)return;
  suppressDragClick=false;
  const cell=e.target.closest('[data-cell]');if(!cell)return;
  const i=Number(cell.dataset.cell);if(game.marks[i]===2)return;
  const point={x:e.clientX,y:e.clientY};
  drag={id:e.pointerId,type:e.pointerType,start:point,last:point,mark:game.marks[i]===1?0:1,visited:new Set(),active:false,changed:false};
});
function extendDrag(e){
  if(!drag||e.pointerId!==drag.id)return;
  if(e.type==='pointermove'&&e.buttons===0){cancelTap();cancelDrag();return;}
  const point={x:e.clientX,y:e.clientY};
  if(!drag.active){
    if(Math.hypot(point.x-drag.start.x,point.y-drag.start.y)<7)return;
    drag.active=true;suppressDragClick=true;cancelTap();
    $('board').classList.add('dragging');
    if(e.type!=='pointerup')$('board').setPointerCapture(e.pointerId);
  }
  if(e.cancelable)e.preventDefault();
  const rect=$('board').getBoundingClientRect();
  const cells=cellsAlongSegment(drag.last,point,game.size,rect).filter(i=>!drag.visited.has(i));
  cells.forEach(i=>drag.visited.add(i));drag.last=point;
  if(paintNotes(game,cells,drag.mark).length){drag.changed=true;render();}
}
window.addEventListener('pointermove',extendDrag,{passive:false});
window.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId){extendDrag(e);cancelDrag();}},{passive:false});
window.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId){cancelTap();cancelDrag();}});
$('board').addEventListener('lostpointercapture',e=>{if(e.target===$('board')&&drag?.id===e.pointerId)cancelDrag();});
window.addEventListener('blur',()=>{cancelTap();cancelDrag();});
$('board').addEventListener('click',e=>{
  if(suppressDragClick&&e.detail!==0){suppressDragClick=false;return;}
  const cell=e.target.closest('[data-cell]');
  if(!cell||!isPlaying||busy||modal.open||!game||game.completed||game.lives<=0)return;
  const i=Number(cell.dataset.cell);
  if(e.detail===0){cancelTap();move(i,e.shiftKey);return;}
  if(game.marks[i]===2){cancelTap();return;}
  const now=performance.now();
  if(pendingTap?.i===i&&now-pendingTap.at<=DOUBLE_TAP_MS){
    // The first tap was shown immediately. A second tap converts that gesture
    // into a find attempt, preserving the original note if the find is wrong.
    game.marks[i]=pendingTap.before;
    cancelTap();move(i,true);return;
  }
  pendingTap={i,at:now,before:game.marks[i]};
  move(i,false);
});
$('board').addEventListener('dblclick',e=>e.preventDefault());
$('board').addEventListener('animationend',e=>{
  const cell=e.target.closest('[data-cell]');if(!cell)return;
  if(e.animationName==='cross-cell-confirm')cell.classList.remove('just-crossed');
  if(e.animationName==='mistake')cell.classList.remove('error');
});
$('board').addEventListener('contextmenu',e=>{
  const cell=e.target.closest('[data-cell]');if(!cell)return;
  e.preventDefault();cancelTap();
  // A touch long-press during painting must never turn into a find attempt.
  if(drag?.type==='touch'||drag?.active||e.pointerType==='touch')return;
  if(e.pointerType==='mouse'||e.button===2)move(Number(cell.dataset.cell),true);
});
function win(){
  if(mode==='daily'){winDaily();return;}
  const completedGame=game;
  game.heartCompletion=hearts.queue(game);
  hearts.flush().then(()=>updateJourneyHeartStatus(completedGame));
  state.completed++;state.level++;let reward=false;
  if(state.completed%CARE_PACKAGE_LEVELS===0){state.hints+=2;state.reveals++;reward=true;}
  save();render();void cloud?.flush();
  // Let the last firefly finish arriving before covering the board.
  const showCompletion=()=>{
    if(!isPlaying||busy||game!==completedGame)return;
    dialog('journeyWin',{details:`Every firefly found its home. Level ${game.level} complete in ${$("time").textContent}, with ${game.mistakes} ${game.mistakes===1?"mistake":"mistakes"}.`,next:`Wander to level ${state.level} →`});
    $('win-reward').hidden=!reward;updateJourneyHeartStatus(completedGame);
    $('journey-hearts-board').onclick=()=>showHeartsLeaderboard(completedGame.heartCompletion?.body.day);
    $('next-level').onclick=()=>{close();newLevel();};
  };
  if(activeHint)activeHint.onContinue=showCompletion;else setTimeout(showCompletion,reducedMotion.matches?0:FOUND_DURATION+40);
}
function winDaily(){
  const result=recordDailyResult(state.dailyRecords,game);if(!result)return;
  save();render();const completedGame=game;
  if(completedGame.online)submitRace(completedGame);
  setTimeout(()=>{
    if(!isPlaying||busy||game!==completedGame)return;
    dialog('dailyWin',{title:result.improved?"A new personal best!":"Daily complete.",time:formatSpeed(game.elapsedMs),details:`${game.dailyDay} · ${game.mistakes} ${game.mistakes===1?"mistake":"mistakes"}`,best:formatSpeed(result.bestMs)});
    $('daily-again').onclick=()=>{close();newDailyRun(completedGame.dailyDay);};
    $('daily-home').onclick=showHome;
    const status=document.createElement('p');status.id='race-status';status.setAttribute('aria-live','polite');$('daily-again').before(status);
    const retry=document.createElement('button');retry.id='race-submit';retry.className='secondary';retry.textContent='Retry score upload';retry.onclick=()=>submitRace(completedGame);$('daily-again').before(retry);
    const board=document.createElement('button');board.className='secondary';board.textContent='Leaderboard';board.onclick=()=>showLeaderboard(completedGame.dailyDay);$('daily-again').before(board);updateRaceStatus(completedGame);
  },reducedMotion.matches?0:FOUND_DURATION+40);
}
function showLoss(){
  if(mode==='daily'){
    dialog('dailyLoss',{details:`You used all three lives in ${formatSpeed(game.elapsedMs)}. Restart the same daily puzzle for free with a fresh clock. Failed runs do not change your best.`});
    $('retry').onclick=()=>{close();newDailyRun(game.dailyDay);};$('daily-loss-home').onclick=showHome;return;
  }
  dialog('journeyLoss');$('retry').onclick=()=>{close();newLevel(true);};$('revive').onclick=()=>offerReward('life');
}
function offerReward(kind){
  const native=location.origin==='https://appassets.androidplatform.net';
  dialog('reward',{symbol:kind==="life"?"♡":"✧",details:`${kind==="life"?"Restore one life":kind==="hints"?"Add one hint":"Add one firefly reveal"} with an optional reward video. You can always keep playing and earn tools every ten completed levels.`,note:native?"Reward videos are unavailable until an ad provider is configured for this Android build.":"Browser preview: this is a simulated reward. No real advertisement will play.",back:game?.lives===0?"Back to restart":"Back to the grove"});
  $('preview-reward').hidden=native;
  if(!native)$('preview-reward').onclick=()=>{if(kind==='life'){game.heartFinds.push(-1);game.lives=1;}else state[kind]++;save();render();close();message(kind==='life'?'One life restored. Take your time.':'Your preview reward is ready. Select the tool to use it.');};
  $('reward-back').onclick=()=>{if(isPlaying&&game?.lives===0)showLoss();else close();};
}
function tool(kind){
  cancelTap();cancelDrag();if(!isPlaying||busy||modal.open||!game||game.completed)return;if(game.lives<=0){showLoss();return;}
  if(mode==='daily'){message('Daily speed challenges have no hints or reveals. Your tools have not been spent.');return;}
  if(state[kind]<=0){offerReward(kind);return;}
  const hint=kind==='hints'?findHint(game):{cells:[game.marks.findIndex((v,i)=>v!==2&&isTarget(game,i))],target:true,text:'A hidden friend, brought into the light. See what this firefly tells you about its row, column, and color.'};
  if(!hint){showHint({cells:[],text:'No explained deduction is available right now. Try checking your crosses or finding another firefly. No tool was spent.'},kind);return;}
  state[kind]--;for(const i of hint.cells){const result=applyMove(game,i,hint.target);if(hint.target&&result!=='ignored')game.heartFinds.push(i);}autoCross();render();save();showHint(hint,kind);if(game.completed)win();
}
$('hint').onclick=()=>tool('hints');$('reveal').onclick=()=>tool('reveals');
$('restart').onclick=()=>{if(!game||busy)return;dialog('restart',{details:mode==="daily"?"Restart the same daily puzzle with three lives and a fresh clock. Your personal best stays saved. The current clock keeps running until you restart.":"Restart this puzzle with three lives. Your used tools stay spent. Restarting is always free.",restart:mode==="daily"?"Restart daily":"Restart level"});$('confirm-restart').onclick=()=>{close();if(game.completed){newLevel();}else newLevel(true);};$('keep-playing').onclick=close;};
$('help').onclick=()=>dialog('help');
function showSettings(){
  dialog('settings');
  $('auto-cross').checked=!!state.settings.autoCross;$('haptics').checked=!!state.settings.haptics;
  for(const [id,key]of[['auto-cross','autoCross'],['haptics','haptics']])$(id).onchange=e=>{state.settings[key]=e.target.checked;save();render();};
  $('race-name').value=state.leaderboardProfile.name;
  $('player-id').textContent=state.leaderboardProfile.localId;
  $('profile-form').onsubmit=async event=>{
    event.preventDefault();const button=$('profile-save'),status=$('profile-error');button.disabled=true;
    try{await profiles.rename($('race-name').value);if(status.isConnected){$('race-name').value=state.leaderboardProfile.name;status.textContent='Username saved.';}}
    catch(error){if(status.isConnected)status.textContent=error.message;}
    finally{button.disabled=false;}
  };
  $('more-tools').onclick=()=>{dialog('moreTools');$('extra-hint').onclick=()=>offerReward('hints');$('extra-reveal').onclick=()=>offerReward('reveals');};
  updateCloudSettings();
  $('cloud-connect').onclick=async()=>{await cloud.connect();updateCloudSettings();};
  $('cloud-sync').onclick=async()=>{await cloud.syncNow();updateCloudSettings();};
  $('cloud-disconnect').onclick=async()=>{try{await cloud.disconnect();}catch(error){$('cloud-status').textContent=error.message;}};
  $('cloud-recover').onclick=()=>{
    try{
      const previous=parseDeviceBackup(localStorage.getItem('firefly-cloud-before-restore-v1'),LEADERBOARD_ORIGIN);
      dialog('cloudRecovery',{details:`Level ${previous.level} · ${previous.completed} completed · ${previous.hints} hints · ${previous.reveals} reveals`});
      $('cloud-recovery-cancel').onclick=showSettings;
      $('cloud-recovery-confirm').onclick=async()=>{
        $('cloud-recovery-confirm').disabled=true;
        try{await cloud.disconnect();restoreDeviceState(previous);}
        catch(error){$('cloud-recovery-error').textContent=error.message;$('cloud-recovery-confirm').disabled=false;}
      };
    }catch(error){$('cloud-status').textContent=error.message;}
  };
}
function updateCloudSettings(){
  if(!cloud)return;
  const status=cloud.status();
  if($('cloud-recovery-confirm'))$('cloud-recovery-confirm').disabled=status.working;
  const choosing=!!$('cloud-choices');$('close-modal').disabled=choosing&&status.working;
  if(choosing){
    $('cloud-choices').querySelectorAll('button').forEach(button=>button.disabled=status.working);
    $('cloud-choice-cancel').disabled=status.working;
    $('cloud-choice-status').textContent=status.working?'Saving your choice…':'';
  }
  if($('cloud-attention'))$('cloud-attention').hidden=!status.attention;
  if(!$('cloud-status'))return;
  $('cloud-status').textContent=status.message+(status.enabled&&status.account?' Linked to '+status.account+'.':'');
  $('cloud-connect').hidden=status.enabled;$('cloud-connect').disabled=!status.available||status.working;
  $('cloud-sync').hidden=$('cloud-disconnect').hidden=!status.enabled;
  $('cloud-sync').textContent=status.attention?'Choose a save':'Sync now';
  $('cloud-sync').disabled=$('cloud-disconnect').disabled=status.working;
  try{$('cloud-recover').hidden=!localStorage.getItem('firefly-cloud-before-restore-v1');}catch{$('cloud-recover').hidden=true;}
  $('cloud-recover').disabled=status.working;
}
function showCloudConflict(choices,select,cancel){
  if(isPlaying||restoringCloud)return;
  dialog('cloudConflict');cloudChoiceCancel=cancel;
  for(const choice of choices){
    const button=document.createElement('button');button.className='secondary';
    const {level,completed,hints,reveals,savedAt}=choice.summary;
    button.textContent=`${choice.title} · Level ${level} · ${completed} completed · ${hints} hints · ${reveals} reveals${savedAt?' · '+new Date(savedAt).toLocaleString():''}`;
    button.onclick=async()=>{
      $('cloud-choices').querySelectorAll('button').forEach(control=>control.disabled=true);
      try{await select(choice.key);if(!restoringCloud&&!cloud.status().attention){cloudChoiceCancel=null;showSettings();}}
      catch{cloudChoiceCancel=null;showSettings();}
    };
    $('cloud-choices').append(button);
  }
  $('cloud-choice-cancel').onclick=()=>{cancelCloudChoice();showSettings();};
}
function restoreDeviceState(restored){
    const backup=localStorage.getItem(STORAGE);
    if(backup)localStorage.setItem('firefly-cloud-before-restore-v1',backup);
    localStorage.setItem(STORAGE,JSON.stringify(restored));state=restored;restoringCloud=true;
    setTimeout(()=>location.reload(),0);
}
cloud=cloudManager({bridge:cloudBridge(),storage:localStorage,readState:()=>state,origin:LEADERBOARD_ORIGIN,
  onStatus:updateCloudSettings,onConflict:showCloudConflict,restore:restoreDeviceState});
void cloud.initialize();
$('settings').onclick=showSettings;
$('cloud-attention').onclick=()=>{showSettings();cloud.showChoices();};
document.addEventListener('firefly-pause',()=>{nativePaused=true;cancelTap();cancelDrag();save();tick=Date.now();stopIdle();finishCellMotion();if(!restoringCloud)void cloud.flush();});
document.addEventListener('firefly-resume',()=>{nativePaused=false;tick=Date.now();updateTime();scheduleIdle();if(!restoringCloud)void cloud.flush();});
setInterval(()=>{const now=Date.now();if(mode==='journey'&&isPlaying&&!nativePaused&&game&&!busy&&!game.completed&&game.lives>0&&!document.hidden&&!modal.open){game.elapsed+=Math.min(2,Math.floor((now-tick)/1000));updateTime();if(game.elapsed%10===0)save();}tick=now;},1000);
setInterval(()=>{if(mode==='daily'&&isPlaying&&game&&!busy&&!document.hidden)updateTime();},100);
setInterval(()=>{if(!isPlaying)renderHome();},30000);
document.addEventListener('visibilitychange',()=>{cancelTap();cancelDrag();save();tick=Date.now();if(document.hidden){stopIdle();finishCellMotion();if(!restoringCloud)void cloud.flush();}else{renderHome();updateTime();scheduleIdle();hearts.flush();}});
render();save();
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});



async function showLeaderboard(day=dailyKey()){
  dialog('leaderboard');
  $('ranking-day').value=day;$('ranking-day').max=dailyKey();$('ranking-day').min=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  $('ranking-day').onchange=()=>showLeaderboard($('ranking-day').value);$('ranking-refresh').onclick=()=>showLeaderboard(day);
  const pending=state.dailyRun;
  if(pending?.completed&&pending.online&&!pending.online.result){const retry=document.createElement('button');retry.className='secondary';retry.textContent='Upload finished race';retry.onclick=async()=>{await submitRace(pending);showLeaderboard(day);};$('ranking-entries').before(retry);}
  const status=$('ranking-status'),list=$('ranking-entries');
  try{
    const data=await raceApi('leaderboard?day='+encodeURIComponent(day),{profile:state.leaderboardProfile});if(!status.isConnected)return;
    status.textContent=data.total?`${data.total} racers · top 50${data.mine?' · Your best: #'+data.mine.rank+' · '+formatSpeed(data.mine.elapsedMs):''}`:'No times yet. Be the first to finish an online race!';
    for(const entry of data.entries){const row=document.createElement('div');row.className='ranking-row'+(entry.isYou?' ranking-you':'');const who=document.createElement('span'),time=document.createElement('strong');who.textContent=`#${entry.rank}  ${entry.name} · ${entry.tag}${entry.isYou?' (you)':''}`;time.textContent=formatSpeed(entry.elapsedMs);row.append(who,time);const mistakes=document.createElement('small');mistakes.textContent=`${entry.mistakes} mistakes`;row.append(mistakes);list.append(row);}
  }catch(error){if(status.isConnected)status.textContent=error.message;}
}
function updateRaceStatus(run){
  if(game!==run||!$('race-status'))return;const online=run.online;
  $('race-status').textContent=!online?'Offline practice · personal best saved on this device.':online.result?`Official time ${formatSpeed(online.result.elapsedMs)} · Your daily best ranks #${online.result.mine.rank} of ${online.result.total}.`:online.error||'Submitting your time…';$('race-submit').hidden=!online?.error;
}
const submittingRaces=new WeakSet();
async function submitRace(run){
  if(!run.online||submittingRaces.has(run))return;submittingRaces.add(run);delete run.online.error;updateRaceStatus(run);
  try{if(state.leaderboardProfile?.id!==run.online.profileId)throw Error('This race belongs to a different player profile.');run.online.result=await raceApi('finish',{method:'POST',profile:state.leaderboardProfile,body:{runId:run.online.runId,finds:run.rankedFinds}});run.online.status='finished';}
  catch(error){run.online.error=error.message+' Retry when connected; the server clock keeps running until your finish arrives.';}
  finally{submittingRaces.delete(run);delete run.online.sending;try{if(!restoringCloud){localStorage.setItem(STORAGE,JSON.stringify(state));cloud?.changed();}}catch{}updateRaceStatus(run);}
}
const rankingButton=document.createElement('button');rankingButton.id='leaderboard';rankingButton.className='secondary leaderboard-button';rankingButton.textContent='Speed leaderboard ◷';rankingButton.onclick=()=>showLeaderboard();$('daily-best').before(rankingButton);

if(LEADERBOARD_ORIGIN)profiles.ensureOnline().then(()=>hearts.flush()).catch(()=>{});
window.addEventListener('online',()=>{if(LEADERBOARD_ORIGIN)profiles.ensureOnline().catch(()=>{});});

function updateJourneyHeartStatus(run){
  if(game!==run||!$('journey-heart-status'))return;
  const entry=run.heartCompletion;
  $('journey-heart-status').textContent=!entry?'This level has already contributed its hearts.':entry.status==='synced'?`+${entry.hearts} hearts · Daily total ${entry.result.mine.hearts} · Rank #${entry.result.mine.rank}`:entry.status==='duplicate'?'This level has already contributed its hearts.':entry.status==='pending'?`${entry.hearts} hearts awaiting upload. Sync before 00:00 UTC.${entry.error?' '+entry.error:''}`:entry.error;
}
$('hearts-leaderboard').onclick=()=>showHeartsLeaderboard();
async function showHeartsLeaderboard(day=dailyKey()){
  // The completed board keeps its Next level button behind the rankings.
  dialog('heartsLeaderboard');
  $('hearts-day').value=day;$('hearts-day').max=dailyKey();$('hearts-day').min=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  $('hearts-day').onchange=()=>showHeartsLeaderboard($('hearts-day').value);$('hearts-refresh').onclick=()=>showHeartsLeaderboard(day);
  const status=$('hearts-status'),list=$('hearts-entries');
  try{
    await hearts.flush();
    const data=await raceApi('hearts?day='+encodeURIComponent(day),{profile:state.leaderboardProfile});if(!status.isConnected)return;
    status.textContent=data.total?`${data.total} ${data.total===1?'player':'players'} · top 50${data.mine?' · You: #'+data.mine.rank+' · '+data.mine.hearts+' hearts':''}`:'No hearts yet. Finish a journey level to join today’s rankings!';
    for(const entry of data.entries){
      const row=document.createElement('div');row.className='ranking-row'+(entry.isYou?' ranking-you':'');
      const who=document.createElement('span'),score=document.createElement('strong'),levels=document.createElement('small');
      who.textContent=`#${entry.rank}  ${entry.name} · ${entry.tag}${entry.isYou?' (you)':''}`;score.textContent=`${entry.hearts} ♥`;levels.textContent=`${entry.levels} ${entry.levels===1?'level':'levels'} completed`;
      row.append(who,score,levels);list.append(row);
    }
    if(hearts.pending().length)status.textContent+=' · Some levels are still awaiting upload.';
  }catch(error){if(status.isConnected)status.textContent=error.status===404?'Heart rankings are awaiting the server update.':error.message;}
}
