import {createGame} from '../web/engine.js';
export const origin='https://abc123.execute-api.us-east-1.amazonaws.com';
export function stateFixture(){
  const owner=origin+'|local-player';
  return {version:1,installSeed:42,level:7,completed:6,hints:3,reveals:2,settings:{autoCross:false,haptics:true},game:createGame(7,42),puzzleKeys:[],dailyRecords:{},
    leaderboardProfiles:{[origin]:{localId:'local-player',id:'server-player',name:'Little Light',token:'a'.repeat(64)},test:{localId:'do-not-copy',token:'secret-test-token'}},
    journeyHearts:{pending:[{owner,body:{version:'journey-v1',day:'2026-10-28',level:1,seed:42,finds:[1,2]},hearts:3,status:'pending'}],lastLevel:{[owner]:6,test:999}}};
}

