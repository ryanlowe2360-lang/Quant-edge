"use client";

import { useStore } from "@/lib/store";
import {
  LayoutDashboard,
  List,
  Bell,
  BarChart3,
  Settings,
  Zap,
  Layers,
  Bot,
  FlaskConical,
  Brain,
  FileText,
  BookOpen,
} from "lucide-react";

const tabs = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "watchlist" as const, label: "Watchlist", icon: List },
  { id: "options" as const, label: "Options", icon: Layers },
  { id: "autotrader" as const, label: "Auto", icon: Bot },
  { id: "alerts" as const, label: "Alerts", icon: Bell },
  { id: "trades" as const, label: "Trades", icon: BarChart3 },
  { id: "reports" as const, label: "Reports", icon: FileText },
  { id: "learn" as const, label: "Learn", icon: BookOpen },
  { id: "backtest" as const, label: "Backtest", icon: FlaskConical },
  { id: "intel" as const, label: "Intel", icon: Brain },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export default function Header() {
  const { activeTab, setActiveTab, getUnreadAlertCount } = useStore();
  const unreadCount = getUnreadAlertCount();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-bg-border bg-bg-primary/90 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-2 md:px-4 h-14 flex items-center justify-between gap-2">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-accent-green/20 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent-green" />
          </div>
          <span className="font-display font-bold text-text-primary text-base md:text-lg tracking-tight hidden sm:block">
            QUANT<span className="text-accent-green">EDGE</span>
          </span>
        </div>

        {/* Navigation — scrollable on mobile */}
        <nav className="flex items-center gap-0.5 md:gap-1 overflow-x-auto scrollbar-hide flex-1 mx-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? "bg-bg-card text-accent-green"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}
              >
                <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden md:inline">{tab.label}</span>
                {tab.id === "alerts" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 rounded-full bg-accent-red text-white text-[9px] md:text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Market status — hidden on small screens */}
        <div className="hidden sm:flex items-center gap-2 text-xs flex-shrink-0">
          <MarketStatus />
        </div>
      </div>
    </header>
  );
}

function MarketStatus() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = et.getHours();
  const min = et.getMinutes();
  const timeNum = hour * 100 + min;
  const day = et.getDay();

  const isWeekend = day === 0 || day === 6;
  const isPreMarket = !isWeekend && timeNum >= 400 && timeNum < 930;
  const isOpen = !isWeekend && timeNum >= 930 && timeNum < 1600;
  const isAfterHours = !isWeekend && timeNum >= 1600 && timeNum < 2000;

  let status = "CLOSED";
  let color = "text-text-muted";
  let dot = "bg-text-muted";

  if (isOpen) {
    status = "MARKET OPEN";
    color = "text-accent-green";
    dot = "bg-accent-green animate-pulse";
  } else if (isPreMarket) {
    status = "PRE-MARKET";
    color = "text-accent-amber";
    dot = "bg-accent-amber";
  } else if (isAfterHours) {
    status = "AFTER HOURS";
    color = "text-accent-amber";
    dot = "bg-accent-amber";
  }

  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="font-mono font-medium">{status}</span>
    </div>
  );
}
