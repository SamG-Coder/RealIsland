import {CollisionWorld,freshState,readSave,writeSave,stepPlayer,makeResources,interaction,useInteraction,eat} from './game-core.js';
import {actorPoses} from './game-actors.js';
import {cameraBasis} from './camera.js';
const $=id=>document.getElementById(id);
export function installGameUI(){
 document.body.classList.add('game');
 const container=document.createElement('div');container.id='game-ui';container.innerHTML=`
 <section id="game-menu" class="game-overlay" aria-label="Game menu">
  <div class="game-card"><p class="game-eyebrow">A FIRST-PERSON SURVIVAL ADVENTURE</p><h1>REAL<span>ISLAND</span></h1>
  <p id="game-subtitle">Find your footing. Stay supplied. Make this island home.</p>
  <div id="game-main-actions" class="game-actions">
   <button id="game-continue" class="primary">Continue journey</button><button id="game-new">New journey</button>
   <button id="game-settings">Settings</button><p id="game-save-info" class="game-muted"></p>
  </div>
  <div id="game-pause-actions" class="game-actions" hidden><button id="game-resume" class="primary">Resume</button><button id="game-save">Save game</button><button id="game-pause-settings">Settings</button><button id="game-quit">Save &amp; return to title</button></div>
  <div id="game-confirm" class="game-actions" hidden><p>Start a new journey? This replaces your saved journey on this device.</p><button id="game-confirm-new" class="primary">Start new journey</button><button id="game-cancel-new">Keep current journey</button></div>
  <div id="game-settings-panel" class="game-actions" hidden>
   <label>Graphics quality<select id="game-quality"><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
   <label class="game-check"><input id="game-adaptive" type="checkbox" checked> Adaptive resolution</label>
   <label>Look sensitivity<input id="game-sensitivity" type="range" min="0.5" max="2" step="0.1" value="1"></label>
   <p class="game-muted">Quality changes reload the island. Your current journey is saved first.</p><button id="game-settings-back">Back</button>
  </div>
  <div id="game-inventory" class="game-actions" hidden><h2>Backpack</h2><div class="inventory-row"><span>Berries <strong id="game-berry-count">0</strong></span><button id="game-eat">Eat one · +18 food</button></div><p class="game-muted">Gather from the small berry bushes near your starting point. Empty bushes recover after three minutes of play.</p><button id="game-inventory-back">Return to game</button></div>
  <div id="game-death" class="game-actions" hidden><h2>Your journey ended</h2><p>Keep food and water supplied, and watch your footing on steep ground.</p><button id="game-respawn" class="primary">Recover at the starting point</button><button id="game-death-title">Return to title</button></div>
  <p id="game-menu-message" role="status"></p>
 </div></section>
 <div id="game-hud" hidden><div class="journey-heading"><span class="game-eyebrow">REALISLAND</span><p id="game-objective">Stay supplied</p></div>
 <div class="game-top-actions"><span id="game-day">Day 1</span><button id="game-backpack">Backpack · I</button><button id="game-pause-button" aria-label="Pause game">Pause · Esc</button></div>
 <div class="needs">${['health','hunger','thirst','stamina'].map((n,i)=>`<label>${['Health','Food','Water','Stamina'][i]}<meter id="need-${n}" min="0" max="100" value="100"></meter><output id="need-${n}-value">100</output></label>`).join('')}</div>
 <div class="game-prompt" id="game-prompt" hidden><kbd>E</kbd><span id="game-prompt-text"></span></div>
 <div class="game-crosshair" aria-hidden="true">·</div><div class="game-help">WASD move · Shift sprint · Space jump<br>Click to capture mouse · Mouse look · E interact · I backpack</div>
 <div id="game-toast" role="status" hidden></div></div>`;
 document.body.append(container);
}
export class SurvivalGame {
 constructor(sim,renderer,camera,quality){
  this.sim=sim;this.renderer=renderer;this.camera=camera;this.quality=quality;this.world=new CollisionWorld(sim.grid,sim.collisionData,sim.treeDescriptors);
  this.spawn=this.world.spawn();this.resources=makeResources(this.world,this.spawn,sim.seed);this.phase='title';this.state=null;this.keys=new Set();this.yaw=Math.PI;this.pitch=-.18;this.sensitivity=1;this.accumulator=0;this.motion={speed:0};this.lastSave=0;this.jumpQueued=false;this.dragging=false;
  this.wire();this.show('title');
 }
 message(text){$('game-menu-message').textContent=text;$('game-toast').textContent=text;$('game-toast').hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>$('game-toast').hidden=true,4000);}
 show(phase){this.phase=phase;if(phase!=='playing'&&document.pointerLockElement)document.exitPointerLock();this.keys.clear();this.jumpQueued=false;this.dragging=false;this.accumulator=0;
  $('game-menu').hidden=phase==='playing';$('game-hud').hidden=phase!=='playing';
  for(const [id,p] of [['game-main-actions','title'],['game-pause-actions','paused'],['game-settings-panel','settings'],['game-inventory','inventory'],['game-confirm','confirm'],['game-death','dead']])$(id).hidden=p!==phase;
  $('game-subtitle').textContent=phase==='title'?'Find your footing. Stay supplied. Make this island home.':phase==='paused'?'Journey paused':phase==='settings'?'Make yourself comfortable':phase==='inventory'?'A few essentials for the journey.':'Stay supplied. Watch your footing.';
  if(phase==='title'){this.renderer.actorCount=0;const {save,error}=readSave(localStorage);$('game-continue').disabled=!save;$('game-save-info').textContent=error?'Save unavailable: '+error:save?'Saved '+new Date(save.savedAt).toLocaleString()+' · island '+save.seed:'Your progress is saved on this device.';}
  if(phase==='inventory'){$('game-berry-count').textContent=this.state.berries;$('game-eat').disabled=this.state.berries<1||this.state.player.hunger>=100;}
  if(phase==='playing')$('view').focus();else requestAnimationFrame(()=>$('game-menu').querySelector('.game-actions:not([hidden]) button:not([disabled])')?.focus());
 }
 start(saved=null){
  this.state=saved||freshState(this.sim.seed,this.spawn);const p=this.state.player;p.y=Math.max(p.y,this.world.height(p.x,p.z)+.02);p.vy=0;
  this.yaw=p.yaw;this.lastSave=this.state.elapsed;this.motion={speed:0};this.show(p.health>0?'playing':'dead');this.follow(1);this.updateActors();if(!saved)this.save();
 }
 save(){if(!this.state)return true;try{const saved=writeSave(localStorage,this.state);this.state.savedAt=saved.savedAt;this.lastSave=this.state.elapsed;this.message('Journey saved');return true;}catch(e){this.message('Could not save: '+e.message+'. Your current journey is still open.');return false;}}
 wire(){
  $('game-new').onclick=()=>readSave(localStorage).save?this.show('confirm'):this.start();$('game-confirm-new').onclick=()=>this.start();$('game-cancel-new').onclick=()=>this.show('title');
  $('game-continue').onclick=()=>{const {save,error}=readSave(localStorage);if(!save){this.message(error||'No saved journey.');return;}if(save.seed!==this.sim.seed){const p=new URLSearchParams(location.search);p.set('seed',save.seed);p.set('resume','1');p.delete('view');location.search=p;return;}this.start(save);};
  $('game-resume').onclick=()=>this.show('playing');$('game-save').onclick=()=>this.save();$('game-quit').onclick=()=>{if(this.save())this.show('title');};
  $('game-pause-button').onclick=()=>this.show('paused');$('game-backpack').onclick=()=>this.show('inventory');$('game-inventory-back').onclick=()=>this.show('playing');
  $('game-eat').onclick=()=>{if(eat(this.state)){this.show('inventory');this.updateHUD();}};
  $('game-respawn').onclick=()=>{const old=this.state;this.state=freshState(this.sim.seed,this.spawn);Object.assign(this.state,{elapsed:old.elapsed,harvested:old.harvested,objectives:old.objectives});this.state.player.hunger=60;this.state.player.thirst=60;this.start(this.state);this.save();};
  $('game-death-title').onclick=()=>{if(this.save())this.show('title');};
  const settings=()=>{this.settingsFrom=this.phase;this.show('settings');};$('game-settings').onclick=settings;$('game-pause-settings').onclick=settings;$('game-settings-back').onclick=()=>this.show(this.settingsFrom||'title');
  $('game-quality').value=this.quality;$('game-quality').onchange=()=>{if(this.state&&!this.save()){$('game-quality').value=this.quality;return;}localStorage.setItem('realisland-quality',$('game-quality').value);const p=new URLSearchParams(location.search);p.set('quality',$('game-quality').value);if(this.state)p.set('resume','1');location.search=p;};
  $('game-adaptive').onchange=()=>{$('adaptive').checked=$('game-adaptive').checked;localStorage.setItem('realisland-adaptive',String($('game-adaptive').checked));};
  $('game-adaptive').checked=localStorage.getItem('realisland-adaptive')!=='false';$('adaptive').checked=$('game-adaptive').checked;
  this.sensitivity=Number(localStorage.getItem('realisland-sensitivity'))||1;$('game-sensitivity').value=this.sensitivity;$('game-sensitivity').oninput=()=>{this.sensitivity=Number($('game-sensitivity').value);localStorage.setItem('realisland-sensitivity',String(this.sensitivity));};
  const canvas=$('view');
  canvas.addEventListener('click',()=>{if(this.phase==='playing')canvas.requestPointerLock?.()?.catch?.(()=>this.message('Mouse capture unavailable. Hold the mouse button to look.'));});
  canvas.addEventListener('pointerdown',e=>{if(this.phase!=='playing')return;this.dragging=true;this.mx=e.clientX;this.my=e.clientY;canvas.focus();});
  document.addEventListener('pointermove',e=>{
   if(this.phase!=='playing'||(!this.dragging&&document.pointerLockElement!==canvas))return;
   const locked=document.pointerLockElement===canvas,dx=locked?e.movementX:e.clientX-this.mx,dy=locked?e.movementY:e.clientY-this.my;
   this.yaw+=dx*.003*this.sensitivity;this.pitch=Math.max(-1.45,Math.min(1.45,this.pitch-dy*.003*this.sensitivity));this.mx=e.clientX;this.my=e.clientY;
  });
  document.addEventListener('pointerup',()=>this.dragging=false);
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&this.phase==='playing')this.show('paused');});
  addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
   if(e.code==='Escape'){e.preventDefault();if(this.phase==='playing')this.show('paused');else if(['paused','inventory'].includes(this.phase))this.show('playing');else if(this.phase==='settings')this.show(this.settingsFrom||'title');return;}
   if(this.phase!=='playing')return;if(['Space','KeyE','KeyI','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();this.keys.add(e.code);
   if(!e.repeat){if(e.code==='Space')this.jumpQueued=true;if(e.code==='KeyI')this.show('inventory');if(e.code==='KeyE'){const action=interaction(this.state,this.world,this.resources);if(useInteraction(this.state,action)){this.message(action.kind==='drink'?'Water replenished':'Gathered 3 berries');this.updateActors();}}}
  });addEventListener('keyup',e=>this.keys.delete(e.code));
  const suspend=()=>{if(this.phase==='playing'){this.show('paused');this.save();}};addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});addEventListener('pagehide',()=>{if(this.state)this.save();});
 }
 update(dt){
  if(this.phase!=='playing')return cameraBasis(this.camera);
  this.world.tide=this.sim.settings.tide;this.accumulator+=Math.min(dt,.1);
  const forward=Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-Number(this.keys.has('KeyS')||this.keys.has('ArrowDown')),side=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
  while(this.accumulator>=1/60){this.motion=stepPlayer(this.state,this.world,{x:Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side,z:-Math.cos(this.yaw)*forward+Math.sin(this.yaw)*side,sprint:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'),jump:this.jumpQueued},1/60);this.jumpQueued=false;this.accumulator-=1/60;}
  if(this.state.player.health<=0){this.show('dead');this.save();}
  if(this.state.elapsed-this.lastSave>30){this.lastSave=this.state.elapsed;this.save();}
  this.follow(dt);this.updateActors();if(!this.hudAt||this.state.elapsed-this.hudAt>.1){this.updateHUD();this.hudAt=this.state.elapsed;}return cameraBasis(this.camera);
 }
 follow(dt){const p=this.state.player;
  // Eye position belongs to the collision-controlled player, without an orbit arm.
  Object.assign(this.camera,{x:p.x,y:p.y+1.65,z:p.z,yaw:this.yaw,pitch:this.pitch});
  p.yaw=this.yaw;
 }
 syncCollision(){
  if(this.phase!=='playing'||this.collisionPending)return;
  const c=this.sim.coast,moves=c.moves||0;if(this.collisionMoves===moves&&this.state.elapsed-(this.collisionAt||0)<2)return;
  this.collisionPending=true;const grid={...c.grid},time=this.state.elapsed;
  // Asynchronous local-tile refresh; physics never waits for a GPU readback.
  this.sim.runtime.read(c.S,Float32Array,c.n*3*4,0).then(data=>{
   if((c.moves||0)===moves){this.world.detail={grid,data:{bed:data.slice(0,c.n),ground:data.slice(c.n,2*c.n),depth:data.slice(2*c.n,3*c.n)}};this.collisionMoves=moves;this.collisionAt=time;}
  }).catch(e=>this.message('Terrain contact refresh failed: '+e.message)).finally(()=>this.collisionPending=false);
 }
 updateActors(){if(this.state)this.renderer.updateActors(actorPoses(this.state,this.resources,this.motion));}
 updateHUD(){const s=this.state;for(const key of ['health','hunger','thirst','stamina']){$('need-'+key).value=s.player[key];$('need-'+key+'-value').textContent=Math.round(s.player[key]);}
  $('game-day').textContent='Day '+(1+Math.floor(s.elapsed/1200));const action=interaction(s,this.world,this.resources);$('game-prompt').hidden=!action;$('game-prompt-text').textContent=action?.label||'';
  $('game-objective').textContent=!s.objectives.gather?'First supplies · gather berries from a nearby bush':!s.objectives.drink?'Find freshwater · approach the river and press E':'Stay supplied · explore the island';
 }
}
