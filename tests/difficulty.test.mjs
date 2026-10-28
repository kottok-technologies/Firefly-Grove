import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generatePuzzle,generateClassicPuzzle,generateGradedPuzzle,gradePuzzle,difficultyRequirements,createGame,isTarget,applyMove,findHint} from '../web/engine.js';
import {createDailyGame} from '../web/daily.js';
import {initializeHeartFinds,heartsManager} from '../web/hearts.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

// Independently reproduce the player's shortcut: place any color's last cell,
// cross its color/row/column/neighbors, and repeat without other deductions.
function colorSingles(puzzle){
  const n=puzzle.size,open=new Set(puzzle.regions.map((_,i)=>i)),found=[];
  for(;;){
    const colors=Array.from({length:n},(_,color)=>[...open].filter(i=>puzzle.regions[i]===color));
    const single=colors.find(cells=>cells.length===1);if(!single)return found.length;
    const cell=single[0];assert.equal(isTarget(puzzle,cell),true);found.push(cell);
    for(const i of open)if(puzzle.regions[i]===puzzle.regions[cell]||Math.floor(i/n)===Math.floor(cell/n)||i%n===cell%n||(Math.abs(Math.floor(i/n)-Math.floor(cell/n))<=1&&Math.abs(i%n-cell%n)<=1))open.delete(i);
  }
}

test('post-training puzzles resist the singles chain and meet their measured reasoning profile',()=>{
  for(let n=6;n<=10;n++)for(let seed=0;seed<60;seed++){
    const difficulty=seed%3,puzzle=generatePuzzle(n,seed,difficulty),grade=gradePuzzle(puzzle);
    const singletons=Array.from({length:n},(_,color)=>puzzle.regions.filter(r=>r===color).length).filter(size=>size===1).length;
    const requirements=difficultyRequirements(n,difficulty,singletons),label=`${n}x${n} seed ${seed}`;
    assert.deepEqual(grade,puzzle.grade,label);assert.equal(grade.solved,true,label);
    assert.ok(grade.advancedSteps>=requirements.advancedSteps,label);
    assert.ok(grade.reasoningStages>=requirements.reasoningStages,label);
    assert.ok(grade.openingChain<=requirements.openingChain,label);
    assert.ok(grade.longestChain<=requirements.longestChain,label);
    assert.ok(colorSingles(puzzle)<=Math.max(2,singletons),label);
    if(difficulty>0){
      assert.equal(singletons,0,label);assert.equal(grade.openingChain,0,label);assert.equal(colorSingles(puzzle),0,label);
      const hint=findHint({...puzzle,marks:Array(n*n).fill(0)});assert.ok(hint,label);assert.equal(hint.target,false,label);assert.notEqual(hint.kind,'last-in-color',label);
      for(const cell of hint.cells)assert.equal(isTarget(puzzle,cell),false,label);
    }
  }
  const classic=generateClassicPuzzle(10,42,2),grade=gradePuzzle(classic);
  assert.equal(grade.advancedSteps,0);assert.equal(grade.openingChain,10);assert.equal(colorSingles(classic),10);
  assert.equal(createGame(6,42).generation,'journey-v1');assert.equal(createGame(7,42).generation,'journey-v3');
  for(const level of [8,9,11,12,14,15,23,24,33]){
    const game=createGame(level,42);assert.deepEqual(game.givens,[]);assert.ok(game.marks.every(mark=>mark===0));assert.equal(game.grade.openingChain,0);
  }
  assert.throws(()=>createGame(7,42,'future'),RangeError);
  assert.throws(()=>generatePuzzle(6.5,1),RangeError);
  assert.throws(()=>generateClassicPuzzle(6,1,0,0),RangeError);
  assert.deepEqual(difficultyRequirements(6,-1),difficultyRequirements(6,0));
  assert.deepEqual(difficultyRequirements(10,10),difficultyRequirements(10,2));
  assert.deepEqual(gradePuzzle({size:2,regions:[0,0,0,0],solution:[0,1]}),{solved:false});
});

