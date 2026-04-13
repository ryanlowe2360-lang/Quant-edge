# QuantEdge v8 — System Documentation

## Overview

QuantEdge is an intraday options signal dashboard with multi-strategy auto-trading. It scans your watchlist for high-conviction entry signals, recommends specific options contracts, executes paper trades, and tracks P&L across 10 independent strategies.

**Stack:** Next.js 14, TypeScript, Tailwind CSS, Zustand, Alpaca API, Tradier API, Telegram Bot

---

## Architecture

### Data Flow
1. **Alpaca API** → Stock quotes (every 30s) + historical bars (32hr warmup)
2. **Signal Engine** → Scores each stock 0-100 using 6 indicators + 5 enhancement layers
3. **Tradier API** → Real options chains with Greeks (delta, gamma, theta, vega, IV)
4. **Auto-Trader** → Evaluates entry/exit conditions, opens/closes paper positions
5. **Multi-Strategy Engine** → 10 independent strategies from grid search, each with $10k
6. **Telegram Bot** → Sends alerts for entries, exits, convergence, daily summary
7. **Options Recorder** → Saves real-time options data every 5 min for future backtesting

### Key Directories
```
src/lib/           — Core logic (signals, backtest, auto-trader, options, multi-strategy)
src/hooks/         — React hooks (useMarketData polling loop)
src/components/    — UI components (Dashboard, Auto, Backtest, Intel, etc.)
src/app/api/       — API routes (alpaca, signals, options, telegram, backtest, etc.)
data/              — Recorded options snapshots (JSONL files)
```

---

## Signal Engine (6 Indicators)

| # | Signal | Weight | What It Detects |
|---|--------|--------|-----------------|
| 1 | VWAP Reclaim | 25% | Price crossing back above VWAP after dipping below |
| 2 | RSI Bounce | 20% | RSI recovering from oversold (<30) territory |
| 3 | 9/21 EMA Cross | 15% | Short-term EMA crossing above long-term EMA |
| 4 | Volume Surge | 15% | Volume > 2x average with bullish price action |
| 5 | Gap Reversal | 10% | Gap-down stock filling the gap |
| 6 | Gap-Up Momentum | 15% | Stock gaps up 1%+ and holds above VWAP (trend days) |

### Enhancement Layers
- **Relative Strength vs SPY:** Outperformers get +8, laggards get -10
- **Time-of-Day:** Morning +15%, lunch lull -10%, power hour +10%
- **Key Levels:** Near support +8, near resistance -8, extended above all pivots -12
- **Multi-Timeframe:** Hourly bullish trend +10, hourly bearish -15
- **Confluence Bonus:** 3+ active signals = +10 points

---

## Auto-Trader Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Mode | OFF | OFF / ALERTS_ONLY / PAPER |
| Max Open Positions | 5 | Concurrent trades |
| Risk Per Trade | 10% | % of balance per trade |
| Daily Loss Limit | $250 | Stop trading after this loss |
| Max Daily Trades | 10 | Maximum trades per day |
| Trailing Stop | 25% | Exit when option drops 25% from high |
| Hard Stop | 35% | Maximum loss per trade |
| Take Profit | 0 (disabled) | Never cap upside |
| Cooldown | 10 min | Wait between trades on same stock |
| Min Hold | 15 min | Minimum hold before trailing/signal exits |
| Signal Collapse | 0 (disabled) | Exit when signal drops below threshold |
| Require Liquidity | false | Trade on signal alone |

### Liquidity-Based Trade Modes
- **HIGH liquidity → DAYTRADE:** Standard parameters, EOD exit at 3:55 PM ET
- **MEDIUM liquidity → DAYTRADE:** Same as HIGH
- **LOW liquidity → SWING:** Trailing stop widened to 35%, hard stop to 45%, no EOD exit, max hold 2 days

---

## Options Filter Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Max Budget | $400 | Maximum cost per contract (ask × 100) |
| Min Delta | 0.10 | Allows cheap OTM calls that can explode |
| Max Delta | 0.45 | Avoids expensive ITM contracts |
| Min Open Interest | 100 | Minimum OI for liquidity |
| Max Spread | 30% | Maximum bid-ask spread % |
| Preferred DTE | 0, 1, 2, 3, 5, 7 | Days to expiration (configurable in Settings) |

---

## Multi-Strategy Engine

### How It Works
1. Run **Grid Search** in Backtest tab (10,368 combinations across 11 parameters)
2. Click **"Deploy Top 10 Diverse Strategies"** — each gets $10k allocation
3. Each strategy evaluates signals independently using its own parameters
4. Strategies open/close positions, track P&L, win rate separately
5. **Convergence alerts** fire when 2+ strategies agree on the same stock
6. After 10+ trades, **"Prune Losers"** deactivates losing strategies and redistributes to winners

