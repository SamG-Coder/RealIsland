# River scale, headwaters and bank rendering

## Research and scale decision

A river has no universal minimum island area. Its discharge depends on its
contributing watershed, rainfall, losses, groundwater and storage. USGS explains
this relationship in [Streamflow and the Water Cycle](https://www.usgs.gov/water-science-school/science/streamflow-and-water-cycle)
and [Watersheds and Drainage Basins](https://www.usgs.gov/water-science-school/science/watersheds-and-drainage-basins).
A lake buffers supply; it cannot sustain an arbitrary outlet forever:
[USGS lake water budgets](https://www.usgs.gov/publications/hydrological-processes-and-water-budget-lakes).

For an illustrative **effective runoff** of 1,000 mm/year (after losses),
`mean discharge = contributing area × 1 m / 31,557,600 seconds`.
One cubic metre per second requires about 31.6 km² of contributing watershed.
Five requires about 158 km². These are scenario calculations, not universal
minimum river sizes, and island area must exceed the contributing watershed.
The whole 2.868 km² island would supply only 0.091 m³/s under this assumption.

This pass keeps that island and reduces its freshwater river instead of claiming
it supports the former large fast river. The generated headwater catchment is
measured once from the actual GPU terrain using strict downhill D8 routing.
For seed 1741/high it is about 0.216 km²: about 6.9 L/s. Closed depressions are
excluded; this is a conservative surface-routing estimate, not groundwater
delineation or a calibrated rainfall model. Other downstream catchments are not
yet injected as lateral runoff.

The new lake stores approximately 52,000 m³ initially. Its surface is not clamped
to an inexhaustible prescribed level. A normalized volume source adds the
catchment budget, multiplied by the existing flow control, and the finite-volume
solver determines outlet flow and drawdown. The initial river/lake state is not
claimed to be long-term hydrological equilibrium. Resolving a few-litres/second
stream everywhere remains limited by the coarse parent grid. The 0.3 m resident
grid improves local water and terrain rendering; grid exchange is state coupling,
not conservative flux refluxing.

## Concrete rendering corrections

- Preserve the coastal wet/dry reconstruction in dry river cells. The inherited
  short-flume renderer had extended its prescribed river datum into dry banks.
- Measure water against the obstacle bed, rather than ground beneath rocks.
- Reject dry source cells when initializing/exchanging the camera-following grid.
- Evaluate signed water depth per pixel and render nearby terrain on the same
  0.3 m mesh, reducing triangle-shaped shoreline teeth.
- Vary bankfull width, replace uniform inland sand with soil/gravel transitions,
  and add deterministic, rounded small-stone geometry rooted in the terrain.
- Reduce river clast sizes downstream. Existing coastal rock geometry and the
  original wave solver remain in use.
- Add tapered bark trunks to the inherited conifer foliage, reject steep/wet
  planting sites, and shorten trees near exposed shores and higher ground.
  Exposure-dependent growth is supported by
  [Forest Research's windthrow guidance](https://www.forestresearch.gov.uk/climate-change/risks/windthrow/).

## Verification

`npm test` checks linking, numerical invariants and runoff dimensional accounting.
`scripts/test-gpu.py` exercises every rendering stage, river-to-sea connectivity,
closed water conservation, lake-at-rest, controls and ordinary GPU-only frames.
`scripts/test-realism.py` checks the real GPU source against its discharge budget,
verifies dry-bank reconstruction does not create water, checks trunk generation,
and captures actual lake, river and tree views. Reports live in `reports/realism`.
