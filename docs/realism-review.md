# Realism review of RealIsland

Reviewed implementation: `1556f4f`, pushed to `origin/main` on 2026-09-22.
Configuration: seed 1741, High, hardware WebGPU, 1440 × 900 headless Edge captures.

## Verdict

**Overall visual realism: 4/10. The requested realism standard is not met.**
These are editorial ratings against a convincing natural environment, not measured
scientific scores. A 5 is a recognizable game environment with obvious procedural
artifacts; 8 would require coherent scale, credible ecology and geology, consistent
materials and lighting, and no distracting transitions during a normal traversal.
Passing numerical tests is not evidence of photorealism.

The larger island originally requested has not been delivered. Land area remains
about 2.87 km². The implementation narrowed the river and added lake storage. The
computed headwater supply is roughly 6.9 L/s under an assumed 1,000 mm/year effective
runoff. Initial lake storage supports transient outflow; the rendered river has
not been shown to reach a physically credible long-term equilibrium at that supply.

## Section ratings and required work

| Section | Rating | Observed problem | Required next work and completion criterion |
|---|---:|---|---|
| Island shape and terrain | 3/10 | Broad rounded hills, smooth valley sides, continuous beach rim, and a conspicuous channel/spit at the mouth. | Design a larger watershed and connected tributaries before detailing. Add structurally consistent ridges, incision, scree and asymmetric coastal erosion. Overlook and ground-level views must describe the same believable landscape. |
| River geometry and behavior | 4/10 | Connected downhill flow works, but the channel remains too regular and visually large relative to its budget. Surface patterns are repetitive. | Set discharge and channel dimensions together. Develop bends, pools, riffles, bars and bank asymmetry from the terrain. Measure cross-section discharge and lake drawdown over long simulation time, not just initial connectivity. |
| Headwater lake | 3/10 | Finite storage is an improvement, but the basin reads as a smooth excavated bowl and the surface resembles the river/ocean material. | Establish a geological basin and visible outlet control; add shallow shelves and irregular littoral zones. Use wind-driven lake detail without marine foam. Demonstrate an outlet budget consistent with the catchment and storage. |
| Estuary and beach | 4/10 | Pebbles now stop before the sandy reach, but the outlet is a broad smooth turquoise corridor. Sand patterns remain too uniform. | Add physically coherent sandbars, tidal channels, sediment variation and more subtle shallow-water color. Inspect wet/dry boundaries while moving and at several tide levels. |
| Ocean and surf | 6/10 | Actual upstream solver and local surf motion are present. Foam is still broad, high contrast and lace-like; the sea loses structure from the overlook. | Tune foam generation, breakup and lifetime to breaking zones; make wave scale and distant detail agree. Compare the same wind, depth and camera scale with the source project. |
| Rocks and pebbles | 5/10 | Small stones now have smoother geometry and less contrast, but distribution is still a repeated procedural scatter. Large blocks have limited shape variety and grounding. | Build rock families with shared mineral composition, fracture direction and weathering. Place clusters, embedded clasts and scree according to landform. Verify silhouettes, contact and wetness at human eye height. |
| Ground materials and transitions | 4/10 | The dark bank strip is reduced; soil, grass, rock and sand still lack a common visual scale and convincing small structure. | Drive material, vegetation and stone distribution from one substrate/erosion field. Match roughness, color range, normals and texel scale. Check boundaries from 0.5 m, 5 m and 50 m. |
| Grass and understory | 5/10 | Detailed source plants and wind are useful, but coverage, scale, repetition and distant appearance do not always agree. The Meadow camera intersects prominent grass blades. | Fix camera clearance and local density, create ecological patches and bare ground, and match near/far LOD color and coverage. A walking traversal should not show abrupt density changes. |
| Trees | 2/10 | Trunks are present, but radial foliage cards remain visibly flat and skeletal, with little branch hierarchy or canopy volume. | Replace the crown construction with volumetric branching and convincing needle/leaf clusters; add age and exposure variation, roots, contact shadows and stable LODs. Judge at 2 m as well as 100 m. |
| Sky and clouds | 3/10 | Cloud spacing and shapes repeat, with visible block-like patterns. | Break repetition across scales and add believable cloud depth, lighting and coverage. The full horizon should not reveal a tile or regular spacing. |
| Lighting and atmosphere | 4/10 | Ground, trees and rocks do not always feel equally grounded; distant relief and material response are inconsistent. | Improve contact/canopy shadowing and occlusion, then calibrate exposure and atmosphere against one lighting condition. Do not hide material mismatches with color grading. |
| Streaming and movement | 7/10, provisional technical score | Grid joins are improved and the short benchmark does not reproduce a major hitch. This does not establish smoothness everywhere or on other hardware. | Record long traversals through forest, river, lake and coast; correlate frame spikes with grid shifts, grass regrowth and LOD changes. Include app-visible timing and multiple quality levels. |

