# Fractal Platform PRD v9

## Architecture Overview

V2 дополняет V1, не заменяет. V1 остаётся как baseline/fallback.

```
┌─────────────────────────────────────────────────────────────┐
│                    MACRO ENGINE ROUTER                      │
│         (auto-switch based on V2 readiness)                 │
├─────────────────────────────────────────────────────────────┤
│    ┌────────────────────┴──────────────────────┐            │
│    ▼                                           ▼            │
│ ┌──────────┐                          ┌──────────────────┐  │
│ │   V1     │                          │      V2          │  │
│ │ Linear   │                          │ Markov + State   │  │
│ │ Stable   │                          │ + Calibration    │  │
│ │ (frozen) │                          │ + Gold + volScale│  │
│ └──────────┘                          └──────────────────┘  │
│                                        ▲    ▲    ▲          │
│                                ┌───────┘    │    └──────┐   │
│                          ┌─────────┐ ┌──────────┐ ┌────────┐│
│                          │ Regime  │ │ Rolling  │ │VolScale││
│                          │ State   │ │ Calibra- │ │Service ││
│                          │(MongoDB)│ │ tion Svc │ │ (CSV)  ││
│                          └─────────┘ └──────────┘ └────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Current Status (2026-02-27)

```
Active Engine: V1 (baseline — V2 auto-switch blocked by confidence 0.48 < 0.6)
V2 Health: OK (warnings: 6 stale FRED series, expected)
V2 State: DB-backed with hysteresis (stored in macro_regime_states)
V2 Weights: Calibrated (stored in macro_weights_versions)
V2 VolScale: 0.929 (DXY realized vol / long-term vol)
Gold: Working via PCU21222122 (PPI proxy, FTQ active)
```

## Completed Work

### V1 Fixes and Optimization (DONE)
- [x] Fixed Replay/Hybrid/Macro modes
- [x] Real FRED data integration
- [x] Correlation analysis with optimized weights
- [x] V1 frozen as baseline

### V2 Phase 1 — Skeleton (DONE)
- [x] Parallel V1/V2 architecture
- [x] Router with auto-switch logic
- [x] Markov chain regime persistence
- [x] V2 API contracts, Index orchestrator

### V2 Phase 2 — Dynamic State (DONE)
- [x] P1: RegimeStateService (DB-backed state + hysteresis) integrated
- [x] P2: RollingCalibrationService (adaptive weights) integrated
- [x] P3: Volatility Adaptation (volScale) from DXY price data
- [x] Gold adapter working (PCU21222122 FRED proxy)
- [x] State/calibration API endpoints (state/current, state/history, calibration/weights, calibration/history, calibration/run)
- [x] V2 health check improved
- [x] Testing: 33/33 tests passed (iterations 4+5)

### Frontend V2 Integration (DONE)
- [x] MacroLayerPanel refactored to use unified V2 API
- [x] Engine version badge (V2), calibration badge, volScale badge
- [x] Regime State card (dominant, confidence, persistence, entropy)
- [x] Guard Level card (level, score, reason codes)
- [x] Macro Impact card (hybrid base, delta, adjusted)
- [x] Top Drivers card (key, contribution, weight)

## API Endpoints

### Router
- GET /api/macro-engine/:asset/pack — Main (uses router)
- GET /api/macro-engine/:asset/compare — V1 vs V2
- GET /api/macro-engine/status — Router status

### Direct
- GET /api/macro-engine/v1/:asset/pack — Direct V1
- GET /api/macro-engine/v2/:asset/pack — Direct V2

### V2 State
- GET /api/macro-engine/v2/state/current
- GET /api/macro-engine/v2/state/history

### V2 Calibration
- GET /api/macro-engine/v2/calibration/weights
- GET /api/macro-engine/v2/calibration/history
- POST /api/macro-engine/v2/calibration/run

### Admin
- POST /api/macro-engine/admin/force-engine
- POST /api/macro-engine/admin/reset

## Next Steps

### P1 — Remaining
- [ ] Scheduled job for periodic recalibration (cron-like)
- [ ] Better gold data source (actual XAUUSD from AlphaVantage/Polygon)
- [ ] Admin toggle V1/V2 in frontend

### P2 — Future
- [ ] AE/S-Brain V2 Development
- [ ] SPX & BTC Standardization to V2
- [ ] V2 Backtesting Framework
