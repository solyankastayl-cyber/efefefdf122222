/**
 * DXY TERMINAL SERVICE — A4 + B2
 * 
 * Unified terminal builder for DXY Fractal Engine.
 * Returns complete pack: core + synthetic + replay + hybrid + meta + macro
 * 
 * B2: Added macro overlay integration
 * 
 * ISOLATION: No imports from /modules/btc or /modules/spx
 */

import {
  DxyTerminalPack,
  DxyTerminalParams,
  TerminalCorePack,
  TerminalSyntheticPack,
  TerminalReplayPack,
  TerminalHybridPack,
  TerminalMeta,
  TerminalMatchInfo,
  TerminalPathPoint,
  TerminalMacroPack,
} from '../contracts/dxy_terminal.contract.js';
import {
  resolveDxyConfig,
  getDxyMode,
  isDxyTradingEnabled,
  getDxyWarnings,
  type DxyFocus,
} from '../config/dxy.defaults.js';
import { buildDxyFocusPack } from './dxy-focus-pack.service.js';
import { buildDxySyntheticPack } from './dxy-synthetic.service.js';
import { buildDxyReplayPack, getDxyTopMatches } from './dxy-replay.service.js';
import { getDxyLatestPrice, getAllDxyCandles } from './dxy-chart.service.js';
import {
  computeReplayWeight,
  blendPathsPointByPoint,
  pctToAbsolutePath,
  computeHybridBreakdown,
  validatePath,
  hasNaN,
} from '../utils/hybrid_blend.js';
import { horizonToDays, type DxyHorizon } from '../contracts/dxy.types.js';

// B2: Macro imports
import { buildMacroOverlay } from './macro_overlay.service.js';
import { computeMacroScore } from '../../dxy-macro-core/services/macro_score.service.js';
import { buildMacroContext } from '../../dxy-macro-core/services/macro_context.service.js';

// ═══════════════════════════════════════════════════════════════
// HELPER: Generate match ID
// ═══════════════════════════════════════════════════════════════

