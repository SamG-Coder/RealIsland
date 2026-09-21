# First-person survival foundation

The default experience is a desktop keyboard/mouse first-person prototype.
Menus provide new/continue, pause, settings, backpack, death and recovery.
The camera stays 1.65 metres above the collision-controlled player; there is
no orbit camera or visible placeholder survivor. Mouse capture is opt-in by
clicking the scene; exiting capture pauses. Menus release capture.

The initial loop is to gather berries, eat from the backpack, find freshwater,
and explore while maintaining food, water and stamina. Bushes regenerate after
three minutes of active play. Sprinting costs stamina; falling and depleted
needs damage health. Recovery returns to the starting area with empty inventory.
The day counter measures elapsed play; it does not implement a lighting cycle.

## Physics and performance

Movement uses fixed 60 Hz character updates, gravity, jumps, step-height and
slope restrictions, terrain contact, tree-trunk collision and simple swimming.
This is a kinematic character controller, not a rigid-body physics engine.
Large rocks included in the terrain heightfield affect collision; foliage does not.

Parent terrain is cached from the existing startup readback. An asynchronous
local water/terrain tile refresh runs on tile moves or every two seconds of play.
Physics never awaits it, but water contact can lag the live fluid simulation.
Berry bushes share one instanced draw. HUD updates are limited to 10 Hz.
No new river geometry, shoreline mesh, water solver or pebble scatter is added.

## Persistence

Versioned localStorage saves validate positions, needs, inventory and resource
cooldowns before loading. Invalid saves are reported; storage errors keep the
current journey open. The simulation regenerates from the saved island seed.
Fluid velocities and exact wave phase are not serialized. There are no accounts,
cloud saves or multiple save slots yet.

## Validation and remaining work

Unit tests exercise save validation, movement, jumps, step and trunk collision,
slopes, swimming, needs, gathering, eating and freshwater detection.
The hardware-browser playthrough tests real menus and keyboard movement, jump,
eye height, absence of a player mesh, pause, save/reload, gathering and eating.

Berry bushes are prototype geometry. Crafting, shelter, tools, combat, audio,
touch controls and a longer progression loop are not implemented in this slice.


## Player contact with the environment

Nearby grass uses RealGrass's existing damped spring and persistent bend state.
A 1.1 metre radial contact area is filtered by the player's foot height, so plants
above or below the body are unaffected. Grass remains displaced while occupied
and recovers when the player leaves; wind continues to act.

Actual horizontal movement drives a small velocity impulse in the 0.3 metre
water tile. The existing conservative flow solver turns this into ripples and
a wake. Contact checks use live GPU water depth and player height. Standing
still, airborne movement and dry ground produce no water impulse. There is
a small foam contribution, but no new splash-particle or footstep-audio system.

This adds one 128-thread water dispatch while moving and reuses the existing
grass update. It adds no meshes, per-frame terrain readbacks or fluid grids.
Pausing and leaving gameplay clear player contact. Hardware validation:
`python scripts/test-player-interaction.py` checks grass recovery and locality,
water volume, propagated surface displacement, dry/air/stationary rejection,
and first-person contact screenshots.
