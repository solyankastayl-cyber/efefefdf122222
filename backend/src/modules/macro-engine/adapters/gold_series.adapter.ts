/**
 * GOLD SERIES ADAPTER — Exogenous signal for V2
 * 
 * Gold is NOT a fractal. Gold is a macro signal that:
 * - Influences regime inference (flight-to-quality detection)
 * - Contributes to DXY scoreSigned via V2 engine
 * - Helps detect STRESS and RISK_OFF regimes
 * 
 * Sources:
 * - FRED: GOLDAMGBD228NLBM (London Bullion Market)
 * - Alternative: Market data API (AlphaVantage, etc.)
 */

import { MacroRole } from '../interfaces/macro_engine.interface.js';

// ═══════════════════════════════════════════════════════════════
// GOLD SERIES CONFIG
// ═══════════════════════════════════════════════════════════════

export const GOLD_SERIES_CONFIG = {
  seriesId: 'GOLD',
  // PCU21222122 = PPI Metal Ore Mining (proxy for gold price pressure)
  // Alternative: Use external gold API in future
  fredSeriesId: 'PCU21222122',
  displayName: 'Gold Proxy (Mining PPI)',
  role: 'gold' as MacroRole,
  
  // Calibrated from correlation analysis
  optimalLag: 90,           // days
  expectedCorr: -0.08,      // negative = gold up → DXY down
  
  // Default weight (updated via rolling correlation)
  weight: 0.05,             // Reduced weight for proxy
  
  // Thresholds for regime signals
  thresholds: {
    flightToQuality: 0.5,   // z-score threshold for FTQ detection
    stressSignal: 1.0,      // z-score for stress contribution
  },
};

// ═══════════════════════════════════════════════════════════════
// GOLD FEATURES (computed from price series)
// ═══════════════════════════════════════════════════════════════

export interface GoldFeatures {
  // Levels
  priceNow: number;
  z120: number;             // z-score vs 120D mean
  
  // Returns
  ret10: number;            // 10-day return
  ret30: number;            // 30-day return
  ret90: number;            // 90-day return
  
  // Signals
  flightToQuality: boolean; // Gold bid + risk-off indicators
  stressContribution: number; // Contribution to stress regime prob
  
  // For scoreSigned
  pressure: number;         // Normalized pressure (-1 to +1)
  contribution: number;     // Weighted contribution to scoreSigned
}

// ═══════════════════════════════════════════════════════════════
// GOLD ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════

export class GoldSeriesAdapter {
  private prices: Array<{ date: string; price: number }> = [];
  private features: GoldFeatures | null = null;
  private lastUpdate: number = 0;
  
  /**
   * Load gold data from FRED
   */
  async loadFromFred(): Promise<boolean> {
    try {
      const { getMacroSeriesPoints } = await import('../../dxy-macro-core/ingest/macro.ingest.service.js');
      
      // Try to get from existing macro ingest
      const points = await getMacroSeriesPoints(GOLD_SERIES_CONFIG.fredSeriesId);
      
      if (points && points.length > 0) {
        this.prices = points.map(p => ({ date: p.date, price: p.value }));
        this.lastUpdate = Date.now();
        return true;
      }
      
      // Fallback: direct FRED API call
      return await this.loadFromFredApi();
      
    } catch (e) {
      console.log('[GoldAdapter] Error loading from FRED:', (e as any).message);
      return false;
    }
  }
  
