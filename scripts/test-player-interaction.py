from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('reports/interaction');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':1440,'height':900})
 page.goto('http://localhost:5180/?quality=high&seed=1741&mode=game')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 page.get_by_role('button',name='New journey',exact=True).click()
 page.keyboard.down('KeyW');page.wait_for_timeout(500);page.keyboard.up('KeyW')
 page.wait_for_timeout(100)
 assert page.evaluate('realIsland.sim.playerInteraction.playerSpeed<.05')
 page.keyboard.press('Escape')
 assert page.evaluate('realIsland.sim.playerInteraction===null')
 page.get_by_role('button',name='Resume',exact=True).click()
 page.evaluate("()=>{realIsland.game.pitch=-.85;}")
 page.keyboard.down('KeyW');page.wait_for_timeout(600);page.keyboard.up('KeyW')
 page.screenshot(path=str(out/'grass-contact.png'))
 page.evaluate('''()=>{
 const g=realIsland.game,p=g.state.player;
 let best=null,score=Infinity;
 for(let z=p.z-15;z<p.z+15;z+=.5)for(let x=p.x-30;x<p.x+30;x+=.5){
  const h=g.world.height(x,z),w=g.world.water(x,z),depth=w-h;
  if(depth>.16&&depth<.7){const d=Math.abs(depth-.55)*30+Math.hypot(x-p.x,z-p.z)*.1;if(d<score){score=d;best={x,y:h+.02,z,vy:0,grounded:true};}}
 }
 if(!best)throw Error('No wading location');Object.assign(p,best);g.pitch=-.75;g.yaw=Math.PI;g.follow(1);
 }''')
 page.keyboard.down('KeyW');page.wait_for_timeout(600)
 page.screenshot(path=str(out/'water-contact.png'));page.keyboard.up('KeyW')
 page.keyboard.press('Escape')
 page.evaluate('realIsland.stop()');page.wait_for_timeout(100)
 result=page.evaluate('''async()=>{
 const sim=realIsland.sim,rt=sim.runtime;
 const run=async(name,buffers,values,steps=1)=>{
  const kernel=sim.kernels[name],binding=kernel.bind(buffers,Object.fromEntries(kernel.artifact.metadata.scalars.map(s=>[s.name,values[s.name]])));
  for(let i=0;i<steps;i++){const batch=rt.batch();batch.dispatch(binding,[1,1,1]);batch.submit();}
  await rt.idle();
 };
 const roots=rt.createBuffer(new Float32Array([.5,3,0,.5,2,3,0,.5,.5,-3,0,.5]));
 const shape=rt.createBuffer(new Float32Array([1,.02,0,0,1,.02,0,0,1,.02,0,0]));
 const state=rt.createBuffer(new Float32Array(12));
 const grass={n:3,dt:1/60,time:0,wind:0,stiffness:.65,brushX:0,brushZ:0,brushY:3,brushForce:1,eyeX:0,eyeZ:0,seed:1741,clouds:0};
 await run('simulate',{roots,shape,state},grass,60);
 const bent=Array.from(await rt.read(state));
 await run('simulate',{roots,shape,state},{...grass,brushForce:0},180);
 const recovered=Array.from(await rt.read(state));
 const nx=41,nz=41,n=nx*nz,g={nx,nz,x0:-6,z0:-6,dx:.3,dz:.3,dt:1/60,playerX:0,playerY:3.02,playerZ:0,playerVX:0,playerVZ:3.1,playerSpeed:3.1};
 const initial=new Float32Array(n*19);initial.fill(3,0,2*n);initial.fill(.4,2*n,3*n);
 const S=rt.createBuffer(initial),Aux=rt.createBuffer(n*4*4);
 await run('playerWater',{S},g,30);
 const disturbed=await rt.read(S);
 let velocity=0,depthDelta=0;
 for(let k=0;k<n;k++){velocity=Math.max(velocity,Math.abs(disturbed[3*n+k]),Math.abs(disturbed[4*n+k]));depthDelta=Math.max(depthDelta,Math.abs(disturbed[2*n+k]-.4));}
 const ctx={...sim,grid:{nx,nz,x0:-6,z0:-6,dx:.3,dz:.3},n,S,Aux,bindings:new Map(),values:sim.values};
 for(let t=0;t<60;t++){
  const batch=rt.batch();
  for(const name of ['advectMomentum','faces','limits','limitFlux','integrate','islandBoundary'])sim.dispatch.call(ctx,batch,name,{dt:1/120,closed:1},n);
  batch.submit();await rt.idle();
 }
 const evolved=await rt.read(S);let wave=0,volume=0;
 for(let k=0;k<n;k++){wave=Math.max(wave,Math.abs(evolved[2*n+k]-.4));volume+=evolved[2*n+k];}
 const stopped=rt.createBuffer(initial);
 await run('playerWater',{S:stopped},{...g,playerSpeed:0},30);
 const stationary=await rt.read(stopped);
 const airborne=rt.createBuffer(initial);
 await run('playerWater',{S:airborne},{...g,playerY:6},30);
 const air=await rt.read(airborne);
 const dryData=initial.slice();dryData.fill(0,2*n,3*n);const dry=rt.createBuffer(dryData);
 await run('playerWater',{S:dry},g,30);const dryResult=await rt.read(dry);
 return {bent,recovered,velocity,depthDelta,wave,relativeVolumeError:Math.abs(volume-.4*n)/(.4*n),finite:evolved.every(Number.isFinite),stationary:stationary.every((x,i)=>x===initial[i]),airborne:air.every((x,i)=>x===initial[i]),dry:dryResult.every((x,i)=>x===dryData[i]),errors:realIsland.errors};
}''')
 assert result['bent'][0]>.1,result
 assert abs(result['bent'][4])<.001 and abs(result['bent'][8])<.001,result
 assert abs(result['recovered'][0])<abs(result['bent'][0])*.1,result
 assert result['velocity']>.1 and result['wave']>.001,result
 assert result['depthDelta']<1e-6 and result['relativeVolumeError']<1e-5,result
 assert result['stationary'] and result['airborne'] and result['dry'] and result['finite'],result
 assert not result['errors'],result
 (out/'gpu-validation.json').write_text(json.dumps(result,indent=2))
 b.close()
print(json.dumps(result))
