import {raceApi,LEADERBOARD_ORIGIN} from './leaderboard-client.js';
import { createGame, applyMove, findHint, isTarget, levelConfig } from './engine.js';
import { cellsAlongSegment, paintNotes } from './gestures.js';
import {dailyKey,createDailyGame,beginDailyRun,dailyElapsed,freezeDailyRun,recordDailyResult,formatSpeed} from './daily.js';
const $ = id => document.getElementById(id);
const STORAGE = 'firefly-grove-v1';
const palette = ['#d9e5ba','#e6c2a9','#c6dcd6','#e7d9a4','#cfc9e2','#b8d4ac','#e4c7ce','#bfcde0','#e3c49a','#c1dfc2','#d7d3ac','#c9bee0','#dbbcae','#b8d9dd'];
const fly = '<span class="firefly-arrival"><svg class="firefly-sprite" viewBox="0 0 48 48" aria-hidden="true"><g class="firefly-wings"><path d="M22 24C4 28 6 7 16 13c5 3 7 8 8 13C25 8 41 8 38 20c-2 8-9 8-14 6" fill="#faf9dc" stroke="#567344" stroke-width="1.5"/></g><ellipse cx="24" cy="31" rx="7" ry="10" fill="#38593c"/><ellipse class="firefly-light" cx="24" cy="35" rx="5" ry="5" fill="#e7d985"/><circle cx="24" cy="22" r="5" fill="#38593c"/><path d="m22 19-4-5m8 5 4-5" stroke="#38593c" stroke-width="1.5" stroke-linecap="round"/></svg></span>';
const cross = '<svg class="cross-mark" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke-linecap="round"><g stroke="#fffdec" stroke-width="6"><path class="cross-line" pathLength="1" d="M8 8 24 24"/><path class="cross-line cross-second" pathLength="1" d="M24 8 8 24"/></g><g stroke="#234536" stroke-width="3.5"><path class="cross-line" pathLength="1" d="M8 8 24 24"/><path class="cross-line cross-second" pathLength="1" d="M24 8 8 24"/></g></svg>';
const defaults = () => ({ version:1, installSeed:crypto.getRandomValues(new Uint32Array(1))[0], level:1, completed:0, hints:3, reveals:2, game:null, settings:{ autoCross:false, haptics:true } });
let state;
try { state=JSON.parse(localStorage.getItem(STORAGE)); if(state?.version!==1 || !Number.isInteger(state.level) || !state.settings) state=null; } catch {}
state ||= defaults();
delete state.settings.targetMode;
state.puzzleKeys ||= [];
state.dailyRecords ||= {};
// Keep test-server identities separate from real online profiles.
state.leaderboardProfiles ||= {};
state.leaderboardProfile=state.leaderboardProfiles[LEADERBOARD_ORIGIN]||null;
const puzzleKey = puzzle => puzzle.size + ':' + puzzle.regions.map(r=>r.toString(36)).join('');
let game=state.game, busy=false, tick=Date.now(), pendingTap=null, worker=null, isPlaying=false;
let renderedGame=null, idleTimer=null;
let mode='journey';
let drag=null,suppressDragClick=false;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const idleClasses=['idle-bob','idle-wiggle','idle-flutter'];
function stopIdle(){
  clearTimeout(idleTimer);idleTimer=null;
  document.querySelectorAll('.firefly-sprite').forEach(sprite=>sprite.classList.remove(...idleClasses));
}
function finishCellMotion(){
  $('board').querySelectorAll('.just-found,.just-crossed').forEach(cell=>cell.classList.remove('just-found','just-crossed'));
}
function scheduleIdle(){
  clearTimeout(idleTimer);
  if(!isPlaying||document.hidden||reducedMotion.matches||$('modal').open)return;
  idleTimer=setTimeout(()=>{
    const sprites=[...$('board').querySelectorAll('.target:not(.just-found) .firefly-sprite')];
    if(sprites.length){
      const sprite=sprites[Math.floor(Math.random()*sprites.length)];
      sprite.classList.remove(...idleClasses);
      sprite.classList.add(idleClasses[Math.floor(Math.random()*idleClasses.length)]);
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
let lastMessage={text:'Two fireflies have already settled in. Let’s find their friends.',colors:[]};
const modal=$('modal');
function save(){ if(mode==='daily')state.dailyRun=game;else state.game=game; try { localStorage.setItem(STORAGE,JSON.stringify(state)); } catch { message('Your browser cannot save progress. Keep this tab open to continue your game.'); } }
function message(text,colors=[]){
  lastMessage={text,colors};$('message-details').hidden=text.length<50;
  const paragraph=$('message-text');paragraph.textContent='';
  for(const color of colors){
    const chip=document.createElement('span');chip.className='hint-color';
    chip.style.background=palette[color];chip.textContent=color+1;
    chip.setAttribute('aria-label',`Color ${color+1}`);paragraph.append(chip);
  }
  paragraph.append(document.createTextNode(text));
}
function dialog(html){cancelTap();cancelDrag();stopIdle();$('modal-content').innerHTML=html;if(!modal.open)modal.showModal();}
function close(){modal.close();tick=Date.now();scheduleIdle();}
$('close-modal').onclick=()=>{if(!isPlaying||!game||game.lives>0)close();};
modal.addEventListener('cancel',e=>{if(isPlaying&&game?.lives<=0)e.preventDefault();});
function cancelTap(){if(pendingTap){clearTimeout(pendingTap.timer);pendingTap=null;}}
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
  $('home-hints').textContent=state.hints;$('home-reveals').textContent=state.reveals;
  $('progress').style.width=`${state.completed%5/5*100}%`;
  $('milestone-text').textContent=`${5-state.completed%5} more ${5-state.completed%5===1?'level':'levels'} to your next care package.`;
  const day=dailyKey(),record=state.dailyRecords[day],run=state.dailyRun?.dailyDay===day?state.dailyRun:null;
  $('daily-date').textContent=new Date(day+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  $('daily-best').textContent=record?`Personal best ${formatSpeed(record.bestMs)} · ${record.finishes} ${record.finishes===1?'finish':'finishes'}`:'Set your first time today';
  $('daily-label').textContent=run?.completed?'Replay today’s puzzle':run?.lives<=0?'Try today again':run?.startedAt!=null?'Continue daily run':'Daily speed challenge';
  const previous=state.dailyRun;
  $('daily-previous').hidden=!(previous&&previous.dailyDay!==day&&previous.startedAt!==null&&!previous.completed&&previous.lives>0);
  if(!$('daily-previous').hidden)$('daily-previous').textContent=`Continue unfinished run · ${previous.dailyDay}`;
}
function showHome(){
  cancelTap();cancelDrag();close();isPlaying=false;stopIdle();finishCellMotion();document.body.classList.remove('playing');
  $('puzzle-screen').hidden=true;$('landing-screen').hidden=false;
  tick=Date.now();save();renderHome();$('play').focus();
}
window.returnToLanding=()=>{if(!isPlaying)return false;showHome();return true;};
$('back-home').onclick=showHome;
$('play').onclick=async()=>{
  if(busy)return;
  cancelTap();cancelDrag();save();mode='journey';game=state.game;
  isPlaying=true;$('landing-screen').hidden=true;$('puzzle-screen').hidden=false;
  document.body.classList.add('playing');tick=Date.now();
  if(!game||game.completed)await newLevel();else{render();message('Welcome back. Every row, column, and color holds exactly one firefly.');}
  scheduleIdle();
  if(isPlaying&&game?.lives<=0)showLoss();
};
async function enterDaily(day,fresh=false,ranked=false){
  if(busy)return;
  cancelTap();cancelDrag();save();mode='daily';
  game=!fresh&&state.dailyRun?.dailyDay===day?state.dailyRun:null;
  isPlaying=true;$('landing-screen').hidden=true;$('puzzle-screen').hidden=false;
  document.body.classList.add('playing');tick=Date.now();
  if(!game||game.completed||game.lives<=0)await newDailyRun(day,ranked);
  else{beginDailyRun(game);render();save();message('Daily speed run: no tools or automatic crosses. The clock keeps running if you leave.');}
  scheduleIdle();
}
$('daily-play').onclick=()=>{
  if(busy)return;
  const day=dailyKey(),run=state.dailyRun;
  if(run?.dailyDay===day&&run.startedAt!==null&&!run.completed&&run.lives>0){enterDaily(day);return;}
  dialog('<div class="modal-symbol">◷</div><h2>A little race against time.</h2><p>Today’s shared <b>8 × 8</b> puzzle has no starter fireflies. Find all eight as quickly as you can.</p><ul><li>Three lives. No hints, reveals, automatic crosses, or ad revives.</li><li>Online races use the server clock from start to finish, including network travel. The clock keeps running if you leave.</li><li>Restart freely. Online races publish your nickname and best time; offline practice saves a personal best on this device.</li><li>A fresh puzzle arrives at 00:00 UTC. Regular levels and tools stay separate.</li></ul><button class="primary" id="daily-start">Start the clock →</button>');
  $('daily-start').onclick=()=>{close();enterDaily(dailyKey(),true);};
  const ranked=document.createElement('button');ranked.className='primary';ranked.textContent='Race online →';ranked.onclick=()=>chooseProfile(()=>{close();enterDaily(dailyKey(),true,true);});$('daily-start').before(ranked);$('daily-start').textContent='Practice offline';$('daily-start').className='secondary';
};
$('daily-previous').onclick=()=>{if(state.dailyRun)enterDaily(state.dailyRun.dailyDay);};
async function newDailyRun(day,ranked=!!game?.online){
  cancelTap();cancelDrag();busy=true;game=null;renderedGame=null;
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
    }catch(error){busy=false;$('loading').hidden=true;game=null;dialog('<h2>Could not start the race.</h2><p id="race-error"></p><button class="primary" id="race-home">Back to home</button>');$('race-error').textContent=error.message;$('race-home').onclick=showHome;return;}
  }
  if(isPlaying)beginDailyRun(game);
  finishLoad();message('The clock is running. Find all eight fireflies—no tools, just your logic.');
}
$('message-details').onclick=()=>{
  dialog('<div class="modal-symbol">✧</div><h2>A little guidance.</h2><p id="full-explanation"></p>');
  $('full-explanation').textContent=lastMessage.text;
};
$('care-package').onclick=()=>dialog(`<div class="modal-symbol">♧</div><h2>A little care package.</h2><p>Every five completed levels earns <b>2 hints and 1 firefly reveal</b>. Rewards are added automatically.</p><p>You have completed ${state.completed} levels. ${5-state.completed%5} more to your next package.</p><p>Hints explain a rule and mark its affected cells. Reveals uncover one hidden firefly. Restarting a puzzle never spends a tool.</p>`);
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
  $('hint').disabled=$('reveal').disabled=daily||busy;
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
    cell.classList.remove('just-found','just-crossed');
    cell.style.setProperty('--mark-delay',`${!fresh&&value===1?Math.min(crossIndex++*22,120):0}ms`);
    const row=Math.floor(i/game.size),col=i%game.size;
    cell.setAttribute('aria-label',`Row ${row+1}, column ${col+1}, color ${game.regions[i]+1}${value===1?', crossed out':value===2?', firefly':''}`);
    cell.setAttribute('aria-pressed',String(value!==0));
    if(value===2){cell.insertAdjacentHTML('beforeend',fly);if(!fresh&&!reducedMotion.matches)cell.classList.add('just-found');}
    if(value===1&&!fresh&&!reducedMotion.matches)cell.classList.add('just-crossed');
  });
  if(fresh)scheduleIdle();
  updateTime();
}
function updateTime(){if(game)$('time').textContent=mode==='daily'?formatSpeed(dailyElapsed(game)):`${String(Math.floor(game.elapsed/60)).padStart(2,'0')}:${String(game.elapsed%60).padStart(2,'0')}`;}
async function newLevel(restart=false){
  if(mode==='daily')return newDailyRun(game?.dailyDay||dailyKey());
  cancelTap();cancelDrag();busy=true;$('loading').hidden=false;$('hint').disabled=$('reveal').disabled=true;
  if(restart){game={...game,marks:Array(game.size**2).fill(0),lives:3,mistakes:0,elapsed:0,completed:false};game.givens.forEach(i=>game.marks[i]=2);finishLoad();return;}
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
function finishLoad(){busy=false;$('home-note').hidden=true;$('loading').hidden=true;$('hint').disabled=$('reveal').disabled=false;tick=Date.now();render();save();message(game.givens.length?`${game.givens.length===2?'Two fireflies have':'One firefly has'} already settled in. Let's find their friends.`:'A fresh patch of the grove. Take your time and follow the colors.');}
function vibrate(){if(state.settings.haptics)navigator.vibrate?.(50);}
function autoCross(){if(mode==='daily'||!state.settings.autoCross)return;const n=game.size,targets=game.marks.flatMap((v,i)=>v===2?[i]:[]);game.marks.forEach((v,i)=>{if(!v&&!isTarget(game,i)&&targets.some(t=>Math.floor(t/n)===Math.floor(i/n)||t%n===i%n||game.regions[t]===game.regions[i]||(Math.abs(Math.floor(t/n)-Math.floor(i/n))<=1&&Math.abs(t%n-i%n)<=1)))game.marks[i]=1;});}
function move(i,target){
  if(!isPlaying||busy||modal.open)return;
  const result=applyMove(game,i,target);
  if(result==='ignored')return;
  if(target&&mode==='daily'&&game.online?.status==='active')game.rankedFinds.push(i);
  if(mode==='daily'&&game.lives===0)freezeDailyRun(game);
  if(result==='mistake'){vibrate();message('No firefly here. Take a breath and look at the colors. One life lost.');}
  else {autoCross();if(target)message('A little light found. Every row, column, and color has just one.');}
  render();save();
  if(result==='mistake')$('board').children[i].classList.add('error');
  if(game?.lives===0)showLoss();else if(result==='won')win();
}
$('board').addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||drag||!isPlaying||busy||modal.open||!game||game.completed||game.lives<=0)return;
  suppressDragClick=false;
  const cell=e.target.closest('[data-cell]');if(!cell)return;
  const i=Number(cell.dataset.cell);if(game.marks[i]===2)return;
  // A prior tap on another cell should still count when the next stroke starts.
  if(pendingTap&&pendingTap.i!==i){const previous=pendingTap.i;cancelTap();move(previous,false);}
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
  const cell=e.target.closest('[data-cell]');if(!cell||busy||modal.open)return;const i=Number(cell.dataset.cell);
  if(e.detail===0){cancelTap();move(i,e.shiftKey);return;}
  if(pendingTap?.i===i){cancelTap();move(i,true);return;}
  if(pendingTap){const prev=pendingTap.i;cancelTap();move(prev,false);if(modal.open)return;}
  pendingTap={i,timer:setTimeout(()=>{pendingTap=null;move(i,false);},320)};
});
$('board').addEventListener('dblclick',e=>e.preventDefault());
$('board').addEventListener('animationend',e=>{
  const cell=e.target.closest('[data-cell]');if(!cell)return;
  if(e.animationName==='firefly-found')cell.classList.remove('just-found');
  if(e.animationName==='cross-cell-confirm')cell.classList.remove('just-crossed');
  if(e.animationName.startsWith('firefly-idle-'))e.target.classList.remove(...idleClasses);
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
  state.completed++;state.level++;let reward='';
  if(state.completed%5===0){state.hints+=2;state.reveals++;reward='<p>A care package for you: <b>+2 hints and +1 reveal</b>.</p>';}
  save();render();
  const completedGame=game;
  // Let the last firefly finish arriving before covering the board.
  setTimeout(()=>{
    if(!isPlaying||game!==completedGame)return;
    dialog(`<div class="modal-symbol">✦</div><div class="eyebrow">A LITTLE MORE LIGHT</div><h2>The grove is glowing.</h2><p>Every firefly found its home. Level ${game.level} complete in ${$('time').textContent}, with ${game.mistakes} ${game.mistakes===1?'mistake':'mistakes'}.</p>${reward}<button class="primary" id="next-level">Wander to level ${state.level} →</button>`);
    $('next-level').onclick=()=>{close();newLevel();};
  },reducedMotion.matches?0:740);
}
function winDaily(){
  const result=recordDailyResult(state.dailyRecords,game);if(!result)return;
  save();render();const completedGame=game;
  if(completedGame.online)submitRace(completedGame);
  setTimeout(()=>{
    if(!isPlaying||game!==completedGame)return;
    dialog(`<div class="modal-symbol">◷</div><div class="eyebrow">DAILY SPEED CHALLENGE</div><h2>${result.improved?'A new personal best!':'Daily complete.'}</h2><p class="daily-result-time">${formatSpeed(game.elapsedMs)}</p><p>${game.dailyDay} · ${game.mistakes} ${game.mistakes===1?'mistake':'mistakes'}<br>Your best: <b>${formatSpeed(result.bestMs)}</b></p><p>Regular levels and tool balances are unchanged. Replay this same puzzle to improve your time.</p><button class="primary" id="daily-again">Race again</button><button class="secondary" id="daily-home">Back to home</button>`);
    $('daily-again').onclick=()=>{close();newDailyRun(completedGame.dailyDay);};
    $('daily-home').onclick=showHome;
    const status=document.createElement('p');status.id='race-status';status.setAttribute('aria-live','polite');$('daily-again').before(status);
    const retry=document.createElement('button');retry.id='race-submit';retry.className='secondary';retry.textContent='Retry score upload';retry.onclick=()=>submitRace(completedGame);$('daily-again').before(retry);
    const board=document.createElement('button');board.className='secondary';board.textContent='Leaderboard';board.onclick=()=>showLeaderboard(completedGame.dailyDay);$('daily-again').before(board);updateRaceStatus(completedGame);
  },reducedMotion.matches?0:740);
}
function showLoss(){
  if(mode==='daily'){
    dialog(`<div class="modal-symbol">♡</div><h2>A fresh run?</h2><p>You used all three lives in ${formatSpeed(game.elapsedMs)}. Restart the same daily puzzle for free with a fresh clock. Failed runs do not change your best.</p><button class="primary" id="retry">Restart daily · Free</button><button class="secondary" id="daily-loss-home">Back to home</button>`);
    $('retry').onclick=()=>{close();newDailyRun(game.dailyDay);};$('daily-loss-home').onclick=showHome;return;
  }
  dialog('<div class="modal-symbol">♡</div><h2>A moment to begin again.</h2><p>Your three lives are used. Restart this same puzzle for free, or choose a reward video to restore one life.</p><button class="primary" id="retry">Restart level · Free</button><button class="secondary" id="revive">Get one life · Optional video</button>');$('retry').onclick=()=>{close();newLevel(true);};$('revive').onclick=()=>offerReward('life');
}
function offerReward(kind){
  const native=!!window.AndroidRewards;
  dialog(`<div class="modal-symbol">${kind==='life'?'♡':'✧'}</div><h2>A little helping hand.</h2><p>${kind==='life'?'Restore one life':kind==='hints'?'Add one hint':'Add one firefly reveal'} with an optional reward video. You can always keep playing and earn tools every five completed levels.</p><p class="reward-note">${native?'Reward videos are unavailable until an ad provider is configured for this Android build.':'Browser preview: this is a simulated reward. No real advertisement will play.'}</p>${native?'':'<button class="primary" id="preview-reward">Try preview reward</button>'}<button class="secondary" id="reward-back">${game?.lives===0?'Back to restart':'Back to the grove'}</button>`);
  if(!native)$('preview-reward').onclick=()=>{if(kind==='life')game.lives=1;else state[kind]++;save();render();close();message(kind==='life'?'One life restored. Take your time.':'Your preview reward is ready. Select the tool to use it.');};
  $('reward-back').onclick=()=>{if(isPlaying&&game?.lives===0)showLoss();else close();};
}
function tool(kind){
  cancelTap();cancelDrag();if(!isPlaying||busy||!game||game.completed)return;if(game.lives<=0){showLoss();return;}
  if(mode==='daily'){message('Daily speed challenges have no hints or reveals. Your tools have not been spent.');return;}
  if(state[kind]<=0){offerReward(kind);return;}
  const hint=kind==='hints'?findHint(game):{cells:[game.marks.findIndex((v,i)=>v!==2&&isTarget(game,i))],target:true,text:'A hidden friend, brought into the light. See what this firefly tells you about its row, column, and color.'};
  if(!hint){message('No explained deduction is available right now. Try checking your crosses or finding another firefly. No tool was spent.');return;}
  state[kind]--;for(const i of hint.cells)applyMove(game,i,hint.target);autoCross();render();message(hint.text,hint.colors);hint.cells.forEach(i=>$('board').children[i].classList.add('flash'));save();if(game.completed)win();
}
$('hint').onclick=()=>tool('hints');$('reveal').onclick=()=>tool('reveals');
$('restart').onclick=()=>{if(!game||busy)return;dialog(`<div class="modal-symbol">↻</div><h2>A fresh look?</h2><p>${mode==='daily'?'Restart the same daily puzzle with three lives and a fresh clock. Your personal best stays saved. The current clock keeps running until you restart.':'Restart this puzzle with three lives. Your used tools stay spent. Restarting is always free.'}</p><button class="primary" id="confirm-restart">${mode==='daily'?'Restart daily':'Restart level'}</button><button class="secondary" id="keep-playing">Keep playing</button>`);$('confirm-restart').onclick=()=>{close();if(game.completed){newLevel();}else newLevel(true);};$('keep-playing').onclick=close;};
$('help').onclick=()=>dialog('<div class="modal-symbol">✦</div><h2>Follow the little lights.</h2><ul><li>Find exactly one firefly in each row, each column, and each colored region.</li><li>Fireflies cannot touch, including diagonally.</li><li>Tap once to add a cross and tap again to erase it. Crosses are notes and never cost a life.</li><li>Drag from an unmarked cell to paint crosses, or start on a cross to erase them. Revealed fireflies stay protected.</li><li>Double-tap to find a firefly, even on a crossed cell.</li><li>Only an incorrect firefly placement costs one of three lives.</li><li>The full grid fits on one screen. Use the back arrow to return home for settings and care package details.</li></ul><p>Hints explain a proven move. Reveals find a firefly. Earn 2 hints and 1 reveal every 5 levels. Small dots mark starter fireflies.</p>');
$('settings').onclick=()=>{
  dialog(`<div class="modal-symbol">❋</div><h2>Make yourself at home.</h2><label class="setting">Automatically cross ruled-out cells<input id="auto-cross" type="checkbox" ${state.settings.autoCross?'checked':''}></label><label class="setting">Gentle vibration on mistakes<input id="haptics" type="checkbox" ${state.settings.haptics?'checked':''}></label><p>Tap to cross, double-tap to find. Your game is saved on this device and works offline after its first visit.</p><button class="secondary" id="more-tools">Optional tool rewards</button>`);
  for(const [id,key]of[['auto-cross','autoCross'],['haptics','haptics']])$(id).onchange=e=>{state.settings[key]=e.target.checked;save();render();};
  $('more-tools').onclick=()=>{dialog('<div class="modal-symbol">✧</div><h2>A little extra help.</h2><p>Care packages arrive every five levels. You can also choose an optional reward.</p><button class="primary" id="extra-hint">Get a hint</button><button class="secondary" id="extra-reveal">Get a firefly reveal</button>');$('extra-hint').onclick=()=>offerReward('hints');$('extra-reveal').onclick=()=>offerReward('reveals');};
};
setInterval(()=>{const now=Date.now();if(mode==='journey'&&isPlaying&&game&&!busy&&!game.completed&&game.lives>0&&!document.hidden&&!modal.open){game.elapsed+=Math.min(2,Math.floor((now-tick)/1000));updateTime();if(game.elapsed%10===0)save();}tick=now;},1000);
setInterval(()=>{if(mode==='daily'&&isPlaying&&game&&!busy&&!document.hidden)updateTime();},100);
setInterval(()=>{if(!isPlaying)renderHome();},30000);
document.addEventListener('visibilitychange',()=>{cancelTap();cancelDrag();save();tick=Date.now();if(document.hidden){stopIdle();finishCellMotion();}else{renderHome();updateTime();scheduleIdle();}});
render();save();
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});



