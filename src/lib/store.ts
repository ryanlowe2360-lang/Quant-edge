// ============================================================
// QUANT EDGE — Global Store (Zustand)
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  WatchlistStock,
  WatchlistStockWithData,
  Alert,
  PaperTrade,
  CompositeSignal,
  Quote,
  PortfolioStats,
  OptionsRecommendation,
  OptionsSettings,
  LiquidityGrade,
  AutoTradeSettings,
  AutoTradeExecution,
  LivePosition,
  DailyStats,
} from "./types";
import { DEFAULT_OPTIONS_SETTINGS } from "./options";
import { DEFAULT_AUTOTRADE_SETTINGS, getOrCreateDailyStats, updateDailyStats, positionToTrade } from "./autotrader";
import { RegimeInfo } from "./regime";
import { StrategySlot, ConvergenceAlert } from "./multi-strategy";

interface AppState {
  // Watchlist
  watchlist: WatchlistStock[];
  addToWatchlist: (stock: WatchlistStock) => void;
  removeFromWatchlist: (symbol: string) => void;

  // Live data
  quotes: Record<string, Quote>;
  signals: Record<string, CompositeSignal>;
  setQuotes: (quotes: Record<string, Quote>) => void;
  setSignal: (symbol: string, signal: CompositeSignal) => void;
  setSignals: (signals: Record<string, CompositeSignal>) => void;

  // Alerts
  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  markAlertRead: (id: string) => void;
  confirmAlert: (id: string) => void;
  clearAlerts: () => void;

  // Paper Trades
  paperTrades: PaperTrade[];
  addPaperTrade: (trade: PaperTrade) => void;
  closePaperTrade: (id: string, exitPrice: number, reason: string) => void;

  // Settings
  signalThreshold: number;
  setSignalThreshold: (threshold: number) => void;
  startingBalance: number;
  setStartingBalance: (balance: number) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;

  // User Profile (Phase 12)
  userProfile: {
    broker: string;
    apiBudget: number;
    experienceLevel: "beginner" | "intermediate" | "advanced";
    dailyTradeLimit: number;
    maxRiskPerTradePct: number;
    dailyLossLimitPct: number;
    tradingHoursStart: number; // ET hour (9 = 9am)
    tradingHoursEnd: number;   // ET hour (16 = 4pm)
    preferredDuration: "scalp" | "momentum" | "day" | "mix";
  };
  setUserProfile: (updates: Partial<AppState["userProfile"]>) => void;

  optionsSettings: OptionsSettings;
  setOptionsSettings: (settings: Partial<OptionsSettings>) => void;

  // Options (Phase 2)
  optionsRecs: Record<string, OptionsRecommendation>;
  optionsLiquidity: Record<string, LiquidityGrade>;
  setOptionsRecs: (recs: Record<string, OptionsRecommendation>) => void;
  setOptionsRec: (symbol: string, rec: OptionsRecommendation) => void;
  setOptionsLiquidity: (grades: Record<string, LiquidityGrade>) => void;

  // Auto Trading (Phase 3)
  autoTradeSettings: AutoTradeSettings;
  setAutoTradeSettings: (settings: Partial<AutoTradeSettings>) => void;
  livePositions: LivePosition[];
  setLivePositions: (positions: LivePosition[]) => void;
  addLivePosition: (position: LivePosition) => void;
  removeLivePosition: (id: string) => void;
  updateLivePosition: (id: string, updates: Partial<LivePosition>) => void;
  executions: AutoTradeExecution[];
  addExecution: (execution: AutoTradeExecution) => void;
  clearExecutions: () => void;
  dailyStats: DailyStats;
  setDailyStats: (stats: DailyStats) => void;
  closePositionAndLog: (positionId: string, exitPrice: number, reason: string, action: AutoTradeExecution["action"]) => void;

  // Market Context
  marketRegime: RegimeInfo | null;
  setMarketRegime: (regime: RegimeInfo) => void;
  spyQuote: Quote | null;
  setSpyQuote: (quote: Quote) => void;
  vixLevel: number;
  setVixLevel: (level: number) => void;
  marketEvents: Array<{ type: string; symbol?: string; date: string; time?: string; description: string }>;
  setMarketEvents: (events: Array<{ type: string; symbol?: string; date: string; time?: string; description: string }>) => void;

  // UI State
  selectedSymbol: string | null;
  setSelectedSymbol: (symbol: string | null) => void;
  activeTab: "dashboard" | "watchlist" | "alerts" | "trades" | "reports" | "learn" | "options" | "autotrader" | "backtest" | "intel" | "settings";
  setActiveTab: (tab: AppState["activeTab"]) => void;