function generateMatchId(startDate: string, endDate: string): string {
  return `${startDate}_${endDate}`;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Extract decade from date
// ═══════════════════════════════════════════════════════════════

function getDecade(dateStr: string): string {
  const year = parseInt(dateStr.substring(0, 4));
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

// ═══════════════════════════════════════════════════════════════
// BUILD DXY TERMINAL PACK
// ═══════════════════════════════════════════════════════════════

export async function buildDxyTerminalPack(
  params: DxyTerminalParams
): Promise<DxyTerminalPack> {
  const start = Date.now();
  const focus = (params.focus || '30d') as DxyFocus;
  const rank = params.rank ?? 1;
  
  // Resolve config from A3.8 defaults
  const config = resolveDxyConfig(focus);
  const windowLen = params.windowLen ?? config.windowLen;
  const topK = params.topK ?? config.topK;
  const focusDays = horizonToDays(focus as DxyHorizon);
  
  // Get mode/trading info
  const mode = getDxyMode(focus);
  const tradingEnabled = isDxyTradingEnabled(focus);
  const warnings: string[] = [...getDxyWarnings(focus)];
  
  // ═══════════════════════════════════════════════════════════════
  // 1) CORE: Get current price, matches, diagnostics
  // ═══════════════════════════════════════════════════════════════
  
  const latestPrice = await getDxyLatestPrice();
  const currentPrice = latestPrice?.price ?? 100;
  const currentDate = latestPrice?.date ?? new Date().toISOString().split('T')[0];
  
  // Helper to clean dates
  const toCleanDate = (d: any): string => {
    if (!d) return 'unknown';
    const dateStr = d instanceof Date ? d.toISOString() : String(d);
    return dateStr.substring(0, 10);
  };
  
  // Get top matches
  const matchesResult = await getDxyTopMatches(focus, topK, windowLen);
  const matches: TerminalMatchInfo[] = matchesResult.matches.map(m => {
    const cleanDate = toCleanDate(m.date);
    return {
      rank: m.rank,
      matchId: generateMatchId(cleanDate, cleanDate), // will be updated with proper dates from replay
      startDate: cleanDate,
      endDate: cleanDate,
      similarity: Math.round(m.similarity * 10000) / 10000,
      decade: m.decade,
    };
  });
  
  // Get focus pack for diagnostics and decision
  const focusPack = await buildDxyFocusPack(focus);
  
  // Build diagnostics
  const diagnostics = {
    similarity: focusPack?.diagnostics?.similarity ?? 0,
    entropy: focusPack?.diagnostics?.entropy ?? 1,
    coverageYears: focusPack?.diagnostics?.coverageYears ?? 0,
    matchCount: focusPack?.diagnostics?.matchCount ?? 0,
    windowLen,
  };
  
  // ═══════════════════════════════════════════════════════════════
  // 2) SYNTHETIC: Get path + bands + forecast
  // ═══════════════════════════════════════════════════════════════
  
  const syntheticPack = await buildDxySyntheticPack(focus, topK, rank, windowLen);
  
  // Extract pct arrays for blending
  const synthPct = syntheticPack.pct.p50;
  
  // Helper: Convert PathPoint (price) to TerminalPathPoint (value)
  const toTerminalPath = (points: Array<{ t: number; date?: string; price: number; pctFromStart?: number }>): TerminalPathPoint[] => {
    return points.map(p => ({
      t: p.t,
      date: p.date,
      value: p.price,
      pct: p.pctFromStart,
    }));
  };
  
  // Build synthetic for terminal
  const synthetic: TerminalSyntheticPack = {
    path: toTerminalPath(syntheticPack.synthetic),
    bands: {
      p10: toTerminalPath(syntheticPack.bands.p10),
      p50: toTerminalPath(syntheticPack.bands.p50),
      p90: toTerminalPath(syntheticPack.bands.p90),
    },
    forecast: {
      bear: syntheticPack.pct.p10[syntheticPack.pct.p10.length - 1] ?? 0,
      base: syntheticPack.pct.p50[syntheticPack.pct.p50.length - 1] ?? 0,
      bull: syntheticPack.pct.p90[syntheticPack.pct.p90.length - 1] ?? 0,
    },
  };
  
  // ═══════════════════════════════════════════════════════════════
  // 3) REPLAY: Get window + continuation for selected rank
  // ═══════════════════════════════════════════════════════════════
  
  let replay: TerminalReplayPack;
  let replayPct: number[] = [];
  
  try {
    const replayPack = await buildDxyReplayPack(focus, rank, windowLen);
    
    // CRITICAL: Get replay pct FIRST from aftermath normalized
    // aftermathNormalized is relative to historical match_end, not NOW
    // We need to rebase it so first value = 0 (relative to NOW)
    const rawReplayPct = replayPack.aftermathNormalized;
    const replayOffset = rawReplayPct[0] || 0; // First value becomes anchor
    replayPct = rawReplayPct.map(v => v - replayOffset); // Now starts at 0
    
    // Handle dates that might be Date objects
    const toCleanDate = (d: any): string => {
      if (!d) return 'unknown';
      const dateStr = d instanceof Date ? d.toISOString() : String(d);
      return dateStr.substring(0, 10);
    };
    
    const matchStartDate = toCleanDate(replayPack.match.startDate);
    const matchEndDate = toCleanDate(replayPack.match.endDate);
    
    // Build continuation with rebased pct (starts at 0)
    // continuation должен начинаться с t=0, pct=0, value=currentPrice
    replay = {
      matchId: generateMatchId(matchStartDate, matchEndDate),
      rank: replayPack.match.rank,
      similarity: replayPack.match.similarity,
      window: replayPack.window.map(p => ({
        t: p.t,
        date: p.date,
        value: p.price,
        pct: p.pctFromStart,
      })),
      continuation: replayPct.map((pct, i) => ({
        t: i,
        date: undefined,
        value: Math.round(currentPrice * (1 + pct) * 10000) / 10000,
        pct: Math.round(pct * 10000) / 10000,
      })),
    };
    
    // Update matches with proper dates from replay
    if (matches.length > 0 && replayPack.match) {
      const matchIdx = matches.findIndex(m => m.rank === rank);
      if (matchIdx >= 0) {
        matches[matchIdx].startDate = matchStartDate;
        matches[matchIdx].endDate = matchEndDate;
        matches[matchIdx].matchId = replay.matchId;
      }
    }
    
  } catch (err: any) {
    // No replay available
    warnings.push(`NO_REPLAY_MATCH: ${err.message}`);
    replay = {
      matchId: '',
      rank: 0,
      similarity: 0,
      window: [],
      continuation: [],
    };
    replayPct = [];
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 4) HYBRID: Blend synthetic + replay
  // ═══════════════════════════════════════════════════════════════
  
  // Compute replay weight (clamped to 0.5)
  const similarity = replay.similarity || diagnostics.similarity;
  const entropy = diagnostics.entropy;
  const replayWeight = computeReplayWeight(similarity, entropy, 0.5);
  
  // Blend paths
  let hybridPct: number[];
  if (replayPct.length > 0 && !hasNaN(replayPct)) {
    hybridPct = blendPathsPointByPoint(synthPct, replayPct, replayWeight);
  } else {
    // Fallback to synthetic if no replay
    hybridPct = synthPct;
    if (replayPct.length === 0) {
      warnings.push('HYBRID_FALLBACK: Using synthetic only (no replay data)');
    }
  }
  
  // Validate hybrid for NaN
  if (hasNaN(hybridPct)) {
    warnings.push('HYBRID_NAN_DETECTED: Falling back to synthetic');
    hybridPct = synthPct;
  }
  
  // Convert to path points
  const hybridPath = pctToAbsolutePath(
    currentPrice,
    hybridPct,
    currentDate
  );
  
  // Compute breakdown
  const breakdown = computeHybridBreakdown(synthPct, replayPct, hybridPct, focusDays);
  
  const hybrid: TerminalHybridPack = {
    replayWeight: Math.round(replayWeight * 10000) / 10000,
    path: hybridPath,
    breakdown,
  };
  
  // ═══════════════════════════════════════════════════════════════
  // 5) DECISION: Build trading decision
  // ═══════════════════════════════════════════════════════════════
  
  const forecastReturn = synthetic.forecast.base;
  const regimeBias = forecastReturn >= 0 ? 'USD_STRENGTHENING' : 'USD_WEAKENING';
  
  let action: 'LONG' | 'SHORT' | 'HOLD';
  let size: number;
  const reasons: string[] = [];
  
  if (!tradingEnabled) {
    // Regime mode: no trading
    action = 'HOLD';
    size = 0;
    reasons.push('Regime horizon: trading disabled');
    reasons.push(`Bias filter: ${regimeBias}`);
  } else {
    // Tactical mode: generate signal
    action = forecastReturn >= 0 ? 'LONG' : 'SHORT';
    size = 1;
    reasons.push(`${focus} tactical signal`);
    reasons.push(`Forecast: ${(forecastReturn * 100).toFixed(2)}%`);
  }
  
  const decision = {
    action,
    size,
    confidence: Math.round(similarity * 100),
    entropy,
    reasons,
    regimeBias,
    forecastReturn: Math.round(forecastReturn * 10000) / 10000,
  };
  
  // ═══════════════════════════════════════════════════════════════
  // 6) B2: MACRO OVERLAY (if data available)
  // ═══════════════════════════════════════════════════════════════
  
  let macroPack: TerminalMacroPack | undefined;
  let macroTradingGuardTriggered = false;
  let macroAdjustedConfidence = decision.confidence;
  
  try {
    // Get macro score and contexts
    const macroScore = await computeMacroScore();
    
    if (macroScore.components.length > 0) {
      // Build contexts map for overlay calculation
      const contextMap: Record<string, any> = {};
      const seriesIds = ['FEDFUNDS', 'CPILFESL', 'T10Y2Y', 'UNRATE', 'M2SL'];
      
      for (const seriesId of seriesIds) {
        const ctx = await buildMacroContext(seriesId);
        if (ctx) {
          contextMap[seriesId] = ctx;
        }
      }
      
      // Build macro overlay
      const overlay = buildMacroOverlay(macroScore, contextMap, action);
      macroPack = overlay;
      
      // Apply guard if triggered
      if (overlay.overlay.tradingGuard.enabled) {
        macroTradingGuardTriggered = true;
        warnings.push(`MACRO_GUARD: ${overlay.overlay.tradingGuard.reason}`);
      }
      
      // Calculate macro-adjusted confidence
      macroAdjustedConfidence = Math.round(
        decision.confidence * overlay.overlay.confidenceMultiplier
      );
    }
  } catch (err: any) {
    console.log('[DXY Terminal] Macro overlay skipped:', err.message);
    warnings.push('MACRO_UNAVAILABLE: ' + err.message);
  }
  
  // Apply macro guard to trading (if triggered)
  let finalTradingEnabled = tradingEnabled;
  if (macroTradingGuardTriggered && tradingEnabled) {
    finalTradingEnabled = false;
    reasons.push('Macro guard: trading blocked');
  }
  
  // Update decision with macro-adjusted confidence
  const finalDecision = {
    ...decision,
    macroAdjustedConfidence,
  };
  
  // ═══════════════════════════════════════════════════════════════
  // 6.5) MACRO PATH: Hybrid + Macro Adjustment
  // ═══════════════════════════════════════════════════════════════
  
  // Calculate macro-adjusted path (cascade: hybrid → macro)
  // macroPath reflects the hybrid forecast adjusted by macro regime influence
  // ALWAYS generate macroPath - fallback to hybrid if no macro data
  let macroPath: TerminalPathPoint[] | undefined;
  let macroDescription = 'Hybrid (no macro data)';
  let macroAdjustmentFactor = 0;
  
  if (hybridPath.length > 0) {
    if (macroPack && macroPack.confidence > 0) {
      // Macro adjustment factor based on:
      // - scoreSigned: -1 to +1 (negative = USD weak, positive = USD strong)
      // - confidenceMultiplier: 0.6 to 1.15
      const macroScoreSigned = macroPack.scoreSigned || 0;
      const macroMultiplier = macroPack.overlay?.confidenceMultiplier || 1.0;
      
      // For DXY: positive macro score → stronger dollar → higher DXY
      // Adjustment: apply small bias based on macro regime
      // Max adjustment: ±3% at extreme macro scores
      macroAdjustmentFactor = macroScoreSigned * 0.03 * macroMultiplier;
      macroDescription = `Hybrid + Macro (${macroPack.regime?.label || 'NEUTRAL'})`;
      
      console.log(`[DXY Terminal] Macro applied: scoreSigned=${macroScoreSigned}, multiplier=${macroMultiplier}, adjustment=${macroAdjustmentFactor}`);
    } else {
      console.log('[DXY Terminal] Macro skipped: no macroPack or confidence=0');
    }
    
    // Generate macro path with or without adjustment
    macroPath = hybridPath.map((point, i) => {
      // Progressive macro influence (increases over time)
      const timeWeight = Math.min(1, i / (hybridPath.length * 0.5));
      const adjustedPct = point.pct + (macroAdjustmentFactor * timeWeight);
      const adjustedValue = currentPrice * (1 + adjustedPct);
      
      return {
        t: point.t,
        date: point.date,
        value: Math.round(adjustedValue * 10000) / 10000,
        pct: Math.round(adjustedPct * 10000) / 10000,
      };
    });
  }
  
  // Build finalMacroPack - always include path
  const finalMacroPack = {
    ...(macroPack || {}),
    path: macroPath,
    adjustment: {
      scoreSigned: macroPack?.scoreSigned || 0,
      maxAdjustment: macroAdjustmentFactor,
      description: macroDescription,
    },
  };
  
  // ═══════════════════════════════════════════════════════════════
  // 7) BUILD FINAL PACK
  // ═══════════════════════════════════════════════════════════════
  
  const core: TerminalCorePack = {
    current: {
      price: currentPrice,
      date: currentDate,
    },
    matches,
    diagnostics,
    decision: finalDecision,
  };
  
  const meta: TerminalMeta = {
    mode,
    tradingEnabled: finalTradingEnabled,
    configUsed: {
      focus,
      windowLen,
      threshold: config.threshold,
      weightMode: config.weightMode,
      topK,
    },
    warnings,
    macroOverlayEnabled: !!finalMacroPack,
  };
  
  return {
    ok: true,
    asset: 'DXY',
    focus,
    ts: new Date().toISOString(),
    processingTimeMs: Date.now() - start,
    meta,
    core,
    synthetic,
    replay,
    hybrid,
    macro: finalMacroPack,
  };
}
