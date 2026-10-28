import {createGame,applyMove} from './engine.js';
import {ApiError} from './service.mjs';

// Replay find attempts (including tool reveals) to derive hearts on the server.
// -1 represents restoring one life after all three lives have been lost.
export function validateJourneyCompletion(input){
  if(!['journey-v1','journey-v2'].includes(input.version)||!Number.isInteger(input.level)||input.level<1||input.level>1000000||!Number.isInteger(input.seed)||input.seed<0||input.seed>0xffffffff)throw new ApiError(400,'Invalid journey puzzle.');
  if(!Array.isArray(input.finds)||!input.finds.length||input.finds.length>512)throw new ApiError(400,'Invalid journey find history.');
  const game=createGame(input.level,input.seed,input.version);
  for(const cell of input.finds){
    if(game.completed)throw new ApiError(400,'The journey continued after completion.');
    if(cell===-1){
      if(game.lives!==0)throw new ApiError(400,'A life can only be restored after losing all lives.');
      game.lives=1;continue;
    }
    if(!Number.isInteger(cell)||cell<0||cell>=game.size**2||applyMove(game,cell,true)==='ignored')throw new ApiError(400,'Invalid find in the journey.');
  }
  if(!game.completed)throw new ApiError(400,'Complete the journey puzzle before submitting hearts.');
  return {level:input.level,hearts:game.lives};
}
