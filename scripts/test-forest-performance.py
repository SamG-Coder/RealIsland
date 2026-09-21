"""Repeatable real GPU scene timings; includes simulation, rendering and queue completion."""
import os,json,statistics
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('reports')/os.environ.get('FOREST_REPORT','forest-after');out.mkdir(parents=True,exist_ok=True)
quality=os.environ.get('TEST_QUALITY','high')
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':1440,'height':900})
 page.goto(os.environ.get('TEST_URL','http://localhost:5180/')+'?quality='+quality+'&seed=1741&manual=1&view=river')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 page.evaluate("document.body.classList.add('photo')")
 result={'quality':quality,'views':{}}
 for view in ['river','meadow','island','forest']:
  if view!='forest':page.evaluate('(v)=>realIsland.goto(v)',view)
  else:page.evaluate('async()=>{const a=realIsland,t=await a.sim.runtime.read(a.sim.Trees);let best=0,score=Infinity;for(let i=0;i<a.sim.treeCount;i++){const d=Math.abs(t[i*4]+120)+Math.abs(t[i*4+2]+100);if(t[i*4+3]>8&&d<score){best=i;score=d;}}const x=t[best*4],y=t[best*4+1],z=t[best*4+2],h=t[best*4+3];Object.assign(a.camera,{x:x+12,y:y+h*.45,z:z+18,yaw:Math.atan2(-12,18),pitch:0});}')
  times=page.evaluate('async()=>{const a=realIsland,values=[];for(let i=0;i<110;i++){const t=performance.now(),b=a.cameraBasis(a.camera);a.sim.frame(1/60,false,a.camera,b,1.6);a.renderer.frame(a.camera,b,a.sim.time);await a.sim.runtime.idle();if(i>=20)values.push(performance.now()-t);}return values;}')
  page.screenshot(path=str(out/(view+'.png')))
  times.sort();result['views'][view]={'medianMs':statistics.median(times),'p95Ms':times[int(len(times)*.95)],'maxMs':max(times)}
  if page.evaluate('!!realIsland.renderer.forest'):
   result['views'][view]['draws']=page.evaluate("""async()=>{const a=realIsland,d=a.sim.device,out=[];for(const view of a.renderer.forest.views){const tmp=d.createBuffer({size:60,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),e=d.createCommandEncoder();e.copyBufferToBuffer(view.commands,0,tmp,0,60);d.queue.submit([e.finish()]);await tmp.mapAsync(GPUMapMode.READ);const c=new Uint32Array(tmp.getMappedRange());out.push({trees:[c[1],c[6],c[11]],triangles:(c[0]*c[1]+c[5]*c[6]+c[10]*c[11])/3});tmp.unmap();tmp.destroy();}return out;}""")

 result['errors']=page.evaluate('realIsland.errors');result['adapter']=page.evaluate('realIsland.sim.runtime.describe()')
 (out/'timings.json').write_text(json.dumps(result,indent=2));b.close()
print(json.dumps(result,indent=2));assert not result['errors']
