import test from 'node:test';
import assert from 'node:assert/strict';
import {cellsAlongSegment,paintNotes} from '../web/gestures.js';
import {createGame,isTarget} from '../web/engine.js';
const rect={left:10,top:20,width:400,height:400};
const point=(row,col)=>({x:10+(col+.5)*100,y:20+(row+.5)*100});
test('fast drags visit every crossed cell in stroke order',()=>{
  assert.deepEqual(cellsAlongSegment(point(0,0),point(0,3),4,rect),[0,1,2,3]);
  assert.deepEqual(cellsAlongSegment(point(3,1),point(0,1),4,rect),[13,9,5,1]);
  assert.deepEqual(cellsAlongSegment(point(0,0),point(3,3),4,rect),[0,5,10,15]);
});
test('segments outside the board are clipped, including re-entry',()=>{
  assert.deepEqual(cellsAlongSegment({x:-100,y:70},{x:500,y:70},4,rect),[0,1,2,3]);
  assert.deepEqual(cellsAlongSegment({x:-100,y:10},{x:500,y:10},4,rect),[]);
  assert.deepEqual(cellsAlongSegment({x:410,y:30},{x:410,y:420},4,rect),[]);
  assert.deepEqual(cellsAlongSegment(point(0,0),point(0,0),4,rect),[0]);
});
test('a shallow stroke includes cells briefly crossed near a corner',()=>{
  assert.deepEqual(cellsAlongSegment({x:60,y:70},{x:360,y:369},4,rect),[0,1,5,6,10,11,15]);
});
test('painting and erasing are idempotent, even when retracing the same cells',()=>{
  const game=createGame(1,42),cells=game.marks.flatMap((v,i)=>v!==2?[i]:[]);
  assert.deepEqual(paintNotes(game,cells,1),cells);
  assert.deepEqual(paintNotes(game,[...cells].reverse(),1),[]);
  assert.deepEqual(paintNotes(game,cells,0),cells);
  assert.deepEqual(paintNotes(game,cells,0),[]);
  assert.equal(game.lives,3);assert.equal(game.mistakes,0);
});
test('dragging protects found fireflies and allows notes on hidden fireflies',()=>{
  const game=createGame(1,42),found=[...game.givens],hidden=game.marks.findIndex((v,i)=>v===0&&isTarget(game,i));
  paintNotes(game,[...found,hidden],1);
  found.forEach(i=>assert.equal(game.marks[i],2));assert.equal(game.marks[hidden],1);
  paintNotes(game,[...found,hidden],0);
  found.forEach(i=>assert.equal(game.marks[i],2));assert.equal(game.marks[hidden],0);
  assert.equal(game.lives,3);assert.equal(game.mistakes,0);
});
test('completed or lost games cannot be painted, invalid cells are ignored',()=>{
  const game=createGame(1,42),before=[...game.marks];
  assert.deepEqual(paintNotes(game,[-1,1000,1.5],1),[]);assert.deepEqual(game.marks,before);
  game.lives=0;assert.deepEqual(paintNotes(game,[0,1,2,3],1),[]);
  game.lives=3;game.completed=true;assert.deepEqual(paintNotes(game,[0,1,2,3],1),[]);
});
