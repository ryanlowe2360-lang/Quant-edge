// ============================================================
// QUANT EDGE — Telegram Notifications
// Sends trade alerts to a Telegram bot
// ============================================================
//
// SETUP:
// 1. Create a bot: message @BotFather on Telegram, send /newbot
// 2. Copy the bot token (looks like 123456789:ABCdefGHI...)
// 3. Send any message to your new bot
// 4. Get your chat ID: visit https://api.telegram.org/bot<TOKEN>/getUpdates
// 5. Add to .env.local:
//    TELEGRAM_BOT_TOKEN=your_bot_token
//    TELEGRAM_CHAT_ID=your_chat_id
// ============================================================

import { Alert } from "./types";

/**
 * Send a message to Telegram
 */
async function sendTelegram(message: string): Promise<boolean> {
  try {
    const res = await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return res.ok;
  } catch (err) {
    console.error("Telegram send error:", err);
    return false;
  }
}

/**
 * Format an alert as a Telegram message
 */
function formatAlert(alert: Alert): string {
  const emoji = alert.type === "ENTRY" ? "🟢" : alert.type === "EXIT" ? "🔴" : "⚠️";
  const severity = alert.severity === "HIGH" ? "🔥" : "";

  let msg = `${emoji}${severity} *${alert.symbol}* — Score: ${alert.score}\n`;

  if (alert.contract) {
    const c = alert.contract;
    msg += `\n📋 *${c.type} $${c.strike}* exp ${c.expiry}`;
    msg += `\n💰 Ask: $${c.ask.toFixed(2)} | Cost: $${c.cost}`;
    msg += `\n📊 Delta: ${c.delta.toFixed(2)}`;
  }

  msg += `\n\n${alert.message}`;
  msg += `\n\n⏰ ${new Date(alert.timestamp).toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`;

  return msg;
}

/**
 * Send an alert to Telegram
 */
export async function sendTelegramAlert(alert: Alert): Promise<boolean> {
  const message = formatAlert(alert);
  return sendTelegram(message);
}

/**
 * Send a custom message to Telegram
 */
export async function sendTelegramMessage(message: string): Promise<boolean> {
  return sendTelegram(message);
}
