"use client";

import { useStore } from "@/lib/store";
import { Sliders, DollarSign, Shield, Info, Layers, Volume2, User, Clock } from "lucide-react";

export default function SettingsView() {
  const {
    signalThreshold,
    setSignalThreshold,
    startingBalance,
    setStartingBalance,
    soundEnabled,
    setSoundEnabled,
    userProfile,
    setUserProfile,
    watchlist,
    paperTrades,
    alerts,
    optionsSettings,
    setOptionsSettings,
  } = useStore();

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-display font-bold text-text-primary text-lg">Settings</h2>

      {/* ── User Profile (Phase 12) ──────────────────────── */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-accent-blue" />
          <h3 className="font-display font-semibold text-text-primary">User Profile</h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          These values drive position sizing, risk limits, and report generation. Update them as your situation changes.
        </p>
        <div className="space-y-4">
          {/* Account Balance */}
          <ProfileField label="Account Balance" hint="Drives all risk calculations">
            <div className="flex items-center gap-1">
              <span className="text-text-muted font-mono">$</span>
              <input type="number" value={startingBalance}
                onChange={(e) => setStartingBalance(parseInt(e.target.value) || 500)}
                className="w-28 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50" />
            </div>
          </ProfileField>

          {/* Broker */}
          <ProfileField label="Broker" hint="Affects trade logging flow">
            <select value={userProfile.broker} onChange={(e) => setUserProfile({ broker: e.target.value })}
              className="px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none">
              <option value="Robinhood">Robinhood</option>
              <option value="Webull">Webull</option>
              <option value="TD Ameritrade">TD Ameritrade</option>
              <option value="Fidelity">Fidelity</option>
              <option value="Other">Other</option>
            </select>
          </ProfileField>

          {/* Experience Level */}
          <ProfileField label="Experience Level" hint="Adjusts education depth and default risk strictness">
            <select value={userProfile.experienceLevel} onChange={(e) => setUserProfile({ experienceLevel: e.target.value as any })}
              className="px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none">
              <option value="beginner">Beginner (~1 year)</option>
              <option value="intermediate">Intermediate (1-3 years)</option>
              <option value="advanced">Advanced (3+ years)</option>
            </select>
          </ProfileField>

          {/* Max Risk Per Trade */}
          <ProfileField label="Max Risk Per Trade" hint={`${userProfile.maxRiskPerTradePct}% = $${(startingBalance * userProfile.maxRiskPerTradePct / 100).toFixed(0)}`}>
            <div className="flex items-center gap-3">
              <input type="range" min={5} max={100} value={userProfile.maxRiskPerTradePct}
                onChange={(e) => setUserProfile({ maxRiskPerTradePct: parseInt(e.target.value) })}
                className="flex-1 accent-accent-green" />
              <span className="font-mono text-sm text-text-primary w-12 text-right">{userProfile.maxRiskPerTradePct}%</span>
            </div>
          </ProfileField>

          {/* Daily Loss Limit */}
          <ProfileField label="Daily Loss Limit" hint={`${userProfile.dailyLossLimitPct}% = $${(startingBalance * userProfile.dailyLossLimitPct / 100).toFixed(0)}`}>
            <div className="flex items-center gap-3">
              <input type="range" min={5} max={50} value={userProfile.dailyLossLimitPct}
                onChange={(e) => setUserProfile({ dailyLossLimitPct: parseInt(e.target.value) })}
                className="flex-1 accent-accent-amber" />
              <span className="font-mono text-sm text-text-primary w-12 text-right">{userProfile.dailyLossLimitPct}%</span>
            </div>
          </ProfileField>

          {/* Daily Trade Limit */}
          <ProfileField label="Daily Trade Limit" hint="Soft warning when exceeded">
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={20} value={userProfile.dailyTradeLimit}
                onChange={(e) => setUserProfile({ dailyTradeLimit: parseInt(e.target.value) })}
                className="flex-1 accent-accent-green" />
              <span className="font-mono text-sm text-text-primary w-12 text-right">{userProfile.dailyTradeLimit}</span>
            </div>
          </ProfileField>

          {/* Trading Hours */}
          <ProfileField label="Trading Hours (ET)" hint="Signal scanning window">
            <div className="flex items-center gap-2 text-sm font-mono">
              <select value={userProfile.tradingHoursStart} onChange={(e) => setUserProfile({ tradingHoursStart: parseInt(e.target.value) })}
                className="px-2 py-1 bg-bg-primary border border-bg-border rounded text-text-primary">
                {[9, 10, 11, 12].map((h) => <option key={h} value={h}>{h === 9 ? "9:30" : `${h}:00`}</option>)}
              </select>
              <span className="text-text-muted">to</span>
              <select value={userProfile.tradingHoursEnd} onChange={(e) => setUserProfile({ tradingHoursEnd: parseInt(e.target.value) })}
                className="px-2 py-1 bg-bg-primary border border-bg-border rounded text-text-primary">
                {[13, 14, 15, 16].map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
              </select>
            </div>
          </ProfileField>

          {/* Preferred Duration */}
          <ProfileField label="Preferred Trade Duration" hint="Drives expiry selection defaults">
            <select value={userProfile.preferredDuration} onChange={(e) => setUserProfile({ preferredDuration: e.target.value as any })}
              className="px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none">
              <option value="scalp">Scalp (minutes)</option>
              <option value="momentum">Momentum (30min - hours)</option>
              <option value="day">Day Trade (hold to EOD)</option>
              <option value="mix">Mix (system decides)</option>
            </select>
          </ProfileField>

          {/* API Budget */}
          <ProfileField label="Monthly API Budget" hint="For data upgrade recommendations">
            <div className="flex items-center gap-1">
              <span className="text-text-muted font-mono">$</span>
              <input type="number" value={userProfile.apiBudget}
                onChange={(e) => setUserProfile({ apiBudget: parseInt(e.target.value) || 50 })}
                className="w-20 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50" />
            </div>
          </ProfileField>
        </div>
      </div>

      {/* Signal Threshold */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="w-4 h-4 text-accent-green" />
          <h3 className="font-display font-semibold text-text-primary">Signal Threshold</h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Alerts fire when a stock's composite signal score crosses this threshold.
          Higher = fewer but stronger signals. Lower = more signals but more noise.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={30}
            max={90}
            step={5}
            value={signalThreshold}
            onChange={(e) => setSignalThreshold(parseInt(e.target.value))}
            className="flex-1 accent-accent-green"
          />
          <span className="font-mono font-bold text-accent-green text-xl min-w-[48px] text-center">
            {signalThreshold}
          </span>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] font-mono text-text-muted">30 (aggressive)</span>
          <span className="text-[10px] font-mono text-text-muted">90 (conservative)</span>
        </div>
      </div>

      {/* Sound Alerts */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Volume2 className="w-4 h-4 text-accent-amber" />
          <h3 className="font-display font-semibold text-text-primary">Sound Alerts</h3>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Play distinct sounds for signals, exits, and risk warnings.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              soundEnabled ? "bg-accent-green" : "bg-bg-hover"
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              soundEnabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`} />
          </button>
          <span className="text-sm text-text-secondary font-mono">
            {soundEnabled ? "ON" : "OFF"}
          </span>
        </div>
        {soundEnabled && (
          <div className="mt-3 text-xs text-text-muted font-mono space-y-1">
            <p>🔔 Rising chime — high-confidence signal (score 80+)</p>
            <p>🔻 Descending tone — exit alert</p>
            <p>⚠️ Double beep — risk warning</p>
          </div>
        )}
      </div>

      {/* Options Filter Settings (Phase 2) */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-accent-blue" />
          <h3 className="font-display font-semibold text-text-primary">Options Filter</h3>
          <span className="text-[10px] font-mono text-text-muted bg-bg-hover px-1.5 py-0.5 rounded">Phase 2</span>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          These settings control which options contracts the system recommends when a signal fires.
        </p>
        <div className="space-y-4">
          {/* Max Budget Per Trade */}
          <div>
            <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
              Max Budget Per Trade
            </label>
            <div className="flex items-center gap-2">
              <span className="text-text-muted font-mono">$</span>
              <input
                type="number"
                value={optionsSettings.maxBudgetPerTrade}
                onChange={(e) => setOptionsSettings({ maxBudgetPerTrade: parseInt(e.target.value) || 25 })}
                className="w-24 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
              />
              <span className="text-xs text-text-muted">per contract (ask × 100)</span>
            </div>
          </div>

          {/* Min Open Interest */}
          <div>
            <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
              Min Open Interest
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={optionsSettings.minOpenInterest}
                onChange={(e) => setOptionsSettings({ minOpenInterest: parseInt(e.target.value) })}
                className="flex-1 accent-accent-green"
              />
              <span className="font-mono font-bold text-accent-green text-sm min-w-[48px] text-center">
                {optionsSettings.minOpenInterest}
              </span>
            </div>
          </div>

          {/* Max Spread */}
          <div>
            <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
              Max Bid-Ask Spread %
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={5}
                max={40}
                step={1}
                value={optionsSettings.maxSpreadPercent}
                onChange={(e) => setOptionsSettings({ maxSpreadPercent: parseInt(e.target.value) })}
                className="flex-1 accent-accent-green"
              />
              <span className="font-mono font-bold text-accent-green text-sm min-w-[48px] text-center">
                {optionsSettings.maxSpreadPercent}%
              </span>
            </div>
          </div>

          {/* Delta Range */}
          <div>
            <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
              Delta Range
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="0.95"
                value={optionsSettings.minDelta}
                onChange={(e) => setOptionsSettings({ minDelta: parseFloat(e.target.value) || 0.20 })}
                className="w-20 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
              />
              <span className="text-text-muted font-mono">to</span>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="0.95"
                value={optionsSettings.maxDelta}
                onChange={(e) => setOptionsSettings({ maxDelta: parseFloat(e.target.value) || 0.55 })}
                className="w-20 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
              />
              <span className="text-xs text-text-muted">0.30–0.45 is the sweet spot for leveraged directional plays</span>
            </div>
          </div>

          {/* Preferred DTE */}
          <div>
            <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
              Preferred Days to Expiration
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {[0, 1, 2, 3, 5, 7, 14, 30].map((dte) => {
                const isSelected = optionsSettings.preferredDTE.includes(dte);
                return (
                  <button
                    key={dte}
                    onClick={() => {
                      const current = optionsSettings.preferredDTE;
                      const updated = isSelected
                        ? current.filter((d: number) => d !== dte)
                        : [...current, dte].sort((a: number, b: number) => a - b);
                      if (updated.length > 0) {
                        setOptionsSettings({ preferredDTE: updated });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                      isSelected
                        ? "bg-accent-green/20 text-accent-green border border-accent-green/30"
                        : "bg-bg-primary text-text-muted border border-bg-border hover:text-text-secondary"
                    }`}
                  >
                    {dte === 0 ? "0DTE" : `${dte}d`}
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] text-text-muted mt-1 block">
              0DTE = highest gamma, biggest moves. Tap to toggle each expiration.
            </span>
          </div>
        </div>
      </div>

      {/* Signal Engine Info */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-accent-blue" />
          <h3 className="font-display font-semibold text-text-primary">Signal Engine</h3>
        </div>
        <div className="space-y-3 text-sm text-text-secondary">
          <p>The signal engine scores stocks 0–100 based on 6 intraday indicators. It detects both <span className="text-accent-green">bullish (call)</span> and <span className="text-accent-red">bearish (put)</span> setups:</p>
          <div className="space-y-2">
            <IndicatorInfo
              name="VWAP Reclaim / Breakdown"
              weight={25}
              desc="Bullish: price crossing back above VWAP. Bearish: price breaking below VWAP. Shows institutional buying or selling pressure."
            />
            <IndicatorInfo
              name="RSI Momentum"
              weight={20}
              desc="Bullish: RSI bouncing from oversold (<30). Bearish: RSI rejecting from overbought (>70). Measures momentum exhaustion."
            />
            <IndicatorInfo
              name="9/21 EMA Cross"
              weight={20}
              desc="Bullish: 9 EMA crossing above 21 EMA. Bearish: 9 EMA crossing below. Detects short-term trend shifts."
            />
            <IndicatorInfo
              name="Volume Surge"
              weight={15}
              desc="2x+ average volume confirms conviction. Direction determined by whether price is rising or falling on the volume."
            />
            <IndicatorInfo
              name="Price Action"
              weight={10}
              desc="Gap-ups holding, gap-fills, higher lows (bullish) or lower highs, failed gaps (bearish). Reads the tape."
            />
            <IndicatorInfo
              name="Market Alignment"
              weight={10}
              desc="Does SPY/QQQ agree with the trade direction? Trading with the market trend significantly improves win rates."
            />
          </div>
          <p className="text-xs text-text-muted mt-4">
            A confluence bonus of +10 points is added when 3+ signals are active in the same direction.
            Additional adjustments: Time-of-Day (morning +15%, lunch -10%, power hour +10%), Key Levels (support/resistance ±8), Multi-Timeframe confirmation (hourly trend ±10-15).
            Confidence levels: LOW (&lt;50), MEDIUM (50+, 2+ signals), HIGH (70+, 3+ signals), VERY HIGH (85+, 4+ signals).
          </p>
        </div>
      </div>

      {/* Data Stats */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-text-muted" />
          <h3 className="font-display font-semibold text-text-primary">Data</h3>
        </div>
        <div className="space-y-2 text-sm font-mono">
          <div className="flex justify-between text-text-secondary">
            <span>Watchlist stocks</span>
            <span className="text-text-primary">{watchlist.length}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Total alerts</span>
            <span className="text-text-primary">{alerts.length}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Paper trades</span>
            <span className="text-text-primary">{paperTrades.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-mono text-text-primary">{label}</div>
        <div className="text-[10px] text-text-muted font-mono">{hint}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function IndicatorInfo({
  name,
  weight,
  desc,
}: {
  name: string;
  weight: number;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg bg-bg-hover/50">
      <span className="font-mono font-bold text-accent-green text-xs mt-0.5 min-w-[32px]">
        {weight}%
      </span>
      <div>
        <span className="font-mono font-medium text-text-primary text-xs">{name}</span>
        <p className="text-xs text-text-muted mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
