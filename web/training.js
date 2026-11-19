// The classic generator reproduces this board for both play and leaderboard replay.
export const TRAINING_SEED=102;

const steps=[
  {cell:0,context:[0,1,2,3],text:'Each row holds one firefly. Row 1 already has one. Tap the outlined square to cross it out. Crosses are free notes.'},
  {cell:14,context:[2,6,10,14],text:'Each column holds one firefly too. Tap the outlined square in column 3 to cross it out.'},
  {cell:8,context:[0,1,2,3,5,6,8,9],text:'Each color holds one firefly. This color already has one, so tap the outlined square to cross it out.'},
  {cell:7,context:[1,2,3,5,6,7],text:'Fireflies can’t touch, even diagonally. Tap the outlined square next to the firefly to cross it out.'},
  {cell:11,context:[7,11],find:true,text:'Only one square of this color is left. Double-tap it to find the firefly. In other levels, a wrong double-tap costs a heart.'},
  {cell:13,context:[1,5,9,12,13,14,15],find:true,text:'Row 4 and column 2 still need a firefly. Double-tap where they meet to finish the puzzle.'},
];

export function trainingStep(game){
  if(game?.level!==1||game.seed!==TRAINING_SEED||game.generation!=='journey-v1'||game.completed)return null;
  const index=steps.findIndex(step=>game.marks[step.cell]!==(step.find?2:1));
  return index<0?null:{...steps[index],position:index+1,total:steps.length};
}
