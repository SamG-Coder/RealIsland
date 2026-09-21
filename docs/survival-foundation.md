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