  /**
   * Direct FRED API call for gold
   */
  private async loadFromFredApi(): Promise<boolean> {
    const apiKey = process.env.FRED_API_KEY || process.env.MACRO_API_KEY;
    if (!apiKey) {
      console.log('[GoldAdapter] No FRED API key');
      return false;
    }
    
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${GOLD_SERIES_CONFIG.fredSeriesId}&api_key=${apiKey}&file_type=json&sort_order=asc`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.observations) {
        this.prices = data.observations
          .filter((o: any) => o.value !== '.')
          .map((o: any) => ({
            date: o.date,
            price: parseFloat(o.value),
          }));
        
        this.lastUpdate = Date.now();
        console.log(`[GoldAdapter] Loaded ${this.prices.length} gold prices from FRED`);
        return true;
      }
      
      return false;
    } catch (e) {
      console.log('[GoldAdapter] FRED API error:', (e as any).message);
      return false;
    }
  }
  
  /**
   * Compute gold features
   */
  computeFeatures(): GoldFeatures | null {
    if (this.prices.length < 120) {
      return null;
    }
    
    const prices = this.prices.map(p => p.price);
    const n = prices.length;
    
    // Current price
    const priceNow = prices[n - 1];
    
    // Returns
    const ret10 = (prices[n - 1] - prices[n - 11]) / prices[n - 11];
    const ret30 = (prices[n - 1] - prices[n - 31]) / prices[n - 31];
    const ret90 = (prices[n - 1] - prices[n - 91]) / prices[n - 91];
    
    // 120-day z-score
    const slice120 = prices.slice(-120);
    const mean120 = slice120.reduce((a, b) => a + b, 0) / 120;
    const std120 = Math.sqrt(slice120.reduce((a, b) => a + (b - mean120) ** 2, 0) / 120);
    const z120 = std120 > 0 ? (priceNow - mean120) / std120 : 0;
    
    // Flight to quality detection
    // Trigger: gold rising (z > threshold) + positive short-term momentum
    const flightToQuality = z120 > GOLD_SERIES_CONFIG.thresholds.flightToQuality && ret30 > 0;
    
    // Stress contribution (for regime inference)
    const stressContribution = Math.max(0, z120 / 2); // Capped positive contribution to stress
    
    // Pressure for scoreSigned
    // Gold up → USD down (negative relationship)
    const pressure = -1 * z120 * 0.3; // Clamped to [-0.3, 0.3]
    
    // Weighted contribution
    const contribution = pressure * GOLD_SERIES_CONFIG.weight;
    
    this.features = {
      priceNow,
      z120: Math.round(z120 * 1000) / 1000,
      ret10: Math.round(ret10 * 10000) / 10000,
      ret30: Math.round(ret30 * 10000) / 10000,
      ret90: Math.round(ret90 * 10000) / 10000,
      flightToQuality,
      stressContribution: Math.round(stressContribution * 1000) / 1000,
      pressure: Math.round(pressure * 1000) / 1000,
      contribution: Math.round(contribution * 10000) / 10000,
    };
    
    return this.features;
  }
  
  /**
   * Get features (with auto-load)
   */
  async getFeatures(): Promise<GoldFeatures | null> {
    // Reload if stale (> 1 hour)
    if (Date.now() - this.lastUpdate > 3600000) {
      await this.loadFromFred();
    }
    
    if (this.prices.length === 0) {
      await this.loadFromFred();
    }
    
    return this.computeFeatures();
  }
  
  /**
   * Get as MacroDriverComponent
   */
  async getAsDriverComponent(): Promise<{
    key: string;
    displayName: string;
    role: 'gold';
    weight: number;
    lagDays: number;
    valueNow: number;
    contribution: number;
    tooltip: string;
  } | null> {
    const features = await this.getFeatures();
    if (!features) return null;
    
    return {
      key: GOLD_SERIES_CONFIG.seriesId,
      displayName: GOLD_SERIES_CONFIG.displayName,
      role: 'gold',
      weight: GOLD_SERIES_CONFIG.weight,
      lagDays: GOLD_SERIES_CONFIG.optimalLag,
      valueNow: features.z120,
      contribution: features.contribution,
      tooltip: features.flightToQuality
        ? `Gold: Flight-to-quality active (z=${features.z120.toFixed(2)})`
        : `Gold: ${features.z120 > 0 ? 'Elevated' : 'Subdued'} (z=${features.z120.toFixed(2)})`,
    };
  }
  
  /**
   * Data info
   */
  getDataInfo(): { points: number; from: string; to: string } | null {
    if (this.prices.length === 0) return null;
    
    return {
      points: this.prices.length,
      from: this.prices[0].date,
      to: this.prices[this.prices.length - 1].date,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════

let goldAdapterInstance: GoldSeriesAdapter | null = null;

export function getGoldAdapter(): GoldSeriesAdapter {
  if (!goldAdapterInstance) {
    goldAdapterInstance = new GoldSeriesAdapter();
  }
  return goldAdapterInstance;
}
