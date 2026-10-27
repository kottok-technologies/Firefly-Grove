import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export function verifyPlanManifest({manifest,runId,sourceSha,headSha,configuration,planBytes,zipBytes,now=Date.now()}){
  if(manifest.runId!==runId)throw Error('Plan manifest does not match the selected workflow run.');
  const created=Date.parse(manifest.createdAt);
  if(!Number.isFinite(created)||now-created>24*3600000||created>now+60000)throw Error('Plan timestamp is invalid or older than 24 hours. Create a new plan.');
  if(!/^[a-f0-9]{40}$/.test(manifest.sha)||headSha!==manifest.sha||sourceSha!==manifest.sha)throw Error('Stale plan: source or main differs from the reviewed plan.');
  if(JSON.stringify(configuration)!==JSON.stringify(manifest.config))throw Error('Deployment account or state configuration changed. Create a new plan.');
  if(digest(planBytes)!==manifest.planSha256||digest(zipBytes)!==manifest.zipSha256)throw Error('Plan or Lambda package checksum mismatch.');
}
export function verifyPlanRun(run,repository){
  if(run.path!=='.github/workflows/terraform-deploy.yml'||run.conclusion!=='success'||run.head_branch!=='main'||run.head_repository?.full_name!==repository||!['workflow_dispatch','workflow_run'].includes(run.event))throw Error('Choose a successful Terraform deployment workflow run from this repository main branch.');
}
export function verifyApprovalEnvironment(environment){
  if(!environment.protection_rules?.some(rule=>rule.type==='required_reviewers'&&rule.reviewers?.length))throw Error('Configure required reviewers on the production environment before applying.');
}
