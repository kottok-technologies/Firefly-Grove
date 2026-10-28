// Keep the rule's context visible as well as the cells changed by the hint.
export function hintFocus(game,hint){
  const {size:n,marks,regions}=game,first=hint.cells[0];
  const indices=marks.map((_,i)=>i);
  const row=i=>Math.floor(i/n),column=i=>i%n;
  if(hint.kind==='occupied-row')return indices.filter(i=>row(i)===row(first));
  if(hint.kind==='occupied-column')return indices.filter(i=>column(i)===column(first));
  if(hint.kind==='touching'){
    const near=(a,b)=>Math.abs(row(a)-row(b))<=1&&Math.abs(column(a)-column(b))<=1;
    const source=indices.find(i=>marks[i]===2&&hint.cells.every(cell=>near(i,cell)));
    if(source!==undefined)return indices.filter(i=>near(i,source));
  }
  return indices.filter(i=>hint.cells.includes(i)||(hint.colors||[]).includes(regions[i]));
}

// A noninteractive board copy lets the explanation and Continue button fit above
// and below it on small phones. The actual board and saved state remain in place.
export function renderHintBoard(stage,board,focus,effects){
  const preview=board.cloneNode(true),context=new Set(focus),changed=new Set(effects);
  preview.removeAttribute('id');preview.removeAttribute('role');preview.removeAttribute('aria-label');
  preview.classList.add('hint-preview-board');preview.classList.remove('dragging');
  preview.setAttribute('aria-hidden','true');preview.inert=true;
  [...preview.children].forEach((cell,i)=>{
    cell.removeAttribute('data-cell');cell.tabIndex=-1;
    cell.classList.remove('flash','error','just-found','just-crossed');
    cell.classList.toggle('hint-context',context.has(i));cell.classList.toggle('hint-effect',changed.has(i));
  });
  stage.replaceChildren(preview);
  const resize=()=>{
    const side=Math.max(0,Math.floor(Math.min(stage.clientWidth,stage.clientHeight)));
    preview.style.width=side+'px';preview.style.height=side+'px';
  };
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  return ()=>{observer.disconnect();stage.replaceChildren();};
}
