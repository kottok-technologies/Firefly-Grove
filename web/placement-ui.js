import {rewardClosesAt} from './placement-rewards.js';

export async function renderPlacementRewards({container,day,api,profile,rewards,onAdded}){
  for(const [board,title] of [['hearts','Daily hearts'],['speed','Daily speed']]){
    const section=document.createElement('section'),heading=document.createElement('h3'),status=document.createElement('p'),button=document.createElement('button');
    heading.textContent=title;status.setAttribute('role','status');button.className='primary';button.textContent='Claim reward';button.hidden=true;
    section.append(heading,status,button);container.append(section);
    if(rewards.has({id:board+':'+day})){status.textContent='This reward is already in your save.';continue;}
    const closes=rewardClosesAt(day,board);
    if(Date.now()<closes){status.textContent='Rewards unlock '+new Date(closes).toLocaleString()+'.';continue;}
    status.textContent='Checking your placement…';
    try{
      const result=await api('rewards?board='+board+'&day='+encodeURIComponent(day),{profile});
      if(!container.isConnected)return;
      if(result.status==='pending'){status.textContent='Rewards unlock '+new Date(result.unlocksAt).toLocaleString()+'.';continue;}
      if(result.status==='expired'){status.textContent='The 90-day reward claim window has ended.';continue;}
      const rank=result.rank;
      if(result.status!=='eligible'||!rank||rank>10){status.textContent='No top 10 placement for this date. Top 10 earn perks.';continue;}
      status.textContent='You placed #'+rank+'. Claim your hints and reveals below.';button.hidden=false;
      button.onclick=async()=>{
        button.disabled=true;status.textContent='Saving your reward…';
        try{
          const {receipt,added}=await rewards.claim(board,day);
          onAdded();
          status.textContent=added?`Added ${receipt.hints} hints and ${receipt.reveals} reveals for #${receipt.rank}!`:'This reward is already in your save.';
          button.textContent='Claimed';
        }catch(error){status.textContent=error.status===404?'Rewards need the server update. Please return later.':error.message;button.disabled=false;}
      };
    }catch(error){status.textContent=error.status===404?'Rewards need the server update. Please return later.':error.message;}
  }
}
