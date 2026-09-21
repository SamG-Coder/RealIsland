"""Real browser WebGPU validation; requires playwright==1.56.0 and its Chromium.
Correctness on SwiftShader is not evidence of RTX/mobile performance.
Run the local server first. The CI workflow supplies it automatically.
"""
import json, os, sys, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports';OUT.mkdir(exist_ok=True)
URL=os.environ.get('TEST_URL','http://127.0.0.1:5173/')
QUALITY=os.environ.get('TEST_QUALITY','test')
logs=[];result={'testEnvironment':'headless Chromium / SwiftShader','quality':QUALITY,'errors':[]}
os.environ['DEBUG']='pw:browser'
with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-gpu-watchdog','--disable-dev-shm-usage','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':960,'height':640})
    def log(text):
        logs.append(text);print(text,flush=True)
    page.on('console',lambda m:log(m.type+': '+m.text))
    page.on('pageerror',lambda e:log('PAGEERROR: '+str(e)))
    try:
        page.goto(URL+'?quality='+QUALITY+'&manual=1',wait_until='domcontentloaded',timeout=60000)
        page.wait_for_function('window.realIsland?.ready || window.realIsland?.errors.length',timeout=240000)
        status=page.evaluate('({ready:realIsland.ready,errors:realIsland.errors,log:realIsland.log})')
        if not status['ready'] or status['errors']: raise RuntimeError(json.dumps(status))
        log('Pipelines ready. Inspecting initialized compute state before rendering.')
        page.evaluate('realIsland.stop()');page.evaluate('realIsland.sim.runtime.idle()')
        result['beforeRendering']=page.evaluate('realIsland.sim.diagnostics()')
        log('Initialized state: '+json.dumps(result['beforeRendering']))
        log('Executing the first grass/water compute frame.')
        page.evaluate('''async()=>{const a=realIsland,b=a.cameraBasis(a.camera);a.sim.frame(1/60,false,a.camera,b,a.renderer.width/a.renderer.height);await a.sim.runtime.idle();}''')
        log('Compute completed. Executing the first render frame.')
        result['renderStages']=[]
        for stage in ['weather','sky','terrain','rocks','foliage','grass','reflection','opaque','water','post']:
            log('Rendering isolated pass: '+stage)
            page.evaluate('''async(stage)=>{const a=realIsland,b=a.cameraBasis(a.camera);a.renderer.frame(a.camera,b,0,stage);await a.sim.runtime.idle();}''',stage)
            result['renderStages'].append(stage)
            log('Completed isolated pass: '+stage)
        log('First render completed.')
        page.screenshot(path=str(OUT/'island.png'),timeout=60000)
        # Freeze and manually render known frames so test readback never races drawing.
        result['initial']=page.evaluate('realIsland.sim.diagnostics()')
        result['renderShaders']=page.evaluate('realIsland.renderer.compilation')
        result['physicsTests']=page.evaluate('realIsland.sim.closedTests()')
        before=page.evaluate('({...realIsland.sim.runtime.stats})')
        page.evaluate('''async()=>{const a=realIsland;for(let i=0;i<8;i++){const b=a.cameraBasis(a.camera);a.sim.frame(1/60,false,a.camera,b,a.renderer.width/a.renderer.height);a.renderer.frame(a.camera,b,100+i/60);await a.sim.runtime.idle();}}''')
        after=page.evaluate('({...realIsland.sim.runtime.stats})')
        result['ordinaryFrames']={'frames':8,'readbackBytes':after['readbackBytes']-before['readbackBytes'],'dataUploadBytes':after['dataBytesUploaded']-before['dataBytesUploaded']}
        result['views']={}
        for name in ['meadow','river','shore','estuary']:
            page.evaluate('(name)=>realIsland.goto(name)',name)
            page.evaluate('''async()=>{const a=realIsland,b=a.cameraBasis(a.camera);a.sim.frame(1/60,false,a.camera,b,a.renderer.width/a.renderer.height);a.renderer.frame(a.camera,b,200+Math.random());await a.sim.runtime.idle();}''')
            page.screenshot(path=str(OUT/(name+'.png')),timeout=60000)
            result['views'][name]=page.evaluate('realIsland.sim.diagnostics()')
        t0=page.evaluate('realIsland.sim.time')
        page.evaluate('''async()=>{const a=realIsland,b=a.cameraBasis(a.camera);a.sim.frame(1/60,true,a.camera,b,a.renderer.width/a.renderer.height);a.renderer.frame(a.camera,b,400);await a.sim.runtime.idle();}''')
        result['pausePreservesSimulationTime']=t0==page.evaluate('realIsland.sim.time')
        result['errors']=page.evaluate('realIsland.errors')
        result['pass']=not result['errors'] and result['initial']['nonfinite']==0 and all(v['nonfinite']==0 for v in result['views'].values()) and all(t['pass'] for t in result['physicsTests']) and result['ordinaryFrames']['readbackBytes']==0 and result['ordinaryFrames']['dataUploadBytes']==0 and result['pausePreservesSimulationTime']
    except Exception as error:
        result['pass']=False;result['exception']=str(error);log(traceback.format_exc())
        try:
            result['page']=page.evaluate('({stage:document.getElementById("stage")?.textContent,errors:window.realIsland?.errors,log:window.realIsland?.log})')
            page.screenshot(path=str(OUT/'failure.png'),timeout=30000)
        except Exception: pass
    finally:
        (OUT/'browser-validation.json').write_text(json.dumps(result,indent=2))
        (OUT/'browser-console.txt').write_text('\n'.join(logs))
        browser.close()
print(json.dumps(result,indent=2),flush=True)
sys.exit(0 if result.get('pass') else 1)
