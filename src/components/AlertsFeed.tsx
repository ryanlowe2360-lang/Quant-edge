"use client";

import { useStore } from "@/lib/store";
import { Alert } from "@/lib/types";
import { format } from "date-fns";
import { Bell, BellOff, TrendingUp, LogOut, AlertTriangle, Trash2, Eye } from "lucide-react";

const typeIcons = {
  ENTRY: TrendingUp,
  EXIT: LogOut,
  WARNING: AlertTriangle,
};

const severityStyles = {
  HIGH: "border-accent-red/40 bg-accent-red-dim",
  MEDIUM: "border-accent-amber/40 bg-accent-amber-dim",
  LOW: "border-bg-border bg-bg-hover",
};

const typeBadge = {
  ENTRY: "bg-accent-green-dim text-accent-green",
  EXIT: "bg-accent-red-dim text-accent-red",
  WARNING: "bg-accent-amber-dim text-accent-amber",
};

export default function AlertsFeed() {
  const { alerts, markAlertRead, clearAlerts } = useStore();
  const unread = alerts.filter((a) => !a.read);
  const read = alerts.filter((a) => a.read);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-bold text-text-primary text-lg">Alerts</h2>
          {unread.length > 0 && (
            <span className="bg-accent-red text-white text-xs font-mono font-bold px-2 py-0.5 rounded-full">
              {unread.length} new
            </span>
          )}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-red font-mono transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear All
          </button>
        )}
      </div>

      {/* Empty state */}
      {alerts.length === 0 && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <BellOff className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-text-primary text-lg mb-2">
            No alerts yet
          </h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Alerts fire when a stock on your watchlist crosses the signal threshold.
            The engine scans every 60 seconds during market hours.
          </p>
        </div>
      )}

      {/* Unread Alerts */}
      {unread.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
            New
          </h3>
          {unread.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onRead={markAlertRead} />
          ))}
        </div>
      )}

      {/* Read Alerts */}
      {read.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
            Previous
          </h3>
          {read.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onRead={markAlertRead} isRead />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  onRead,
  isRead = false,
}: {
  alert: Alert;
  onRead: (id: string) => void;
  isRead?: boolean;
}) {
  const Icon = typeIcons[alert.type];
  const time = format(new Date(alert.timestamp), "h:mm a");
  const date = format(new Date(alert.timestamp), "MMM d");
  const { confirmAlert } = useStore();

  return (
    <div
      className={`flex flex-col gap-2 p-4 rounded-xl border transition-all animate-slide-in ${
        isRead
          ? "border-bg-border/50 bg-bg-card/50 opacity-60"
          : severityStyles[alert.severity]
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-lg ${typeBadge[alert.type]}`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono font-bold text-text-primary text-sm">
              {alert.symbol}
            </span>
            <span
              className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                typeBadge[alert.type]
              }`}
            >
              {alert.type}
            </span>
            {alert.score > 0 && (
              <span className="text-[10px] font-mono text-text-muted">
                Score: {alert.score}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary leading-snug">{alert.message}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-mono text-text-muted">{time}</span>
          <span className="text-[10px] font-mono text-text-muted">{date}</span>
          {!isRead && (
            <button
              onClick={() => onRead(alert.id)}
              className="mt-1 p-1 rounded text-text-muted hover:text-accent-green transition-colors"
            >
              <Eye className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Contract recommendation */}
      {alert.contract && (
        <div className="ml-10 bg-bg-primary/50 border border-bg-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm">
              <span className="text-accent-green font-bold">
                {alert.contract.type} ${alert.contract.strike}
              </span>
              <span className="text-text-muted"> exp {alert.contract.expiry}</span>
              <span className="text-text-primary"> @ ${alert.contract.ask.toFixed(2)}</span>
              <span className="text-text-muted"> (Δ{alert.contract.delta.toFixed(2)})</span>
              <span className="text-accent-amber ml-2">Cost: ${alert.contract.cost}</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation button */}
      {alert.type === "ENTRY" && alert.contract && !alert.confirmed && (
        <div className="ml-10">
          <button
            onClick={() => confirmAlert(alert.id)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-green/20 text-accent-green border border-accent-green/30 rounded-lg text-xs font-mono font-bold hover:bg-accent-green/30 transition-all"
          >
            ✓ I Bought This — Track for Exit
          </button>
        </div>
      )}

      {/* Confirmed badge */}
      {alert.confirmed && (
        <div className="ml-10 flex items-center gap-2">
          <span className="text-[10px] font-mono bg-accent-green-dim text-accent-green px-2 py-1 rounded font-bold">
            ✓ CONFIRMED — Tracking for exit
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            at {alert.confirmedAt ? format(new Date(alert.confirmedAt), "h:mm a") : ""}
          </span>
        </div>
      )}
    </div>
  );
}
