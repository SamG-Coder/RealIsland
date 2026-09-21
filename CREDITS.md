# Sources and attribution

RealIsland combines SamG-Coder's actual source systems. The exact commits are in `sources.lock.json`; the originals are pinned as Git submodules and preserved in the source ZIP.

## RealGrass

`vendor/realgrass`: seeded crowns, tillers, grass organs, wildflowers, spring wind, GPU streaming/culling/indirect draws, procedural material textures, and evolving volumetric cloud density/lighting. Its plant and cloud WGSL is imported directly; the grass CUDA receives terrain/water inputs through checked source adapters. Original notices remain in the vendor tree. This integration does not assert a new licence over the original RealGrass project.

## MountainRIver

`vendor/river`: original rock generation/intersection geometry, conifer branch geometry, rock wetness, river reconstruction and persistent impact spray. Endless reach layout helpers are replaced by the finite catchment in kernels/watershed.cuh; the upstream water and scenery implementations remain linked. Original MIT notices are retained, including Techartist and SamG-Coder copyright notices.

## Saltreach / coastal-simulation-cuda-webshader

The ocean/coastal system is based on **[coastal-simulation](https://github.com/iamtechartist/coastal-simulation)**
by **[iamtechartist](https://github.com/iamtechartist)** (Techartist), via
[SamG-Coder’s CUDA WebShader port](https://github.com/SamG-Coder/coastal-simulation-cuda-webshader).
The original coastal simulation, shallow-water equations, materials and procedural
scene assets originate with Techartist. RealIsland integrates the port into its
shared island; the port and RealIsland build upon that original work.

- [Original live demo](https://iamtechartist.github.io/coastal-simulation/)
- Port's starting upstream revision: [2e95e1a3e757ca1268247417dee01606e5e3d55c](https://github.com/iamtechartist/coastal-simulation/commit/2e95e1a3e757ca1268247417dee01606e5e3d55c)
- Provenance recorded in the pinned [port credits](vendor/coast/CREDITS.md)
- [Retained MIT licence](vendor/coast/LICENSE), including Copyright (c) 2026 Techartist


`vendor/coast`: the finite-volume water solver, momentum advection, outgoing-volume limits, transported fresh/old foam, wetness/film, shore profile, original RGBA noise generation, and surface reconstruction/detail. Coastal stone geometry ports `rockHeight`; coastal impact particles adapt the original trigger/launch model to the island rock descriptors, with the original `sprayVertices` kernel advancing them. Foam-front direction is generalized to a curved coastline. Water shading in `src/scene-shaders.js` ports/adapts the reference's absorption, refraction, Fresnel, derivative filtering and foam-filament approach to native WGSL. The old Three.js scene adapters are not run alongside the new renderer. Original MIT notices are retained.

## CUDA WebShader

The unmodified compiler and runtime are included from RealGrass's pinned submodule under `vendor/realgrass/vendor/cuda-webshader`. CUDA C is translated to WGSL and runs through WebGPU. This is not native NVIDIA CUDA execution. The original MIT licence and third-party notices remain applicable.

## RealIsland integration

RealIsland’s original integration code is licensed under the [MIT License](LICENSE),
Copyright (c) 2026 SamG-Coder. Third-party code and assets retain the licences
and notices documented here and in their source directories.

New shared terrain, spring/ocean boundary conditions, GPU terrain publication, common rendering adapter, camera, controls, build scripts and integration tests are in the top-level `src`, `kernels`, `scripts` and `tests` folders. Source adapters fail if expected upstream patterns change. Precompiled deployment artifacts omit compiler ASTs, but the editable CUDA originals and linked CUDA output are included.

## Pine bark and twig textures

[Pine Tree 01](https://polyhaven.com/a/pine_tree_01), by Rico Cilliers (modeling)
and Rob Tuytel (photography), published by Poly Haven under CC0. The project uses
its 2K twig diffuse/alpha and bark diffuse textures on custom curved branch geometry;
it does not include the original 17-million-triangle tree model. Source URLs and
original MD5 hashes are recorded in `src/assets/pine-tree-source.json`.