test('legacy replay and daily layouts remain byte-for-byte compatible with released apps',()=>{
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for(const [level,expected] of [
    [1,'8fa91913e774cd6bd46db9a2179cc4dade5827900419b6d865a89b8001664557'],
    [7,'b5d052940d65f6726e96cf8c8e1d943aaf9481e0b41d6832b84ed08ab6929292'],
    [13,'71f6acae53207c9651cbdabf30277c6a3bc0d532d7c2df1f0dca67ba2d748130'],
    [33,'7463d863128ace679ea96d4b3ab16d416cc5575848104911ebbe0bb34d3531d0']
  ]){
    const game=createGame(level,42,'journey-v1');
    assert.equal(digest([game.regions,game.solution,game.givens]),expected);
    const finds=game.solution.flatMap((c,r)=>game.givens.includes(r*game.size+c)?[]:[r*game.size+c]);
    assert.equal(validateJourneyCompletion({version:'journey-v1',level,seed:42,finds}).hearts,3);
  }
  for(const [level,expected] of [
    [7,'7d141e344a01e1316f44c77ce799760a679d44d82aeb572d9c9974be97d7e0a6'],
    [8,'bf2e7a5e74aaf7b86a192ca3cfea218d3383da14ce3d5bbf8446ad9e51133835'],
    [9,'2f6ac21535c9b6509869b7d7dc255d70c0f694fe4fc8b8d32853ee385aa72662'],
    [13,'a2707da8194fdb1201132fff28d0dca90316e3cc646d008597152bac353d32f5'],
    [33,'bac6fefa16b35e1cf672f734547ad15d034482c2679126288c90ceb21bd3fd67']
  ]){
    const game=createGame(level,42,'journey-v2');assert.equal(digest([game.regions,game.solution,game.givens]),expected);
    const finds=game.solution.map((c,r)=>r*game.size+c);assert.equal(validateJourneyCompletion({version:'journey-v2',level,seed:42,finds}).hearts,3);
    assert.ok(generateGradedPuzzle(game.size,42,game.difficulty).grade.openingChain>=1);
  }
  const daily=createDailyGame('2026-10-28');
  assert.equal(digest([daily.regions,daily.solution]),'65f945e6378c5ef5a07036593defbe70beaef1118f769f9c1d2529b96a18ad66');
});

test('new-generation hearts replay on the server and survive a staggered deployment',async()=>{
  const game=createGame(33,42);initializeHeartFinds(game);
  const wrong=game.marks.findIndex((_,i)=>!isTarget(game,i));
  game.heartFinds.push(wrong);applyMove(game,wrong,true);
  for(const [row,column] of game.solution.entries()){
    const cell=row*game.size+column;game.heartFinds.push(cell);applyMove(game,cell,true);
  }
  let legacyServer=true;const state={},profile={localId:'test'};
  const manager=heartsManager({state,profile,origin:'test',persist(){},ensureOnline:async()=>{},async api(_path,{body}){
    if(legacyServer)throw Object.assign(Error('Invalid journey puzzle.'),{status:400});
    return {credited:true,hearts:validateJourneyCompletion(body).hearts,mine:{rank:1,hearts:2},total:1};
  }});
  const entry=manager.queue(game);assert.equal(entry.body.version,'journey-v3');
  assert.equal(validateJourneyCompletion(entry.body).hearts,2);
  await manager.flush();assert.equal(entry.status,'pending');assert.equal(manager.pending().length,1);assert.match(entry.error,/updated server/);
  legacyServer=false;await manager.flush();assert.equal(entry.status,'synced');assert.equal(manager.pending().length,0);
  const legacy=createGame(7,42,'journey-v1');delete legacy.generation;
  initializeHeartFinds(legacy);for(const [row,column] of legacy.solution.entries()){const cell=row*legacy.size+column;legacy.heartFinds.push(cell);applyMove(legacy,cell,true);}
  const offline=heartsManager({state:{},profile,origin:null,persist(){}});
  assert.equal(offline.queue(legacy).body.version,'journey-v1');
});
