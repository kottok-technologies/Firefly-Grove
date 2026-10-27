import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const outputs=JSON.parse(execFileSync('terraform',['-chdir=infrastructure/bootstrap','output','-json'],{encoding:'utf8'}));
const value=name=>{if(!outputs[name])throw Error('Missing bootstrap output '+name);return outputs[name].value;};
const backend=value('backend_config');
await writeFile(new URL('../infrastructure/leaderboard/backend.hcl',import.meta.url),Object.entries(backend).map(([key,item])=>`${key} = ${JSON.stringify(item)}`).join('\n')+'\n');
const account=/^arn:aws:iam::([0-9]{12}):role\//.exec(value('plan_role_arn'))?.[1];if(!account)throw Error('Invalid bootstrap role ARN.');
const variables={AWS_ACCOUNT_ID:account,TF_STATE_BUCKET:value('state_bucket'),TF_STATE_KMS_KEY_ARN:value('state_kms_key_arn'),TF_PLAN_ROLE_ARN:value('plan_role_arn'),TF_APPLY_ROLE_ARN:value('apply_role_arn'),TF_RUNTIME_BOUNDARY_ARN:value('runtime_boundary_arn'),TF_SERVICE_KMS_KEY_ARN:value('service_kms_key_arn')};
if(process.argv.includes('--set-github-variables')){
  for(const [name,item]of Object.entries(variables))execFileSync('gh',['variable','set',name,'--repo','kottok-technologies/Firefly-Grove','--body',item],{stdio:'inherit'});
  console.log('GitHub deployment variables configured. These contain resource names and ARNs, not credentials.');
}else console.log(JSON.stringify(variables,null,2));
console.log('Local backend configuration written to infrastructure/leaderboard/backend.hcl (ignored by Git).');