## Priority order

1. **Resolve world scale and hydrology.** Deliver the larger island/watershed, or explicitly redesign the experience around a small stream. Do not retain a visually substantial river with an unsupported steady supply. Terrain, drainage and lake outlet are one design task.
2. **Establish shared ground and vegetation fields.** Material transitions, sand exclusion, stone placement and plant cover must agree spatially. Fix remaining boundary artifacts with matched geometry/state, not dark masks.
3. **Replace the tree crown construction and improve grounding.** This is currently the largest close-up realism deficit. Add contact and canopy shadows as part of the same work.
4. **Refine water appearance by environment.** River, lake, estuary and breaking surf should share physics where appropriate but have distinct, condition-driven appearance.
5. **Rework cloud structure and finish lighting/LOD consistency.** Validate whole-island and walking views, then profile the complete traversal.

## Verified fixes and limits

- Pebble geometry increased from 24 triangles to 160 triangles per visible stone,
  with ellipsoidal normals, slight shape variation and partly buried bases.
- Small-stone density fades to zero toward sand. River blocks also shrink out
  before the sandy tidal reach.
- Bank material influence uses fixed distances in metres on both grids.
- Wet-history shading is spatially filtered, reducing the visible square-cell
  pattern. Sand ripples receive screen-footprint filtering.
- Fine water blends to the actual parent triangle heights at the cut boundary;
  flow and foam also blend. Fine terrain likewise morphs to the parent triangles.
- These corrections do not replace the coarse underlying DEM or prove every
  shoreline is free of grid artifacts at every tide and camera angle.

## Evidence

`npm test`: 17 passing tests. `npm run build`: self-contained build succeeds.
`test-gpu.py` on the built application: passes; no reported WebGPU errors;
river-to-sea connectivity passes before and after control/soak tests.
`test-realism.py`: source-volume check, dry-bank regression and trunk checks pass.

A post-push 100-frame estuary traversal recorded 95 ordinary frames and 5 resident
shifts. Median completion was approximately 4.4 ms ordinary / 4.0 ms shift; maxima
approximately 12.0 / 11.0 ms. This is headless frame completion on this hardware,
not a guarantee of application FPS, input latency, or a long-session hitch test.

Local, reproducible evidence (excluded from Git to avoid committing generated videos):
- `reports/review/{island,meadow,river,lake,shore,surf,estuary}.png`
- `reports/bank-materials/{gravel,transition,sand,shoreline}.png`
- `reports/bank-materials/validation.json`
- `reports/realism/browser-validation.json`
- `reports/realism/realism-validation.json`

Reproduce checks with `scripts/test-gpu.py`, `scripts/test-realism.py`, and
`scripts/test-bank-materials.py`. Their browser dependency is Playwright; hardware
captures in this review use Edge with WebGPU. The review does not claim calibrated
rainfall, sediment transport, erosion, groundwater, or conservative AMR coupling.

## Follow-up: river rollback and tree branch correction

The attempted larger terrain/river redesign was rejected during visual review and
reverted to the river implementation reviewed above. The rollback includes world
scale, lake, channel depth, runoff, water shading, fine-grid dispatch and cameras.
Small procedural pebbles were removed at the user's request; larger rocks remain.
No larger-island or improved river-realism claim applies to this revision.

Tree branches now use twelve geometric segments per plane, rising from the trunk
and sagging toward loaded ends, with additional pendant spread. The crown has 92
radial limbs rather than detached upright foliage clumps. Bark and twig textures
come from Poly Haven's CC0 Pine Tree 01; mipmaps reduce distant needle aliasing.
Static soft canopy shade grounds trees. These are artistic branch shapes, not a
mechanical branch-weight simulation. The crown still reads too regularly and dark
in comparison with the supplied photograph, so trees remain approximately 4/10,
not a finished photorealistic asset. The other section ratings above still apply.

Verification includes unit tests, a High GPU source/dry-bank/trunk check, and an
Ultra full rendering/solver check. Local screenshots are generated by
`scripts/test-realism.py`; they are evidence of the actual renderer, not mockups.

## Subsequent performance-budgeted vegetation pass

See [forest realism and performance](forest-realism-performance.md) for the current
GPU culling, distance detail, crown/needle lighting changes and measured before/after
results. The river rollback remains in force. The new pass improves tree visibility
and proportions without claiming to resolve all close-up foliage realism issues.
