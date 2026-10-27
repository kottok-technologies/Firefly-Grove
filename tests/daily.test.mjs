import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyKey,dailySeed,createDailyGame,beginDailyRun,dailyElapsed,freezeDailyRun,recordDailyResult,formatSpeed} from '../web/daily.js';
import {applyMove,solve} from '../web/engine.js';
test('daily dates reset at UTC midnight regardless of the player timezone',()=>{
  assert.equal(dailyKey(new Date('2026-10-26T18:59:59-05:00')),'2026-10-26');
  assert.equal(dailyKey(new Date('2026-10-26T19:00:00-05:00')),'2026-10-27');
  assert.throws(()=>dailySeed('2026-02-30'),RangeError);
  assert.throws(()=>dailySeed('tomorrow'),RangeError);
});
test('everyone gets the same unique 8x8 daily without starter fireflies',()=>{
  const a=createDailyGame('2026-10-26'),b=createDailyGame('2026-10-26'),tomorrow=createDailyGame('2026-10-27');
  assert.deepEqual(a,b);assert.equal(a.size,8);assert.equal(a.givens.length,0);
  assert.ok(a.marks.every(mark=>mark===0));assert.notEqual(a.seed,tomorrow.seed);
  assert.notDeepEqual(a.regions,tomorrow.regions);
  assert.deepEqual(solve(a.regions,8).solutions,[a.solution]);
});
test('daily timer starts once, includes away time, and freezes at the finish',()=>{
  const game=createDailyGame('2026-10-26');
  assert.equal(dailyElapsed(game,10000),0);
  beginDailyRun(game,10000);beginDailyRun(game,11000);
  assert.equal(game.startedAt,10000);assert.equal(dailyElapsed(game,73521),63521);
  game.completed=true;freezeDailyRun(game,73521);
  assert.equal(dailyElapsed(game,999999),63521);
  assert.equal(formatSpeed(63521),'01:03.52');assert.equal(formatSpeed(0),'00:00.00');
});
test('daily bests accept faster finishes, count replays, and record a run once',()=>{
  const records={};
  function finish(ms){const game=createDailyGame('2026-10-26');beginDailyRun(game,1000);game.completed=true;return {game,result:recordDailyResult(records,game,1000+ms)};}
  const first=finish(60000);assert.equal(first.result.improved,true);
  assert.equal(recordDailyResult(records,first.game,100000),null);
  assert.equal(finish(70000).result.improved,false);assert.equal(records['2026-10-26'].bestMs,60000);
  assert.equal(finish(45000).result.improved,true);assert.equal(records['2026-10-26'].bestMs,45000);
  assert.equal(records['2026-10-26'].finishes,3);
});
test('lost runs do not set a best and restarting restores the same daily puzzle',()=>{
  const records={},game=createDailyGame('2026-10-26');beginDailyRun(game,1000);
  const wrong=game.solution[0]===0?1:0;
  for(let i=0;i<3;i++)applyMove(game,wrong,true);
  freezeDailyRun(game,9000);assert.equal(dailyElapsed(game,99999),8000);
  assert.equal(recordDailyResult(records,game,9000),null);assert.deepEqual(records,{});
  const retry=createDailyGame(game.dailyDay);assert.deepEqual(retry.regions,game.regions);assert.equal(retry.startedAt,null);assert.equal(retry.lives,3);
});
test('a saved daily resumes with its original clock and completed saves do not score twice',()=>{
  const game=createDailyGame('2026-10-26');beginDailyRun(game,1000);
  applyMove(game,game.solution[0],true);
  const restored=JSON.parse(JSON.stringify(game));beginDailyRun(restored,100000);
  assert.equal(restored.startedAt,1000);assert.equal(dailyElapsed(restored,100000),99000);
  assert.equal(restored.marks[restored.solution[0]],2);
  restored.completed=true;const records={};recordDailyResult(records,restored,100000);
  const restoredAgain=JSON.parse(JSON.stringify(restored));
  assert.equal(recordDailyResult(records,restoredAgain,200000),null);
  assert.equal(records['2026-10-26'].finishes,1);
});
