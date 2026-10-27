import {appendFile,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyPlanManifest,verifyPlanRun,verifyApprovalEnvironment} from './terraform-policy.mjs';

const repository=process.env.GITHUB_REPOSITORY||'kottok-technologies/Firefly-Grove';
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const headers={Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
async function api(path){const response=await fetch('https://api.github.com/repos/'+repository+'/'+path,{headers});if(!response.ok)throw Error(`GitHub verification failed (${response.status}): ${path}`);return response.json();}
async function output(values){for(const [key,value]of Object.entries(values)){if(/[\r\n]/.test(String(value)))throw Error('Invalid multiline output');await appendFile(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);}}
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=()=>Object.fromEntries(['AWS_ACCOUNT_ID','TF_STATE_BUCKET','TF_STATE_KMS_KEY_ARN','TF_RUNTIME_BOUNDARY_ARN'].map(key=>{if(!process.env[key])throw Error('Missing repository variable '+key);return [key,process.env[key]];}));
async function checks(sha){
  const response=await api(`actions/runs?head_sha=${sha}&event=push&per_page=100`);
  for(const path of ['.github/workflows/ci.yml','.github/workflows/codeql.yml']){
    const run=response.workflow_runs.find(item=>item.path===path&&item.head_repository?.full_name===repository);
    if(!run||run.status!=='completed'||run.conclusion!=='success')throw Error(`Successful completed ${path} is required for ${sha}. Wait for CI or fix its findings.`);
  }
  for(let page=1;;page++){
    const alerts=await api(`code-scanning/alerts?state=open&per_page=100&page=${page}`);
    if(alerts.some(alert=>['high','critical'].includes(alert.rule.security_severity_level)))throw Error('Resolve or review/dismiss open high/critical CodeQL alerts before deployment.');
    if(alerts.length<100)break;
  }
}
const mode=process.argv[2];
if(mode==='resolve'){
  if(process.env.GITHUB_REF!=='refs/heads/main')throw Error('Deployments must run from main.');
  const runId=event.inputs?.plan_run_id||'';
  if(runId){
    if(!/^[0-9]+$/.test(runId))throw Error('Plan run ID must be numeric.');
    const run=await api('actions/runs/'+runId);
    verifyPlanRun(run,repository);
    const artifacts=await api('actions/runs/'+runId+'/artifacts');
    if(!artifacts.artifacts.some(artifact=>artifact.name==='terraform-production-plan'&&!artifact.expired))throw Error('Selected run has no unexpired saved Terraform plan.');
    const environment=await api('environments/production');
    verifyApprovalEnvironment(environment);
    await output({mode:'apply',plan_run_id:runId});
  }else{
    const sha=event.workflow_run?.head_sha||process.env.GITHUB_SHA;
    if(event.workflow_run&&(event.workflow_run.conclusion!=='success'||event.workflow_run.head_branch!=='main'||event.workflow_run.head_repository?.full_name!==repository))throw Error('Only successful CI on this repository main branch can create a plan.');
    const head=await api('commits/main');if(head.sha!==sha)throw Error('This commit is no longer the head of main. Plan the current commit instead.');
    await checks(sha);config();await output({mode:'plan',sha});
  }
}else if(mode==='manifest'){
  const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const plan=await readFile('infrastructure/leaderboard/production.tfplan'),zip=await readFile('infrastructure/leaderboard/build/lambda.zip');
  await writeFile('infrastructure/leaderboard/manifest.json',JSON.stringify({sha,runId:process.env.GITHUB_RUN_ID,createdAt:new Date().toISOString(),planSha256:sha256(plan),zipSha256:sha256(zip),config:config()},null,2)+'\n');
}else if(mode==='verify'){
  const manifest=JSON.parse(await readFile('infrastructure/leaderboard/manifest.json','utf8'));
  const head=await api('commits/main'),checkout=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  verifyPlanManifest({manifest,runId:event.inputs?.plan_run_id,sourceSha:checkout,headSha:head.sha,configuration:config(),planBytes:await readFile('infrastructure/leaderboard/production.tfplan'),zipBytes:await readFile('infrastructure/leaderboard/build/lambda.zip')});
  await checks(manifest.sha);
  console.log('Saved plan, Lambda package, source commit, configuration, CI and security status verified.');
}else throw Error('Expected resolve, manifest, or verify.');
