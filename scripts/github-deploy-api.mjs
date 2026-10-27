export const deploymentRepository='kottok-technologies/Firefly-Grove';
export function githubDeployApiUrl(path){
  const allowed=/^(commits\/main|environments\/production|actions\/runs\?branch=main(?:&event=push)?&per_page=100(?:&page=[1-9][0-9]*)?|actions\/runs\/[1-9][0-9]*\/artifacts|code-scanning\/alerts\?state=open&per_page=100&page=[1-9][0-9]*)$/;
  if(typeof path!=='string'||!allowed.test(path))throw Error('Unexpected GitHub deployment API endpoint.');
  return 'https://api.github.com/repos/'+deploymentRepository+'/'+path;
}
export async function findPlanRun(api,runId){
  if(!/^[1-9][0-9]*$/.test(runId))throw Error('Plan run ID must be numeric.');
  // Event-file input selects a returned run locally; it never enters a URL.
  for(let page=1;page<=10;page++){
    const result=await api('actions/runs?branch=main&per_page=100&page='+page);
    const run=result.workflow_runs.find(candidate=>String(candidate.id)===runId);
    if(run)return run;
    if(result.workflow_runs.length<100)break;
  }
  throw Error('Plan run not found among recent main-branch runs. Create a fresh plan.');
}
