import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotion} from '../web/motion.js';

function preference(matches=false){return {matches,addEventListener(name,listener){this.changed=listener;}};}
test('rapid screen changes ignore superseded snapshots and reduced motion stays immediate',async()=>{
  const media=preference(),pending=[];
  const document={documentElement:{dataset:{}},startViewTransition(update){const transition={update,skipped:0,skipTransition(){this.skipped++;},finished:Promise.resolve()};pending.push(transition);return transition;}};
  const motion=createMotion(document,media),seen=[];
  motion.screen(()=>seen.push('puzzle'));motion.screen(()=>seen.push('home'),'back');
  assert.equal(pending[0].skipped,1);pending[0].update();pending[1].update();
  assert.deepEqual(seen,['home']);assert.equal(document.documentElement.dataset.navigation,'back');
  media.matches=true;media.changed();assert.equal(pending[1].skipped,1);
  motion.screen(()=>seen.push('settings'));assert.deepEqual(seen,['home','settings']);
  const fallback=createMotion({documentElement:{dataset:{}}},preference());fallback.screen(()=>seen.push('fallback'));
  assert.equal(seen.at(-1),'fallback');
});
test('panel motion can be interrupted without stale cleanup or animation requirements',async()=>{
  const media=preference(),animations=[];
  const element={animate(frames,options){let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});const animation={finished,frames,options,resolve,cancels:0,cancel(){this.cancels++;reject(Error('interrupted'));}};animations.push(animation);return animation;}};
  const motion=createMotion({documentElement:{dataset:{}}},media);
  motion.enter(null);motion.enter({});motion.enter(element,'board');motion.enter(element);
  assert.equal(animations[0].cancels,1);assert.equal(animations[0].options.duration,320);
  await new Promise(resolve=>setImmediate(resolve));
  media.matches=true;media.changed();assert.equal(animations[1].cancels,1);
  motion.enter(element);assert.equal(animations.length,2);
  media.matches=false;
  const fallback=createMotion({documentElement:{dataset:{}}},media);fallback.screen(()=>element);
  assert.equal(animations.length,3,'older WebViews still animate the incoming screen');
  animations[2].resolve();
  await new Promise(resolve=>setImmediate(resolve));
  media.matches=true;media.changed();assert.equal(animations[2].cancels,0,'finished motion is no longer retained');
});
