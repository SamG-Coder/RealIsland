# RealIsland: connected island design

The original integration was a small rounded island with three magnified river
steps. This revision uses a larger finite catchment with a consistent metre scale.
Arran is a landform reference, not a claim to reproduce its real geography.

## Research and decisions

| Evidence | Application |
| --- | --- |
| [NatureScot: rugged uplands](https://www.nature.scot/sites/default/files/LCA/LCT%20083%20-%20Rugged%20Upland%20-%20Ayrshire%20-%20Final%20pdf.pdf) describes exposed rock and sparse upland cover, with woodland on lower slopes. | Rocky upper ridges, grass on gentler terrain, clustered trees below 125 m, no resident meadow above 155 m. |
| [BGS: Arran's geological structure](https://earthwise.bgs.ac.uk/index.php/Arran_central_complexes%2C_Hebridean_Igneous_Province) explains the granite mountains in northern Arran. | Connected upland ridges rather than independent rounded bumps. |
| [NatureScot: rivers](https://www.nature.scot/landforms-and-geology/scotlands-rocks-landforms-and-soils/landforms/rivers) relates river form and sediment transport to gradient and flow. | Narrower upper course, small upstream bedrock riffles, gentler wider lower channel and tidal outlet. |
| [USGS: longitudinal river profiles](https://www.usgs.gov/publications/longitudinal-slope-characteristics-rivers-midcontinent-and-atlantic-east-gulf-slopes) documents concave profiles as one of several natural forms. | A selected concave grade: about 57 m at the spring, decreasing toward sea level over 1.36 km. This is not a universal river shape. |
| [NOAA: ocean waves](https://oceanexplorer.noaa.gov/ocean-fact/waves/) explains the seabed's influence on approaching waves. | One incoming swell spectrum; depth/current interaction remains in the coastal solver. Boundary and distant water share phase and direction. |
| [NOAA coastal guidance, p.39](https://repository.library.noaa.gov/view/noaa/43643/noaa_43643_DS1.pdf) illustrates refraction, headlands and bays. | Irregular coast, coves and exposed shoulders, with continuous bathymetry. |

These are design inferences, not a numerical erosion model or survey of Arran.

## Shared world contract

- 3.2 × 3.2 km simulation domain, roughly 2 km island span. Seed 1741 has about
  2.86 km² of land and a highest sampled point near 267 m.
- World Y is elevation in metres. Tide is shared by water, reflection, wetness
  and vegetation exclusion.
- The main valley crosses diagonally from western headwaters toward the southeast,
  between the upland ridges; it is not aligned with the island centreline.
- Source near Z = −600 m; grade approaches sea level at Z = 760 m. Channel
  half-width grows from 8 to 28 m; the carved outlet continues into the sea.
- Visible terrain, vegetation roots and water sample the same GPU terrain field.
- Saltreach water runs at 120 Hz; foam/transport at 30 Hz. MountainRIver supplies
  reconstruction, rocks, wetness and spray. RealGrass supplies organ geometry,
  growth, wind and volumetric weather.
- A moving 513 × 401 water grid uses 0.3 m spacing, the original Saltreach
  resolution. It follows the camera through rivers and every coast. Whole-cell
  scrolling preserves overlap, including foam transport history and wetness. New
  cells inherit live parent water and resolve rock geometry at fine spacing.
  The parent supplies every local boundary; there is no beach-specific wave inlet.
  Both grids couple the world-space swell to exposed deep shelves (4–8 m) so
  offshore waves do not dissipate across kilometres before reaching the surf.
  The depth-dependent incoming current follows the source coastal boundary model.
  The original swell parameters and short-wave directions approach from the west.
- `src/ocean.js` imports the pinned Saltreach `WAVES` and supplies initial swell, boundary conditions and offshore shading.
  Short waves have the same propagation sign; unresolved vertex waves are filtered.
  Far-ocean displacement tapers to mean tide at the shared mesh boundary while
  analytic normals retain swell; the coarse horizon mesh cannot alias short waves.
- One final tone mapping stage handles the scene. Upstream display-oriented
  vegetation/sky colours are converted for the shared linear targets.

## Quality and validation

Quality changes terrain/water resolution, grass capacity, cloud samples, lighting
resolution and image resolution together. World scale, channel and seed stay the
same. The diagnostic `test` profile is not a visual quality preset.

The browser suite checks the actual GPU bed and water for a wet route from upper
river to ocean, a downhill valley, finite nonnegative depths and a submerged
offshore shelf. It also checks shaders, closed-volume conservation, lake
equilibrium, growth controls, pause, ordinary-frame uploads/readbacks and 30
simulated seconds at changing flow/tide. Screenshots receive separate visual review.

## Limits

This is a procedural real-time island, not photogrammetry. The drainage is designed,
not generated by rainfall and erosion. There is one main catchment; tributary
hydrology and sediment transport are not simulated. The spring is an explicit
water boundary. Water remains a shallow-water heightfield: overturning breakers,
caves and detached waterfall sheets are not resolved. Distant ocean is visual.
Trees use upstream branch cards and do not cast individual canopy shadows.
These limits should not be confused with completed photorealism.

Fine resolution follows the viewer; it is not limited to a selected beach.
The rest of the island continues at the parent resolution. Moving back to an area
inherits its current parent state rather than keeping every sub-metre eddy resident
across the entire island. Grid exchange blends state and does not perform conservative
flux refluxing. Closed-volume tests validate the underlying solver, not conservation
across this open nested-grid boundary.

## Source appearance and dynamic validation

The original `generateNoise` CUDA kernel supplies all four material channels and
mipmaps. The water shader uses the original foam frequencies/channel selection,
ripple amplitudes, fine foam breakup, GGX roughness, water colours and crest light.
Wet sand and caustics use the same texture. Shoreline normals use the original
wet-neighbour conditions instead of differentiating through dry ground. Reflection
strength remains deliberately reduced according to the requested appearance.

The coastal stone formula comes from `rockHeight`. Rock contacts adapt Saltreach's
speed/rising-surface thresholds, droplet/mist launch and lifetime model to the shared
rock descriptors and local shore direction. Its original `sprayVertices` kernel
advances the particles. These coordinate and renderer adaptations mean this is
not an assertion of pixel-identical output to the standalone Three.js coast.

The moving-grid GPU suite compares every overlapping state and auxiliary value,
checks pause/clock preservation and zero CPU field transfers, teleports between
land/river/sea views, and records a continuous coastal traverse across grid shifts.
An isolated impact fixture verifies rising water emits spray and a dry bed does not.
