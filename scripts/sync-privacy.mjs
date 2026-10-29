import {writeFile} from 'node:fs/promises';
import {privacyDocument} from '../web/privacy-policy.js';
await writeFile(new URL('../web/privacy.html',import.meta.url),privacyDocument+'\n');
console.log('Public/offline privacy HTML synchronized.');
