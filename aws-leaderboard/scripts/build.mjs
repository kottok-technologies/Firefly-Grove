import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
for(const file of ['engine.js','daily.js'])await copyFile(new URL('../../web/'+file,import.meta.url),new URL('../src/'+file,import.meta.url));
await build({entryPoints:[new URL('../src/handler.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],outfile:new URL('../dist/handler.mjs',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),bundle:true,platform:'node',target:'node24',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
console.log('AWS Lambda bundle ready: dist/handler.mjs');
