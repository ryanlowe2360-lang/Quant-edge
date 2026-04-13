// ============================================================
// QUANT EDGE — Core Types
// ============================================================

// --- Market Data ---
export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: string;
}

// --- Signal Engine ---
export type SignalType = "VWAP_RECLAIM" | "RSI_MOMENTUM" | "EMA_CROSS" | "VOLUME_SURGE" | "PRICE_ACTION" | "MARKET_ALIGNMENT";

export interface SignalDetail {
  type: SignalType;
  name: string;
  score: number;     // 0-100 contribution
  active: boolean;
  bullish: boolean;  // true = bullish signal, false = bearish signal
  value?: number;     // current indicator value
  threshold?: number; // trigger threshold
  description: string;
}

export interface CompositeSignal {
  symbol: string;
  score: number;       // 0-100 composite
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  explanation: string; // plain English summary
  signals: SignalDetail[];
  timestamp: string;
  optionsPlayable: boolean;
}

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface Alert {
  id: string;
  symbol: string;
  type: "ENTRY" | "EXIT" | "WARNING";
  severity: AlertSeverity;
  message: string;
  score: number;
  timestamp: string;
  price: number;
  read: boolean;
  // Contract recommendation (Phase 7)
  contract?: {
    type: "CALL" | "PUT";
    strike: number;
    expiry: string;
    ask: number;
    bid: number;
    delta: number;
    cost: number;        // ask * 100
  };
  // Confirmation flow
  confirmed?: boolean;    // user clicked "I bought this"
  confirmedAt?: string;
  exitAlert?: boolean;    // true if this is an exit alert for a confirmed position
  exitPnl?: number;
}

// --- Watchlist ---
export interface WatchlistStock {
  symbol: string;
  name: string;
  addedAt: string;
  sector?: string;
  quantRank?: number;
  quantScore?: number;
}

export interface WatchlistStockWithData extends WatchlistStock {
  quote?: Quote;
  signal?: CompositeSignal;
  optionsLiquidity: "HIGH" | "MEDIUM" | "LOW" | "NONE";
}

// --- Paper Trading ---
export type TradeStatus = "OPEN" | "CLOSED" | "PENDING";

export interface PaperTrade {
  id: string;
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  entryTime: string;
  exitTime?: string;
  status: TradeStatus;
  signalScore: number;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
  // Phase 6 additions
  source?: "USER" | "SYSTEM";         // who placed this trade (defaults to SYSTEM for legacy)
  signalId?: string;                  // link to the signal that triggered it
  grade?: "A" | "B" | "C" | "D" | "F";
  gradeExplanation?: string;
  gradeBreakdown?: {
    entryTiming: number;       // 0-25 points
    exitTiming: number;        // 0-25 points
    positionSizing: number;    // 0-20 points
    signalAdherence: number;   // 0-15 points
    marketAlignment: number;   // 0-15 points
  };
}

export interface PortfolioStats {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  currentBalance: number;
  startingBalance: number;
}

// --- Auto Trading (Phase 3) ---
export type AutoTradeMode = "OFF" | "PAPER" | "ALERTS_ONLY";

export interface AutoTradeSettings {
  mode: AutoTradeMode;
  maxOpenPositions: number;       // max concurrent positions
  maxRiskPerTrade: number;        // max % of balance per trade
  maxDailyLoss: number;           // stop trading if daily loss exceeds this $
  maxDailyTrades: number;         // max trades per day
  trailingStopType: "EMA9" | "VWAP" | "PERCENT" | "ATR";
  trailingStopPercent: number;    // for PERCENT mode
  hardStopPercent: number;        // max loss % before forced exit
  takeProfitPercent: number;      // auto-close at this % gain (0 = disabled)
  cooldownMinutes: number;        // min time between trades on same symbol
  requireOptionsLiquidity: boolean; // only trade if options liquidity is HIGH/MEDIUM
  signalCollapseThreshold: number;  // exit if signal drops below this (0 = disabled)
  minHoldMinutes: number;           // min minutes to hold before trailing/signal exits
}

