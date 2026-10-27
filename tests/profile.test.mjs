import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile,profileManager} from '../web/profile.js';

test('new profiles have random IDs and valid generated usernames',()=>{
  const profiles=Array.from({length:100},createProfile);
  assert.equal(new Set(profiles.map(p=>p.localId)).size,100);
  for(const p of profiles){assert.match(p.localId,/^[a-f0-9-]{36}$/);assert.match(p.name,/^[A-Za-z]+\d{4}$/);assert.ok(p.name.length<=20);}
});

test('existing players keep their server identity, credentials, and name across restarts',async()=>{
  const profiles={production:{id:'existing-id',token:'secret',name:'Birch'}};
  const manager=profileManager({profiles,origin:'production',persist(){},api(){assert.fail('Must not register again');}});
  assert.equal((await manager.ensureOnline()).id,'existing-id');
  assert.equal(manager.profile.localId,'existing-id');assert.equal(manager.profile.name,'Birch');
  const reloaded=profileManager({profiles:JSON.parse(JSON.stringify(profiles)),origin:'production'});
  assert.deepEqual(reloaded.profile,manager.profile);
});

test('offline profiles persist, retry registration, and isolate API environments',async()=>{
  const profiles={};let calls=0,saves=0;
  const manager=profileManager({profiles,origin:'production',persist(){saves++;},async api(path,{body}){
    assert.equal(path,'players');assert.equal(body.name,'Little Light');if(++calls===1)throw Error('offline');
    return {id:'server-id',token:'secret',name:body.name};
  }});
  const localId=manager.profile.localId;
  await manager.rename(' Little   Light ');
  await assert.rejects(manager.ensureOnline(),/offline/);
  assert.equal(manager.profile.name,'Little Light');assert.equal(manager.profile.token,undefined);
  await manager.ensureOnline();assert.equal(manager.profile.localId,localId);assert.equal(saves,2);
  const other=profileManager({profiles,origin:'test'});assert.notEqual(other.profile.localId,localId);assert.equal(other.profile.token,undefined);
});

test('concurrent registration and rename keep one identity and retain the chosen username',async()=>{
  let release,registrations=0;const gate=new Promise(resolve=>{release=resolve;});
  const manager=profileManager({profiles:{},origin:'production',persist(){},async api(path,{body,profile}){
    if(path==='players'){registrations++;await gate;return {id:'server-id',token:'secret',name:body.name};}
    assert.equal(path,'profile');assert.equal(profile.token,'secret');return {id:profile.id,name:body.name};
  }});
  const first=manager.ensureOnline(),second=manager.ensureOnline(),rename=manager.rename('Fern');
  release();await Promise.all([first,second,rename]);assert.equal(registrations,1);assert.equal(manager.profile.name,'Fern');
  assert.equal(manager.profile.token,'secret');
});

test('invalid usernames and failed server renames preserve the saved profile',async()=>{
  let saves=0;const manager=profileManager({profiles:{production:{id:'id',token:'secret',name:'Birch'}},origin:'production',persist(){saves++;},async api(){throw Error('offline');}});
  for(const name of ['x','<script>','a'.repeat(21)])await assert.rejects(manager.rename(name),/2–20/);
  await assert.rejects(manager.rename('Fern'),/offline/);assert.equal(manager.profile.name,'Birch');assert.equal(saves,0);
});
