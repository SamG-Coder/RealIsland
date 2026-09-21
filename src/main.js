import {SurvivalGame,installGameUI} from './game.js';
import {readSave} from './game-core.js';
import {IslandSimulation} from './simulation.js';
import {IslandRenderer} from './renderer.js';
import {qualityFor} from './quality.js';
import {createCamera,cameraBasis,VIEWS,pointCamera} from './camera.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const explore=params.get('mode')==='explore'||(params.has('manual')&&params.get('mode')!=='game');
if(!explore)document.body.classList.add('game');
const priorSave=readSave(localStorage).save;
const quality=params.get('quality')||localStorage.getItem('realisland-quality')||((matchMedia('(pointer:coarse)').matches)?'low':'balanced');
const seed=Math.max(0,Math.min(99999999,Number(params.get('seed')||(!explore&&priorSave?.seed)||1741)))>>>0;
const errors=[],log=[];let sim,renderer,game,paused=false,busy=false,last=0,stopped=params.has('manual'),previousCompletion=0,frames=[],lastHud=0;
const api=window.realIsland={ready:false,errors,log,quality,seed,stop(){stopped=true;},resume(){stopped=false;last=0;requestAnimationFrame(frame);}};
function progress(message,value){$('stage').textContent=message;$('progress').style.width=`${Math.min(value,1)*100}%`;$('percent').textContent=`${Math.round(Math.min(value,1)*100)}%`;log.push(message);$('load-log').textContent=log.slice(-8).map((x,i)=>`${i===7?'›':'✓'} ${x}`).join('\n');console.info('[RealIsland]',message);}
function fail(error){const message=error?.message||String(error);if(errors.includes(message))return;errors.push(message);console.error(error);stopped=true;$('loading').hidden=false;$('loading').classList.add('failed');$('stage').textContent='Startup / GPU error';$('load-log').textContent=message+'\n\nOpen the browser console for details. No substitute renderer is used.';}
function photo(){document.body.classList.toggle('photo');$('restore').hidden=!document.body.classList.contains('photo');}
const controls=createCamera($('view'),key=>{if(key==='KeyH')photo();if(key==='KeyP')togglePause();const views={Digit1:'island',Digit2:'meadow',Digit3:'river',Digit4:'shore',Digit5:'estuary',Digit6:'surf'};if(views[key])goto(views[key]);},()=>explore);
function togglePause(){paused=!paused;$('pause').textContent=paused?'Resume water':'Pause water';}
async function goto(name){const v=VIEWS[name];if(!v||!sim)return;let position=[...v.position];
 let target=[...v.target];
 if(name==='river'){
   const g=sim.grid,j=Math.round((-180-g.z0)/g.dz),row=await sim.runtime.read(sim.S,Float32Array,g.nx*4,(sim.n+j*g.nx)*4);
   const depths=await sim.runtime.read(sim.S,Float32Array,g.nx*4,(2*sim.n+j*g.nx)*4);let i0=Math.ceil((-450-g.x0)/g.dx),best=i0;
   for(let i=i0;i<Math.floor((450-g.x0)/g.dx);i++)if(depths[i]>.05 && (depths[best]<=.05 || row[i]<row[best]))best=i;
   const x=g.x0+best*g.dx;position=[x-8,0,-180];target=[x+18,row[best]+1,-90];
 }
 if(name==='surf'){const x=sim.coast.shoreX;position=[x-24,2.2,135];target=[x-5,.15,170];}
 if(name==='shore'){
   // Locate the actual west shoreline for this seed instead of teleporting to
   // a hard-coded coordinate which may be open sea after a coastline change.
   const g=sim.grid,j=Math.round((160-g.z0)/g.dz);
   const row=await sim.runtime.read(sim.S,Float32Array,g.nx*4,(sim.n+j*g.nx)*4);
   const i=row.findIndex(h=>h>.1);
   if(i>=0){const x=g.x0+i*g.dx;position=[x+8,0,160];target=[x-40,.2,210];}
 }
 if(v.groundOffset){const g=sim.grid,i=Math.max(0,Math.min(g.nx-1,Math.round((position[0]-g.x0)/g.dx))),j=Math.max(0,Math.min(g.nz-1,Math.round((position[2]-g.z0)/g.dz))),k=j*g.nx+i;
 // An explicit viewpoint action reads two scalars, not an evolving field per frame.
 const [bed,depth]=await Promise.all([sim.runtime.read(sim.S,Float32Array,4,k*4),sim.runtime.read(sim.S,Float32Array,4,(2*sim.n+k)*4)]);position[1]=bed[0]+depth[0]+v.groundOffset;}
 pointCamera(controls.camera,position,target);renderer.lastWeather=-Infinity;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));return position;}
