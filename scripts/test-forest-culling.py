"""Exercise actual GPU culling/LOD counters and reflected bounds with known trees."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page();page.goto('http://localhost:5180/?quality=test&manual=1')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 result=page.evaluate("async()=>{\n const {ForestVisibility}=await import('/src/forest-visibility.js');const d=realIsland.sim.device;\n const data=new Float32Array([0,0,-20,10, 0,0,-100,10, 0,0,-300,10, 0,0,100,10, 300,0,-20,10, 0,0,-10,0, 16,0,-20,10, 0,40,-20,10]);\n const trees=d.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(trees,0,data);\n const f=new ForestVisibility(d,trees,8);await f.initialize();f.aspect=1;\n async function read(buffer){const tmp=d.createBuffer({size:buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const e=d.createCommandEncoder();e.copyBufferToBuffer(buffer,0,tmp,0,buffer.size);d.queue.submit([e.finish()]);await tmp.mapAsync(GPUMapMode.READ);const a=Array.from(new Uint32Array(tmp.getMappedRange()));tmp.unmap();tmp.destroy();return a;}\n const camera={x:0,y:5,z:0},basis={forward:[0,0,-1],right:[1,0,0],up:[0,1,0]};let out=[];\n for(const reversed of [false,true]){\n  if(reversed){basis.forward=[0,0,1];basis.right=[-1,0,0];}\n  const e=d.createCommandEncoder();f.encode(e,camera,basis,0,false);f.encode(e,camera,basis,0,true);d.queue.submit([e.finish()]);\n  for(const view of f.views){const cmd=await read(view.commands),ids=await read(view.ids);out.push([0,1,2].map(lod=>ids.slice(lod*8,lod*8+cmd[lod*5+1]).sort((a,b)=>a-b)));}\n }\n for(const v of f.views){v.uniform.destroy();v.ids.destroy();v.commands.destroy();}trees.destroy();\n return {groups:out,errors:realIsland.errors};\n}")
 b.close()
assert result['groups']==[[[0,6],[1],[2]],[[0,6],[1],[2]],[[],[3],[]],[[],[3],[]]],result
assert not result['errors'],result
Path('reports/forest-culling.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
