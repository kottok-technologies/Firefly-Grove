import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleLeaderboard,validateFinds,normalizeName} from '../leaderboard-service/lib/leaderboard.js';
import {createDailyGame} from '../web/daily.js';
const day='2026-10-26',finds=createDailyGame(day).solution.map((c,r)=>r*8+c);
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../leaderboard-service/drizzle/0000_stormy_union_jack.sql',import.meta.url),'utf8'));
 const db={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 let time=Date.parse(day+'T12:00:00Z');return {advance(ms){time+=ms;},async call(path,body,player,method=body?'POST':'GET'){const response=await handleLeaderboard(new Request('https://race.test/api/v1/'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(player?{Authorization:'Bearer '+player.token}:{})},...(body?{body:JSON.stringify(body)}:{})}),db,{now:()=>time});return {status:response.status,...await response.json()};}};
}
test('nickname and completed-find validation',()=>{assert.equal(normalizeName('  Little   Light '),'Little Light');assert.throws(()=>normalizeName('<script>'));assert.equal(validateFinds(day,finds),0);assert.throws(()=>validateFinds(day,finds.slice(1)));assert.throws(()=>validateFinds(day,[...finds,finds[0]]));const wrong=Array.from({length:64},(_,i)=>i).filter(i=>!finds.includes(i));assert.throws(()=>validateFinds(day,[...wrong.slice(0,3),...finds]));});
test('server timing, ownership, best score and idempotent finish',async()=>{
 const f=fixture(),a=await f.call('players',{name:'Amber'}),b=await f.call('players',{name:'Birch'});assert.equal(a.status,201);
 const start=()=>f.call('runs',{day,version:'speed-v1'},a);let run=await start();f.advance(20000);
 assert.equal((await f.call('finish',{runId:run.id,finds},b)).status,404);
 assert.equal((await f.call('finish',{runId:run.id,finds:finds.slice(1)},a)).status,400);
 let result=await f.call('finish',{runId:run.id,finds,elapsedMs:1},a);assert.equal(result.elapsedMs,20000);assert.equal(result.mine.rank,1);
 f.advance(10000);assert.equal((await f.call('finish',{runId:run.id,finds},a)).elapsedMs,20000);
 run=await start();f.advance(30000);await f.call('finish',{runId:run.id,finds},a);assert.equal((await f.call('leaderboard?day='+day,null,a)).mine.elapsedMs,20000);
 run=await start();f.advance(10000);await f.call('finish',{runId:run.id,finds},a);const board=await f.call('leaderboard?day='+day,null,a);assert.equal(board.total,1);assert.equal(board.mine.elapsedMs,10000);assert.equal(board.entries[0].isYou,true);
});
test('new attempts retire older runs and enforce today/version',async()=>{const f=fixture(),a=await f.call('players',{name:'Clover'});const one=await f.call('runs',{day,version:'speed-v1'},a);await f.call('runs',{day,version:'speed-v1'},a);f.advance(1000);assert.equal((await f.call('finish',{runId:one.id,finds},a)).status,409);assert.equal((await f.call('runs',{day:'2026-10-25',version:'speed-v1'},a)).status,409);assert.equal((await f.call('leaderboard?day=2026-10-27')).status,400);assert.equal((await f.call('runs',{day,version:'old'},a)).status,409);});
