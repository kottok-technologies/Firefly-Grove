// Return the cells a pointer segment actually crosses, including fast swipes.
// Clip to the board first so leaving it cannot mark unrelated cells.
export function cellsAlongSegment(from,to,size,rect){
  if(rect.width<=0||rect.height<=0)return [];
  const dx=to.x-from.x,dy=to.y-from.y;
  const right=rect.left+rect.width-1e-7,bottom=rect.top+rect.height-1e-7;
  let enter=0,leave=1;
  for(const [p,q] of [[-dx,from.x-rect.left],[dx,right-from.x],[-dy,from.y-rect.top],[dy,bottom-from.y]]){
    if(p===0){if(q<0)return [];continue;}
    const t=q/p;
    if(p<0)enter=Math.max(enter,t);else leave=Math.min(leave,t);
    if(enter>leave)return [];
  }
  const times=[enter,leave],cells=[];
  for(let line=1;line<size;line++){
    if(dx){const t=(rect.left+line*rect.width/size-from.x)/dx;if(t>enter&&t<leave)times.push(t);}
    if(dy){const t=(rect.top+line*rect.height/size-from.y)/dy;if(t>enter&&t<leave)times.push(t);}
  }
  times.sort((a,b)=>a-b);
  function sample(t){
    const x=from.x+dx*t,y=from.y+dy*t;
    const col=Math.min(size-1,Math.max(0,Math.floor((x-rect.left)/rect.width*size)));
    const row=Math.min(size-1,Math.max(0,Math.floor((y-rect.top)/rect.height*size)));
    const cell=row*size+col;if(cells.at(-1)!==cell)cells.push(cell);
  }
  if(enter===leave)sample(enter);
  for(let i=1;i<times.length;i++)if(times[i]>times[i-1])sample((times[i]+times[i-1])/2);
  sample(leave);
  return cells;
}

// A drag paints a single note state, rather than toggling at every visit.
// Revealed fireflies are protected; crossing hidden ones never costs a life.
export function paintNotes(game,cells,mark){
  if(!game||game.completed||game.lives<=0||(mark!==0&&mark!==1))return [];
  const changed=[];
  for(const cell of cells){
    if(!Number.isInteger(cell)||cell<0||cell>=game.marks.length||game.marks[cell]===2||game.marks[cell]===mark)continue;
    game.marks[cell]=mark;changed.push(cell);
  }
  return changed;
}
