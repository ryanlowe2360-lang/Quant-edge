// ============================================================
// QUANT EDGE — useMarketData Hook
// Polls market data, runs signals, and executes auto-trades
// ============================================================

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { Alert } from "@/lib/types";
import { useNotifications } from "./useNotifications";
import { sendTelegramAlert, sendTelegramMessage } from "@/lib/telegram";
import {
  evaluateAllStrategies,
  updateStrategyPositions,
  openStrategyPosition,
  formatConvergenceMessage,
  formatStrategyTrade,
} from "@/lib/multi-strategy";
import {
  canOpenTrade,
  evaluateEntry,
  evaluateExit,
  calculatePositionSize,
  createPosition,
  createExecution,
  updatePosition,
  getOrCreateDailyStats,
} from "@/lib/autotrader";

const QUOTE_INTERVAL = 30_000;   // 30 seconds (was 15 — causing 429s)
const SIGNAL_INTERVAL = 90_000;  // 90 seconds (was 60 — signals change per 5min bar anyway)
const OPTIONS_INTERVAL = 300_000; // 5 minutes
const AUTOTRADE_INTERVAL = 45_000; // 45 seconds (was 30)

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useMarketData() {
  const store = useStore();
  const {
    watchlist,
    setQuotes,
    setSignals,
    setOptionsLiquidity,
    addAlert,
    signalThreshold,
    signals: currentSignals,
    optionsSettings,
    // Phase 3
    autoTradeSettings,
    livePositions,
    optionsRecs,
    optionsLiquidity,
    quotes,
    executions,
    dailyStats,
    addLivePosition,
    addExecution,
    setLivePositions,
    closePositionAndLog,
    setDailyStats,
    getPortfolioStats,
    // Market context
    setMarketRegime,
    setSpyQuote,
    setVixLevel,
    setMarketEvents,
  } = store;

  const { notifySignal, notifyAutoTrade } = useNotifications();
  const prevSignals = useRef(currentSignals);

  const symbols = watchlist.map((s) => s.symbol);
  const symbolsKey = symbols.join(",");

  // Fetch market context (SPY, VIX, regime)
  const fetchMarketContext = useCallback(async () => {
    try {
      const res = await fetch("/api/market-context");
      if (!res.ok) return;
      const data = await res.json();
      if (data.spy) setSpyQuote(data.spy);
      if (data.vixLevel) setVixLevel(data.vixLevel);
      if (data.regime) setMarketRegime(data.regime);
    } catch (err) {
      console.error("Market context fetch error:", err);
    }
    // Fetch events (once per session is enough)
    try {
      const today = new Date().toISOString().slice(0, 10);
      const evtRes = await fetch(`/api/events?from=${today}&to=${today}&symbols=${symbols.join(",")}`);
      if (evtRes.ok) {
        const evtData = await evtRes.json();
        if (evtData.events) setMarketEvents(evtData.events);
      }
    } catch (err) {
      console.warn("Events fetch failed:", err);
    }
  }, [setSpyQuote, setVixLevel, setMarketRegime, setMarketEvents]);

  // Fetch quotes
  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return;
    try {
      const res = await fetch(`/api/alpaca?symbols=${symbolsKey}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.quotes) setQuotes(data.quotes);
    } catch (err) {
      console.error("Quote fetch error:", err);
    }
  }, [symbolsKey, setQuotes]);

  // Fetch signals
  const fetchSignals = useCallback(async () => {
    if (symbols.length === 0) return;
    try {
      const res = await fetch(`/api/signals?symbols=${symbolsKey}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.signals) {
        setSignals(data.signals);

        for (const [sym, signal] of Object.entries(data.signals) as any) {
          const prevScore = prevSignals.current[sym]?.score || 0;
          const newScore = signal.score;

          if (newScore >= signalThreshold && prevScore < signalThreshold) {
            // Get contract recommendation if available
            const rec = useStore.getState().optionsRecs[sym];
            const quote = useStore.getState().quotes[sym];
            const contractInfo = rec?.bestContract ? {
              type: rec.bestContract.type as "CALL" | "PUT",
              strike: rec.bestContract.strike,
              expiry: rec.bestContract.expiry,
              ask: rec.bestContract.ask,
              bid: rec.bestContract.bid,
              delta: rec.bestContract.delta,
              cost: Math.round(rec.bestContract.ask * 100),
            } : undefined;

            const activeSignals = signal.signals
              .filter((s: any) => s.active)
              .map((s: any) => s.name)
              .join(", ");

            const contractMsg = contractInfo
              ? ` → BUY ${sym} $${contractInfo.strike} ${contractInfo.type} ${contractInfo.expiry} @ $${contractInfo.ask.toFixed(2)} (Δ${contractInfo.delta.toFixed(2)}, cost $${contractInfo.cost})`
              : "";

            const alert: Alert = {
              id: generateId(),
              symbol: sym,
              type: "ENTRY",
              severity: newScore >= 85 ? "HIGH" : "MEDIUM",
              message: `${sym} signal score hit ${newScore} — ${activeSignals}${contractMsg}`,
              score: newScore,
              timestamp: new Date().toISOString(),
              price: quote?.price || 0,
              read: false,
              contract: contractInfo,
            };
            addAlert(alert);
            notifySignal(sym, newScore, "ENTRY", alert.message);

            // Send Telegram notification
            sendTelegramAlert(alert);
          }

          if (prevScore >= signalThreshold && newScore < signalThreshold * 0.6) {
            // Only fire exit alert if we actually have a position in this stock
            const currentState = useStore.getState();
            const hasPosition = currentState.livePositions.some((p) => p.symbol === sym);
            const hasConfirmedAlert = currentState.alerts.some(
              (a) => a.symbol === sym && a.confirmed && a.type === "ENTRY"
            );

            if (hasPosition || hasConfirmedAlert) {
              const alert: Alert = {
                id: generateId(),
                symbol: sym,
                type: "EXIT",
                severity: "HIGH",
                message: `${sym} signal collapsed from ${prevScore} → ${newScore} — SELL NOW`,
                score: newScore,
                timestamp: new Date().toISOString(),
                price: 0,
                read: false,
                exitAlert: true,
              };
              addAlert(alert);
              notifySignal(sym, newScore, "EXIT", alert.message);
              sendTelegramAlert(alert);
            }
          }
        }

        prevSignals.current = data.signals;
      }
    } catch (err) {
      console.error("Signal fetch error:", err);
    }
  }, [symbolsKey, setSignals, addAlert, signalThreshold]);

  // Scan options liquidity
  const fetchOptionsLiquidity = useCallback(async () => {
    if (symbols.length === 0) return;
    try {
      const res = await fetch(`/api/options?symbols=${symbolsKey}&mode=scan`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.scan) {
        const grades: Record<string, any> = {};
        for (const [sym, info] of Object.entries(data.scan) as any) {
          grades[sym] = info.liquidityGrade;
        }
        setOptionsLiquidity(grades);
      }
    } catch (err) {
      console.error("Options scan error:", err);
    }
  }, [symbolsKey, setOptionsLiquidity]);

  // ── Auto-Trade Engine ──
  const runAutoTrader = useCallback(() => {
    if (autoTradeSettings.mode === "OFF") return;

    const currentState = useStore.getState();
    const stats = currentState.getPortfolioStats();
    const today = getOrCreateDailyStats(currentState.dailyStats);

    // Reset daily stats if new day
    if (today.date !== currentState.dailyStats.date) {
      setDailyStats(today);
    }

    // ── Check exits on open positions ──
    for (const position of currentState.livePositions) {
      const signal = currentState.signals[position.symbol];
      const quote = currentState.quotes[position.symbol];

      // Update position with current price (use quote as proxy for option price movement)
      // In a real system, we'd fetch live option prices from Tradier
      if (quote) {
        const priceChangePercent = quote.changePercent || 0;
        // Rough option price estimate: delta * stock price change
        // This is a simplification - real implementation would use Tradier live prices
        const estimatedCurrentPrice = Math.max(
          0.01,
          position.entryPrice * (1 + (priceChangePercent / 100) * 2.5)
        );

        const updated = updatePosition(position, estimatedCurrentPrice, signal);

        // Update the position in store
        currentState.updateLivePosition(position.id, {
          currentPrice: updated.currentPrice,
          unrealizedPnl: updated.unrealizedPnl,
          unrealizedPnlPercent: updated.unrealizedPnlPercent,
          highWaterMark: updated.highWaterMark,
          exitSignalActive: updated.exitSignalActive,
          exitSignalReason: updated.exitSignalReason,
        });

        // Check exit conditions
        const exitEval = evaluateExit({
          position: updated,
          currentPrice: updated.currentPrice,
          signal,
          settings: autoTradeSettings,
        });

        if (exitEval.shouldExit && autoTradeSettings.mode === "PAPER") {
          currentState.closePositionAndLog(
            position.id,
            updated.currentPrice,
            exitEval.reason,
            exitEval.action
          );

          const exitAlert: Alert = {
            id: generateId(),
            symbol: position.symbol,
            type: "EXIT",
            severity: "HIGH",
            message: `AUTO-EXIT: ${position.symbol} — ${exitEval.reason}`,
            score: signal?.score || 0,
            timestamp: new Date().toISOString(),
            price: updated.currentPrice,
            read: false,
            exitAlert: true,
          };
          addAlert(exitAlert);
          sendTelegramAlert(exitAlert);
        } else if (exitEval.shouldExit && autoTradeSettings.mode === "ALERTS_ONLY") {
          const exitAlert: Alert = {
            id: generateId(),
            symbol: position.symbol,
            type: "EXIT",
            severity: "HIGH",
            message: `EXIT SIGNAL: ${position.symbol} — ${exitEval.reason} (manual action required)`,
            score: signal?.score || 0,
            timestamp: new Date().toISOString(),
            price: updated.currentPrice,
            read: false,
            exitAlert: true,
          };
          addAlert(exitAlert);
          sendTelegramAlert(exitAlert);
        }
      }
    }

    // ── Check entries on watchlist ──
    const freshState = useStore.getState();
    for (const stock of freshState.watchlist) {
      const sym = stock.symbol;
      const signal = freshState.signals[sym];
      const quote = freshState.quotes[sym];
      const rec = freshState.optionsRecs[sym];
      const liq = freshState.optionsLiquidity[sym] || "NONE";

      if (!signal || !quote) continue;
      if (signal.score < signalThreshold) continue;

      // Can we open a trade?
      const riskCheck = canOpenTrade({
        settings: autoTradeSettings,
        openPositions: freshState.livePositions,
        dailyStats: getOrCreateDailyStats(freshState.dailyStats),
        currentBalance: stats.currentBalance,
        symbol: sym,
        recentExecutions: freshState.executions,
      });

      if (!riskCheck.allowed) continue;

      // Evaluate entry
      const entryEval = evaluateEntry({
        symbol: sym,
        signal,
        quote,
        recommendation: rec || null,
        liquidity: liq as any,
        settings: autoTradeSettings,
        signalThreshold,
      });

      if (!entryEval.shouldEnter || !entryEval.contract) continue;

      // Calculate position size
      const sizing = calculatePositionSize({
        balance: stats.currentBalance,
        maxRiskPercent: autoTradeSettings.maxRiskPerTrade,
        contractAsk: entryEval.contract.ask,
      });

      if (sizing.quantity <= 0) continue;

      if (autoTradeSettings.mode === "PAPER") {
        // Execute paper trade
        const stopPrice = entryEval.contract.ask * (1 - autoTradeSettings.hardStopPercent / 100);
        const tpPrice = autoTradeSettings.takeProfitPercent > 0
          ? entryEval.contract.ask * (1 + autoTradeSettings.takeProfitPercent / 100)
          : 0;

        const position = createPosition({
          symbol: sym,
          type: entryEval.contract.type,
          strike: entryEval.contract.strike,
          expiry: entryEval.contract.expiry,
          entryPrice: entryEval.contract.ask,
          quantity: sizing.quantity,
          signalScore: signal.score,
          contractSymbol: entryEval.contract.symbol,
          stopPrice,
          takeProfitPrice: tpPrice,
          tradeMode: entryEval.tradeMode || "DAYTRADE",
        });

        freshState.addLivePosition(position);

        const execution = createExecution({
          tradeId: position.id,
          symbol: sym,
          action: "OPEN",
          reason: entryEval.reason,
          signalScore: signal.score,
          price: entryEval.contract.ask,
          quantity: sizing.quantity,
          contractInfo: {
            type: entryEval.contract.type,
            strike: entryEval.contract.strike,
            expiry: entryEval.contract.expiry,
            ask: entryEval.contract.ask,
            bid: entryEval.contract.bid,
            delta: entryEval.contract.delta,
          },
        });

        freshState.addExecution(execution);

        // Update daily stats
        const updatedDaily = { ...getOrCreateDailyStats(freshState.dailyStats) };
        updatedDaily.tradesOpened += 1;
        freshState.setDailyStats(updatedDaily);

        const entryAlertObj: Alert = {
          id: generateId(),
          symbol: sym,
          type: "ENTRY",
          severity: "HIGH",
          message: `AUTO-ENTRY: ${sym} $${entryEval.contract.strike} ${entryEval.contract.type} @ $${entryEval.contract.ask.toFixed(2)} × ${sizing.quantity}${entryEval.tradeMode === "SWING" ? " [SWING]" : ""}`,
          score: signal.score,
          timestamp: new Date().toISOString(),
          price: entryEval.contract.ask,
          read: false,
          contract: {
            type: entryEval.contract.type,
            strike: entryEval.contract.strike,
            expiry: entryEval.contract.expiry,
            ask: entryEval.contract.ask,
            bid: entryEval.contract.bid,
            delta: entryEval.contract.delta,
            cost: Math.round(entryEval.contract.ask * 100),
          },
        };
        addAlert(entryAlertObj);
        sendTelegramAlert(entryAlertObj);
      } else if (autoTradeSettings.mode === "ALERTS_ONLY") {
        const alertOnlyObj: Alert = {
          id: generateId(),
          symbol: sym,
          type: "ENTRY",
          severity: "HIGH",
          message: `ENTRY SIGNAL: ${sym} — ${entryEval.reason}. Suggested: $${entryEval.contract.strike} ${entryEval.contract.type} @ $${entryEval.contract.ask.toFixed(2)}${entryEval.tradeMode === "SWING" ? " [SWING]" : ""}`,
          score: signal.score,
          timestamp: new Date().toISOString(),
          price: entryEval.contract.ask,
          read: false,
          contract: {
            type: entryEval.contract.type,
            strike: entryEval.contract.strike,
            expiry: entryEval.contract.expiry,
            ask: entryEval.contract.ask,
            bid: entryEval.contract.bid,
            delta: entryEval.contract.delta,
            cost: Math.round(entryEval.contract.ask * 100),
          },
        };
        addAlert(alertOnlyObj);
        sendTelegramAlert(alertOnlyObj);
      }
    }
  }, [autoTradeSettings, signalThreshold]);

  // ── Multi-Strategy Engine ──
  const runMultiStrategy = useCallback(() => {
    const currentState = useStore.getState();
    const strategies = currentState.multiStrategies;
    if (strategies.length === 0) return;

    const currentSignals = currentState.signals;
    const currentQuotes = currentState.quotes;

    // Update existing positions for all strategies
    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      if (!strategy.isActive) continue;

      const { updatedStrategy, closedPositions } = updateStrategyPositions(
        strategy, currentQuotes, currentSignals
      );

      // Send Telegram for closed positions
      for (const closed of closedPositions) {
        const pnlEmoji = closed.pnlDollar >= 0 ? "✅" : "❌";
        sendTelegramMessage(
          formatStrategyTrade(
            strategy.id,
            closed.symbol,
            "EXIT",
            `${pnlEmoji} ${closed.exitReason}\nP&L: ${closed.pnlDollar >= 0 ? "+" : ""}$${closed.pnlDollar.toFixed(0)} (${closed.pnlPercent >= 0 ? "+" : ""}${closed.pnlPercent.toFixed(1)}%)\nBars held: ${closed.barsHeld}`
          )
        );
      }

      currentState.updateStrategy(strategy.id, updatedStrategy);
    }

    // Evaluate new entries across all strategies
    const { entries, convergence } = evaluateAllStrategies(
      currentState.multiStrategies, currentSignals, currentQuotes
    );

    // Send convergence alerts
    for (const conv of convergence) {
      // Only alert if we haven't already for this symbol recently
      const recentConv = currentState.convergenceAlerts.find(
        (c) => c.symbol === conv.symbol &&
        Date.now() - new Date(c.timestamp).getTime() < 300000 // 5 min cooldown
      );
      if (!recentConv) {
        currentState.addConvergenceAlert(conv);
        sendTelegramMessage(formatConvergenceMessage(conv));
      }
    }

    // Execute entries
    for (const entry of entries) {
      const strategy = currentState.multiStrategies.find((s) => s.id === entry.strategyId);
      if (!strategy) continue;

      const quote = currentQuotes[entry.symbol];
      if (!quote) continue;

      // Estimate contract cost based on strategy allocation
      const contractCost = Math.min(strategy.balance * 0.1, 400); // 10% of balance, max $400
      if (contractCost <= 0 || strategy.balance < contractCost) continue;

      const updated = openStrategyPosition(
        strategy,
        entry.symbol,
        (quote as any).price || 0,
        entry.score,
        contractCost
      );

      currentState.updateStrategy(strategy.id, updated);

      sendTelegramMessage(
        formatStrategyTrade(
          strategy.id,
          entry.symbol,
          "ENTRY",
          `Score: ${entry.score} — ${entry.reason}\nCost: $${contractCost.toFixed(0)} | Balance: $${updated.balance.toFixed(0)}`
        )
      );
    }
  }, []);

  // Daily P&L Summary at 4:00 PM ET
  const dailySummarySent = useRef(false);
  const sendDailySummary = useCallback(() => {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const etHour = et.getHours();
    const etMin = et.getMinutes();

    // Reset flag at midnight
    if (etHour === 0) dailySummarySent.current = false;

    // Send at 4:00 PM ET (once per day)
    if (etHour === 16 && etMin < 5 && !dailySummarySent.current) {
      dailySummarySent.current = true;
      const state = useStore.getState();
      const stats = state.getPortfolioStats();
      const strategies = state.multiStrategies;

      let msg = `📊 *DAILY SUMMARY* — ${et.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}\n\n`;

      // Main auto-trader stats
      const daily = state.dailyStats;
      msg += `*Auto-Trader:*\n`;
      msg += `Trades: ${daily.tradesOpened} opened, ${daily.tradesClosed} closed\n`;
      msg += `P&L: ${daily.realizedPnl >= 0 ? "+" : ""}$${(daily.realizedPnl || 0).toFixed(0)}\n`;
      msg += `Win/Loss: ${daily.winCount}W / ${daily.lossCount}L\n\n`;

      // Multi-strategy leaderboard
      if (strategies.length > 0) {
        const totalPnl = strategies.reduce((s, st) => s + st.totalPnl, 0);
        const totalTrades = strategies.reduce((s, st) => s + st.totalTrades, 0);
        msg += `*Multi-Strategy (10 slots):*\n`;
        msg += `Combined P&L: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)}\n`;
        msg += `Total Trades: ${totalTrades}\n`;

        // Top 3
        const sorted = [...strategies].sort((a, b) => b.totalPnl - a.totalPnl);
        msg += `\n*Top 3:*\n`;
        sorted.slice(0, 3).forEach((s, i) => {
          msg += `${i + 1}. ${s.name}: ${s.totalPnl >= 0 ? "+" : ""}$${s.totalPnl.toFixed(0)} (${s.wins}W/${s.losses}L)\n`;
        });

        // Worst
        const worst = sorted[sorted.length - 1];
        if (worst && worst.totalPnl < 0) {
          msg += `\n*Worst:* ${worst.name}: $${worst.totalPnl.toFixed(0)}\n`;
        }
      }

      msg += `\n⏰ Market closed. See you tomorrow! 🚀`;
      sendTelegramMessage(msg);
    }
  }, []);

  // Record options data for future backtesting
  const recordOptionsData = useCallback(async () => {
    if (symbols.length === 0) return;
    const currentState = useStore.getState();
    const prices: Record<string, number> = {};
    for (const [sym, q] of Object.entries(currentState.quotes)) {
      if (q && (q as any).price) prices[sym] = (q as any).price;
    }
    try {
      await fetch("/api/record-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: symbols.slice(0, 10), prices }),
      });
    } catch (err) {
      // Silent fail — recording is best-effort
    }
  }, [symbolsKey]);

  // Manual refresh
  const refresh = useCallback(async () => {
    await Promise.all([fetchQuotes(), fetchSignals(), fetchOptionsLiquidity()]);
    runAutoTrader();
  }, [fetchQuotes, fetchSignals, fetchOptionsLiquidity, runAutoTrader]);

  // Polling
  useEffect(() => {
    // Market context runs regardless of watchlist
    fetchMarketContext();
    const marketTimer = setInterval(fetchMarketContext, 120_000); // every 2 min

    if (symbols.length === 0) {
      return () => clearInterval(marketTimer);
    }

    fetchQuotes();
    fetchSignals();
    fetchOptionsLiquidity();

    const quoteTimer = setInterval(fetchQuotes, QUOTE_INTERVAL);
    const signalTimer = setInterval(fetchSignals, SIGNAL_INTERVAL);
    const optionsTimer = setInterval(fetchOptionsLiquidity, OPTIONS_INTERVAL);
    const autoTradeTimer = setInterval(runAutoTrader, AUTOTRADE_INTERVAL);
    const multiStratTimer = setInterval(runMultiStrategy, AUTOTRADE_INTERVAL);
    const recordTimer = setInterval(recordOptionsData, 300_000);
    const summaryTimer = setInterval(sendDailySummary, 60_000);

    return () => {
      clearInterval(marketTimer);
      clearInterval(quoteTimer);
      clearInterval(signalTimer);
      clearInterval(optionsTimer);
      clearInterval(autoTradeTimer);
      clearInterval(multiStratTimer);
      clearInterval(recordTimer);
      clearInterval(summaryTimer);
    };
  }, [symbolsKey]);

  return { refresh, isActive: symbols.length > 0 };
}
