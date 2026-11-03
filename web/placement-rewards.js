export const PLACEMENT_TIERS=Object.freeze([
  {through:1,hints:5,reveals:3},
  {through:3,hints:3,reveals:2},
  {through:10,hints:1,reveals:1}
]);
export function placementPrize(rank){
  return Number.isInteger(rank)&&rank>0?PLACEMENT_TIERS.find(tier=>rank<=tier.through)||null:null;
}
export function rewardClosesAt(day,board){
  // A speed run may start just before midnight and last another 36 hours.
  return Date.parse(day+'T00:00:00Z')+86400000+(board==='speed'?36*3600000:0);
}
export function placementRewards({state,origin,profile,api,persist}){
  state.placementReceipts ||= {};
  const pending=new Map();
  function claim(board,day){
    const requestKey=board+':'+day;
    if(pending.has(requestKey))return pending.get(requestKey);
    const request=(async()=>{
      const receipt=await api('rewards/claim',{method:'POST',profile,body:{board,day}});
      const key=origin+'|'+profile.id+'|'+receipt.id;
      if(state.placementReceipts[key])return {receipt,added:false};
      const before={hints:state.hints,reveals:state.reveals};
      state.hints+=receipt.hints;state.reveals+=receipt.reveals;
      state.placementReceipts[key]=true;
      // The receipt and inventory must reach the same local snapshot. On failure,
      // retry the server receipt rather than losing a reward or adding it twice.
      try{persist();}catch(error){
        Object.assign(state,before);delete state.placementReceipts[key];throw error;
      }
      return {receipt,added:true};
    })().finally(()=>{pending.delete(requestKey);});
    pending.set(requestKey,request);return request;
  }
  return {claim,has:receipt=>!!state.placementReceipts[origin+'|'+profile.id+'|'+receipt.id]};
}
