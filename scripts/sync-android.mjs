// Gradle reads web/ directly. This check catches missing assets before a build.
import { access } from 'node:fs/promises';
for (const file of ['index.html','app.js','engine.js','daily.js','leaderboard-client.js','gestures.js','generator-worker.js','style.css']) await access(new URL('../web/'+file,import.meta.url));
console.log('Android assets ready. Gradle packages web/ directly; no copy step is needed.');
