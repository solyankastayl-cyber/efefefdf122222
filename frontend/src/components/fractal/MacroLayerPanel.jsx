/**
 * MACRO LAYER PANEL
 * 3 blocks in horizontal row:
 * A. Regime State
 * B. Macro Impact
 * C. Macro Drivers
 */

import React, { useState, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

const MacroLayerPanel = ({ focus, focusPack }) => {
  const [aeState, setAeState] = useState(null);
  const [macroScore, setMacroScore] = useState(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch AE terminal state
        const aeRes = await fetch(`${API_BASE}/api/ae/terminal`);
        if (aeRes.ok) {
          const aeData = await aeRes.json();
          setAeState(aeData);
        }
        
        // Fetch macro score
        const scoreRes = await fetch(`${API_BASE}/api/dxy-macro-core/score`);
        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          setMacroScore(scoreData.score);
        }
      } catch (err) {
        console.log('[MacroLayerPanel] Error:', err);
      }
    };
    
    fetchData();
  }, [focus]);

  // Extract data
  const regime = aeState?.regime || {};
  const macro = focusPack?.macro || {};
  const hybrid = focusPack?.hybrid || {};
  
  // Regime state
  const regimeName = (regime.regime || 'NEUTRAL').replace(/_/g, ' ');
  const regimeConfidence = regime.confidence || 0;
  const regimeReasons = regime.reasons || [];
  
  // Macro impact
  const hybridReturn = hybrid?.path?.[hybrid.path.length - 1]?.pct || 0;
  const macroBias = macro?.adjustment?.maxAdjustment || 0;
  const macroReturn = macro?.path?.[macro.path.length - 1]?.pct || hybridReturn;
  const impactStrength = Math.abs(macroBias) > 0.01 ? 'Strong' 
    : Math.abs(macroBias) > 0.005 ? 'Moderate' 
    : Math.abs(macroBias) > 0 ? 'Weak' 
    : 'None';
  
  // Macro drivers from score
  const drivers = [];
  if (macroScore?.components) {
    const inflationComp = macroScore.components.find(c => c.role === 'inflation');
    const ratesComp = macroScore.components.find(c => c.seriesId === 'FEDFUNDS');
    const laborComp = macroScore.components.find(c => c.role === 'labor');
    
    if (inflationComp) {
      drivers.push({ 
        label: 'Inflation', 
        value: inflationComp.regime || 'STABLE',
        direction: inflationComp.scoreSigned > 0 ? '↑' : inflationComp.scoreSigned < 0 ? '↓' : '→'
      });
    }
    if (ratesComp) {
      drivers.push({ 
        label: 'Rates', 
        value: ratesComp.regime || 'STABLE',
        direction: ratesComp.scoreSigned > 0 ? '↑' : ratesComp.scoreSigned < 0 ? '↓' : '→'
      });
    }
    if (laborComp) {
      drivers.push({ 
        label: 'Labor', 
        value: laborComp.regime || 'NORMAL',
        direction: laborComp.scoreSigned > 0 ? '↑' : laborComp.scoreSigned < 0 ? '↓' : '→'
      });
    }
  }
  
  // Add liquidity from AE state
  const liquidityImpulse = aeState?.state?.vector?.liquidityImpulse || 0;
  drivers.push({
    label: 'Liquidity',
    value: liquidityImpulse > 0.3 ? 'EXPANDING' : liquidityImpulse < -0.3 ? 'TIGHTENING' : 'STABLE',
    direction: liquidityImpulse > 0 ? '↑' : liquidityImpulse < 0 ? '↓' : '→'
  });
  
  // Format helpers
  const formatReturn = (r) => {
    if (!r && r !== 0) return '—';
    const pct = r * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="macro-layer-panel">
      {/* A. Regime State */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
          Regime State
        </div>
        
        <div className="mb-3">
          <span className={`inline-block px-2 py-1 rounded text-sm font-semibold ${
            regimeName.includes('BULL') ? 'bg-green-100 text-green-700' :
            regimeName.includes('BEAR') || regimeName.includes('STRESS') ? 'bg-red-100 text-red-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {regimeName}
          </span>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Confidence</span>
            <span className="font-medium">{(regimeConfidence * 100).toFixed(0)}%</span>
          </div>
          {regimeReasons.slice(0, 2).map((r, i) => (
            <div key={i} className="text-xs text-slate-400">• {r}</div>
          ))}
        </div>
      </div>
      
      {/* B. Macro Impact */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
          Macro Impact
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Hybrid Base</span>
            <span className={`font-medium ${hybridReturn < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatReturn(hybridReturn)}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-slate-500">Macro Bias</span>
            <span className={`font-medium ${
              macroBias < 0 ? 'text-amber-600' : 
              macroBias > 0 ? 'text-blue-600' : 
              'text-slate-400'
            }`}>
              {macroBias !== 0 ? `${(macroBias * 100).toFixed(2)}%` : '0%'}
            </span>
          </div>
          
          <div className="border-t border-slate-100 pt-2 mt-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Adjusted Forecast</span>
              <span className={`font-semibold text-base ${macroReturn < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatReturn(macroReturn)}
              </span>
            </div>
          </div>
          
          <div className="flex justify-between pt-1">
            <span className="text-slate-500">Impact Strength</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              impactStrength === 'Strong' ? 'bg-blue-100 text-blue-700' :
              impactStrength === 'Moderate' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {impactStrength}
            </span>
          </div>
        </div>
      </div>
      
      {/* C. Macro Drivers */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
          Macro Drivers
        </div>
        
        <div className="space-y-2">
          {drivers.map((d, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-slate-500">{d.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-lg ${
                  d.direction === '↑' ? 'text-green-500' :
                  d.direction === '↓' ? 'text-red-500' :
                  'text-slate-400'
                }`}>
                  {d.direction}
                </span>
                <span className="text-xs font-medium text-slate-600 w-20 text-right">
                  {d.value}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {drivers.length === 0 && (
          <div className="text-slate-400 text-sm">No driver data</div>
        )}
      </div>
    </div>
  );
};

export default MacroLayerPanel;
