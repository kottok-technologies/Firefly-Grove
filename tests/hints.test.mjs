import test from 'node:test';
import assert from 'node:assert/strict';
import {findHint,applyMove,isTarget,createGame,solve} from '../web/engine.js';

// Candidate-only fixtures isolate a deduction. Every crossed cell is empty,
// and every remaining color includes its target in this valid arrangement.
function fixture(groups,transpose=false){
  const n=6, solution=[1,3,5,0,2,4], regions=Array(n*n).fill(0),marks=Array(n*n).fill(1);
  for(const [color,cells] of groups.entries())for(const [r,c] of cells){
    const i=transpose?c*n+r:r*n+c;regions[i]=color;marks[i]=0;
  }
  const answer=transpose?Array.from({length:n},(_,c)=>solution.indexOf(c)):solution;
  const game={size:n,regions,marks,solution:answer,lives:3,mistakes:0,completed:false};
  answer.forEach((c,r)=>assert.equal(marks[r*n+c],0));
  return game;
}
const confined=[[[0,0],[0,1]],[[0,3],[1,3],[1,2]],[[2,4],[2,5]],[[3,0],[3,1]],[[4,2],[4,3]],[[5,4],[5,5]]];
const lineOnly=[[[0,0],[0,1],[1,1]],[[1,3],[2,2]],[[2,5],[3,4]],[[3,0],[4,1]],[[4,2],[5,3]],[[5,4],[1,5]]];
const pair=[[[0,1],[1,2]],[[1,3],[0,4]],[[2,5],[0,0],[3,5],[2,1]],[[3,0],[1,5],[2,0]],[[4,2],[3,3],[5,2]],[[5,4],[4,5]]];
const triple=[[[0,1],[1,0],[2,2],[1,5]],[[1,3],[0,4],[2,3],[2,1]],[[2,5],[0,5],[1,4],[1,1]],[[3,0],[0,0],[4,1],[4,3]],[[4,2],[1,2],[5,3],[5,0]],[[5,4],[2,4],[3,5],[3,2]]];
for(const transpose of [false,true]){
  const axis=transpose?'column':'row';
  for(const [name,groups,kind,expected]of[
    ['color confined to one line',confined,'color-in-line',[[0,3]]],
    ['line containing only one color',lineOnly,'line-in-color',[[1,1]]],
    ['two colors sharing two lines',pair,'shared-lines',[[0,0],[1,5]]],
    ['three colors sharing three lines',triple,'shared-lines',[[0,0],[1,2],[2,4]]]
  ])test(`${name} (${axis}s)`,()=>{
    const game=fixture(groups,transpose),hint=findHint(game);
    assert.ok(hint);assert.equal(hint.kind,kind);assert.match(hint.text,new RegExp(axis));
    const cells=expected.map(([r,c])=>transpose?c*6+r:r*6+c).sort((a,b)=>a-b);
    assert.deepEqual([...hint.cells].sort((a,b)=>a-b),cells);
    hint.cells.forEach(i=>{assert.equal(isTarget(game,i),false);assert.equal(game.marks[i],0);applyMove(game,i,hint.target);assert.equal(game.marks[i],1);});
    assert.equal(game.lives,3);
  });
}
test('direct hints state the specific occupied row and its coordinates',()=>{
  const g=createGame(1,42), t=g.givens[0],hint=findHint(g);
  assert.equal(hint.kind,'occupied-row');assert.match(hint.text,new RegExp(`Row ${Math.floor(t/g.size)+1}`));
  assert.match(hint.text,new RegExp(`column ${t%g.size+1}`));
  assert.ok(hint.cells.length>1);assert.ok(hint.cells.every(i=>Math.floor(i/g.size)===Math.floor(t/g.size)&&!isTarget(g,i)));
});
test('each direct exclusion names its own rule rather than listing alternatives',()=>{
  for(const kind of ['occupied-row','occupied-column','occupied-color','touching']){
    const g=createGame(7,42), n=g.size;
    const t=g.solution.map((c,r)=>r*n+c).find(t=>g.regions.some((region,i)=>{
      const sameRow=Math.floor(i/n)===Math.floor(t/n),sameCol=i%n===t%n;
      if(kind==='occupied-color')return region===g.regions[t]&&!sameRow&&!sameCol;
      if(kind==='touching')return Math.abs(Math.floor(i/n)-Math.floor(t/n))===1&&Math.abs(i%n-t%n)===1&&region!==g.regions[t];
      return true;
    }));
    assert.notEqual(t,undefined);applyMove(g,t,true);
    for(let i=0;i<g.marks.length;i++)if(!g.marks[i]){
      const sameRow=Math.floor(i/n)===Math.floor(t/n),sameCol=i%n===t%n,sameColor=g.regions[i]===g.regions[t];
      if((kind!=='occupied-row'&&sameRow)||(['occupied-color','touching'].includes(kind)&&sameCol)||(kind==='touching'&&sameColor))applyMove(g,i,false);
    }
    const hint=findHint(g);assert.equal(hint.kind,kind);
    assert.doesNotMatch(hint.text,/row, column, color, or/);
    assert.ok(hint.cells.every(i=>!isTarget(g,i)));
  }
});
test('hint sequences remain sound across board sizes and player note mistakes',()=>{
  for(let seed=0;seed<21;seed++){
    const g=createGame(7+10*(seed%7),seed);
    for(let i=0;i<g.marks.length;i++)if((i+seed)%5===0)applyMove(g,i,false);
    for(let step=0;step<=g.size*g.size&&!g.completed;step++){
      const hint=findHint(g);if(!hint)break;
      assert.ok(hint.cells.length);
      for(const cell of hint.cells){assert.equal(isTarget(g,cell),hint.target);assert.notEqual(g.marks[cell],2);if(!hint.target)assert.equal(g.marks[cell],0);applyMove(g,cell,hint.target);}
      assert.equal(g.lives,3);assert.equal(g.mistakes,0);
    }
  }
});
test('contradiction hints name the exact group left without a firefly',()=>{
  const game={size:6,solution:[1,3,5,0,2,4],
    marks:[0,0,1,0,1,1,0,1,1,0,1,1,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0,1,0,0,1,1,0,1,0,1],
    regions:[3,0,2,0,1,4,2,5,0,1,2,1,1,0,3,2,1,2,3,5,0,4,3,5,4,0,4,4,0,2,3,3,2,4,5,1]};
  const hint=findHint(game);
  assert.equal(hint.kind,'contradiction');assert.deepEqual(hint.cells,[0]);
  assert.match(hint.text,/row 4 would have no possible cell/);
  const excluded=game.marks.flatMap((v,i)=>v===1?[i]:[]);
  const proof=solve(game.regions,6,{fixed:[0],excluded});
  assert.equal(proof.exhausted,false);assert.equal(proof.solutions.length,0);
});
