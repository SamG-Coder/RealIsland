"""Play through real menus and keyboard input, save/reload, pause and capture the game."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
out=Path('reports/game');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':1440,'height':900});page.goto(os.environ.get('TEST_URL','http://localhost:5180/')+'?quality=high&mode=game&seed=1741')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 page.screenshot(path=str(out/'title.png'));page.get_by_role('button',name='New journey',exact=True).click()
 page.wait_for_function("realIsland.game.phase==='playing'")
 initial=page.evaluate('({...realIsland.game.state.player})')
 page.keyboard.down('KeyW');page.wait_for_timeout(700);page.keyboard.up('KeyW')
 moved=page.evaluate('({...realIsland.game.state.player})');assert abs(moved['x']-initial['x'])+abs(moved['z']-initial['z'])>.3
 page.keyboard.press('Space');page.wait_for_timeout(150);assert page.evaluate('realIsland.game.state.player.y')>page.evaluate('realIsland.game.world.height(realIsland.game.state.player.x,realIsland.game.state.player.z)')+.1
 page.wait_for_timeout(700)
 assert page.evaluate('Math.abs(realIsland.camera.y-realIsland.game.state.player.y-1.65)<.01')
 assert page.evaluate('realIsland.renderer.actorCount===realIsland.game.resources.filter(r=>(realIsland.game.state.harvested[r.id]||0)<=realIsland.game.state.elapsed).length*5')
 page.screenshot(path=str(out/'playing.png'))
 page.locator('#view').click(position={'x':720,'y':450})
 page.wait_for_function("document.pointerLockElement===document.getElementById('view')")
 yaw=page.evaluate('realIsland.game.yaw');page.mouse.move(760,460);page.wait_for_timeout(100)
 assert abs(page.evaluate('realIsland.game.yaw')-yaw)>.001
 page.keyboard.press('Escape');assert page.evaluate('realIsland.game.phase')=='paused'
 elapsed=page.evaluate('realIsland.game.state.elapsed');page.keyboard.down('KeyW');page.wait_for_timeout(250);page.keyboard.up('KeyW');assert page.evaluate('realIsland.game.state.elapsed')==elapsed
 page.get_by_role('button',name='Save game',exact=True).click();saved=page.evaluate("JSON.parse(localStorage.getItem('realisland-survival-v1'))")
 page.screenshot(path=str(out/'pause.png'));page.reload();page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 page.get_by_role('button',name='Continue journey',exact=True).click();restored=page.evaluate('realIsland.game.state');assert abs(restored['player']['x']-saved['player']['x'])<.01;assert abs(restored['player']['z']-saved['player']['z'])<.01
 # Position at a generated bush to exercise the actual interaction and backpack UI.
 page.evaluate('()=>{const g=realIsland.game,r=g.resources[0];Object.assign(g.state.player,{x:r.x+.5,y:r.y+.02,z:r.z,vy:0});g.follow(1);}')
 page.wait_for_timeout(150);page.keyboard.press('KeyE');assert page.evaluate('realIsland.game.state.berries')==3
 page.keyboard.press('KeyI');page.get_by_role('button',name='Eat one',exact=False).click();assert page.evaluate('realIsland.game.state.berries')==2
 page.screenshot(path=str(out/'inventory.png'));page.get_by_role('button',name='Return to game',exact=True).click()
 errors=page.evaluate('realIsland.errors');assert not errors,errors
 result={'initial':initial,'moved':moved,'saved':saved,'restored':restored,'errors':errors,'pass':True};(out/'validation.json').write_text(json.dumps(result,indent=2));b.close()
print(json.dumps({'pass':True,'errors':errors}))