function download(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,5000);}
async function diagnostics(){const prior=stopped;stopped=true;await sim.runtime.idle();const state=await sim.diagnostics(),tests=await sim.closedTests(),watershed=await sim.watershedAudit(),coastalPatch=await sim.coast.diagnostics();const report={version:'RealIsland 0.1',date:new Date().toISOString(),state,tests,watershed,coastalPatch,renderShaders:renderer.compilation,frameSamplesMs:[...frames],renderSize:[renderer.width,renderer.height],errors:[...errors],note:'Software adapters are valid for correctness, not hardware performance estimates.'};if(!prior){stopped=false;last=0;requestAnimationFrame(frame);}return report;}
function wire(){
 $('quality').value=quality;$('quality').addEventListener('change',()=>{localStorage.setItem('realisland-quality',$('quality').value);params.set('quality',$('quality').value);location.search=params;});
 for(const name of ['flow','strength','wind','season','moisture','clouds','tide','exposure'])$(name).addEventListener('input',()=>{const v=Number($(name).value);if(name==='exposure')renderer.exposure=v;else sim.settings[name]=v;$(name+'-value').textContent=['clouds','season','moisture'].includes(name)?`${Math.round(v*100)}%`:name==='tide'?`${v.toFixed(2)} m`:name==='flow'?`${v.toFixed(1)}×`:v.toFixed(2);renderer.lastWeather=-Infinity;});
 $('seed').value=seed;$('regrow').onclick=()=>{params.set('seed',$('seed').value);location.search=params;};$('pause').onclick=togglePause;$('capture').onclick=photo;$('restore').onclick=photo;
 $('collapse').onclick=()=>{$('settings').hidden=!$('settings').hidden;$('collapse').textContent=$('settings').hidden?'+':'−';};
 document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>goto(button.dataset.view));
 $('diagnostics').onclick=async()=>{try{toast('Running explicit water and GPU checks…');const report=await diagnostics();download(report,'RealIsland-validation.json');toast(report.tests.every(x=>x.pass)&&report.watershed.pass&&!report.errors.length?'Validation report exported.':'Report exported: inspect the failed checks.');}catch(error){toast(error.message);}};
}
function frame(timestamp) {
 if(stopped)return;requestAnimationFrame(frame);if(busy||document.hidden)return;
 const now=timestamp/1000,dt=last?Math.min(.1,now-last):1/60;last=now;
 try{busy=true;const basis=game?game.update(dt):controls.update(dt);sim.frame(dt,game?game.phase!=='playing':paused,controls.camera,basis,renderer.width/renderer.height);renderer.frame(controls.camera,basis,now);game?.syncCollision();
 sim.device.queue.onSubmittedWorkDone().then(()=>{const finish=performance.now();if(previousCompletion){frames.push(finish-previousCompletion);if(frames.length>240)frames.shift();}previousCompletion=finish;busy=false;
 if(now-lastHud>.75){const recent=frames.slice(-60),mean=recent.reduce((a,b)=>a+b,0)/Math.max(1,recent.length);$('fps').textContent=`${mean>0?(1000/mean).toFixed(0):'—'} FPS`;$('resolution').textContent=`${renderer.width} × ${renderer.height}`;$('sim-clock').textContent=`${sim.time.toFixed(1)} s · ${sim.grid.nx}² cells`;
 if($('adaptive').checked&&quality!=='test'&&frames.length>45){const old=renderer.scale;if(mean>23)renderer.scale=Math.max(.50,old-.035);else if(mean<15.5)renderer.scale=Math.min(renderer.q.scale,old+.015);}
 lastHud=now;}
 }).catch(fail);
 }catch(error){busy=false;fail(error);}
}
async function start(){try{
 sim=await IslandSimulation.create(qualityFor(quality),seed,progress,fail);renderer=await IslandRenderer.create($('view'),sim,progress);
 Object.assign(api,{sim,renderer,camera:controls.camera,cameraBasis,goto,diagnostics,togglePause});Object.defineProperty(api,'paused',{get:()=>paused});wire();
 if(explore){if(VIEWS[params.get('view')])await goto(params.get('view'));}
 else {await goto('island');installGameUI();game=new SurvivalGame(sim,renderer,controls.camera,quality);api.game=game;
  if(params.get('resume')==='1'&&priorSave&&priorSave.seed===seed){game.start(priorSave);params.delete('resume');history.replaceState(null,'','?'+params);}
 }
 $('loading').hidden=true;api.ready=true;requestAnimationFrame(frame);
}catch(error){fail(error);}}
addEventListener('error',event=>fail(event.error||event.message));addEventListener('unhandledrejection',event=>fail(event.reason));start();
