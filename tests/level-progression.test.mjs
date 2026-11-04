import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {levelConfig,createGame,solve} from '../web/engine.js';
import {validateJourneyCompletion} from '../aws-leaderboard/src/journey.mjs';

test('journey phases use their allowed sizes and balanced shuffled bags indefinitely',()=>{
  for(let level=1;level<=6;level++)assert.equal(levelConfig(level).size,level<=3?4:5);
  for(const [start,end,sizes,label,difficulty] of [[7,12,[6,7],'Easy',0],[13,32,[7,8],'Medium',1],[33,1001,[8,9,10],'Hard',2]]){
    for(let level=start;level<=end;level++){
      const config=levelConfig(level);
      assert.ok(sizes.includes(config.size));assert.equal(config.label,label);
      assert.equal(config.difficulty,difficulty);assert.equal(config.givens,0);
      assert.deepEqual(levelConfig(level),config);
    }
    for(let level=start;level+sizes.length-1<=end;level+=sizes.length){
      assert.deepEqual(Array.from({length:sizes.length},(_,i)=>levelConfig(level+i).size).sort((a,b)=>a-b),sizes);
    }
  }
  assert.ok([8,9,10].includes(levelConfig(1000000).size));
});

test('mixed hard sizes keep hard deductions and replay identically on the server',()=>{
  for(const level of [7,8,13,14,33,34,35,99,100,101]){
    const game=createGame(level,42);
    assert.equal(game.generation,'journey-v4');assert.equal(game.size,levelConfig(level).size);
    assert.equal(game.difficulty,levelConfig(level).difficulty);
    assert.deepEqual(solve(game.regions,game.size).solutions,[game.solution]);
    assert.deepEqual(game.givens,[]);
    if(level>=13)assert.equal(game.grade.openingChain,0);
    if(level>=33)assert.ok(game.grade.advancedSteps>=3);
    const finds=game.solution.map((c,r)=>r*game.size+c);
    assert.equal(validateJourneyCompletion({version:game.generation,level,seed:42,finds}).hearts,3);
  }
});

test('released v3 layouts retain their fingerprints and original size progression',()=>{
  for(const [level,expected] of [
    [7,'7d141e344a01e1316f44c77ce799760a679d44d82aeb572d9c9974be97d7e0a6'],
    [8,'d4eb577c0d0aed1f9905aaf010bc5b698e6963bd436137f5d06a6c1a43b27350'],
    [13,'a2707da8194fdb1201132fff28d0dca90316e3cc646d008597152bac353d32f5'],
    [33,'5320d7a8998e199e7fd7d45ef4464d3bde8356f9f499dd9eb7946eb5c687c136'],
    [100,'cde1be05badffe5f2ba144ad1f70f4240ec886a645f6787db7fa7aeb67943e8c']
  ]){
    const game=createGame(level,42,'journey-v3');
    const digest=createHash('sha256').update(JSON.stringify([game.regions,game.solution,game.givens])).digest('hex');
    assert.equal(digest,expected);
    assert.equal(game.size,levelConfig(level,'journey-v3').size);
    const finds=game.solution.map((c,r)=>r*game.size+c);
    assert.equal(validateJourneyCompletion({version:'journey-v3',level,seed:42,finds}).hearts,3);
  }
});
