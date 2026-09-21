
const $=id=>document.getElementById(id);
export class TouchControls {
 constructor(game){
  this.game=game;this.enabled=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
  document.body.classList.toggle('touch-game',this.enabled);
  if(this.enabled){$('game-backpack').textContent='Backpack';$('game-pause-button').textContent='Pause';}
  this.move={x:0,y:0};this.look={x:0,y:0};this.sprint=false;this.resets=[];
  this.stick('touch-move',this.move);this.stick('touch-look',this.look);
  const sprint=$('touch-sprint');let held=null;
  sprint.addEventListener('pointerdown',e=>{if(game.phase!=='playing')return;e.preventDefault();held=e.pointerId;sprint.setPointerCapture(held);this.sprint=true;sprint.classList.add('held');});
  const release=e=>{if(e&&e.pointerId!==held)return;held=null;this.sprint=false;sprint.classList.remove('held');};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])sprint.addEventListener(type,release);
  this.resets.push(()=>release());
  $('touch-jump').onclick=()=>{if(game.phase==='playing')game.jumpQueued=true;};
  $('touch-interact').onclick=()=>game.interact();
  for(const id of ['touch-fullscreen','game-fullscreen','rotate-fullscreen'])$(id).onclick=()=>this.landscape();
  addEventListener('resize',()=>this.reset());addEventListener('blur',()=>this.reset());
 }
 get portrait(){return this.enabled&&innerHeight>innerWidth;}
 async landscape(){
  try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}
  catch{}
  try{await screen.orientation?.lock?.('landscape');}
  catch{}
  $('rotate-message').textContent='Turn your phone sideways to play. If it stays upright, enable screen rotation on your device.';
 }
 stick(id,value){
  const node=$(id),knob=node.querySelector('.stick-knob');let pointer=null,center={x:0,y:0};
  const move=e=>{
   const radius=node.clientWidth*.30,dx=e.clientX-center.x,dy=e.clientY-center.y,d=Math.hypot(dx,dy),limit=Math.min(1,radius/Math.max(d,.001));
   const amount=Math.min(1,d/radius),strength=amount<.12?0:(amount-.12)/.88;
   value.x=d?dx/d*strength:0;value.y=d?dy/d*strength:0;
   knob.style.transform='translate('+dx*limit+'px,'+dy*limit+'px)';
  };
  node.addEventListener('pointerdown',e=>{if(pointer!==null||this.game.phase!=='playing')return;e.preventDefault();pointer=e.pointerId;const r=node.getBoundingClientRect();center={x:r.x+r.width/2,y:r.y+r.height/2};node.setPointerCapture(pointer);node.classList.add('held');move(e);});
  node.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();move(e);}});
  const reset=()=>{pointer=null;value.x=0;value.y=0;knob.style.transform='translate(0,0)';node.classList.remove('held');};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(type,e=>{if(e.pointerId===pointer)reset();});
  this.resets.push(reset);
 }
 reset(){for(const fn of this.resets)fn();this.game.keys.clear();this.game.jumpQueued=false;this.game.sim.playerInteraction=null;}
}
