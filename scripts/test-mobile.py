from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
out=Path('reports/mobile');out.mkdir(parents=True,exist_ok=True)
shots=Path('docs/screenshots');shots.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True,device_scale_factor=1)
 page.goto(os.environ.get('TEST_URL','http://localhost:5180/')+'?seed=1741')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 assert page.evaluate('realIsland.quality')=='low'
 page.screenshot(path=str(out/'title.png'))
 page.get_by_role('button',name='New journey',exact=True).tap()
 page.wait_for_timeout(300)
 assert page.locator('#touch-move').is_visible()
 sprint_box=page.locator('#touch-sprint').bounding_box();jump_box=page.locator('#touch-jump').bounding_box()
 assert abs(sprint_box['y']-jump_box['y'])<2 and sprint_box['x']>422
 fps_start=page.evaluate('realIsland.renderer.frameCount');page.wait_for_timeout(1000)
 frames=page.evaluate('realIsland.renderer.frameCount')-fps_start
 assert 1<=frames<=33,frames
 assert page.evaluate('realIsland.sim.coast.n')==257*257

 cdp=page.context.new_cdp_session(page)
 def pos(selector):
  r=page.locator(selector).bounding_box()
  return {'x':r['x']+r['width']/2,'y':r['y']+r['height']/2}
 left,right=pos('#touch-move'),pos('#touch-look')
 initial=page.evaluate('({x:realIsland.game.state.player.x,z:realIsland.game.state.player.z,yaw:realIsland.game.yaw})')
 touches=[dict(left,id=1),dict(right,id=2)]
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':touches})
 touches[0]['y']-=34;touches[1]['x']+=26
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':touches})
 page.wait_for_timeout(650)
 moved=page.evaluate('({x:realIsland.game.state.player.x,z:realIsland.game.state.player.z,yaw:realIsland.game.yaw})')
 assert abs(moved['x']-initial['x'])+abs(moved['z']-initial['z'])>.5,(initial,moved)
 assert abs(moved['yaw']-initial['yaw'])>.2,(initial,moved)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert page.evaluate('realIsland.game.touch.move.x===0&&realIsland.game.touch.move.y===0&&realIsland.game.touch.look.x===0')
 # Cancelled touches must not leave either analog axis held.
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(left,id=3)]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dict(left,id=3,y=left['y']-30)]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
 assert page.evaluate('realIsland.game.touch.move.y===0')
 page.get_by_role('button',name='Jump ↑',exact=True).tap();page.wait_for_timeout(100)
 assert page.evaluate('realIsland.game.state.player.vy>0')
 page.wait_for_timeout(700)
 # Real touch action, inventory, and settings flows.
 page.evaluate('()=>{const g=realIsland.game,r=g.resources[0];Object.assign(g.state.player,{x:r.x+.5,y:r.y+.02,z:r.z,vy:0});}')
 page.wait_for_timeout(200);page.locator('#touch-interact').tap()
 assert page.evaluate('realIsland.game.state.berries')==3
 page.locator('#game-backpack').tap();page.get_by_role('button',name='Eat one',exact=False).tap()
 assert page.evaluate('realIsland.game.state.berries')==2
 page.get_by_role('button',name='Return to game',exact=True).tap()
 page.evaluate('()=>{const g=realIsland.game;Object.assign(g.state.player,g.spawn);g.yaw=Math.PI;g.pitch=-.14;}')
 page.wait_for_timeout(300);page.evaluate("document.getElementById('game-toast').hidden=true");page.screenshot(path=str(shots/'mobile-landscape.jpg'),type='jpeg',quality=88)
 # Portrait blocks movement and pauses world time; rotating back resets inputs.
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
 assert page.locator('#rotate-prompt').is_visible()
 elapsed=page.evaluate('realIsland.game.state.elapsed');page.wait_for_timeout(150)
 assert page.evaluate('realIsland.game.state.elapsed')==elapsed
 page.screenshot(path=str(out/'portrait.png'))
 page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(150)
 assert not page.locator('#rotate-prompt').is_visible()
 page.locator('#game-pause-button').tap();page.get_by_role('button',name='Settings',exact=True).tap()
 page.screenshot(path=str(out/'settings.png'))
 assert page.locator('#game-settings-back').is_visible()
 page.get_by_role('button',name='Back',exact=True).tap()
 page.get_by_role('button',name='Save game',exact=True).tap()
 assert page.evaluate("!!localStorage.getItem('realisland-survival-v1')")
 assert not page.evaluate('realIsland.errors'),page.evaluate('realIsland.errors')
 result={'pass':True,'initial':initial,'moved':moved,'quality':'low','device':'emulated touch viewport on desktop hardware, not physical-phone performance'}
 (out/'validation.json').write_text(json.dumps(result,indent=2));b.close()
print(json.dumps(result))
