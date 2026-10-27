import {mkdir} from 'node:fs/promises';
await mkdir(new URL('../reports/',import.meta.url),{recursive:true});
