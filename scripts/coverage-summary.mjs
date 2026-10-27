import {readFile,appendFile} from 'node:fs/promises';
try{
  const report=JSON.parse(await readFile(new URL('../coverage/coverage-summary.json',import.meta.url),'utf8'));
  const lines=['## Test coverage','','| Metric | Coverage | Required |','| --- | ---: | ---: |'];
  const limits={lines:95,statements:95,functions:90,branches:85};
  for(const [metric,minimum] of Object.entries(limits))lines.push(`| ${metric} | ${report.total[metric].pct}% | ${minimum}% |`);
  lines.push('','Scope: puzzle engine, daily timing, drag gestures, AWS API and DynamoDB store, existing SQLite leaderboard API, and saved-plan integrity guards. UI event wiring and native Android code are not included in this JavaScript coverage report.','');
  const summary=lines.join('\n');console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}catch(error){if(error.code!=='ENOENT')throw error;console.log('No coverage report was generated. See the test step for failures.');}
