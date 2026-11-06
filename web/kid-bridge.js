// The Android SDK owns age capture. This bridge exposes capabilities and an app-specific
// backend credential only, never k-ID session IDs, parent data or claim tokens.
export function kidBridge(native=globalThis.FireflyKid,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
  if(!native)return null;
  let serial=0;
  const pending=new Map();
  native.onmessage=event=>{
    let data;try{data=JSON.parse(event.data);}catch{return;}
    const entry=pending.get(data.id);if(!entry)return;
    pending.delete(data.id);clearTimer(entry.timer);entry.resolve(data);
  };
  return {request(operation='status'){
    return new Promise((resolve,reject)=>{
      const id='kid-'+(++serial);
      const timer=setTimer(()=>{pending.delete(id);reject(Error('Privacy permissions could not be checked. Please try again.'));},5000);
      pending.set(id,{resolve,timer});
      try{native.postMessage(JSON.stringify({id,operation}));}
      catch(error){pending.delete(id);clearTimer(timer);reject(error);}
    });
  }};
}
const bridge=kidBridge();
export async function onlineConsent(path){
  if(!bridge){
    if(/Android/.test(globalThis.navigator?.userAgent||'')&&/; wv/.test(globalThis.navigator?.userAgent||''))throw Error('Online privacy permissions are unavailable in this WebView. Please update Android System WebView.');
    return {};
  }
  const status=await bridge.request();
  if(!status.rankings)throw Error('Online rankings are off. Manage access in Settings → Privacy & permissions.');
  if(path==='profile'&&!status.username)throw Error('Custom usernames are off. Manage access in Settings → Privacy & permissions.');
  if(!/^[a-f0-9]{64}$/.test(status.proof))throw Error(status.message||'Online permission verification is pending.');
  return {'X-Firefly-Consent':status.proof};
}
export async function showKidSettings(){if(bridge)await bridge.request('settings');}
export const hasKidSettings=!!bridge;

export async function requireCustomUsername(){
  if(!bridge)return;
  const status=await bridge.request();
  if(!status.username)throw Error('Custom usernames are off. Manage access in Privacy & permissions.');
}
export async function kidStatus(){return bridge?bridge.request():null;}
