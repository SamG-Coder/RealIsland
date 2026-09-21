# RealIsland

A connected procedural island using **RealGrass, MountainRIver and Saltreach**.
Their pinned original repositories remain in `vendor/`.

Roughly two kilometres of island sit within a 3.2 km simulation domain. A downhill
river flows between upland ridges and joins the same water grid as the sea.
Grass, rocks, trees and shoreline wetness use the shared terrain. See the
[researched design](docs/island-design.md) for references, dimensions and limits.

## Run

Use Node.js 22+ and Edge or Chrome with hardware WebGPU enabled.

```sh
git clone --recurse-submodules https://github.com/SamG-Coder/RealIsland.git
cd RealIsland
npm start
```

Startup compiles the actual CUDA sources to WGSL, then serves localhost:5173.
No native CUDA toolkit or npm dependencies are required. For an existing clone,
run `git submodule update --init --recursive` first. Windows also has `start.bat`.

If that port is occupied, use PowerShell:

```powershell
$env:PORT = '5180'
npm start
```

Open http://localhost:5180/?quality=high&seed=1741 for High quality.

## Survival prototype

The default page opens the first-person survival title menu. Start a new journey
or continue the local save. WASD/arrows move, Shift sprints, Space jumps, and
clicking the scene captures the mouse for looking around. Escape releases the
mouse and pauses; I opens the backpack; E gathers berries or drinks freshwater.
Hold and drag to look if mouse capture is unavailable.

Progress autosaves every 30 seconds of play and when leaving the page. Pause also
offers Save and Save & return to title. Saves are stored in this browser on this
device; clearing site data removes them. Food, water, stamina, health, inventory,
position, island seed and harvested bush cooldowns persist. Starting a new journey
asks before replacing an existing save.

For the original scenery and simulation controls, open `?mode=explore`.
There, drag to look, WASD/arrows fly, Q/E change height, Shift increases speed,
1–6 select views, H hides the interface and P pauses water.

See [the survival foundation](docs/survival-foundation.md) for implementation
limits and validation.

## Build and validate

```sh
npm test
npm run build
```

The self-contained static build is in `dist/`, with no CDN dependencies. Unit tests
regenerate kernel artifacts automatically. With the server running, hardware
validation on Windows uses:

```powershell
python -m pip install playwright==1.56.0
$env:TEST_GPU = 'hardware'
$env:TEST_QUALITY = 'high'
$env:TEST_URL = 'http://127.0.0.1:5180/'
npm run test:gpu
```

The default test uses Playwright Chromium/SwiftShader for CI; install that browser
with `python -m playwright install chromium`. Reports/screenshots go to `reports/`.
Hardware results verify correctness, not performance on every device. Package a
flattened source archive using `python scripts/package.py`.

The scenery is procedural and the water is a shallow-water simulation. This is
not a claim of photorealism or simulated erosion. See [credits](CREDITS.md) and
[design limitations](docs/island-design.md).

Water detail follows the camera throughout the island at 0.3 m spacing.
The moving 153.6 × 120 m grid scrolls in whole cells, preserving overlapping
water, foam, wetness and flow exactly. New cells inherit live island water and
resolve local rock collisions; moving or changing views does not reset the clock.
The island grid continues simulating outside the detail region. The two grids
exchange state; this is not a globally conservative adaptive-mesh solver.

Coastal rendering uses Saltreach's original GPU-generated RGBA noise, foam
channels, short-wave detail, water colours, crest lighting and impact spray model.
Coastal rocks use its stone shape, adapted to shared island descriptors.
Reflection contribution stays reduced (0.12) as requested.

Run `python scripts/test-dynamic-water.py` with the source server on port 5180
for overlap preservation, camera travel, impact/dry-bed tests and a moving clip.
The report and captures are written to `reports/dynamic-water/`.
