"""Capture sand transition and measure frame completion across resident-grid shifts."""
import json,statistics
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'reports'/'bank-materials';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':1440,'height':900})
 page.goto('http://localhost:5180/?quality=high&seed=1741&manual=1&view=river')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 page.evaluate("document.body.classList.add('photo')")
 for name,z in [('gravel',-180),('transition',470),('sand',600),('shoreline',700)]:
  page.evaluate('''async(z)=>{const a=realIsland,s=a.sim,g=s.grid,j=Math.round((z-g.z0)/g.dz);
   const bed=await s.runtime.read(s.S,Float32Array,g.nx*4,(s.n+j*g.nx)*4);
   const t=Math.max(0,Math.min(1,(z+600)/1360));const center=-280+510*t+65*Math.sin(t*6)+25*Math.sin(t*12+.65);let best=Math.round((center-g.x0)/g.dx);for(let i=Math.ceil((center-10-g.x0)/g.dx);i<Math.floor((center+10-g.x0)/g.dx);i++)if(bed[i]<bed[best])best=i;
   const x=g.x0+best*g.dx;Object.assign(a.camera,{x:x+6,y:Math.max(0,bed[best])+5,z:z-12,yaw:Math.PI,pitch:-.22});
   const basis=a.cameraBasis(a.camera);for(let i=0;i<30;i++){s.frame(1/30,false,a.camera,basis,1.6);await s.runtime.idle();}
   a.renderer.frame(a.camera,basis,s.time);await s.runtime.idle();}''',z)
  page.screenshot(path=str(OUT/(name+'.png')))
 result=page.evaluate('''async()=>{const a=realIsland,s=a.sim,frames=[];for(let i=0;i<100;i++){
  a.camera.z+=.55;const moves=s.coast.moves||0,b=a.cameraBasis(a.camera),start=performance.now();
  s.frame(1/30,false,a.camera,b,1.6);a.renderer.frame(a.camera,b,s.time);await s.runtime.idle();
  frames.push({ms:performance.now()-start,shift:(s.coast.moves||0)>moves});
 }return {frames,errors:a.errors,adapter:s.runtime.describe()};}''')
 for category,frames in [('ordinary',[f['ms'] for f in result['frames'] if not f['shift']]),('shift',[f['ms'] for f in result['frames'] if f['shift']])]:
  result[category]={'count':len(frames),'medianMs':statistics.median(frames) if frames else None,'maxMs':max(frames) if frames else None}
 (OUT/'validation.json').write_text(json.dumps(result,indent=2))
 b.close()
print(json.dumps({k:v for k,v in result.items() if k!='frames'},indent=2))
assert not result['errors']
