import json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1)
 if os.environ.get('BENCH_BASELINE'):
  for name in ['quality.js','coastal-patch.js','renderer.js','scene-shaders.js','main.js']:
   content=subprocess.check_output(['git','show',os.environ['BENCH_BASELINE']+':src/'+name],text=True,encoding='utf8')
   page.route('**/src/'+name,lambda route,request,content=content:route.fulfill(status=200,content_type='text/javascript',body=content))
 page.goto('http://localhost:5180/?quality=low&mode=explore&manual=1&seed=1741&view=river')
 page.wait_for_function('realIsland.ready||realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 result=page.evaluate('''async()=>{
 const a=realIsland,rt=a.sim.runtime,samples=[],compute=[],render=[],gpu=[];
 const d=rt.device,query=d.createQuerySet({type:'timestamp',count:128}),resolve=d.createBuffer({size:1024,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:1024,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 const original=d.createCommandEncoder.bind(d);let cursor=0;
 d.createCommandEncoder=(...args)=>{const e=original(...args);
 for(const method of ['beginComputePass','beginRenderPass']){const begin=e[method].bind(e);e[method]=(desc={})=>{const start=cursor;cursor+=2;return begin({...desc,timestampWrites:{querySet:query,beginningOfPassWriteIndex:start,endOfPassWriteIndex:start+1}});};}return e;};

 for(let i=0;i<90;i++){
  cursor=0;const basis=a.cameraBasis(a.camera),start=performance.now();
  a.sim.frame(1/30,false,a.camera,basis,a.renderer.width/a.renderer.height);await rt.idle();const middle=performance.now();
  a.renderer.frame(a.camera,basis,i/30);await rt.idle();const end=performance.now();
  const e=original();e.resolveQuerySet(query,0,cursor,resolve,0);e.copyBufferToBuffer(resolve,0,read,0,cursor*8);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const times=new BigUint64Array(read.getMappedRange());let gpuMs=0;for(let k=0;k<cursor;k+=2)gpuMs+=Number(times[k+1]-times[k])/1e6;read.unmap();
  if(i>14){gpu.push(gpuMs);samples.push(end-start);compute.push(middle-start);render.push(end-middle);}
 }
 const stats=v=>{v.sort((a,b)=>a-b);return {median:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)]};};
 return {gpu:stats(gpu),frame:stats(samples),compute:stats(compute),render:stats(render),grass:a.sim.count,trees:a.sim.treeCount,patch:a.sim.coast.grid,renderSize:[a.renderer.width,a.renderer.height],errors:a.errors,environment:'Desktop GPU, phone viewport; not physical mobile FPS'};
 }''')
 assert not result['errors'],result
 target=Path(os.environ.get('BENCH_REPORT','reports/mobile-benchmark.json'));target.write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
