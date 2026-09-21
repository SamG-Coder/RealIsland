from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('docs/screenshots');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-webgpu'])
 page=b.new_page(viewport={'width':1600,'height':900})
 page.goto('http://localhost:5180/?quality=high&seed=1741')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 assert page.evaluate('realIsland.ready'),page.evaluate('realIsland.errors')
 page.screenshot(path=str(out/'title.jpg'),type='jpeg',quality=88)
 page.get_by_role('button',name='New journey',exact=True).click()
 page.wait_for_timeout(500);page.evaluate("document.getElementById('game-toast').hidden=true")
 page.screenshot(path=str(out/'first-person.jpg'),type='jpeg',quality=88)
 page.keyboard.press('Escape');page.screenshot(path=str(out/'pause.jpg'),type='jpeg',quality=85)
 page.goto('http://localhost:5180/?quality=high&seed=1741&mode=explore&view=surf')
 page.wait_for_function('realIsland.ready || realIsland.errors.length',timeout=240000)
 page.wait_for_timeout(1000);page.keyboard.press('KeyH')
 page.screenshot(path=str(out/'coast.jpg'),type='jpeg',quality=88)
 assert not page.evaluate('realIsland.errors');b.close()
