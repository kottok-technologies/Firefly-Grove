import {mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('leaderboard-service/lib/puzzle/',root),{recursive:true});
for(const file of ['engine.js','daily.js'])await copyFile(new URL('web/'+file,root),new URL('leaderboard-service/lib/puzzle/'+file,root));
console.log('Shared puzzle engine synchronized with leaderboard service.');
