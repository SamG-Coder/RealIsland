"""A close-up at a generated coastal rock, using the moving water system."""
from pathlib import Path
import subprocess,json
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'reports'/'dynamic-water'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='msedge',args=['--enable-unsafe-webgpu']);page=b.new_page(viewport={'width':1440,'height':900})
 page.goto('http://localhost:5181/?quality=high&manual=1&view=surf');page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000);assert page.evaluate('realIsland.ready')
 rock=page.evaluate("""async()=>{const a=realIsland,s=a.sim,rocks=await s.runtime.read(s.R);a.stop();document.body.classList.add('photo');let best=-1,score=Infinity;
 for(let r=65;r<105;r++){const o=r*8,x=rocks[o],z=rocks[o+1],bed=rocks[o+5];if(x>0||bed< -3||bed>.5)continue;const v=Math.abs(z-160);if(v<score){score=v;best=r;}}
 if(best<0)throw Error('No exposed tidal rock found');const o=best*8,x=rocks[o],z=rocks[o+1],rx=rocks[o+2],rz=rocks[o+3],c=a.camera;
 c.x=x-rx-12;c.z=z-rz-12;c.y=4.5;const dx=x-c.x,dz=z-c.z;c.yaw=Math.atan2(dx,-dz);c.pitch=Math.atan2(.6-c.y,Math.hypot(dx,dz));
 const basis=a.cameraBasis(c);s.frame(0,true,c,basis,1.6);await s.runtime.idle();
 for(let j=0;j<30;j++){const batch=s.runtime.batch();for(let i=0;i<40;i++)s.step(batch);s.publish(batch);batch.submit();await s.runtime.idle();}
 return {index:best,x,z,rx,rz,base:rocks[o+5],camera:{...c}};}""")
 ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate','15','-vcodec','png','-i','-','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'rocky-surf.mp4')],stdin=subprocess.PIPE)
 for frame in range(120):
  page.evaluate("""async()=>{const a=realIsland,s=a.sim,c=a.camera,b=a.cameraBasis(c);s.frame(1/30,false,c,b,1.6);s.frame(1/30,false,c,b,1.6);a.renderer.frame(c,b,s.time);await s.runtime.idle();}""")
  png=page.screenshot();ff.stdin.write(png)
  if frame in [0,60,119]:(OUT/f'rocky-surf-{frame:03}.png').write_bytes(png)
 ff.stdin.close();assert ff.wait()==0
 final=page.evaluate('realIsland.sim.coast.diagnostics()');errors=page.evaluate('realIsland.errors');assert not errors and final['nonfinite']==0
 (OUT/'rocky-surf-validation.json').write_text(json.dumps({'rock':rock,'final':final,'errors':errors},indent=2));print(json.dumps({'rock':rock,'sprayEmitted':final['sprayEmitted'],'pass':True}));b.close()
