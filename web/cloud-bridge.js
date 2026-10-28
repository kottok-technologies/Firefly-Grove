export function cloudBridge({native=globalThis.window?.FireflyCloud,setTimer=setTimeout,clearTimer=clearTimeout,id=()=>crypto.randomUUID()}={}){
  if(!native||typeof native.postMessage!=='function')return null;
  const requests=new Map();
  native.onmessage=event=>{
    let reply;try{reply=JSON.parse(event.data);}catch{return;}
    const pending=requests.get(reply.id);if(!pending)return;
    requests.delete(reply.id);clearTimer(pending.timer);
    if(reply.ok)pending.resolve(reply);else pending.reject(Object.assign(Error(reply.error||'Google Play could not complete this request. Please retry.'),{enabled:reply.enabled}));
  };
  function request(operation,values={}){
    const requestId=id();
    return new Promise((resolve,reject)=>{
      const timer=setTimer(()=>{
        requests.delete(requestId);reject(Error('Google Play did not respond. Your device save is safe; please retry.'));
        try{native.postMessage(JSON.stringify({id:id(),operation:'cancel'}));}catch{/* The native page may already be gone. */}
      },120000);
      requests.set(requestId,{resolve,reject,timer});
      try{native.postMessage(JSON.stringify({...values,id:requestId,operation}));}
      catch{requests.delete(requestId);clearTimer(timer);reject(Error('Google Play is unavailable. Your device save is safe.'));}
    });
  }
  return {request};
}