  // Multi-Strategy Engine
  multiStrategies: StrategySlot[];
  setMultiStrategies: (strategies: StrategySlot[]) => void;
  updateStrategy: (id: number, updates: Partial<StrategySlot>) => void;
  convergenceAlerts: ConvergenceAlert[];
  addConvergenceAlert: (alert: ConvergenceAlert) => void;

  // Computed
  getWatchlistWithData: () => WatchlistStockWithData[];
  getPortfolioStats: () => PortfolioStats;
  getUnreadAlertCount: () => number;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // --- Watchlist ---
      watchlist: [],
      addToWatchlist: (stock) =>
        set((state) => {
          if (state.watchlist.find((s) => s.symbol === stock.symbol)) return state;
          return { watchlist: [...state.watchlist, stock] };
        }),
      removeFromWatchlist: (symbol) =>
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s.symbol !== symbol),
        })),

      // --- Live Data ---
      quotes: {},
      signals: {},
      setQuotes: (quotes) => set({ quotes }),
      setSignal: (symbol, signal) =>
        set((state) => ({
          signals: { ...state.signals, [symbol]: signal },
        })),
      setSignals: (signals) => set({ signals }),

      // --- Alerts ---
      alerts: [],
      addAlert: (alert) =>
        set((state) => ({
          alerts: [alert, ...state.alerts].slice(0, 200), // Keep last 200
        })),
      markAlertRead: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
        })),
      confirmAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id
              ? { ...a, confirmed: true, confirmedAt: new Date().toISOString(), read: true }
              : a
          ),
        })),
      clearAlerts: () => set({ alerts: [] }),

      // --- Paper Trades ---
      paperTrades: [],
      addPaperTrade: (trade) =>
        set((state) => ({
          paperTrades: [trade, ...state.paperTrades].slice(0, 1000),
        })),
      closePaperTrade: (id, exitPrice, reason) =>
        set((state) => ({
          paperTrades: state.paperTrades.map((t) => {
            if (t.id !== id || t.status !== "OPEN") return t;
            const pnl = (exitPrice - t.entryPrice) * t.quantity * 100;
            const pnlPercent = ((exitPrice - t.entryPrice) / t.entryPrice) * 100;
            return {
              ...t,
              exitPrice,
              exitTime: new Date().toISOString(),
              status: "CLOSED" as const,
              pnl,
              pnlPercent,
              exitReason: reason,
            };
          }),
        })),

      // --- Settings ---
      signalThreshold: 70,
      setSignalThreshold: (threshold) => set({ signalThreshold: threshold }),
      startingBalance: 500,
      setStartingBalance: (balance) => set({ startingBalance: balance }),
      soundEnabled: true,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

      // --- User Profile ---
      userProfile: {
        broker: "Robinhood",
        apiBudget: 50,
        experienceLevel: "beginner",
        dailyTradeLimit: 3,
        maxRiskPerTradePct: 30,
        dailyLossLimitPct: 10,
        tradingHoursStart: 9,
        tradingHoursEnd: 16,
        preferredDuration: "mix",
      },
      setUserProfile: (updates) =>
        set((state) => ({
          userProfile: { ...state.userProfile, ...updates },
        })),

      optionsSettings: { ...DEFAULT_OPTIONS_SETTINGS },
      setOptionsSettings: (partial) =>
        set((state) => ({
          optionsSettings: { ...state.optionsSettings, ...partial },
        })),

      // --- Options (Phase 2) ---
      optionsRecs: {},
      optionsLiquidity: {},
      setOptionsRecs: (recs) => set({ optionsRecs: recs }),
      setOptionsRec: (symbol, rec) =>
        set((state) => ({
          optionsRecs: { ...state.optionsRecs, [symbol]: rec },
        })),
      setOptionsLiquidity: (grades) =>
        set((state) => ({
          optionsLiquidity: { ...state.optionsLiquidity, ...grades },
        })),

      // --- Auto Trading (Phase 3) ---
      autoTradeSettings: { ...DEFAULT_AUTOTRADE_SETTINGS },
      setAutoTradeSettings: (partial) =>
        set((state) => ({
          autoTradeSettings: { ...state.autoTradeSettings, ...partial },
        })),

      livePositions: [],
      setLivePositions: (positions) => set({ livePositions: positions }),
      addLivePosition: (position) =>
        set((state) => ({
          livePositions: [...state.livePositions, position],
        })),
      removeLivePosition: (id) =>
        set((state) => ({
          livePositions: state.livePositions.filter((p) => p.id !== id),
        })),
      updateLivePosition: (id, updates) =>
        set((state) => ({
          livePositions: state.livePositions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      executions: [],
      addExecution: (execution) =>
        set((state) => ({
          executions: [execution, ...state.executions].slice(0, 500),
        })),
      clearExecutions: () => set({ executions: [] }),

      dailyStats: getOrCreateDailyStats(),
      setDailyStats: (stats) => set({ dailyStats: stats }),

      closePositionAndLog: (positionId, exitPrice, reason, action) =>
        set((state) => {
          const position = state.livePositions.find((p) => p.id === positionId);
          if (!position) return state;

          // Convert to paper trade
          const trade = positionToTrade(position, exitPrice, reason);

          // Update daily stats
          const pnl = trade.pnl || 0;
          const newDailyStats = updateDailyStats(
            getOrCreateDailyStats(state.dailyStats),
            pnl,
            state.autoTradeSettings.maxDailyLoss
          );

          // Create execution log
          const execution: AutoTradeExecution = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tradeId: position.id,
            symbol: position.symbol,
            action,
            reason,
            signalScore: position.signalScore,
            price: exitPrice,
            quantity: position.quantity,
            timestamp: new Date().toISOString(),
          };

          return {
            livePositions: state.livePositions.filter((p) => p.id !== positionId),
            paperTrades: [trade, ...state.paperTrades],
            executions: [execution, ...state.executions].slice(0, 500),
            dailyStats: newDailyStats,
          };
        }),

      // --- Multi-Strategy Engine ---
      multiStrategies: [],
      setMultiStrategies: (strategies) => set({ multiStrategies: strategies }),
      updateStrategy: (id, updates) =>
        set((state) => ({
          multiStrategies: state.multiStrategies.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),
      convergenceAlerts: [],
      addConvergenceAlert: (alert) =>
        set((state) => ({
          convergenceAlerts: [alert, ...state.convergenceAlerts].slice(0, 50),
        })),

      // --- Market Context ---
      marketRegime: null,
      setMarketRegime: (regime) => set({ marketRegime: regime }),
      spyQuote: null,
      setSpyQuote: (quote) => set({ spyQuote: quote }),
      vixLevel: 0,
      setVixLevel: (level) => set({ vixLevel: level }),
      marketEvents: [],
      setMarketEvents: (events) => set({ marketEvents: events }),

      // --- UI ---
      selectedSymbol: null,
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
      activeTab: "dashboard",
      setActiveTab: (tab) => set({ activeTab: tab }),

      // --- Computed ---
      getWatchlistWithData: () => {
        const { watchlist, quotes, signals, optionsLiquidity } = get();
        return watchlist.map((stock) => ({
          ...stock,
          quote: quotes[stock.symbol],
          signal: signals[stock.symbol],
          optionsLiquidity: (optionsLiquidity[stock.symbol] || "NONE") as "HIGH" | "MEDIUM" | "LOW" | "NONE",
        }));
      },

      getPortfolioStats: () => {
        const { paperTrades, startingBalance } = get();
        const closed = paperTrades.filter((t) => t.status === "CLOSED");
        const wins = closed.filter((t) => (t.pnl || 0) > 0);
        const losses = closed.filter((t) => (t.pnl || 0) <= 0);
        const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);

        return {
          totalTrades: closed.length,
          winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
          totalPnl,
          avgWin: wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0,
          avgLoss: losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length : 0,
          bestTrade: closed.length > 0 ? Math.max(...closed.map((t) => t.pnl || 0)) : 0,
          worstTrade: closed.length > 0 ? Math.min(...closed.map((t) => t.pnl || 0)) : 0,
          currentBalance: startingBalance + totalPnl,
          startingBalance,
        };
      },

      getUnreadAlertCount: () => {
        return get().alerts.filter((a) => !a.read).length;
      },
    }),
    {
      name: "quant-edge-storage",
      partialize: (state) => ({
        watchlist: state.watchlist,
        paperTrades: state.paperTrades,
        alerts: state.alerts,
        signalThreshold: state.signalThreshold,
        startingBalance: state.startingBalance,
        soundEnabled: state.soundEnabled,
        userProfile: state.userProfile,
        optionsSettings: state.optionsSettings,
        autoTradeSettings: state.autoTradeSettings,
        livePositions: state.livePositions,
        executions: state.executions,
        dailyStats: state.dailyStats,
        multiStrategies: state.multiStrategies,
        convergenceAlerts: state.convergenceAlerts,
      }),
    }
  )
);
