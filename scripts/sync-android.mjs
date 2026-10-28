// Gradle reads web/ directly. This check catches missing assets before a build.
import { access } from 'node:fs/promises';
for (const file of ['cloud.js','cloud-state.js','cloud-bridge.js','index.html','assets/firefly.png','assets/firefly-atlas.png','firefly-player.js','firefly-frames.js','app.js','hint-overlay.js','hearts.js','profile.js','dialogs.js','generator-protocol.js','engine.js','daily.js','leaderboard-client.js','leaderboard-config.js','gestures.js','generator-worker.js','style.css']) await access(new URL('../web/'+file,import.meta.url));
console.log('Android assets ready. Gradle packages web/ directly; no copy step is needed.');
