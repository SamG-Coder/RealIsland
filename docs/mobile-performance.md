# Mobile performance pass

The earlier Low preset still used desktop's 513 × 401 close-up water tile.
This pass keeps the parent island terrain and water solver unchanged, retaining
0.3 m water cells while reducing the area simulated at that resolution.

| Low preset budget | Before | After |
| --- | ---: | ---: |
| Fine water cells | 205,713 | 66,049 |
| Grass capacity | 262,144 | 65,536 |
| Trees | 1,200 | 600 |
| Coastal spray slots per rock | 256 | 64 |
| Cloud ray steps | 24 | 12 |
| Cloud map | 384 × 96 | 384 × 96 (retained for sky quality) |
| Shadow map | 192 × 192 | 96 × 96 |
| Distant grass tiles | 128² | 64² |
| Initial resolution scale | 70% | 65% |

The smaller tile retains the existing coarse/fine blend with a shorter blend
distance, so close-up water still reaches full detail around the player.
The reduced tile also lowers collision readback size. High/Balanced/Ultra
retain their existing budgets.

Touch play is paced at 30 FPS; menus and portrait mode at 15 FPS. Adaptive
resolution uses submitted frame work time instead of interpreting intentional
frame pacing as GPU overload. Its mobile lower bound is 45%.

## Measurement

Run python scripts/benchmark-mobile.py for timestamp-query GPU measurements.
Set BENCH_BASELINE=7c6661e to serve the prior rendering modules in the benchmark
browser without changing the checkout. BENCH_REPORT selects its JSON report.

A desktop hardware GPU, 844 × 390 phone viewport, fixed river view and 30 Hz
simulation workload gave median GPU pass time of **0.711 ms before** and
**0.463 ms after**, a **34.9% reduction**. These are GPU timestamps, not phone
FPS; browser submission/readback overhead is measured separately. Physical
phone and thermal testing remains necessary.

The mobile browser test covers right-thumb button placement, frame pacing,
two simultaneous sticks, interrupted touches, jump, gathering, eating,
portrait pause, menus and saving. Full water/GPU validation also runs at Low.


## Known validation limit

The Low preset's parent-grid watershed connectivity audit fails both on the
previous published build (7c6661e) and this pass: reachesOcean=false with the
same 0.2176895 m maximum uphill step. This pass does not change that terrain.
All shader stages, finite-state checks, closed-wave propagation and lake-at-rest
tests passed, and ordinary exploration frames added no readbacks or data uploads.
The complete Low GPU report is therefore **not** an all-pass report.
