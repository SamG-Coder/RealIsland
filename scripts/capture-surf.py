"""Capture actual simulated coastal motion in the hardware WebGPU browser."""
import json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports'/'surf-closeups';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge',args=['--enable-unsafe-webgpu','--disable-background-timer-throttling'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.goto(os.environ.get('TEST_URL','http://127.0.0.1:5180/')+'?quality=high&seed=1741&manual=1')
    page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
    assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
    page.evaluate('realIsland.stop();document.body.classList.add("photo")')
    page.evaluate('realIsland.goto("surf")')
    before=page.evaluate('realIsland.sim.coast.diagnostics()')
    shots=[]
    for shot in ['along-shore','incoming-waves']:
        if shot=='incoming-waves':
            page.evaluate("""()=>{const a=realIsland,c=a.camera,x=a.sim.coast.shoreX;
              c.x=x-47;c.y=1.25;c.z=157;
              const dx=30,dy=-1.1,dz=15;c.yaw=Math.atan2(dx,-dz);c.pitch=Math.atan2(dy,Math.hypot(dx,dz));
            }""")
        ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate','15','-vcodec','png','-i','-','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/(shot+'.mp4'))],stdin=subprocess.PIPE)
        for frame in range(120):
            page.evaluate("""async()=>{const a=realIsland,s=a.sim,b=a.cameraBasis(a.camera),batch=s.runtime.batch();
              for(let i=0;i<8;i++)s.step(batch);s.publish(batch);batch.submit();await s.runtime.idle();
              s.frame(0,true,a.camera,b,a.renderer.width/a.renderer.height);
              a.renderer.frame(a.camera,b,s.time);await s.runtime.idle();
            }""")
            png=page.screenshot(timeout=60000)
            ff.stdin.write(png)
            if frame in [0,60,119]:(OUT/(shot+f'-{frame:03}.png')).write_bytes(png)
        ff.stdin.close();assert ff.wait()==0
        shots.append({'name':shot,'frames':120,'fps':15,'simulationSeconds':8,'camera':page.evaluate('realIsland.camera')})
    after=page.evaluate('realIsland.sim.coast.diagnostics()')
    delta=max(abs(a['height']-b['height']) for a,b in zip(before['transect'],after['transect']) if a['depth']>.1 and b['depth']>.1)
    report={'shots':shots,'before':before,'after':after,'maxWetTransectHeightChange':delta,'errors':page.evaluate('realIsland.errors')}
    assert after['nonfinite']==0 and delta>.05 and not report['errors']
    (OUT/'motion-validation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'shots':shots,'maxWetTransectHeightChange':delta,'pass':True}))
    browser.close()
