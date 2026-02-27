# Fractal Platform PRD v10 — V2 Active, Institutional Grade

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│              MACRO ENGINE ROUTER (auto | v1 | v2)              │
│        mode=auto → V2 if health.ok && confidence >= 0.6       │
├──────────┬─────────────────────────────────────────────────────┤
│   V1     │                      V2 (ACTIVE)                   │
│ Linear   │   Markov + State Memory + Rolling Calibration      │
│ Baseline │   + Gold XAUUSD + VolScale + Sanity Checks         │
│ (frozen) │                                                     │
└──────────┴────────┬────────────┬──────────┬───────────────────┘
                    │            │          │
              RegimeState  Calibration  VolScale
              (MongoDB)    (MongoDB)    (CSV)
```

## Current Status (2026-02-27)

| Metric | Value |
|--------|-------|
| Active Engine | **V2** (auto-switch) |
| V2 Health | **OK** (no issues) |
| V2 Confidence | **0.80** (threshold: 0.6) |
| Gold Source | **Stooq XAUUSD** (5200 daily pts, $5185) |
| Gold Signal | **Flight-to-quality active** (z=1.90) |
| Calibration | **ACTIVE** (sanity pass, 8 drivers) |
| VolScale | **0.929** |
| Regime | NEUTRAL (50% persistence) |

## API Endpoints

### Engine Router
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/macro-engine/:asset/pack | Main (auto-selects V1/V2) |
| GET | /api/macro-engine/:asset/compare | V1 vs V2 shadow |
| GET | /api/macro-engine/status | Router status |

### Direct Access
| GET | /api/macro-engine/v1/:asset/pack | Direct V1 |
| GET | /api/macro-engine/v2/:asset/pack | Direct V2 |

### Admin Lifecycle
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/macro-engine/admin/active | Get active engine |
| POST | /api/macro-engine/admin/active | Set active (v1/v2/auto) |
| POST | /api/macro-engine/admin/promote | Promote V2 (with health check) |
| POST | /api/macro-engine/admin/rollback | Rollback to V1 |
| POST/GET | /api/macro-engine/admin/reset | Reset to auto |

### V2 State
| GET | /api/macro-engine/v2/state/current | Current regime |
| GET | /api/macro-engine/v2/state/history | Regime history |

### V2 Calibration
| GET | /api/macro-engine/v2/calibration/weights | Current weights |
| GET | /api/macro-engine/v2/calibration/history | Weight versions |
| POST | /api/macro-engine/v2/calibration/run | Trigger recalibration |

## Completed Work

### V1 (Frozen Baseline)
- [x] Fixed Replay/Hybrid/Macro modes
- [x] Real FRED data, optimized weights

### V2 Phase 1 — Skeleton
- [x] Parallel V1/V2, Markov chains, V2 contracts

### V2 Phase 2 — Dynamic State
- [x] RegimeStateService (MongoDB + hysteresis)
- [x] RollingCalibrationService (adaptive weights)
- [x] Volatility Adaptation (volScale)

### V2 Phase 3 — Production Ready (THIS SESSION)
- [x] **Gold: real XAUUSD from stooq** (5200 daily pts, not PPI proxy)
- [x] **V2 own confidence** (0.80, not inherited V1 string)
- [x] **Router auto-switches to V2** (no more fallback!)
- [x] **Admin lifecycle**: promote/rollback/active
- [x] **Calibration sanity**: sumWeights=1.0, maxWeight<0.35, coverage>=0.8
- [x] **Router response**: mode/chosen/fallbackFrom/reason
- [x] **Frontend**: V2 badge, CALIBRATED, volScale, GOLD driver visible
- [x] Testing: 51/51 tests passed (iterations 4-6)

## Calibrated Weights (Current)

| Driver | Weight | Lag | Corr |
|--------|--------|-----|------|
| FEDFUNDS | 0.229 | 60D | -0.114 |
| UNRATE | 0.217 | 10D | -0.109 |
| PPIACO | 0.172 | 10D | +0.086 |
| **GOLD** | **0.088** | **30D** | **-0.044** |
| CPILFESL | 0.079 | 180D | +0.040 |
| T10Y2Y | 0.079 | 120D | -0.039 |
| M2SL | 0.076 | 180D | +0.038 |
| CPIAUCSL | 0.061 | 180D | +0.030 |

## Next Steps

### P1 — Cron + Scheduler
- [ ] Scheduled monthly recalibration (auto-run)
- [ ] Audit trail for calibration versions

### P1 — Frontend
- [ ] Compare page (/engine/compare): divergence, regime timeline, weight drift
- [ ] Shadow mode: V1+V2 overlay on chart
- [ ] Admin panel: toggle V1/V2, view state history

### P2 — Future
- [ ] V2 backtest framework (hit rate, RMSE, regime stability)
- [ ] AE/S-Brain V2 cross-asset intelligence
- [ ] SPX & BTC migration to V2 (after DXY stable 14+ days)

## V2 Production Promotion Criteria

1. V2 ok:true without fallback for 14+ consecutive days
2. Gold driver available and staleness < 5 days
3. Cron recalibration working + audit trail
4. UI engineVersion indicator + compare page
5. Admin toggle + shadow mode
