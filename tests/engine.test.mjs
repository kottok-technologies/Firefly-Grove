import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, solve, neighbors, createGame, applyMove, isTarget, findHint, levelConfig } from '../web/engine.js';
test('generated boards are connected, deterministic, and uniquely solvable at every size', () => {
  for (let n = 4; n <= 10; n++) for (let seed = 1; seed <= 4; seed++) {
    const difficulty = seed % 3;
    const p = generatePuzzle(n, seed * 7949, difficulty);
    assert.deepEqual(solve(p.regions, n).solutions, [p.solution]);
    assert.deepEqual(generatePuzzle(n, seed * 7949, difficulty), p);
    for (let r = 0; r < n; r++) {
      const cells = p.regions.flatMap((v,i) => v === r ? [i] : []), seen = new Set([cells[0]]), stack = [cells[0]];
      while (stack.length) for (const i of neighbors(stack.pop(), n)) if (p.regions[i] === r && !seen.has(i)) { seen.add(i); stack.push(i); }
      assert.equal(seen.size, cells.length);
    }
  }
});
test('region sizes stay balanced, with singleton-free harder profiles and gentle singleton variety', () => {
  let singletons = 0, oneSingleton = 0, gentleSamples=0;
  const samples = 140;
  for(let seed=0;seed<samples;seed++){
    const n=4+seed%7, difficulty=seed%3,puzzle=generatePuzzle(n,seed,difficulty), sizes=Array(n).fill(0);
    puzzle.regions.forEach(region=>sizes[region]++);
    const count=sizes.filter(size=>size===1).length;
    if(n>=6&&difficulty>0)assert.equal(count,0,`${n}×${n}, seed ${seed}: harder boards have no singletons`);
    else {assert.ok(count>=1&&count<=3,`${n}×${n}, seed ${seed}: ${count} singletons`);gentleSamples++;singletons+=count;if(count===1)oneSingleton++;}
    assert.ok(Math.max(...sizes)<=Math.ceil(n*n/(n-count)*1.8),`Dominant region at seed ${seed}`);
    const check=solve(puzzle.regions,n);
    assert.equal(check.exhausted,false);
    assert.deepEqual(check.solutions,[puzzle.solution]);
  }
  assert.ok(singletons/gentleSamples>=1&&singletons/gentleSamples<=1.3,`Gentle mean singleton count: ${singletons/gentleSamples}`);
  assert.ok(oneSingleton/gentleSamples>=.8,`Gentle one-singleton proportion: ${oneSingleton/gentleSamples}`);
});
test('incorrect firefly placements cost lives, completion and lockout work', () => {
  const g = createGame(1, 42), empty = g.marks.findIndex((v,i) => !v && !isTarget(g,i));
  assert.equal(g.givens.length, 2);
  applyMove(g,empty,false); assert.equal(g.marks[empty],1); applyMove(g,empty,false); assert.equal(g.marks[empty],0);
  applyMove(g,empty,true); assert.equal(g.lives,2);
  for (let r=0;r<g.size;r++) applyMove(g,r*g.size+g.solution[r],true);
  assert.equal(g.completed,true); assert.equal(applyMove(g,empty,true),'ignored');
  const dead = createGame(7,24), wrong = dead.marks.findIndex((v,i)=>!isTarget(dead,i));
  for(let i=0;i<3;i++) applyMove(dead,wrong,true);
  assert.equal(dead.lives,0); assert.equal(applyMove(dead,1,true),'ignored');
});
test('crosses are reversible notes on hidden fireflies and empty cells', () => {
  const g=createGame(1,42);
  const target=g.marks.findIndex((v,i)=>!v&&isTarget(g,i));
  const empty=g.marks.findIndex((v,i)=>!v&&!isTarget(g,i));
  for(const cell of [target,empty]){
    assert.equal(applyMove(g,cell,false),'marked');assert.equal(g.marks[cell],1);
    assert.equal(g.lives,3);assert.equal(g.mistakes,0);
    assert.equal(applyMove(g,cell,false),'cleared');assert.equal(g.marks[cell],0);
  }
  applyMove(g,target,false);assert.equal(applyMove(g,target,true),'marked');
  assert.equal(g.marks[target],2);assert.equal(g.lives,3);assert.equal(g.mistakes,0);
  assert.equal(applyMove(g,g.givens[0],false),'ignored');
});
test('hints remain truthful when player notes incorrectly cross out fireflies', () => {
  for(let seed=0;seed<10;seed++){
    const g=createGame(1,seed);
    g.solution.forEach((c,r)=>applyMove(g,r*g.size+c,false));
    for(let step=0;step<g.size*g.size;step++){
      const hint=findHint(g);if(!hint)break;
      hint.cells.forEach(cell=>{
        assert.equal(isTarget(g,cell),hint.target);
        applyMove(g,cell,hint.target);
      });
      assert.equal(g.lives,3);assert.equal(g.mistakes,0);
    }
  }
});
test('hints are truthful and training grows from 4x4 to a maximum of 10x10', () => {
  for(let seed=0;seed<10;seed++) {
    const g=createGame(1,seed), hint=findHint(g); assert.ok(hint);
    hint.cells.forEach(i=> assert.equal(isTarget(g,i),hint.target));
  }
  for(const [level,size]of[[1,4],[3,4],[4,5],[6,5],[7,6],[10,7],[13,8],[23,9],[33,10],[1000,10]])assert.equal(levelConfig(level).size,size);
  assert.equal(levelConfig(4).givens,1); assert.equal(levelConfig(7).givens,0);
  assert.throws(()=>generatePuzzle(14,42),RangeError);
  assert.throws(()=>generatePuzzle(3,42),RangeError);
});
