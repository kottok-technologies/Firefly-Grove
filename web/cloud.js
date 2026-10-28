import {cloudState,encodeCloudSave,parseCloudSave,cloudSummary} from './cloud-state.js';

const META='firefly-cloud-meta-v1';
// Conflicting saves remain whole: never add tools, combine two progressions,
// or select a winner solely by a timestamp from a device's clock.
export function cloudManager({bridge,storage,readState,origin,restore,onStatus=()=>{},onConflict=()=>{},now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
  let available=false,enabled=false,account='',working=false,attention=false,message='Cloud saves are available in the Android app.',choice=null,timer=null,lastSync=0,dirty=false,flushAgain=false;
  let meta={};try{
    const stored=JSON.parse(storage.getItem(META));
    if(typeof stored?.base==='string'&&stored.base.length>0&&stored.base.length<=64)meta={base:stored.base};
  }catch{/* Local metadata is expendable; game data is not. */}
  const status=()=>({available,enabled,account,working,attention,message});
  const publish=()=>onStatus(status());
  const local=()=>cloudState(readState(),origin);
  const acknowledge=save=>{
    meta={base:save.id};storage.setItem(META,JSON.stringify(meta));
    enabled=true;attention=false;choice=null;lastSync=now();message='Saved with Google Play. Uploads finish when online.';publish();
  };
  async function cancelRead(){try{await bridge.request('cancel');}catch{/* No game data is changed by closing a read. */}}
  async function initialize(){
    if(!bridge){publish();return;}
    try{
      const result=await bridge.request('status');available=result.available===true;enabled=available&&result.enabled===true;account=result.account||'';
      message=available?(enabled?'Cloud saves are on.':'Cloud saves are off. Play as a guest or link Google Play.'):'Google Play cloud saves are not configured for this build.';
      publish();if(enabled)await sync();
    }catch(error){message=error.message;publish();}
  }
  async function finishWrite(result,save,restoring){
    if(result.saves){await inspect(result,true);return;}
    if(restoring)await restore(save.state);
    acknowledge(save);
  }
  async function write(session,state,restoring=false){
    const {save,text}=encodeCloudSave(state,{parent:meta.base||null});
    const result=await bridge.request('write',{session,data:text});
    await finishWrite(result,save,restoring);
  }
  async function inspect(result,forceConflict=false){
    account=result.account||account;
    const saves=result.saves.map(item=>({...item,save:item.data?parseCloudSave(item.data):null}));
    const state=local(),stateText=JSON.stringify(state);
    if(!forceConflict&&saves.length===1){
      const remote=saves[0].save;
      if(!remote){await write(result.session,state);return;}
      const remoteText=JSON.stringify(remote.state);
      if(remoteText===stateText){
        await bridge.request('adopt',{session:result.session});acknowledge(remote);return;
      }
      if(enabled&&remote.id===meta.base){await write(result.session,state);return;}
    }
    // Keep the native snapshot open until a selection or cancellation. Automatic
    // sync reports attention, but never interrupts a puzzle with a modal.
    choice={session:result.session,saves};attention=true;message='Device and cloud progress differ. Open Settings to choose a save.';
    publish();
  }
  async function sync(interactive=false){
    if(!bridge||working||choice||!available||!interactive&&!enabled)return;
    clearTimer(timer);timer=null;dirty=false;working=true;publish();
    try{await inspect(await bridge.request('read',{interactive}));}
    catch(error){await cancelRead();message=error.message;if(error.enabled===false)enabled=false;}
    finally{
      working=false;publish();
      if(flushAgain){flushAgain=false;if(enabled&&!choice)await sync();}
      else if(dirty)changed();
    }
    if(interactive&&choice)showChoices();
  }
  function showChoices(){
    if(!choice)return;
    const choices=[{key:'device',title:'Keep this device',summary:cloudSummary({state:local(),savedAt:null})},
      ...choice.saves.filter(item=>item.save).map((item,index)=>({key:item.key,title:choice.saves.length>1?`Cloud save ${index+1}`:'Use cloud save',summary:cloudSummary(item.save)}))];
    onConflict(choices,select,cancelChoice);
  }
  async function select(key){
    if(!choice||working)return;
    const selected=key==='device'?null:choice.saves.find(item=>item.key===key&&item.save);
    if(key!=='device'&&!selected)throw Error('Choose one of the displayed saves.');
    const current=choice;working=true;publish();
    try{await write(current.session,selected?selected.save.state:local(),!!selected);}
    catch(error){await cancelRead();choice=null;message=error.message;attention=true;throw error;}
    finally{working=false;publish();}
    if(choice)showChoices();
  }
  async function cancelChoice(){
    if(working)return;
    await cancelRead();choice=null;attention=false;message=enabled?'Cloud save choice cancelled. Your device save is unchanged.':'Cloud saves are off. Your device save is unchanged.';publish();
  }
  async function connect(){if(choice)showChoices();else await sync(true);}
  async function disconnect(){
    if(!bridge)return;
    if(working)throw Error('Wait for the current cloud save to finish, then try again.');
    working=true;clearTimer(timer);timer=null;flushAgain=false;publish();
    try{
      await bridge.request('disconnect');
      enabled=false;attention=false;choice=null;meta={};storage.removeItem(META);
      message='Cloud saves are off on this device. Your cloud save is kept.';
    }finally{working=false;flushAgain=false;publish();}
  }
  function changed(){
    dirty=true;
    if(!enabled||working||choice)return;
    clearTimer(timer);
    timer=setTimer(()=>{timer=null;void sync();},Math.max(2500,30000-(now()-lastSync)));
  }
  async function syncNow(){if(choice)showChoices();else await sync(true);}
  async function flush(){if(working){flushAgain=true;return;}await sync(false);}
  return {initialize,status,connect,disconnect,changed,syncNow,flush,showChoices,cancelChoice};
}
