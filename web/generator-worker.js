import { createGame } from './engine.js';
import { createDailyGame } from './daily.js';
import {validateGeneratorMessage} from './generator-protocol.js';
self.onmessage = event => {
  if(event.origin!==''&&event.origin!==self.location.origin)return;
  const data=validateGeneratorMessage(event,self.location.origin);
  if(!data){self.postMessage({error:'Invalid puzzle request.'});return;}
  try{self.postMessage({game:data.mode==='daily'?createDailyGame(data.day):createGame(data.level,data.seed)});}
  catch(error){self.postMessage({error:error.message});}
};
