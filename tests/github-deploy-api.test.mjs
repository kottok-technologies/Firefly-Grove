import test from 'node:test';
import assert from 'node:assert/strict';
import {githubDeployApiUrl,findPlanRun} from '../scripts/github-deploy-api.mjs';
test('GitHub deployment traffic uses only approved read endpoints on the fixed repository',()=>{
  for(const path of ['commits/main','environments/production','actions/runs?branch=main&event=push&per_page=100','actions/runs/123/artifacts','code-scanning/alerts?state=open&per_page=100&page=2'])assert.ok(githubDeployApiUrl(path).startsWith('https://api.github.com/repos/kottok-technologies/Firefly-Grove/'));
  for(const path of ['https://evil.example','//evil.example','../other','actions/runs/123/artifacts?token=secret','commits/main#secret','environments/production\n','actions/runs?head_sha=file-content'])assert.throws(()=>githubDeployApiUrl(path));
});
test('event-file selection never enters an outgoing request URL',async()=>{
  const requested=[];const result=await findPlanRun(async path=>{requested.push(path);return {workflow_runs:[{id:12345}]};},'12345');assert.equal(result.id,12345);assert.ok(requested.every(path=>!path.includes('12345')));
  for(const id of ['../secrets','123?secret','1\n','0','-1'])await assert.rejects(findPlanRun(async()=>{throw Error('must not fetch');},id),/numeric/);
  await assert.rejects(findPlanRun(async()=>({workflow_runs:[]}),'12345'),/not found/);
});