function chooseProfile(next){if(state.leaderboardProfile){next();return;}editProfile(next);}
function editProfile(next=()=>showLeaderboard()){
  dialog('<div class="modal-symbol">✦</div><h2>Your racing name.</h2><p>Your nickname and scores will be public. Your profile is saved on this device; clearing app data creates a new profile.</p><form id="profile-form"><label for="race-name">Nickname · 2–20 characters</label><input id="race-name" maxlength="20" minlength="2" required autocomplete="nickname"><p id="profile-error" role="alert"></p><button class="primary" id="profile-save">Save nickname</button></form>');
  $('race-name').value=state.leaderboardProfile?.name||'';
  $('profile-form').onsubmit=async event=>{
    event.preventDefault();$('profile-save').disabled=true;
    try{const previous=state.leaderboardProfile;const profile=await raceApi(previous?'profile':'players',{method:previous?'PUT':'POST',profile:previous,body:{name:$('race-name').value}});state.leaderboardProfile={...previous,...profile};state.leaderboardProfiles[LEADERBOARD_ORIGIN]=state.leaderboardProfile;save();next();}
    catch(error){if($('profile-error'))$('profile-error').textContent=error.message;}
    finally{if($('profile-save'))$('profile-save').disabled=false;}
  };
}
async function showLeaderboard(day=dailyKey()){
  dialog('<div class="modal-symbol">♕</div><h2>The daily leaderboard.</h2><label for="ranking-day">Puzzle date · UTC</label><input id="ranking-day" type="date"><p id="ranking-status" aria-live="polite">Loading times…</p><div id="ranking-entries"></div><button class="secondary" id="ranking-refresh">Refresh</button><button class="secondary" id="ranking-name">Set racing nickname</button>');
  $('ranking-day').value=day;$('ranking-day').max=dailyKey();$('ranking-day').min=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
  $('ranking-day').onchange=()=>showLeaderboard($('ranking-day').value);$('ranking-refresh').onclick=()=>showLeaderboard(day);$('ranking-name').textContent=state.leaderboardProfile?'Change nickname':'Set racing nickname';$('ranking-name').onclick=()=>editProfile(()=>showLeaderboard(day));
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
  finally{submittingRaces.delete(run);delete run.online.sending;try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}updateRaceStatus(run);}
}
const rankingButton=document.createElement('button');rankingButton.id='leaderboard';rankingButton.className='secondary leaderboard-button';rankingButton.textContent='Daily leaderboard ♕';rankingButton.onclick=()=>showLeaderboard();$('daily-best').before(rankingButton);
