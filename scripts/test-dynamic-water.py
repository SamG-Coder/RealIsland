"""Hardware test for scrolling detail: byte-exact overlap, live seeding, and travel."""
import json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'reports'/'dynamic-water';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='msedge',args=['--enable-unsafe-webgpu']);page=b.new_page(viewport={'width':1440,'height':900})
 page.goto(os.environ.get('TEST_URL','http://localhost:5180/')+'?quality=high&manual=1&view=surf')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 page.evaluate('realIsland.stop();document.body.classList.add("photo")')
 overlap=page.evaluate("""async()=>{const a=realIsland,s=a.sim,c=s.coast,b=a.cameraBasis(a.camera);let batch=s.runtime.batch();c.follow(batch,a.camera,b);batch.submit();await s.runtime.idle();
 const before=await s.runtime.read(c.S),auxBefore=await s.runtime.read(c.Aux),g={...c.grid},time=s.time;
 const stats={...s.runtime.stats};a.camera.x+=24;batch=s.runtime.batch();c.follow(batch,a.camera,b);batch.submit();await s.runtime.idle();const afterStats={...s.runtime.stats};
 const after=await s.runtime.read(c.S),auxAfter=await s.runtime.read(c.Aux);const {shiftX,shiftZ}=c.lastShift;let mismatch=0,compared=0;
 for(let j=0;j<g.nz;j++)for(let i=0;i<g.nx;i++){const oi=i+shiftX,oj=j+shiftZ;if(oi<0||oj<0||oi>=g.nx||oj>=g.nz)continue;
 for(let l=0;l<19;l++){if(after[l*c.n+j*g.nx+i]!==before[l*c.n+oj*g.nx+oi])mismatch++;compared++;}
 for(let l=0;l<4;l++){if(auxAfter[l*c.n+j*g.nx+i]!==auxBefore[l*c.n+oj*g.nx+oi])mismatch++;compared++;}}
 return {mismatch,compared,shiftX,shiftZ,timePreserved:s.time===time,readbackBytes:afterStats.readbackBytes-stats.readbackBytes,dataUploadBytes:afterStats.dataBytesUploaded-stats.dataBytesUploaded};}""")
 assert overlap['mismatch']==0 and overlap['compared']>1000000 and overlap['timePreserved'] and overlap['readbackBytes']==0 and overlap['dataUploadBytes']==0,overlap
 visits=[]
 for name in ['river','estuary','meadow','shore','surf']:
  page.evaluate('(n)=>realIsland.goto(n)',name)
  page.evaluate("""async()=>{const a=realIsland,b=a.cameraBasis(a.camera);for(let i=0;i<12;i++){a.sim.frame(1/30,false,a.camera,b,1.6);await a.sim.runtime.idle();}a.renderer.frame(a.camera,b,a.sim.time);await a.sim.runtime.idle();}""")
  result=page.evaluate("""async()=>{const a=realIsland,c=a.sim.coast,g=c.grid,d=await c.diagnostics();return {camera:{...a.camera},grid:g,nonfinite:d.nonfinite,moves:d.moves,containsCamera:a.camera.x>g.x0+8&&a.camera.x<g.x0+(g.nx-1)*g.dx-8&&a.camera.z>g.z0+8&&a.camera.z<g.z0+(g.nz-1)*g.dz-8};}""")
  result['view']=name;visits.append(result);assert result['nonfinite']==0 and result['containsCamera'],result
  page.screenshot(path=str(OUT/(name+'-dynamic.png')))
 # Visit actual opposite coastlines, not only the supplied west-beach view.
 for coast in ['east','north','south']:
  page.evaluate("""async(name)=>{const a=realIsland,s=a.sim,g=s.grid,j=Math.round((160-g.z0)/g.dz);let position,target;
   if(name==='east'){const row=await s.runtime.read(s.S,Float32Array,g.nx*4,(s.n+j*g.nx)*4);const i=row.findLastIndex(h=>h>.1),x=g.x0+i*g.dx;position=[x+24,2.2,160];target=[x,.2,180];}
   else {const state=await s.runtime.read(s.S),i=Math.round((-250-g.x0)/g.dx);let found=-1;
    for(let k=0;k<g.nz;k++)if(state[s.n+k*g.nx+i]>.1){found=k;if(name==='north')break;}
    const z=g.z0+found*g.dz,sign=name==='north'?-1:1;position=[-250,2.2,z+sign*24];target=[-230,.2,z];}
   const c=a.camera;[c.x,c.y,c.z]=position;const dx=target[0]-c.x,dz=target[2]-c.z;c.yaw=Math.atan2(dx,-dz);c.pitch=Math.atan2(target[1]-c.y,Math.hypot(dx,dz));
   const basis=a.cameraBasis(c);for(let i=0;i<12;i++){s.frame(1/30,false,c,basis,1.6);await s.runtime.idle();}a.renderer.frame(c,basis,s.time);await s.runtime.idle();
  }""",coast)
  d=page.evaluate('realIsland.sim.coast.diagnostics()');assert d['nonfinite']==0
  visits.append({'view':coast,'grid':d['grid'],'nonfinite':d['nonfinite'],'moves':d['moves']});page.screenshot(path=str(OUT/(coast+'-coast.png')))
 page.evaluate('realIsland.goto("surf")')
 # Isolated real GPU impact fixture: rising onshore water emits; a dry bed does not.
 impact=page.evaluate("""async()=>{const s=realIsland.sim,rt=s.runtime,nx=65,nz=65,n=nx*nz,slots=256,dx=.3,dz=.3,x0=-9.6,z0=-9.6;
 const state=new Float32Array(n*19),eta=new Float32Array(n);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const k=j*nx+i,bed=-1+(x0+i*dx)*.1;state[k]=state[n+k]=bed;state[2*n+k]=Math.max(0,-bed);state[3*n+k]=1;}
 const resources={World:s.World,Controls:s.Controls,S:rt.createBuffer(state),Eta:rt.createBuffer(eta),R:rt.createBuffer(new Float32Array([0,0,2,2,3,-1,12,0])),RockState:rt.createBuffer(32),Particles:rt.createBuffer(slots*12*4)};
 const values={nx,nz,x0,z0,dx,dz,rockCount:1,slots,step:1,time:1};
 const k=s.kernels.coastalImpact;const bind=k.bind(resources,Object.fromEntries(k.artifact.metadata.scalars.map(q=>[q.name,values[q.name]])));
 const run=async(time)=>{bind.setScalars({...values,time,step:Math.round(time*120)});const b=rt.batch();b.dispatch(bind,[1,1,1]);b.submit();await rt.idle();};
 await run(1);eta.fill(.1);rt.write(resources.Eta,eta);await run(1.1);const hit=await rt.read(resources.RockState);
 state.fill(0,2*n,3*n);rt.write(resources.S,state);eta.fill(-3);rt.write(resources.Eta,eta);await run(2.1);const dry=await rt.read(resources.RockState);
 const particles=await rt.read(resources.Particles);let nonfinite=0;for(const v of particles)if(!Number.isFinite(v))nonfinite++;
 for(const name of ['S','Eta','R','RockState','Particles'])rt.destroyBuffer(resources[name]);
 return {emitted:hit[5],dryEmitted:dry[5]-hit[5],nonfinite};}""")
 assert impact['emitted']>0 and impact['dryEmitted']==0 and impact['nonfinite']==0,impact
 # Continuous 60 metre coastal traverse. Camera and focus move together.
 ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate','15','-vcodec','png','-i','-','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'moving-coast.mp4')],stdin=subprocess.PIPE)
 start=page.evaluate('realIsland.sim.coast.moves');origins=[]
 for frame in range(150):
  r=page.evaluate("""async()=>{const a=realIsland,s=a.sim;a.camera.z+=.4;const b=a.cameraBasis(a.camera);s.frame(1/30,false,a.camera,b,1.6);s.frame(1/30,false,a.camera,b,1.6);a.renderer.frame(a.camera,b,s.time);await s.runtime.idle();return {x:s.coast.grid.x0,z:s.coast.grid.z0};}""")
  origins.append(r);png=page.screenshot();ff.stdin.write(png)
  if frame in [0,75,149]:(OUT/f'travel-{frame:03}.png').write_bytes(png)
 ff.stdin.close();assert ff.wait()==0
 final=page.evaluate('realIsland.sim.coast.diagnostics()');errors=page.evaluate('realIsland.errors')
 assert final['moves']>start and final['nonfinite']==0 and not errors
 report={'impact':impact,'overlap':overlap,'visits':visits,'travel':{'frames':150,'seconds':10,'distanceMetres':60,'scrolls':final['moves']-start,'origins':origins},'final':final,'errors':errors,'pass':True}
 (OUT/'dynamic-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'overlap':overlap,'visits':visits,'travelScrolls':final['moves']-start,'pass':True}))
 b.close()