### Grid Search Parameters
Signal Threshold (55/65/75) × Trailing Stop (15/25/35%) × Hard Stop (25/35%) × Take Profit (0/100%) × Max Hold (48/78 bars) × Min Hold (3/6 bars) × Min Signals (1/2) × Delta (3/5x) × Signal Collapse (0/10) × Contract Cost ($50/$150/$400) × Spread Cost (3/5/8%)

---

## Notifications

### Telegram Alerts
- **Entry:** "🟢 MU — Score: 72, CALL $375 exp 4/8 @ $1.25 (Δ0.35, cost $125)"
- **Exit:** "🔴 MU — Trailing stop: -15% from peak, P&L +$45"
- **Convergence:** "🔥 CONVERGENCE: MU — 6 of 10 strategies agree! Avg Score: 78"
- **Daily Summary:** At 4:00 PM ET — trades, P&L, leaderboard standings

### In-App Alerts
- Entry alerts with "I Bought This — Track for Exit" confirmation button
- Exit alerts ONLY fire for confirmed positions or auto-trader positions
- Contract details shown inline (strike, expiry, ask, delta, cost)

---

## Market Intelligence (Intel Tab)

- **VIX Level:** Real-time from Tradier (not VIXY proxy)
- **Market Regime:** LOW_VOL_TREND / NORMAL / HIGH_VOL / CRISIS
- **Fear & Greed Index:** 0-100 gauge based on VIX + SPY momentum
- **Market Headlines:** Color-coded sentiment (bullish/bearish/neutral)
- **Multi-Timeframe Alignment:** Hourly and daily trend for top signal stocks
- **Key Levels:** Prior day high/low, pivot points, support/resistance

---

## Backtesting

### Options Price Simulation
Uses Black-Scholes approximation instead of flat delta multiplier:
- Models gamma acceleration near expiry
- Models theta decay
- Different strike distances produce different behavior
- $50 contracts act like cheap 5% OTM (high gamma)
- $400 contracts act like near-ATM (higher delta)

### Options Data Recording
- Records real Tradier data every 5 minutes during market hours
- Saves to `data/options-snapshots/options-YYYY-MM-DD.jsonl`
- Captures: price, bid, ask, delta, gamma, theta, vega, IV, volume, OI
- After 5+ days of recording, real-data backtesting becomes available

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/alpaca` | GET | Stock quotes from Alpaca |
| `/api/signals` | GET | Run signal engine on watchlist |
| `/api/options` | GET | Options chains + liquidity from Tradier |
| `/api/intelligence` | GET | VIX, regime, MTF, key levels |
| `/api/sentiment` | GET | Fear & Greed, headlines |
| `/api/backtest` | POST | Run backtest / grid search |
| `/api/telegram` | POST | Send Telegram message |
| `/api/record-options` | POST/GET | Record / check options data |
| `/api/alpaca-trade` | POST/GET | Place paper orders on Alpaca |

---

## Environment Variables (.env.local)

```
ALPACA_API_KEY=your_key
ALPACA_SECRET_KEY=your_secret
ALPACA_PAPER=true
ALPACA_FEED=iex
ALPACA_DATA_URL=https://data.alpaca.markets
ALPACA_PAPER_URL=https://paper-api.alpaca.markets
TRADIER_API_KEY=your_key
TRADIER_SANDBOX=false
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## Deployment

### Local Development
```bash
cd ~/Downloads/quant-edge
npm run dev
# Open http://localhost:3000
```

### Vercel Deployment
1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables in Vercel dashboard (Settings → Environment Variables)
4. Deploy

**Note:** Options data recording uses local filesystem and won't work on Vercel (serverless). For recording, run locally.

---

## Known Limitations

1. **IEX data coverage:** Free Alpaca IEX feed covers ~3-5% of US volume. Some stocks show 0 volume. Real volume is much higher.
2. **No historical options data:** Backtest uses Black-Scholes simulation. After 1-2 weeks of recording, real data will be available.
3. **Options recording on Vercel:** Serverless functions don't have persistent filesystem. Record locally only.
4. **Rate limiting:** Alpaca free tier limits to ~200 requests/minute. Polling is throttled to 30s quotes, 90s signals.

---

## Version History

- **v1-v6:** Core signal engine, options filter, auto-trader, backtest
- **v7:** Signal engine v2, VIX fix, 5 strategy improvements, multi-strategy engine, options recorder, Telegram alerts, Black-Scholes simulator
- **v8:** Trend-following signal, Fear & Greed, diverse strategies, swing trade mode, exit alert fix, Alpaca paper orders, daily P&L summary, auto-pruning, P&L chart, CSV export, mobile responsive
