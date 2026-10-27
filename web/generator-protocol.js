export function validateGeneratorMessage(event,expectedOrigin){
  // Dedicated workers normally receive an empty MessageEvent.origin. A nonempty
  // origin must still match the creator's packaged/localhost origin.
  if(event.origin!==''&&event.origin!==expectedOrigin)return null;
  const data=event.data;
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  if(data.mode==='daily')return typeof data.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(data.day)?{mode:'daily',day:data.day}:null;
  if(data.mode!==undefined&&data.mode!=='journey')return null;
  return Number.isSafeInteger(data.level)&&data.level>=1&&Number.isInteger(data.seed)&&data.seed>=0&&data.seed<=0xffffffff?{mode:'journey',level:data.level,seed:data.seed}:null;
}
