import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('runner signing setup fails closed, writes only the temporary key, and cleans it',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'firefly-signing-test-'));
  const env={...process.env,RUNNER_TEMP:directory,GITHUB_ENV:path.join(directory,'environment'),ANDROID_KEYSTORE_BASE64:'',ANDROID_STORE_PASSWORD:'',ANDROID_KEY_ALIAS:'',ANDROID_KEY_PASSWORD:'',ANDROID_CERT_SHA256:''};
  const run=mode=>spawnSync(process.execPath,['scripts/android-signing.mjs',mode],{env,encoding:'utf8'});
  try{
    assert.notEqual(run('prepare').status,0);
    const bytes=Buffer.from('a fake test key, not a real credential');
    Object.assign(env,{ANDROID_KEYSTORE_BASE64:bytes.toString('base64'),ANDROID_STORE_PASSWORD:'test-only',ANDROID_KEY_ALIAS:'alias',ANDROID_KEY_PASSWORD:'test-only',ANDROID_CERT_SHA256:'test-only'});
    const result=run('prepare');assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
    const key=path.join(directory,'firefly-signing','release.p12');
    assert.deepEqual(await readFile(key),bytes);
    assert.equal(await readFile(env.GITHUB_ENV,'utf8'),`ANDROID_KEYSTORE_PATH=${key}\n`);
    assert.equal(run('clean').status,0);await assert.rejects(access(key));
    assert.equal(run('clean').status,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('the public signing certificate agrees with the committed fingerprint',()=>{
  const result=spawnSync(process.execPath,['scripts/android-signing.mjs','certificate','docs/firefly-grove-upload-certificate.crt'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const publicValues=JSON.parse(result.stdout);
  return readFile('docs/ANDROID_CERTIFICATE.json','utf8').then(value=>{
    const pinned=JSON.parse(value);assert.equal(publicValues.sha256,pinned.sha256);assert.equal(publicValues.sha1,pinned.sha1);
  });
});
