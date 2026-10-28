import {fireflyFrames} from './firefly-frames.js';

export const FIREFLY_REST='./assets/firefly.png?v=3';
export const FIREFLY_ATLAS='./assets/firefly-atlas.png?v=1';
export const FOUND_DURATION=fireflyFrames.animations.found.durations.reduce((sum,duration)=>sum+duration,0);

export function spriteFrameAt(kind,elapsed){
  if(!Object.hasOwn(fireflyFrames.animations,kind))return null;
  const sequence=fireflyFrames.animations[kind];
  let end=0;
  for(let i=0;i<sequence.frames.length;i++){
    end+=sequence.durations[i];
    if(elapsed<end)return sequence.frames[i];
  }
  return null;
}

// Only raster frame selection happens here. No transforms, fades, filters, or
// programmatically drawn anatomy: every wing pose, glow, and leaf is in the atlas.
export function createFireflyPlayer({document=globalThis.document,atlas=document.createElement('img'),request=callback=>requestAnimationFrame(callback),cancel=id=>cancelAnimationFrame(id),now=()=>performance.now()}={}){
  const runs=new Set();let ready=atlas.complete&&atlas.naturalWidth>0,failed=false,requestId=null;
  function restingImage(){
    const image=document.createElement('img');image.className='firefly-sprite';image.src=FIREFLY_REST;
    image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;
    image.width=image.height=fireflyFrames.size;return image;
  }
  function finish(run){
    if(!runs.delete(run))return;
    if(run.canvas?.isConnected)run.canvas.replaceWith(restingImage());
    run.onComplete?.();
  }
  function draw(run,frame){
    if(frame===run.frame)return;
    const {size,columns}=fireflyFrames;
    run.context.clearRect(0,0,size,size);
    run.context.drawImage(atlas,(frame%columns)*size,Math.floor(frame/columns)*size,size,size,0,0,size,size);
    run.frame=frame;
  }
  function schedule(){if(requestId===null&&[...runs].some(run=>run.canvas))requestId=request(tick);}
  function tick(time){
    requestId=null;
    for(const run of [...runs]){
      if(!run.canvas)continue;
      const frame=spriteFrameAt(run.kind,Math.max(0,time-run.startedAt));
      if(!run.canvas.isConnected||frame===null)finish(run);else draw(run,frame);
    }
    schedule();
  }
  function start(run){
    if(!run.source.isConnected){finish(run);return;}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=fireflyFrames.size;
    const context=canvas.getContext('2d');if(!context){finish(run);return;}
    canvas.className='firefly-sprite';canvas.dataset.fireflyMotion=run.kind;canvas.setAttribute('aria-hidden','true');
    Object.assign(run,{canvas,context,startedAt:now(),frame:null});
    run.source.replaceWith(canvas);draw(run,spriteFrameAt(run.kind,0));schedule();
  }
  atlas.onload=()=>{ready=true;for(const run of [...runs])if(!run.canvas)start(run);};
  atlas.onerror=()=>{failed=true;for(const run of [...runs])finish(run);};
  atlas.src=FIREFLY_ATLAS;
  function play(source,kind,onComplete){
    if(!Object.hasOwn(fireflyFrames.animations,kind)||!source?.isConnected)return false;
    if(failed){onComplete?.();return false;}
    const run={source,kind,onComplete};runs.add(run);if(ready)start(run);return true;
  }
  function stop(kind){
    for(const run of [...runs])if(!kind||run.kind===kind)finish(run);
    if(requestId!==null&&![...runs].some(run=>run.canvas)){cancel(requestId);requestId=null;}
  }
  return {play,stop};
}
