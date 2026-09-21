# Forest realism within a measured frame budget

The river terrain, water solver, water material, world scale and cameras remain
at the restored baseline. Pebbles remain removed. This pass changes vegetation.

## Rendering changes

GPU sphere/frustum culling excludes inactive and out-of-view trees independently
for the ordinary and reflected cameras. Three indirect draws select twelve, four,
or two branch segments based on distance relative to tree height (5 and 18 tree
heights). Branch counts, silhouette and texture atlas remain the same across
levels; only curve subdivision changes. There is no per-frame tree readback or
CPU visibility list. New uniform/command uploads total 248 bytes for both views.

One index mesh per detail level replaces a full-forest index allocation. At High,
branch index storage drops from 165,888,000 bytes to 82,944 bytes, plus 72,000 bytes
of visible IDs for the two cameras. The existing generated tree control geometry
is still allocated once. No extra tree instances, simulation cells, shadow maps,
or higher-resolution textures were added.

Crown base, width, taper, limb length and orientation vary deterministically by
seed. Branch normals now follow their bend. Smaller photographed needle patterns,
two-sided foliage illumination, partial compensation for filtered black atlas
backgrounds, and shaded inner branches reduce the uniformly dark cone appearance.
Static canopy shade remains cached. These are artistic growth/weight approximations,
not a mechanical simulation or a species-accurate botanical model.

Resident grass selection now uses bilinear bed/depth samples, matching root
generation instead of using a neighboring cell's depth. Distant vegetation also
rejects shallow water. No river geometry or water appearance changes are included.

## Measurement

Hardware Edge WebGPU, NVIDIA Blackwell, 1440 by 900, High, seed 1741. Each view
warms for 20 frames, then measures 90 frames with fixed 1/60 simulation steps.
Timings include simulation, rendering and GPU queue completion. They are headless
wall times, not isolated GPU timestamps or a guarantee of interactive FPS.
Baseline is 92212a4; the final run uses the new forest renderer and shading.

| View | Baseline median ms | New median ms | Baseline p95 ms | New p95 ms |
|---|---:|---:|---:|---:|
| River | 6.35 | 4.54 | 16.64 | 14.99 |
| Meadow | 6.93 | 4.01 | 16.99 | 15.99 |
| Island | 7.14 | 4.07 | 16.04 | 14.02 |
| Forest | 6.77 | 4.05 | 16.02 | 15.02 |

The forest main pass draws 5 near, 81 medium and 261 distant trees: 347,904
triangles, versus 13,824,000 triangles previously submitted for all High tree
slots. The new benchmark still has occasional frames up to 26.3 ms. Lower median
cost does not establish hitch-free movement, mobile performance or long-session
stability. The final distant-grass threshold adjustment follows this timing run;
it changes a cutoff in an existing sample, without adding sampling or geometry.

## Verification and remaining visual limits

- `npm test`: seventeen existing integration/numerical tests.
- `scripts/test-forest-culling.py`: real GPU checks of all three detail levels,
  inactive trees, behind-camera trees, conservative edge bounds, reflected view,
  and counter reset after reversing the camera.
- `scripts/test-realism.py`: actual tree/river captures, trunk generation,
  normalized source and dry-bank checks.
- `scripts/test-gpu.py`: full Ultra source-build and High packaged-build checks.
- `scripts/test-forest-performance.py`: repeatable views, timings and GPU draw counts.

Generated evidence lives under `reports/forest-before`, `reports/forest-final`,
`reports/forest-ultra`, and `reports/forest-build` and is not committed.
The forest now has more readable foliage and varied proportions, but close-up
needles still reveal the plane construction and regular branch repetition.
This remains a procedural game environment rather than photographic realism.
