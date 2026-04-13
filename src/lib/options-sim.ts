// ============================================================
// QUANT EDGE — Options Price Simulator
// Replaces flat delta multiplier with Black-Scholes approximation
// Models: delta, gamma acceleration, theta decay, IV sensitivity
// ============================================================

/**
 * Simulated option position for backtesting
 */
export interface SimulatedOption {
  strikePercent: number;    // % OTM (e.g., 0.05 = 5% OTM)
  delta: number;            // initial delta at entry
  gamma: number;            // initial gamma
  theta: number;            // daily theta decay as % of option price
  iv: number;               // implied volatility
  dte: number;              // days to expiration at entry
  entryPrice: number;       // option price at entry
  contractCost: number;     // total cost (entryPrice * 100)
}

/**
 * Standard normal CDF approximation (for Black-Scholes)
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Simplified Black-Scholes call price
 */
function bsCallPrice(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0) return Math.max(0, S - K); // At expiry, intrinsic value only

  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}

/**
 * Calculate Greeks from Black-Scholes
 */
function bsGreeks(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0) {
    return {
      delta: S > K ? 1 : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
    };
  }

  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const nd1 = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI); // normal PDF

  const delta = normalCDF(d1);
  const gamma = nd1 / (S * sigma * Math.sqrt(T));

  // Theta (per day)
  const theta = (
    -(S * nd1 * sigma) / (2 * Math.sqrt(T))
    - r * K * Math.exp(-r * T) * normalCDF(d2)
  ) / 365;

  const vega = S * nd1 * Math.sqrt(T) / 100; // per 1% IV change

  return { delta, gamma, theta, vega };
}

/**
 * Simulate an option's price given a stock price change
 * Much more realistic than a flat multiplier
 *
 * @param config - simulation configuration
 * @param stockPriceAtEntry - stock price when option was bought
 * @param stockPriceNow - current stock price
 * @param barsElapsed - number of 5-min bars since entry
 * @param contractCost - how much the contract cost at entry
 */
export function simulateOptionPrice(config: {
  deltaAtEntry: number;     // 0.10 to 0.50
  strikeOTMPercent: number; // how far OTM the strike is (0.05 = 5%)
  iv: number;               // implied volatility (0.30 = 30%)
  dteAtEntry: number;       // days to expiration when bought
  riskFreeRate?: number;    // default 0.05 (5%)
}, stockPriceAtEntry: number, stockPriceNow: number, barsElapsed: number, contractCost: number): {
  optionPrice: number;
  pnlPercent: number;
  pnlDollar: number;
  currentDelta: number;
  currentGamma: number;
  currentTheta: number;
} {
  const r = config.riskFreeRate || 0.05;
  const sigma = config.iv || 0.35;

  // Calculate strike from OTM percentage
  const strike = stockPriceAtEntry * (1 + config.strikeOTMPercent);

  // Time remaining (each bar = 5 min, trading day = 6.5 hours = 78 bars)
  const daysElapsed = barsElapsed / 78; // approximate trading days elapsed
  const T = Math.max(0.001, (config.dteAtEntry - daysElapsed) / 365);

  // Calculate current option price using Black-Scholes
  const currentOptionPrice = bsCallPrice(stockPriceNow, strike, T, r, sigma);
  const entryOptionPrice = bsCallPrice(stockPriceAtEntry, strike, config.dteAtEntry / 365, r, sigma);

  // Scale to match the actual contract cost
  // (BS gives theoretical price, but we want to match what was actually paid)
  const scaleFactor = entryOptionPrice > 0 ? contractCost / (entryOptionPrice * 100) : 1;
  const scaledCurrentPrice = currentOptionPrice * 100 * scaleFactor;

  // Calculate P&L
  const pnlDollar = scaledCurrentPrice - contractCost;
  const pnlPercent = contractCost > 0 ? (pnlDollar / contractCost) * 100 : 0;

  // Current Greeks
  const greeks = bsGreeks(stockPriceNow, strike, T, r, sigma);

  return {
    optionPrice: scaledCurrentPrice / 100, // per-share price
    pnlPercent,
    pnlDollar,
    currentDelta: greeks.delta,
    currentGamma: greeks.gamma,
    currentTheta: greeks.theta,
  };
}

/**
 * Get a realistic option entry configuration based on budget and strategy
 */
export function getSimulatedEntry(
  stockPrice: number,
  contractBudget: number,
  strategy: "AGGRESSIVE" | "MODERATE" | "CONSERVATIVE" = "AGGRESSIVE"
): {
  strikeOTMPercent: number;
  deltaAtEntry: number;
  iv: number;
  dte: number;
  estimatedAsk: number;
} {
  switch (strategy) {
    case "AGGRESSIVE":
      // Cheap OTM options — high gamma, low delta, 0-2 DTE
      return {
        strikeOTMPercent: 0.05,  // 5% OTM
        deltaAtEntry: 0.15,
        iv: 0.45,               // Higher IV for short-dated
        dte: 1,
        estimatedAsk: contractBudget / 100,
      };

    case "MODERATE":
      // Slightly OTM — balanced risk/reward, 2-5 DTE
      return {
        strikeOTMPercent: 0.03,  // 3% OTM
        deltaAtEntry: 0.30,
        iv: 0.35,
        dte: 3,
        estimatedAsk: contractBudget / 100,
      };

    case "CONSERVATIVE":
      // Near ATM — higher delta, lower gamma, 5-14 DTE
      return {
        strikeOTMPercent: 0.01,  // 1% OTM
        deltaAtEntry: 0.45,
        iv: 0.30,
        dte: 7,
        estimatedAsk: contractBudget / 100,
      };

    default:
      return {
        strikeOTMPercent: 0.05,
        deltaAtEntry: 0.15,
        iv: 0.40,
        dte: 1,
        estimatedAsk: contractBudget / 100,
      };
  }
}
