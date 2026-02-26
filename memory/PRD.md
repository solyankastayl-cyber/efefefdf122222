# Fractal Platform PRD

## Original Problem Statement
Развернуть код из репозитория https://github.com/solyankastayl-cyber/c-c-c-c. 
Поднять frontend, backend и админку. Логика DXY фракталов - основной модуль для доработки.
SPX и BTC в заморозке - поднимаются как есть.

**Последняя задача:** Исправить DXY модуль согласно архитектурному плану:
1. Macro система сломана (данные в старых коллекциях)
2. Replay не должен быть плоским
3. Hybrid должен отличаться от Synthetic
4. Macro должен реально влиять на путь

## Architecture
- **Backend**: TypeScript Fastify (8002) + Python proxy (8001)
- **Frontend**: React с lazy loading (3000)
- **Database**: MongoDB (27017)
- **Assets**: DXY (основной), SPX, BTC (заморожены)

## What's Been Implemented (2026-02-26)

### Phase 1: Deployment ✅
- Клонирован и развёрнут репозиторий
- Установлены все зависимости (npm, yarn, pip)
- Настроены .env файлы
- Запущен TypeScript backend через supervisor
- Запущен Python proxy и React frontend

### Phase 2: Macro Data Migration ✅
- **Проблема**: `macro_series_meta` и `macro_points` были пустые
- **Данные были в legacy**: `fed_funds` (859), `dxy_macro_cpi_points` (1776), `dxy_macro_unrate_points` (936)
- **Решение**: ETL миграция с дедупликацией
- **Результат**: 2743 macro points мигрированы в новую схему:
  - FEDFUNDS: 859 points
  - CPILFESL: 948 points  
  - UNRATE: 936 points

### Phase 3: DXY Validation ✅
- ✅ **Replay не плоский** (std=4.67, variance есть)
- ✅ **Hybrid отличается от Synthetic** (max_diff=2.44)
- ✅ **Macro отличается от Hybrid** (max_diff=0.59)
- ✅ **Macro scoreSigned = -0.174** (был 0)
- ✅ **Macro regime = EASING** (работает)

## Test Results
- Backend: **100%** 
- Frontend: **100%**

## Key API Endpoints
- `GET /api/health` - Health check
- `GET /api/fractal/dxy/terminal?focus=30d` - DXY Terminal (all 4 paths)
- `GET /api/fractal/spx?focus=30d` - SPX data
- `GET /api/ae/terminal` - Macro context for MacroPanel

## Key Routes
- `/fractal/dxy` - DXY Fractal Page (4 tabs: Price/Replay/Hybrid/Macro)
- `/spx` - SPX Terminal
- `/bitcoin` - BTC Terminal
- `/admin/fractal` - Admin Panel

## Next Action Items (P0)
1. Проверить MacroPanel на предмет cross-asset references (SPX/BTC в DXY)
2. Добавить conditional rendering для блоков без backend (Market Phase Engine, Strategy)

## Backlog (P1/P2)
- P1: Убрать cross-asset стрелки из Macro tab
- P1: Добавить enabled flags для блоков без DXY backend
- P2: Focus-pack endpoint унификация (/api/fractal/:assetId/focus-pack)
- P2: AssetConfig.dxy.features.crossAsset = false enforcement

## Data Status
- DXY history: 18,508 candles
- DXY macro points: 2,743
- SPX candles: 19,242
- Macro series: 3 (FEDFUNDS, CPILFESL, UNRATE)
