// Only native earned-reward responses may grant Android rewards. No browser fallback.
export function rewardBridge({native=globalThis.window?.FireflyAds,id=()=>crypto.randomUUID()}={}){
  if(!native||typeof native.postMessage!=='function')return null;
  const pending=new Map();
  native.onmessage=event=>{
    let reply;try{reply=JSON.parse(event.data);}catch{return;}
    if(!reply||typeof reply!=='object')return;
    const request=pending.get(reply.id);if(!request)return;
    pending.delete(reply.id);
    if(reply.ok===true)request.resolve(reply);else request.reject(Error(reply.error||'Reward video unavailable. Please try again later.'));
  };
  function request(operation,kind){
    if(pending.size)return Promise.reject(Error('Please finish the current ad request first.'));
    const requestId=id();
    return new Promise((resolve,reject)=>{
      pending.set(requestId,{resolve,reject});
      try{native.postMessage(JSON.stringify({id:requestId,operation,kind}));}
      catch{pending.delete(requestId);reject(Error('Reward videos are unavailable on this device.'));}
    });
  }
  function cancel(){
    if(!pending.size)return;
    try{native.postMessage(JSON.stringify({id:id(),operation:'cancel'}));}catch{/* Native loading timeout remains the fallback. */}
  }
  return {request,cancel};
}
