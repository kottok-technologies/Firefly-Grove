import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createFireflyPlayer,spriteFrameAt,FOUND_DURATION,FIREFLY_REST,FIREFLY_ATLAS} from '../web/firefly-player.js';
import {fireflyFrames} from '../web/firefly-frames.js';

function harness({ready=true,canvas=true}={}){
  const dom=new JSDOM('<main><img id="one"><img id="two"></main>');
  const document=dom.window.document,draws=[],pending=new Map(),cancelled=[];
  let time=0,id=0;
  dom.window.HTMLCanvasElement.prototype.getContext=()=>canvas?{clearRect(){},drawImage(...args){draws.push(args);}}:null;
  const atlas={complete:ready,naturalWidth:ready?1024:0};
  const player=createFireflyPlayer({document,atlas,now:()=>time,request:cb=>{pending.set(++id,cb);return id;},cancel:key=>{cancelled.push(key);pending.delete(key);}});
  return {dom,document,atlas,player,draws,pending,cancelled,source:id=>document.getElementById(id),advance(value){time=value;const callbacks=[...pending.values()];pending.clear();for(const cb of callbacks)cb(time);}};
}

test('sprite timelines select actual atlas frames and stop at their precise end',()=>{
  for(const [kind,sequence] of Object.entries(fireflyFrames.animations)){
    let elapsed=0;
    for(let i=0;i<sequence.frames.length;i++){
      assert.equal(spriteFrameAt(kind,elapsed),sequence.frames[i]);
      elapsed+=sequence.durations[i];
      assert.equal(spriteFrameAt(kind,elapsed-0.1),sequence.frames[i]);
    }
    assert.equal(spriteFrameAt(kind,elapsed),null);
  }
  assert.equal(spriteFrameAt('__proto__',0),null);
  assert.equal(spriteFrameAt('unknown',0),null);
  assert.equal(FOUND_DURATION,1100);
});

test('found and idle animations have independent clocks and restore closed-wing images',()=>{
  const h=harness();let completed=0;
  try{
    assert.equal(h.atlas.src,FIREFLY_ATLAS);
    assert.equal(h.player.play(h.source('one'),'found',()=>completed++),true);
    assert.equal(h.document.querySelector('canvas').dataset.fireflyMotion,'found');
    assert.deepEqual(h.draws[0].slice(1),[0,512,256,256,0,0,256,256]);
    h.advance(50);assert.equal(h.draws.length,1,'unchanged frames are not redrawn');
    h.advance(110);assert.equal(h.draws[1][1],256);
    h.player.play(h.source('two'),'idle');assert.equal(h.pending.size,1,'one frame loop serves all sprites');
    h.advance(1100);assert.equal(completed,1);
    assert.equal(h.document.querySelectorAll('canvas').length,1,'idle started later and still runs');
    const rest=h.document.querySelector('img');assert.equal(rest.getAttribute('src'),FIREFLY_REST);
    assert.equal(rest.draggable,false);assert.equal(rest.getAttribute('aria-hidden'),'true');
    h.advance(1145);assert.equal(h.document.querySelectorAll('canvas').length,0);
    assert.equal(h.pending.size,0);h.player.stop();assert.equal(completed,1);
  }finally{h.dom.window.close();}
});

test('asset loading preserves resting images; cancellation and load failure are harmless',()=>{
  const h=harness({ready:false});let completed=0;
  try{
    h.player.play(h.source('one'),'found',()=>completed++);
    h.player.play(h.source('two'),'idle');
    assert.equal(h.document.querySelectorAll('canvas').length,0);
    h.player.stop('idle');h.atlas.onload();h.atlas.onload();
    assert.equal(h.document.querySelectorAll('canvas').length,1);
    h.player.stop('idle');assert.equal(h.cancelled.length,0);
    h.player.stop();assert.equal(h.cancelled.length,1);assert.equal(completed,1);
    h.atlas.onerror();
    assert.equal(h.player.play(h.document.querySelector('img'),'idle',()=>completed++),false);
    assert.equal(completed,2);
    assert.equal(h.player.play(null,'idle'),false);
    assert.equal(h.player.play(h.document.querySelector('img'),'__proto__'),false);
  }finally{h.dom.window.close();}
  const failed=harness({ready:false});let failures=0;
  failed.player.play(failed.source('one'),'found',()=>failures++);failed.atlas.onerror();
  assert.equal(failures,1);assert.equal(failed.document.querySelectorAll('canvas').length,0);failed.dom.window.close();
});

test('missing canvases and detached boards clean up without restarting animations',()=>{
  const h=harness({canvas:false});let completed=0;
  h.player.play(h.source('one'),'idle',()=>completed++);assert.equal(completed,1);assert.equal(h.pending.size,0);h.dom.window.close();
  const pending=harness({ready:false});pending.player.play(pending.source('one'),'found');pending.source('one').remove();pending.atlas.onload();assert.equal(pending.pending.size,0);pending.dom.window.close();
  const detached=harness();detached.player.play(detached.source('one'),'idle');detached.document.querySelector('canvas').remove();detached.advance(20);assert.equal(detached.pending.size,0);detached.dom.window.close();
});
