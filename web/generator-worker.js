import { createGame } from './engine.js';
import { createDailyGame } from './daily.js';
self.onmessage = ({data}) => { try { self.postMessage({game:data.mode==='daily'?createDailyGame(data.day):createGame(data.level,data.seed)}); } catch(error) { self.postMessage({error:error.message}); } };
