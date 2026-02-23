# Checkpoint 3 — Cache Effectiveness Report

```
============================================================
  CHECKPOINT 3 — CACHE EFFECTIVENESS
============================================================

── ANALYSIS 1: Cache Hit Rate ──
  Total requests:       200
  Overall hit rate:     74.0%
    Memory hits:        89 (44.5%)
    Storage hits:       59 (29.5%)
    Cache misses:       52 (26.0%)

── ANALYSIS 2: Cache Miss Analysis ──
  Top uncached concepts (by request count):
     1. 'horse'                    ×6
     2. 'okapi'                    ×5
     3. 'cat'                      ×4
     4. 'asdfgh'                   ×4
     5. 'narwhal'                  ×3
     6. 'beautiful butterfly'      ×3
     7. 'butterfly'                ×3
     8. 'pangolin'                 ×3
     9. 'airplane'                 ×3
    10. 'quokka'                   ×3
    11. 'flower'                   ×2
    12. 'dog'                      ×2
    13. 'my dog'                   ×2
    14. 'running horse'            ×2
    15. 'axolotl'                  ×2

  Recommendation: Add these to pre-generation list:
    - horse (6 misses)
    - okapi (5 misses)
    - cat (4 misses)
    - asdfgh (4 misses)
    - narwhal (3 misses)

── ANALYSIS 3: Normalization Failures ──
  No normalization issues detected.

── ANALYSIS 4: Cost Projection ──
  Cost per generation:  $0.0002
  Current miss rate:    26.0%

  Scenario               Concepts/day   Gens/day    $/month
  ──────────────────── ────────────── ────────── ──────────
  Current usage                   200          1 $     0.01
  100 users                       500        130 $     0.78
  1,000 users                   2,000        260 $     1.56
  10,000 users                  5,000        650 $     3.90

── ANALYSIS 5: Latency Comparison ──
  Category                Count      p50      p95     Mean
  ────────────────────── ────── ──────── ──────── ────────
  Memory cache hit           89     2.4ms     4.7ms     2.6ms
  Storage cache hit          59    94.6ms   142.8ms    89.8ms
  Full generation            52  3023.7ms  3729.1ms  2906.3ms

============================================================
  SUMMARY & DECISIONS
============================================================
  ~ Cache hit rate 74% — room for improvement.
    → Expand pre-generation list with top miss concepts.
  → Add to pre-generation: horse, okapi, cat, asdfgh, narwhal
```
