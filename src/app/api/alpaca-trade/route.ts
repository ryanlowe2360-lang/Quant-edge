// ============================================================
// POST /api/alpaca-trade
// Places real paper orders on Alpaca's paper trading account
// Supports: buy, sell, get positions, get account
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const PAPER_URL = process.env.ALPACA_PAPER_URL || "https://paper-api.alpaca.markets";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
    "Content-Type": "application/json",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "buy": {
        // Place a buy order for an options contract
        const { symbol, qty, type, limit_price } = body;
        if (!symbol || !qty) {
          return NextResponse.json({ error: "symbol and qty required" }, { status: 400 });
        }

        const orderBody: any = {
          symbol,
          qty: qty.toString(),
          side: "buy",
          type: type || "market",
          time_in_force: "day",
        };

        if (type === "limit" && limit_price) {
          orderBody.limit_price = limit_price.toString();
        }

        const res = await fetch(`${PAPER_URL}/v2/orders`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(orderBody),
        });

        const data = await res.json();
        if (!res.ok) {
          return NextResponse.json({ error: "Order failed", details: data }, { status: res.status });
        }

        return NextResponse.json({ order: data, status: "submitted" });
      }

      case "sell": {
        const { symbol, qty, type, limit_price } = body;
        if (!symbol || !qty) {
          return NextResponse.json({ error: "symbol and qty required" }, { status: 400 });
        }

        const orderBody: any = {
          symbol,
          qty: qty.toString(),
          side: "sell",
          type: type || "market",
          time_in_force: "day",
        };

        if (type === "limit" && limit_price) {
          orderBody.limit_price = limit_price.toString();
        }

        const res = await fetch(`${PAPER_URL}/v2/orders`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(orderBody),
        });

        const data = await res.json();
        if (!res.ok) {
          return NextResponse.json({ error: "Order failed", details: data }, { status: res.status });
        }

        return NextResponse.json({ order: data, status: "submitted" });
      }

      case "positions": {
        const res = await fetch(`${PAPER_URL}/v2/positions`, {
          headers: headers(),
        });
        const data = await res.json();
        return NextResponse.json({ positions: data });
      }

      case "account": {
        const res = await fetch(`${PAPER_URL}/v2/account`, {
          headers: headers(),
        });
        const data = await res.json();
        return NextResponse.json({
          equity: parseFloat(data.equity),
          cash: parseFloat(data.cash),
          buyingPower: parseFloat(data.buying_power),
          portfolioValue: parseFloat(data.portfolio_value),
          daytradeCount: data.daytrade_count,
          status: data.status,
        });
      }

      case "orders": {
        const res = await fetch(`${PAPER_URL}/v2/orders?status=all&limit=50`, {
          headers: headers(),
        });
        const data = await res.json();
        return NextResponse.json({ orders: data });
      }

      case "cancel": {
        const { order_id } = body;
        if (!order_id) {
          return NextResponse.json({ error: "order_id required" }, { status: 400 });
        }
        const res = await fetch(`${PAPER_URL}/v2/orders/${order_id}`, {
          method: "DELETE",
          headers: headers(),
        });
        return NextResponse.json({ cancelled: res.ok });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: buy, sell, positions, account, orders, cancel" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Alpaca trade error:", error);
    return NextResponse.json(
      { error: "Trade execution failed", details: error.message },
      { status: 500 }
    );
  }
}

// GET — quick account info
export async function GET() {
  try {
    const res = await fetch(`${PAPER_URL}/v2/account`, {
      headers: headers(),
    });
    const data = await res.json();
    return NextResponse.json({
      equity: parseFloat(data.equity),
      cash: parseFloat(data.cash),
      buyingPower: parseFloat(data.buying_power),
      portfolioValue: parseFloat(data.portfolio_value),
      status: data.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
