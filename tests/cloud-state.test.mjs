import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyGame} from '../web/daily.js';
import {cloudState,encodeCloudSave,parseCloudSave,parseDeviceBackup,cloudSummary,CLOUD_LIMIT} from '../web/cloud-state.js';

import {origin,stateFixture} from './cloud-fixture.mjs';

test('private snapshots preserve progression and profile credentials without test accounts or race tickets',()=>{
  const state=stateFixture();state.dailyRun=createDailyGame('2026-10-28');state.dailyRun.online={runId:'stay-on-original-device'};state.dailyRun.rankedFinds=[];
  state.dailyRecords['2026-10-28']={bestMs:1234,lastMs:2345,finishes:2};state.previousPuzzle={size:14};state.notForCloud='private debug data';
  state.leaderboardProfile=state.leaderboardProfiles[origin];state.journeyHearts.pending.push({owner:'test',body:{}});
  const selected=cloudState(state,origin),{text}=encodeCloudSave(selected,{id:'snapshot-1',savedAt:'2026-10-28T00:00:00Z'}),save=parseCloudSave(text);
  assert.deepEqual(save.state,selected);assert.equal(save.state.leaderboardProfiles[origin].token,'a'.repeat(64));
  assert.equal(save.state.leaderboardProfiles.test,undefined);assert.equal(save.state.leaderboardProfile,undefined);assert.equal(save.state.notForCloud,undefined);assert.equal(save.state.previousPuzzle,undefined);
  assert.equal(save.state.dailyRun.online,undefined);assert.equal(save.state.dailyRun.rankedFinds,undefined);assert.ok(state.dailyRun.online);
  assert.equal(save.state.journeyHearts.pending.length,1);assert.equal(save.state.journeyHearts.lastLevel.test,undefined);
  assert.deepEqual(cloudSummary(save),{level:7,completed:6,hints:3,reveals:2,savedAt:'2026-10-28T00:00:00Z'});
  assert.deepEqual(cloudState({...state,journeyHearts:undefined,puzzleKeys:undefined,dailyRecords:undefined},null).journeyHearts,{pending:[],lastLevel:{}});
  assert.deepEqual(parseDeviceBackup(JSON.stringify(stateFixture()),origin),stateFixture());
  for(const text of ['bad','null','[]','{"__proto__":{}}'])assert.throws(()=>parseDeviceBackup(text,origin));
});

test('invalid and future saves cannot replace local progress',()=>{
  const good=cloudState(stateFixture(),origin),wrap=state=>JSON.stringify({format:'firefly-cloud-v1',id:'id',parent:null,savedAt:'2026-10-28T00:00:00Z',state});
  const bad=[s=>s.version=2,s=>s.installSeed=-1,s=>s.level=0,s=>s.completed=-1,s=>s.hints=-1,s=>s.reveals=Infinity,s=>s.settings=null,s=>s.settings.haptics='yes',s=>s.puzzleKeys=['<script>'],s=>s.dailyRecords={bad:{bestMs:1}},s=>s.dailyRecords={'2026-10-28':{bestMs:-1,lastMs:1,finishes:1}},
    s=>s.game.size=14,s=>s.game.regions.pop(),s=>s.game.regions[0]=99,s=>s.game.solution[1]=s.game.solution[0],s=>s.game.givens=[999],s=>s.game.givens=[0,0],s=>s.game.lives=4,s=>s.game.elapsed=-1,s=>s.game.completed=true,s=>s.game.heartFinds=[1000],s=>s.game.generation='future',s=>s.game.seed=-1,
    s=>s.leaderboardProfiles={test:{localId:'x',name:'x'}},s=>s.leaderboardProfiles[origin].token='bad',s=>s.journeyHearts.pending=null,s=>s.journeyHearts.lastLevel={bad:-1},s=>s.journeyHearts.pending[0].body.finds=[1000],s=>s.dailyRun={size:4}];
  for(const mutate of bad){const state=structuredClone(good);mutate(state);assert.throws(()=>parseCloudSave(wrap(state)),/damaged|unsupported/);}
  for(const text of [null,'bad','[]','null',wrap(good).replace('firefly-cloud-v1','future'),wrap(good).replace('"id":"id"','"id":""'),wrap(good).replace('"parent":null','"parent":3'),wrap(good).replace('2026-10-28T00:00:00Z','bad-date'),wrap(good).replace('"settings":{','"settings":{"__proto__":{},')])assert.throws(()=>parseCloudSave(text));
  const illegal=stateFixture();illegal.game.marks[illegal.game.marks.findIndex((_,i)=>illegal.game.solution[Math.floor(i/illegal.game.size)]!==i%illegal.game.size)]=2;
  assert.throws(()=>cloudState(illegal,origin));
  const large=structuredClone(good);large.puzzleKeys=Array(30000).fill('10:'+('0'.repeat(100)));
  assert.throws(()=>encodeCloudSave(large),/too large/);assert.throws(()=>parseCloudSave('x'.repeat(CLOUD_LIMIT+1)));
});