export interface AutoTradeExecution {
  id: string;
  tradeId: string;
  symbol: string;
  action: "OPEN" | "CLOSE" | "STOP_HIT" | "TAKE_PROFIT" | "FORCED_EXIT";
  reason: string;
  signalScore: number;
  price: number;
  quantity: number;
  timestamp: string;
  contractInfo?: {
    type: "CALL" | "PUT";
    strike: number;
    expiry: string;
    ask: number;
    bid: number;
    delta: number;
  };
}

export interface LivePosition {
  id: string;
  symbol: string;
  contractSymbol?: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  entryTime: string;
  signalScore: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  stopPrice: number;
  takeProfitPrice: number;
  highWaterMark: number;
  exitSignalActive: boolean;
  exitSignalReason: string;
  tradeMode?: "SCALP" | "DAYTRADE" | "SWING";  // determines exit parameters
}

export interface DailyStats {
  date: string;
  tradesOpened: number;
  tradesClosed: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  isLocked: boolean;       // true if daily loss limit hit
}

// --- Indicator Values ---
export interface IndicatorSnapshot {
  symbol: string;
  timestamp: string;
  vwap: number;
  rsi: number;
  ema9: number;
  ema21: number;
  relativeVolume: number;  // current vol / avg vol
  atr: number;
  priceVsVwap: number;    // % above/below VWAP
}

// --- Options ---
export interface OptionsContract {
  symbol: string;
  underlying: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  spreadPercent: number; // (ask-bid)/mid * 100
}

export interface OptionsFilter {
  minOpenInterest: number;
  maxSpreadPercent: number;
  maxPrice: number;
  preferredDTE: number[];   // [0, 1, 2, 5] etc.
  minDelta: number;
  maxDelta: number;
}

// --- Options Recommendation (Phase 2) ---
export type LiquidityGrade = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type TradeType = "SCALP" | "MOMENTUM" | "DAY_TRADE";

export interface OptionsRecommendation {
  symbol: string;
  liquidityGrade: LiquidityGrade;
  bestContract: OptionsContract | null;
  alternatives: OptionsContract[];
  reason: string;            // why this contract was picked or why none qualify
  estimatedCost: number;     // total cost to buy 1 contract (ask * 100)
  spreadCost: number;        // round-trip spread cost in dollars
  maxRisk: number;           // max you can lose (= premium paid)
  timestamp: string;
  // Smart engine fields (Phase 5)
  tradeType: TradeType;
  whyThisStrike: string;     // educational explanation
  whyThisExpiry: string;     // educational explanation
  targetExit: number;        // target exit price for the contract
  targetPnl: number;         // expected P&L at target
  targetPnlPct: number;      // expected P&L % at target
  stopLoss: number;          // stop loss price for the contract
  stopLossPnl: number;       // P&L at stop loss
  stopLossPnlPct: number;    // P&L % at stop loss
  positionSize: {
    recommended: number;     // recommended # of contracts
    maxAffordable: number;   // max contracts within budget
    dollarRisk: number;      // total dollar risk
    accountRiskPct: number;  // % of account at risk
  };
  greeksSnapshot: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    iv: number;
    thetaPerHour: number;    // theta decay per hour
  } | null;
  riskWarning: string;       // "Max loss $215 (43% of account). Consider 1 contract."
}

export interface OptionsChainSummary {
  symbol: string;
  expirations: string[];     // available expiry dates
  callCount: number;
  putCount: number;
  avgSpreadPercent: number;
  avgOpenInterest: number;
  liquidityGrade: LiquidityGrade;
  timestamp: string;
}

export interface OptionsSettings {
  maxBudgetPerTrade: number;   // max $ to spend on a single contract
  preferredDTE: number[];      // preferred days to expiration [0, 1, 2, 5]
  minOpenInterest: number;     // minimum OI filter
  maxSpreadPercent: number;    // max bid-ask spread %
  minDelta: number;            // min delta for contract selection
  maxDelta: number;            // max delta
  preferCalls: boolean;        // default to calls (bullish strategy)
}
