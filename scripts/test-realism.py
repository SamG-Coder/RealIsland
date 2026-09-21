"""Hardware WebGPU evidence for headwater budget, lake storage and tree geometry."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/realism';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.goto(os.environ.get('TEST_URL','http://localhost:5180/')+'?quality=high&seed=1741&manual=1&view=lake')
    page.wait_for_function('window.realIsland?.ready || window.realIsland?.errors.length',timeout=240000)
    assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
    result=page.evaluate('''async()=>{
      const a=realIsland,s=a.sim,rt=s.runtime,n=65*65,dx=3.125;
      const data=new Float32Array(n*19);
      for(let k=0;k<n;k++){data[k]=data[n+k]=15;data[2*n+k]=data[11*n+k]=3;}
      const S=rt.createBuffer(data),Aux=rt.createBuffer(n*16),Controls=rt.createBuffer(new Float32Array([0,s.hydrology.sourceDepthRate,0]));
      const kernel=s.kernels.islandBoundary;
      const values={nx:65,nz:65,x0:-280-32*dx,z0:-690-32*dx,dx,dz:dx,dt:1,time:0,flow:1,closed:0};
      const bindings={S,Aux,Controls,World:s.World};
      const bound=kernel.bind(Object.fromEntries(kernel.artifact.metadata.bindings.map(b=>[b.name,bindings[b.name]])),Object.fromEntries(kernel.artifact.metadata.scalars.map(v=>[v.name,values[v.name]])));
      const batch=rt.batch();batch.dispatch(bound,[Math.ceil(n/128),1,1]);batch.submit();
      const after=await rt.read(S),k=32*65+32,added=(after[2*n+k]-3)*dx*dx;
      // Regression: an entirely dry bank must keep the coast reconstructor's
      // signed surface. The river pass formerly invented its prescribed datum.
      for(let k=0;k<n;k++){data[k]=data[n+k]=10;data[2*n+k]=data[11*n+k]=0;}
      rt.write(S,data);const Eta=rt.createBuffer(n*4);
      const run=(name)=>{const kernel=s.kernels[name],all={...values,enhanced:1,flow:1};
        const resources={S,Eta,Controls,World:s.World};
        const bound=kernel.bind(Object.fromEntries(kernel.artifact.metadata.bindings.map(b=>[b.name,resources[b.name]])),Object.fromEntries(kernel.artifact.metadata.scalars.map(v=>[v.name,all[v.name]])));
        const b=rt.batch();b.dispatch(bound,[Math.ceil(n/128),1,1]);b.submit();};
      run('reconstruct');const dryBefore=await rt.read(Eta);run('reconstructRiver');const dryAfter=await rt.read(Eta);
      let inventedWetCells=0,changedDryCells=0;
      for(let k=0;k<n;k++){if(dryAfter[k]>data[k])inventedWetCells++;if(dryBefore[k]!==dryAfter[k])changedDryCells++;}
      rt.destroyBuffer(Eta);rt.destroyBuffer(S);rt.destroyBuffer(Aux);rt.destroyBuffer(Controls);
      const trees=await rt.read(s.Trees),foliage=await rt.read(s.Foliage);let active=0,trunks=0,best=0,score=Infinity;
      for(let i=0;i<s.treeCount;i++)if(trees[i*4+3]>0){
        active++;if(foliage[(i*96+88)*4*8+3]===-1)trunks++;
        const v=Math.abs(trees[i*4]+120)+Math.abs(trees[i*4+2]+100);
        if(v<score){best=i;score=v;}
      }
      return {hydrology:s.hydrology,dryBank:{inventedWetCells,changedDryCells},source:{expected:s.hydrology.dischargeM3s,actual:added,relativeError:Math.abs(added/s.hydrology.dischargeM3s-1)},trees:{active,trunks,example:Array.from(trees.slice(best*4,best*4+4))}};
    }''')
    page.evaluate("document.body.classList.add('photo')")
    for view in ['lake','river','surf']:
        page.evaluate('(v)=>realIsland.goto(v)',view)
        page.evaluate('''async()=>{const a=realIsland,b=a.cameraBasis(a.camera);a.sim.frame(1/60,false,a.camera,b,1.6);a.renderer.frame(a.camera,b,a.sim.time);await a.sim.runtime.idle();}''')
        page.screenshot(path=str(OUT/(view+'-closeup.png')))
    page.evaluate('''async([x,y,z,h])=>{const a=realIsland,c=a.camera,g=a.sim.grid;
      const ix=Math.round((x+9-g.x0)/g.dx),iz=Math.round((z+12-g.z0)/g.dz);
      const ground=(await a.sim.runtime.read(a.sim.S,Float32Array,4,(a.sim.n+iz*g.nx+ix)*4))[0];
      const eyeY=Math.max(y+2.3,ground+2.3);
      Object.assign(c,{x:x+9,y:eyeY,z:z+12,yaw:Math.atan2(-9,12),pitch:Math.atan2(y+h*.4-eyeY,15)});}''',result['trees']['example'])
    page.evaluate('''async()=>{const a=realIsland,b=a.cameraBasis(a.camera);a.sim.frame(1/60,false,a.camera,b,1.6);a.renderer.frame(a.camera,b,a.sim.time);await a.sim.runtime.idle();}''')
    page.screenshot(path=str(OUT/'trees-closeup.png'))
    result['errors']=page.evaluate('realIsland.errors')
    result['pass']=not result['errors'] and result['dryBank']['inventedWetCells']==0 and result['dryBank']['changedDryCells']==0 and result['source']['relativeError']<.005 and result['trees']['active']==result['trees']['trunks'] and result['trees']['active']>0
    (OUT/'realism-validation.json').write_text(json.dumps(result,indent=2))
    browser.close()
print(json.dumps(result,indent=2))
assert result['pass']
