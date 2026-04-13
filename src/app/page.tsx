"use client";

import { useStore } from "@/lib/store";
import { useMarketData } from "@/hooks/useMarketData";
import { useDbSync } from "@/hooks/useDbSync";
import ErrorBoundary from "@/components/ErrorBoundary";
import HydrationGuard from "@/components/HydrationGuard";
import Header from "@/components/Header";
import Dashboard from "@/components/Dashboard";
import Watchlist from "@/components/Watchlist";
import OptionsPanel from "@/components/OptionsPanel";
import AutoTrader from "@/components/AutoTrader";
import BacktestView from "@/components/BacktestView";
import IntelligenceView from "@/components/IntelligenceView";
import AlertsFeed from "@/components/AlertsFeed";
import TradesView from "@/components/TradesView";
import ReportsView from "@/components/ReportsView";
import EducationView from "@/components/EducationView";
import SettingsView from "@/components/SettingsView";

function AppContent() {
  const { activeTab } = useStore();
  useMarketData();
  useDbSync();

  return (
    <>
      <Header />
      <main className="pt-14">
        <div className="max-w-[1600px] mx-auto px-2 md:px-4 py-4 md:py-6">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "watchlist" && <Watchlist />}
          {activeTab === "options" && <OptionsPanel />}
          {activeTab === "autotrader" && <AutoTrader />}
          {activeTab === "backtest" && <BacktestView />}
          {activeTab === "intel" && <IntelligenceView />}
          {activeTab === "alerts" && <AlertsFeed />}
          {activeTab === "trades" && <TradesView />}
          {activeTab === "reports" && <ReportsView />}
          {activeTab === "learn" && <EducationView />}
          {activeTab === "settings" && <SettingsView />}
        </div>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <HydrationGuard>
        <AppContent />
      </HydrationGuard>
    </ErrorBoundary>
  );
}
