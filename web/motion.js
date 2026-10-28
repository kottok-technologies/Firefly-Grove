// UI motion never owns game state or delays a move, save, or score submission.
export function createMotion(document,preference){
  let route=null,request=0;
  const running=new Map();
  function enter(element,kind='panel'){
    running.get(element)?.cancel();
    if(preference.matches||!element?.animate)return;
    const offset=kind==='board'?'translateY(10px) scale(.975)':'translateY(10px) scale(.99)';
    const animation=element.animate([{opacity:0,transform:offset},{opacity:1,transform:'none'}],{duration:kind==='board'?320:220,easing:'cubic-bezier(.2,.8,.2,1)'});
    running.set(element,animation);
    animation.finished.catch(()=>{}).then(()=>{if(running.get(element)===animation)running.delete(element);});
  }
  function screen(update,direction='forward'){
    const latest=++request;
    route?.skipTransition();
    document.documentElement.dataset.navigation=direction;
    if(preference.matches||!document.startViewTransition){const target=update();enter(target);return;}
    route=document.startViewTransition(()=>{if(latest===request)update();});
    route.finished.catch(()=>{});
  }
  preference.addEventListener('change',()=>{
    if(!preference.matches)return;
    route?.skipTransition();
    for(const animation of running.values())animation.cancel();
    running.clear();
  });
  return {enter,screen};
}
