export function random(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const neighbors = (i, n) => [i % n ? i - 1 : -1, i % n < n - 1 ? i + 1 : -1, i >= n ? i - n : -1, i < n * (n - 1) ? i + n : -1].filter(x => x >= 0);
// Branch on the most constrained row or region; enforce every puzzle rule.
export function solve(regions, n, { limit = 2, fixed = [], excluded = [], budget = 500000 } = {}) {
  const results = [], chosen = Array(n).fill(-1), usedCols = new Set(), usedRegions = new Set(), blocked = new Set(excluded);
  const fixedRows = new Map(fixed.map(i => [Math.floor(i / n), i % n]));
  let nodes = 0, exhausted = false;
  function visit(depth) {
    if (++nodes > budget) { exhausted = true; return; }
    if (depth === n) { results.push([...chosen]); return; }
    let candidates = null, possibleRegions = new Map();
    for (let r = 0; r < n; r++) if (chosen[r] < 0) {
      const options = [];
      for (let c = 0; c < n; c++) {
        const i = r * n + c, region = regions[i];
        if ((fixedRows.has(r) && fixedRows.get(r) !== c) || blocked.has(i) || usedCols.has(c) || usedRegions.has(region) || (r > 0 && chosen[r-1] >= 0 && Math.abs(chosen[r-1]-c)<=1) || (r<n-1 && chosen[r+1]>=0 && Math.abs(chosen[r+1]-c)<=1)) continue;
        const cell = [r,c]; options.push(cell);
        if(!possibleRegions.has(region))possibleRegions.set(region,[]);
        possibleRegions.get(region).push(cell);
      }
      if (!options.length) return;
      if (!candidates || options.length < candidates.length) candidates = options;
    }
    if (possibleRegions.size < n-depth) return;
    for (const options of possibleRegions.values()) if(options.length<candidates.length)candidates=options;
    for (const [row,c] of candidates) {
      const region = regions[row*n+c];
      chosen[row]=c; usedCols.add(c); usedRegions.add(region); visit(depth + 1);
      chosen[row]=-1; usedCols.delete(c); usedRegions.delete(region);
      if (results.length >= limit || exhausted) return;
    }
  }
  visit(0); return { solutions: results, nodes, exhausted };
}
export function levelConfig(level) {
  const size=level<=3?4:level<=6?5:level<=9?6:level<=12?7:Math.min(10,8+Math.floor((level-13)/10));
  return { size, givens: level <= 3 ? 2 : level <= 6 ? 1 : 0, label: level <= 6 ? 'Training' : ['Gentle', 'Thoughtful', 'Challenging'][(level - 7) % 3] };
}
export function generateClassicPuzzle(n, seed, difficulty = 0, requestedSingletons) {
  if(!Number.isInteger(n)||n<4||n>10)throw new RangeError('Puzzle size must be between 4 and 10.');
  const rng = random(seed);
  // Choose the count once, before retries, so easier-to-generate layouts do not
  // bias the output toward extra singletons. Expected count: 1.17.
  const roll = rng(), singletonCount = requestedSingletons ?? (roll < .85 ? 1 : roll < .98 ? 2 : 3);
  const maxRegionSize = Math.ceil(n * n / (n - singletonCount) * 1.8);
  for (;;) {
    let columns;
    do { columns = shuffle(Array.from({ length: n }, (_, i) => i), rng); }
    while (columns.some((c, r) => r && Math.abs(c - columns[r - 1]) <= 1));
    // Expand outward from a random row, giving each subsequent target a
    // neighboring cell ruled out by an earlier target in the deduction order.
    let low = Math.floor(rng()*n), high = low;
    const order = [low], rank = Array(n);
    while(order.length<n){
      if(low>0&&(high===n-1||rng()<.5))order.push(--low);
      else order.push(++high);
    }
    order.forEach((region,i)=>rank[region]=i);
    const targets = columns.map((c,r)=>r*n+c);
    const regions = Array(n*n).fill(-1), sizes = Array(n).fill(1);
    targets.forEach((cell,r)=>regions[cell]=r);
    const ruledOutAt = Array.from({length:n*n},(_,cell)=>{
      const row=Math.floor(cell/n), col=cell%n;
      return Math.min(...targets.flatMap((target,r)=>
        r===row||target%n===col||(Math.abs(r-row)<=1&&Math.abs(target%n-col)<=1)?[rank[r]]:[]));
    });
    // Keep the selected singleton regions frozen, and give every other region
    // a second cell before filling the board so no accidental singletons arise.
    let failed = false;
    for(const region of order.slice(singletonCount)){
      const options=neighbors(targets[region],n).filter(cell=>regions[cell]<0&&ruledOutAt[cell]<rank[region]);
      if(!options.length){failed=true;break;}
      regions[options[Math.floor(rng()*options.length)]]=region;sizes[region]++;
    }
    if(failed)continue;
    let remaining=regions.filter(region=>region<0).length;
    while(remaining){
      const options=[];
      for(let cell=0;cell<regions.length;cell++)if(regions[cell]<0){
        for(const region of new Set(neighbors(cell,n).map(next=>regions[next]))){
          if(region>=0&&rank[region]>=singletonCount&&ruledOutAt[cell]<rank[region]&&sizes[region]<maxRegionSize)
            options.push([cell,region]);
        }
      }
      if(!options.length){failed=true;break;}
      // Favor smaller regions, with a gentler preference on harder levels.
      const exponent=difficulty>=2?1.5:2;
      const weights=options.map(([,region])=>1/sizes[region]**exponent);
      let pick=rng()*weights.reduce((sum,w)=>sum+w,0), selected=options.length-1;
      for(let i=0;i<options.length;i++){
        pick-=weights[i];if(pick<=0){selected=i;break;}
      }
      const [cell,region]=options[selected];regions[cell]=region;sizes[region]++;remaining--;
    }
    if(failed)continue;
    // Each region's non-target cells are ruled out by earlier targets. Starting
    // with the frozen singletons, this proves the solution by induction. Keep
    // the independent solver check as a guard against generation regressions.
    const check=solve(regions,n);
    if(!check.exhausted&&check.solutions.length===1)return {size:n,regions,solution:columns,seed,effort:check.nodes,difficulty};
  }
}
// Measure the actual solving path, rather than using search effort as a proxy.
// A basic placement is the last candidate in any row, column, or color after
// applying confirmed fireflies. Only explained deductions can break a stall.
export function gradePuzzle(puzzle) {
  const n=puzzle.size, marks=Array(n*n).fill(0), game={...puzzle,marks};
  const row=i=>Math.floor(i/n), column=i=>i%n, color=i=>puzzle.regions[i];
  let basicPlacements=0, advancedSteps=0, openingChain=null, chain=0, longestChain=0;
  const stages=new Set(), techniques={};
  for(let step=0;step<n*n*2;step++){
    const found=marks.flatMap((mark,i)=>mark===2?[i]:[]);
    longestChain=Math.max(longestChain,chain);
    if(found.length===n)return {solved:true,basicPlacements,advancedSteps,reasoningStages:stages.size,openingChain:openingChain??basicPlacements,longestChain,techniques};
    for(let i=0;i<marks.length;i++)if(!marks[i]&&found.some(t=>row(t)===row(i)||column(t)===column(i)||color(t)===color(i)||(Math.abs(row(t)-row(i))<=1&&Math.abs(column(t)-column(i))<=1)))marks[i]=1;
    const available=marks.flatMap((mark,i)=>mark===0?[i]:[]);
    let forced=null;
    for(const groupOf of [color,row,column]){
      for(let group=0;group<n;group++){
        if(found.some(i=>groupOf(i)===group))continue;
        const cells=available.filter(i=>groupOf(i)===group);
        if(!cells.length)return {solved:false};
        if(cells.length===1){forced=cells[0];break;}
      }
      if(forced!==null)break;
    }
    if(forced!==null){marks[forced]=2;basicPlacements++;chain++;continue;}
    openingChain??=basicPlacements;chain=0;
    const hint=findHint(game);if(!hint)return {solved:false};
    stages.add(found.length);advancedSteps++;techniques[hint.kind]=(techniques[hint.kind]||0)+1;
    for(const i of hint.cells)marks[i]=hint.target?2:1;
  }
  return {solved:false};
}
export function difficultyRequirements(n,difficulty,singletons=1) {
  const tier=Math.max(0,Math.min(2,difficulty));
  return {advancedSteps:Math.min(tier+1,n-singletons-1),reasoningStages:n-singletons>=5&&(n>=8||tier===2)?2:1,
    openingChain:Math.max(singletons,2),longestChain:Math.max(singletons,Math.ceil(n*(tier===2?.5:.65)))};
}
function matchesDifficulty(grade,requirements) {
  return grade.solved&&grade.advancedSteps>=requirements.advancedSteps&&grade.reasoningStages>=requirements.reasoningStages&&grade.openingChain<=requirements.openingChain&&grade.longestChain<=requirements.longestChain;
}
function staysConnected(regions,n,removed) {
  const color=regions[removed],cells=regions.flatMap((r,i)=>r===color&&i!==removed?[i]:[]);
  const seen=new Set([cells[0]]),stack=[cells[0]];
  while(stack.length)for(const cell of neighbors(stack.pop(),n))if(cell!==removed&&regions[cell]===color&&!seen.has(cell)){seen.add(cell);stack.push(cell);}
  return seen.size===cells.length;
}
export function generatePuzzle(n,seed,difficulty=0) {
  if(n<6)return generateClassicPuzzle(n,seed,difficulty);
  if(!Number.isInteger(n)||n>10)throw new RangeError('Puzzle size must be between 4 and 10.');
  const rng=random(seed^0x7f4a7c15),roll=random(seed)();
  const singletonCount=roll<.85?1:roll<.98?2:3,requirements=difficultyRequirements(n,difficulty,singletonCount);
  const cap=Math.ceil(n*n/(n-singletonCount)*1.8);
  // Alter connected region boundaries without moving targets or adding extra
  // singletons. Reject each edit that introduces a second solution, and accept
  // a board only after the logical grader proves it breaks the singles chain.
  for(let restart=0;restart<40;restart++){
    const puzzle=generateClassicPuzzle(n,(seed+Math.imul(restart,7919))>>>0,difficulty,singletonCount);
    const targets=new Set(puzzle.solution.map((c,r)=>r*n+c)),sizes=Array(n).fill(0);
    puzzle.regions.forEach(color=>sizes[color]++);
    let accepted=0;
    for(let attempt=0;attempt<250;attempt++){
      const options=[];
      for(let cell=0;cell<n*n;cell++)if(!targets.has(cell)&&sizes[puzzle.regions[cell]]>2){
        for(const color of new Set(neighbors(cell,n).map(i=>puzzle.regions[i]))){
          if(color!==puzzle.regions[cell]&&sizes[color]>1&&sizes[color]<cap)options.push([cell,color]);
        }
      }
      if(!options.length)break;
      const [cell,color]=options[Math.floor(rng()*options.length)],previous=puzzle.regions[cell];
      if(!staysConnected(puzzle.regions,n,cell))continue;
      puzzle.regions[cell]=color;
      const check=solve(puzzle.regions,n,{budget:20000});
      if(check.exhausted||check.solutions.length!==1){puzzle.regions[cell]=previous;continue;}
      sizes[previous]--;sizes[color]++;accepted++;
      if(accepted%4)continue;
      const grade=gradePuzzle(puzzle);
      if(matchesDifficulty(grade,requirements))return {...puzzle,seed,effort:check.nodes,grade};
    }
  }
  // Do not silently hand the player another trivial puzzle on a hard seed.
  throw new Error('Unable to generate a puzzle at the required difficulty.');
}
export function createGame(level, seed, generation = level<=6?'journey-v1':'journey-v2') {
  const config = levelConfig(level), difficulty = (level - 7) % 3;
  const puzzle = generation==='journey-v1'?generateClassicPuzzle(config.size,seed,difficulty):generatePuzzle(config.size,seed,difficulty);
  const marks = Array(config.size ** 2).fill(0), rng = random(seed ^ 0xabc123);
  const givenRows = shuffle(Array.from({ length: config.size }, (_, i) => i), rng).slice(0, config.givens);
  const givens = givenRows.map(r => r * config.size + puzzle.solution[r]); givens.forEach(i => marks[i] = 2);
  return { ...puzzle, generation, level, marks, givens, lives: 3, mistakes: 0, elapsed: 0, completed: false };
}
export const isTarget = (game, i) => game.solution[Math.floor(i / game.size)] === i % game.size;
export function applyMove(game, i, target) {
  if (game.completed || game.lives <= 0 || game.marks[i] === 2) return 'ignored';
  if (!target && game.marks[i] === 1) { game.marks[i] = 0; return 'cleared'; }
  // Crosses are player notes, including on cells that hide a firefly.
  if (target && !isTarget(game, i)) { game.lives--; game.mistakes++; return 'mistake'; }
  game.marks[i] = target ? 2 : 1;
  game.completed = game.solution.every((c, r) => game.marks[r * game.size + c] === 2);
  return game.completed ? 'won' : 'marked';
}
export function findHint(game) {
  const { size: n, marks, regions } = game;
  const targets = marks.flatMap((v, i) => v === 2 ? [i] : []);
  const row = i => Math.floor(i/n), column = i => i%n;
  const at = i => `row ${row(i)+1}, column ${column(i)+1}`;
  const touches = (a,b) => Math.abs(row(a)-row(b))<=1&&Math.abs(column(a)-column(b))<=1;
  const ruledOut = i => targets.some(t => row(t)===row(i)||column(t)===column(i)||regions[t]===regions[i]||touches(t,i));
  // Crosses can support deductions only when they are consistent with this
  // board's unique solution. With a mistaken note, use confirmed targets only.
  const ignoreNotes=marks.some((v,i)=>v===1&&isTarget(game,i));
  const finish = hint => ignoreNotes ? {...hint,text:`Some crosses rule out a valid solution, so this hint ignores player crosses. ${hint.text}`} : hint;
  const result = (kind,cells,text,colors=[],target=false) => finish({kind,cells,text,colors,target});
  // Give one exact reason and mark every affected, still-unmarked cell.
  for(const t of targets){
    const rules=[
      ['occupied-row',i=>row(i)===row(t),`Row ${row(t)+1} already has a firefly at ${at(t)}. Each row can contain only one firefly. Cross out the other cells in row ${row(t)+1}.`],
      ['occupied-column',i=>column(i)===column(t),`Column ${column(t)+1} already has a firefly at ${at(t)}. Each column can contain only one firefly. Cross out the other cells in column ${column(t)+1}.`],
      ['occupied-color',i=>regions[i]===regions[t],`Color ${regions[t]+1} already has a firefly at ${at(t)}. Each color can contain only one firefly. Cross out the other cells of this color.`],
      ['touching',i=>touches(t,i),`The firefly at ${at(t)} needs space. Fireflies cannot touch along an edge or diagonally. Cross out these neighboring cells.`]
    ];
    for(const [kind,test,text] of rules){
      const cells=marks.flatMap((v,i)=>v===0&&test(i)?[i]:[]);
      if(cells.length)return result(kind,cells,text,[regions[t]]);
    }
  }
  const excluded=marks.flatMap((v,i)=>v!==2&&(ruledOut(i)||(!ignoreNotes&&v===1))?[i]:[]);
  const blocked=new Set(excluded);
  const candidates=marks.flatMap((v,i)=>v!==2&&!blocked.has(i)?[i]:[]);
  const groups=Array.from({length:n},(_,r)=>candidates.filter(i=>regions[i]===r));
  const openColors=groups.flatMap((cells,r)=>cells.length?[r]:[]);
  for(const color of openColors){
    const cells=groups[color];
    if(cells.length===1)return result('last-in-color',cells,`Color ${color+1} has only one possible position left: ${at(cells[0])}. Every color needs one firefly, so place it here.`,[color],true);
  }
  const list = values => values.map(v=>v+1).join(', ');
  for(const [axis,lineOf] of [['row',row],['column',column]]){
    // A color confined to one line reserves that line for its own firefly.
    for(const color of openColors){
      const lines=new Set(groups[color].map(lineOf));
      if(lines.size!==1)continue;
      const line=[...lines][0];
      const cells=candidates.filter(i=>marks[i]===0&&lineOf(i)===line&&regions[i]!==color);
      if(cells.length)return result('color-in-line',cells,`All remaining positions for color ${color+1} are in ${axis} ${line+1}. Its firefly must occupy that ${axis}, which allows only one firefly. Cross out the other colors in ${axis} ${line+1}.`,[color]);
    }
    // Conversely, a line with just one color reserves that color's firefly.
    for(let line=0;line<n;line++){
      const lineCells=candidates.filter(i=>lineOf(i)===line), colors=new Set(lineCells.map(i=>regions[i]));
      if(colors.size!==1)continue;
      const color=[...colors][0], cells=groups[color].filter(i=>marks[i]===0&&lineOf(i)!==line);
      if(cells.length)return result('line-in-color',cells,`${axis==='row'?'Row':'Column'} ${line+1} has only color ${color+1} left as a possible home for its firefly. That uses this color's one firefly. Cross out color ${color+1} outside ${axis} ${line+1}.`,[color]);
    }
    // Hall's rule: k colors confined to k lines consume all k firefly slots.
    const lineMasks=groups.map(cells=>cells.reduce((mask,i)=>mask|(1<<lineOf(i)),0));
    for(let count=2;count<openColors.length;count++){
      function search(start,selected,mask){
        const lines=Array.from({length:n},(_,i)=>i).filter(i=>mask&(1<<i));
        if(lines.length>count)return null;
        if(selected.length===count){
          if(lines.length!==count)return null;
          const colors=new Set(selected);
          const cells=candidates.filter(i=>marks[i]===0&&(mask&(1<<lineOf(i)))&&!colors.has(regions[i]));
          return cells.length?result('shared-lines',cells,`Colors ${list(selected)} must place their ${count} fireflies within ${axis}s ${list(lines)}. Those ${count} ${axis}s have exactly ${count} firefly slots, so other colors cannot use them. Cross out all other colors in these ${axis}s.`,selected):null;
        }
        for(let j=start;j<=openColors.length-(count-selected.length);j++){
          const color=openColors[j], hint=search(j+1,[...selected,color],mask|lineMasks[color]);
          if(hint)return hint;
        }
        return null;
      }
      const hint=search(0,[],0);if(hint)return hint;
    }
  }
  // For a harder hint, follow forced placements after an assumption and name
  // the exact row, column, or color that loses its last available cell.
  function contradiction(assumption){
    const placed=[...targets,assumption], available=new Set(candidates);
    for(;;){
      for(const t of placed)for(const cell of available){
        if(row(t)===row(cell)||column(t)===column(cell)||regions[t]===regions[cell]||touches(t,cell))available.delete(cell);
      }
      let forced=null;
      for(const [name,groupOf] of [['row',row],['column',column],['color',i=>regions[i]]]){
        for(let group=0;group<n;group++){
          if(placed.some(t=>groupOf(t)===group))continue;
          const cells=[...available].filter(i=>groupOf(i)===group);
          if(!cells.length)return `${name} ${group+1} would have no possible cell for its required firefly`;
          if(cells.length===1)forced=cells[0];
        }
      }
      if(forced===null)return null;
      placed.push(forced);
    }
  }
  for(const i of candidates)if(marks[i]===0&&!isTarget(game,i)){
    const reason=contradiction(i);
    if(reason)return result('contradiction',[i],`If a firefly were placed at ${at(i)}, following the forced placements would leave a contradiction: ${reason}. Cross out ${at(i)}.`,[regions[i]]);
  }
  return null;
}
