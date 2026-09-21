# Sources and attribution

RealIsland combines SamG-Coder's actual source systems. The exact commits are in `sources.lock.json`; the originals are pinned as Git submodules and preserved in the source ZIP.

## RealGrass

`vendor/realgrass`: seeded crowns, tillers, grass organs, wildflowers, spring wind, GPU streaming/culling/indirect draws, procedural material textures, and evolving volumetric cloud density/lighting. Its plant and cloud WGSL is imported directly; the grass CUDA receives terrain/water inputs through checked source adapters. Original notices remain in the vendor tree. This integration does not assert a new licence over the original RealGrass project.

## MountainRIver

`vendor/river`: original rock generation/intersection geometry, conifer branch geometry, rock wetness, river reconstruction and persistent impact spray. Endless reach layout helpers are replaced by the finite catchment in kernels/watershed.cuh; the upstream water and scenery implementations remain linked. Original MIT notices are retained, including Techartist and SamG-Coder copyright notices.

## Saltreach / coastal-simulation-cuda-webshader

`vendor/coast`: the finite-volume water solver, momentum advection, outgoing-volume limits, transported fresh/old foam, wetness/film, shore profile, original RGBA noise generation, and surface reconstruction/detail. Coastal stone geometry ports `rockHeight`; coastal impact particles adapt the original trigger/launch model to the island rock descriptors, with the original `sprayVertices` kernel advancing them. Foam-front direction is generalized to a curved coastline. Water shading in `src/scene-shaders.js` ports/adapts the reference's absorption, refraction, Fresnel, derivative filtering and foam-filament approach to native WGSL. The old Three.js scene adapters are not run alongside the new renderer. Original MIT notices are retained.

## CUDA WebShader

The unmodified compiler and runtime are included from RealGrass's pinned submodule under `vendor/realgrass/vendor/cuda-webshader`. CUDA C is translated to WGSL and runs through WebGPU. This is not native NVIDIA CUDA execution. The original MIT licence and third-party notices remain applicable.

## RealIsland integration

New shared terrain, spring/ocean boundary conditions, GPU terrain publication, common rendering adapter, camera, controls, build scripts and integration tests are in the top-level `src`, `kernels`, `scripts` and `tests` folders. Source adapters fail if expected upstream patterns change. Precompiled deployment artifacts omit compiler ASTs, but the editable CUDA originals and linked CUDA output are included.
