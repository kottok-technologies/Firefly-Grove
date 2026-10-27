import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPlanManifest,verifyPlanRun,verifyApprovalEnvironment} from '../scripts/terraform-policy.mjs';
import {configureLeaderboard} from '../scripts/configure-leaderboard.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
  const sha='a'.repeat(40),now=Date.parse('2026-10-27T12:00:00Z'),configuration={AWS_ACCOUNT_ID:'111111111111',TF_STATE_BUCKET:'private-state'},planBytes=Buffer.from('saved plan'),zipBytes=Buffer.from('exact package');
  return {now,runId:'12345',sourceSha:sha,headSha:sha,configuration,planBytes,zipBytes,manifest:{sha,runId:'12345',createdAt:new Date(now-1000).toISOString(),config:{...configuration},planSha256:digest(planBytes),zipSha256:digest(zipBytes)}};
}
test('reviewed plan requires exact source, account, package and fresh timestamp',()=>{
  assert.doesNotThrow(()=>verifyPlanManifest(fixture()));
  for(const change of [f=>f.planBytes=Buffer.from('modified'),f=>f.zipBytes=Buffer.from('different package'),f=>f.runId='other',f=>f.sourceSha='b'.repeat(40),f=>f.headSha='c'.repeat(40),f=>f.configuration={AWS_ACCOUNT_ID:'222222222222'},f=>f.manifest.createdAt='not a date',f=>f.manifest.createdAt=new Date(f.now-25*3600000).toISOString(),f=>f.manifest.createdAt=new Date(f.now+3600000).toISOString()]){const input=fixture();change(input);assert.throws(()=>verifyPlanManifest(input));}
});
test('apply rejects plans from forks, wrong workflows, failed runs and unprotected environments',()=>{
  const repo='kottok-technologies/Firefly-Grove',run={path:'.github/workflows/terraform-deploy.yml',conclusion:'success',head_branch:'main',head_repository:{full_name:repo},event:'workflow_dispatch'};
  assert.doesNotThrow(()=>verifyPlanRun(run,repo));
  for(const change of [{head_repository:{full_name:'attacker/fork'}},{head_branch:'feature'},{event:'pull_request'},{conclusion:'failure'},{path:'.github/workflows/ci.yml'}])assert.throws(()=>verifyPlanRun({...run,...change},repo));
  assert.throws(()=>verifyApprovalEnvironment({}));assert.throws(()=>verifyApprovalEnvironment({protection_rules:[{type:'required_reviewers',reviewers:[]}]}));
  assert.doesNotThrow(()=>verifyApprovalEnvironment({protection_rules:[{type:'required_reviewers',reviewers:[{id:1}]}]}));
});
test('app configuration refuses non-AWS, insecure, credential-bearing and wrong-region origins before fetching',async()=>{
  for(const origin of ['http://abc.execute-api.us-east-1.amazonaws.com','https://example.com','https://user:pass@abc.execute-api.us-east-1.amazonaws.com','https://abc.execute-api.us-east-2.amazonaws.com','https://abc.execute-api.us-east-1.amazonaws.com/injected','https://abc.execute-api.us-east-1.amazonaws.com/?secret=1'])await assert.rejects(configureLeaderboard(origin),/Expected a production AWS HTTPS API origin/);
});
