# QuantEdge — Intraday Options Signal Dashboard

Real-time intraday signal scanner for options trading on your quant watchlist. Your quant software picks **what** to trade — QuantEdge tells you **when**.

## How It Works

1. **Add your quant picks** to the watchlist (up to 30 tickers)
2. The **signal engine** scans every 60 seconds using 5 technical indicators
3. Each stock gets a **composite score from 0–100**
4. **Alerts fire** when a stock crosses your threshold (default: 70)
5. **Log paper trades** and track your P&L and win rate

### Signal Engine Indicators

| Indicator | Weight | What It Detects |
|-----------|--------|-----------------|
| VWAP Reclaim | 30% | Price crossing back above VWAP after a dip |
| RSI Bounce | 25% | RSI recovering from oversold (<30) |
| 9/21 EMA Cross | 20% | Short-term momentum crossing above long-term |
| Volume Surge | 15% | Above-average volume on bullish candles |
| Gap Reversal | 10% | Gap-down stocks filling back up |

A **confluence bonus** of +10 points is added when 3+ signals fire simultaneously.

---

## Quick Start

### 1. Get your Alpaca API keys

1. Create a free account at [alpaca.markets](https://alpaca.markets)
2. Go to **Paper Trading** → **API Keys**
3. Generate a new key pair

### 2. Set up the project

```bash
# Clone or copy the project
cd quant-edge

# Install dependencies
npm install

# Create your env file
cp .env.example .env.local

# Edit .env.local and add your Alpaca keys
```

### 3. Configure `.env.local`

```
ALPACA_API_KEY=your_paper_trading_key
ALPACA_SECRET_KEY=your_paper_trading_secret
ALPACA_PAPER=true
```

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Architecture

```
quant-edge/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── alpaca/route.ts    # Market data proxy
│   │   │   └── signals/route.ts   # Signal engine endpoint
│   │   ├── layout.tsx
│   │   ├── page.tsx               # Main app shell
│   │   └── globals.css
│   ├── components/
│   │   ├── Header.tsx             # Nav + market status
│   │   ├── Dashboard.tsx          # Signal overview
│   │   ├── SignalCard.tsx         # Individual stock signal
│   │   ├── Watchlist.tsx          # Add/remove tickers
│   │   ├── AlertsFeed.tsx         # Signal alerts log
│   │   ├── TradesView.tsx         # Paper trade tracker
│   │   └── SettingsView.tsx       # Config
│   ├── hooks/
│   │   └── useMarketData.ts      # Polling hook
│   └── lib/
│       ├── alpaca.ts              # Alpaca API client
│       ├── indicators.ts          # VWAP, RSI, EMA, ATR math
│       ├── signals.ts             # Composite signal engine
│       ├── store.ts               # Zustand state
│       └── types.ts               # TypeScript types
```

---

## Roadmap

### Phase 2 — Options Layer
- [ ] Tradier API integration for options chain data
- [ ] Liquidity filter (OI, spread, volume)
- [ ] Auto-suggest best strike/expiry for budget

### Phase 3 — Alpaca Paper Trading
- [ ] Auto-execute paper trades on signal
- [ ] Position management with trailing stops
- [ ] Real-time P&L from Alpaca positions

### Phase 4 — Optimization
- [ ] Backtest signal parameters on historical data
- [ ] Tune indicator weights by win rate
- [ ] Add/remove indicators based on performance
- [ ] Mobile push notifications (PWA)

---

## Important Notes

- **This is a paper trading tool.** Validate signals with paper trades before risking real money.
- **Cash account rules apply.** With a $500 cash account on Robinhood, you're limited to settled funds. No PDT rule, but you can't trade the same dollars back-to-back without T+1 settlement.
- **Options are risky.** 0DTE options can and will go to zero. Never risk more than you can afford to lose.
- Alpaca free tier uses **IEX data** which may have slight delays vs. direct exchange feeds.

---

## Tech Stack

- **Next.js 14** — React framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling
- **Zustand** — State management
- **Alpaca API** — Market data + paper trading
- **date-fns** — Date formatting
- **lucide-react** — Icons
