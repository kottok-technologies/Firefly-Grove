import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {parseDocument} from 'yaml';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
for(const file of await readdir(new URL('.github/workflows/',root))){
  if(!/\.ya?ml$/.test(file))continue;
  const doc=parseDocument(await read('.github/workflows/'+file));assert.equal(doc.errors.length,0,`${file}: invalid YAML`);
  const workflow=doc.toJS();
  if(file==='terraform-deploy.yml'){
    assert.ok(workflow.on.workflow_run&&workflow.on.workflow_dispatch,`${file}: CI-completion and manual triggers required`);
    assert.equal(workflow.jobs.apply.environment,'production');
    assert.ok(workflow.jobs.apply.if.includes("github.event_name == 'workflow_dispatch'"),'Terraform apply must be manually requested');
    assert.equal(workflow.concurrency['cancel-in-progress'],false,'Do not cancel active Terraform operations');
  }else assert.ok(workflow.on.push!==undefined&&workflow.on.pull_request!==undefined,`${file}: push and pull_request triggers required`);
  assert.equal(workflow.on.pull_request_target,undefined,`${file}: untrusted PR code must not run with deployment credentials`);
  assert.equal(workflow.permissions.contents,'read',`${file}: default contents permission must be read-only`);
  for(const [name,job] of Object.entries(workflow.jobs)){
    assert.ok(job['timeout-minutes']>0,`${file}/${name}: timeout required`);
    for(const step of job.steps||[])if(step.uses&&!step.uses.startsWith('./'))assert.match(step.uses,/@[a-f0-9]{40}$/,`${file}/${name}: action must be pinned to a commit`);
  }
}
const dependabot=parseDocument(await read('.github/dependabot.yml'));assert.equal(dependabot.errors.length,0);
for(const directory of ['', 'aws-leaderboard/']){
  const manifest=JSON.parse(await read(directory+'package.json')),lock=JSON.parse(await read(directory+'package-lock.json'));
  assert.equal(lock.lockfileVersion,3);assert.deepEqual(lock.packages[''].dependencies||{},manifest.dependencies||{});assert.deepEqual(lock.packages[''].devDependencies||{},manifest.devDependencies||{});
}
const manifest=JSON.parse(await read('package.json')),gradle=await read('android/app/build.gradle');assert.ok(gradle.includes(`versionName '${manifest.version}'`),'Android and npm versions differ');
assert.match(await read('android/gradle/wrapper/gradle-wrapper.properties'),/^distributionSha256Sum=[a-f0-9]{64}$/m,'Gradle distribution checksum required');
for(const file of ['web/engine.js','web/daily.js','web/gestures.js','web/leaderboard-client.js','web/leaderboard-config.js']){
  await access(new URL(file,root));assert.ok((await read('web/sw.js')).includes('./'+file.slice(4)),`${file}: missing offline cache entry`);
}
for(const file of ['engine.js','daily.js'])assert.equal(await read('web/'+file),await read('aws-leaderboard/src/'+file),`${file}: AWS puzzle copy is stale`);
console.log('Workflow YAML, action pins, lockfiles, versions, wrapper checksum, offline assets, and shared engine copies are valid.');
