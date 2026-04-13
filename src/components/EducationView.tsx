"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  INDICATOR_EDUCATION, generateStudyRecommendations, trackImprovement,
  StudyRecommendation,
} from "@/lib/education";
import {
  BookOpen, TrendingUp, AlertTriangle, Award, ChevronDown, ChevronUp,
  Activity, BarChart2, Zap, Globe, ArrowUp,
} from "lucide-react";

type EduTab = "study" | "indicators" | "progress";

const indicatorIcons: Record<string, any> = {
  VWAP_RECLAIM: Activity,
  RSI_MOMENTUM: TrendingUp,
  EMA_CROSS: Zap,
  VOLUME_SURGE: BarChart2,
  PRICE_ACTION: ArrowUp,
  MARKET_ALIGNMENT: Globe,
};

export default function EducationView() {
  const { paperTrades, signals, startingBalance } = useStore();
  const [tab, setTab] = useState<EduTab>("study");
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);

  // Study recommendations
  const recommendations = useMemo(() =>
    generateStudyRecommendations(paperTrades, signals),
    [paperTrades, signals]
  );

  // Improvement tracking
  const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const improvement = useMemo(() => {
    const recent = paperTrades.filter((t) => new Date(t.entryTime) >= twoWeeksAgo);
    const older = paperTrades.filter((t) => {
      const d = new Date(t.entryTime);
      return d >= fourWeeksAgo && d < twoWeeksAgo;
    });
    return trackImprovement(recent, older);
  }, [paperTrades]);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-2">
        {([
          { key: "study" as const, label: "Study Plan", icon: BookOpen },
          { key: "indicators" as const, label: "Indicators", icon: Activity },
          { key: "progress" as const, label: "Progress", icon: Award },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all ${
              tab === key ? "bg-accent-green-dim text-accent-green border border-accent-green/30" :
              "bg-bg-card border border-bg-border text-text-secondary hover:text-text-primary"
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Study Plan Tab */}
      {tab === "study" && (
        <div className="space-y-4">
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="font-display font-bold text-text-primary mb-2">Your Study Recommendations</h3>
            <p className="text-sm text-text-secondary mb-4">
              Based on patterns in your recent trades, here's what to focus on to improve:
            </p>
            {recommendations.length === 0 ? (
              <p className="text-sm text-text-muted font-mono">Take a few more trades for personalized recommendations.</p>
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec, i) => (
                  <StudyCard key={i} rec={rec} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Indicators Tab */}
      {tab === "indicators" && (
        <div className="space-y-3">
          <div className="bg-bg-card border border-bg-border rounded-xl p-5 mb-4">
            <h3 className="font-display font-bold text-text-primary mb-2">Signal Indicators — Deep Dive</h3>
            <p className="text-sm text-text-secondary">
              Tap any indicator to learn what it measures, how to read it, and common mistakes to avoid.
            </p>
          </div>
          {Object.entries(INDICATOR_EDUCATION).map(([key, edu]) => {
            const Icon = indicatorIcons[key] || Activity;
            const isExpanded = expandedIndicator === key;
            return (
              <div key={key} className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedIndicator(isExpanded ? null : key)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-bg-hover transition-all text-left"
                >
                  <Icon className="w-5 h-5 text-accent-green flex-shrink-0" />
                  <span className="font-mono font-semibold text-text-primary flex-1">
                    {key.replace(/_/g, " ")}
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-bg-border pt-3">
                    <EduSection title="What it is" content={edu.whatItIs} />
                    <EduSection title="How to read it" content={edu.howToRead} />
                    <EduSection title="Best for" content={edu.bestFor} />
                    <EduSection title="Common mistake" content={edu.commonMistake} highlight />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Progress Tab */}
      {tab === "progress" && (
        <div className="space-y-4">
          {/* Improvement tracking */}
          <div className={`bg-bg-card border rounded-xl p-5 ${
            improvement.improving ? "border-accent-green/30" : "border-bg-border"
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {improvement.improving ? (
                <Award className="w-5 h-5 text-accent-green" />
              ) : (
                <TrendingUp className="w-5 h-5 text-accent-amber" />
              )}
              <h3 className="font-display font-bold text-text-primary">
                {improvement.improving ? "You're Improving!" : "Track Your Progress"}
              </h3>
            </div>
            <p className="text-sm text-text-secondary font-mono">{improvement.summary}</p>
          </div>

          {/* Quick stats */}
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="font-display font-bold text-text-primary mb-4">Trading Stats</h3>
            <TradeStats trades={paperTrades} />
          </div>

          {/* Mistake frequency */}
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="font-display font-bold text-text-primary mb-3">Mistake Tracker</h3>
            <p className="text-sm text-text-secondary mb-4">
              Are you making the same mistakes less often? Track it here over time.
            </p>
            <MistakeTracker trades={paperTrades} signals={signals} />
          </div>
        </div>
      )}
    </div>
  );
}

function StudyCard({ rec }: { rec: StudyRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  const priorityColor = rec.priority === "HIGH" ? "border-accent-red/30 bg-accent-red-dim/30" :
    rec.priority === "MEDIUM" ? "border-accent-amber/30 bg-accent-amber-dim/30" : "border-accent-green/30 bg-accent-green-dim/30";
  const priorityText = rec.priority === "HIGH" ? "text-accent-red" :
    rec.priority === "MEDIUM" ? "text-accent-amber" : "text-accent-green";

  return (
    <div className={`border rounded-xl p-4 ${priorityColor}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${priorityText}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-mono font-bold text-text-primary text-sm">{rec.topic}</h4>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${priorityText}`}>
              {rec.priority}
            </span>
          </div>
          <p className="text-xs text-text-secondary font-mono">{rec.reason}</p>
          <button onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[10px] text-accent-blue font-mono hover:underline">
            {expanded ? "Hide details" : "What to do →"}
          </button>
          {expanded && (
            <div className="mt-2 bg-bg-primary rounded-lg p-3 text-xs text-text-primary font-mono">
              {rec.resources}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EduSection({ title, content, highlight }: { title: string; content: string; highlight?: boolean }) {
  return (
    <div className={`${highlight ? "bg-accent-amber-dim/50 border border-accent-amber/20" : "bg-bg-primary"} rounded-lg p-3`}>
      <h5 className="text-[10px] font-mono text-text-muted uppercase mb-1">{title}</h5>
      <p className="text-sm text-text-primary font-mono">{content}</p>
    </div>
  );
}

function TradeStats({ trades }: { trades: any[] }) {
  const userClosed = trades.filter((t: any) => t.source === "USER" && t.status === "CLOSED");
  const wins = userClosed.filter((t: any) => (t.pnl || 0) > 0);
  const losses = userClosed.filter((t: any) => (t.pnl || 0) <= 0);
  const avgSignal = userClosed.length > 0 ? userClosed.reduce((s: number, t: any) => s + t.signalScore, 0) / userClosed.length : 0;
  const avgWinSignal = wins.length > 0 ? wins.reduce((s: number, t: any) => s + t.signalScore, 0) / wins.length : 0;
  const avgLossSignal = losses.length > 0 ? losses.reduce((s: number, t: any) => s + t.signalScore, 0) / losses.length : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <QuickStat label="Total Trades" value={userClosed.length.toString()} />
      <QuickStat label="Win Rate" value={userClosed.length > 0 ? `${(wins.length / userClosed.length * 100).toFixed(0)}%` : "—"} />
      <QuickStat label="Avg Entry Signal" value={avgSignal.toFixed(0)} />
      <QuickStat label="Avg Win Signal" value={avgWinSignal.toFixed(0)} />
      <QuickStat label="Avg Loss Signal" value={avgLossSignal.toFixed(0)} />
      <QuickStat label="Signal Edge" value={avgWinSignal > avgLossSignal ? `+${(avgWinSignal - avgLossSignal).toFixed(0)}` : "—"} />
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-primary rounded-lg p-3">
      <div className="text-[10px] font-mono text-text-muted uppercase">{label}</div>
      <div className="font-mono font-bold text-lg text-text-primary">{value}</div>
    </div>
  );
}

function MistakeTracker({ trades, signals }: { trades: any[]; signals: Record<string, any> }) {
  const userLosses = trades.filter((t: any) => t.source === "USER" && t.status === "CLOSED" && (t.pnl || 0) < 0);
  if (userLosses.length < 2) {
    return <p className="text-sm text-text-muted font-mono">Not enough losing trades to identify patterns yet. (That's a good thing!)</p>;
  }

  const lowSignal = userLosses.filter((t: any) => t.signalScore < 50).length;
  const bigLoss = userLosses.filter((t: any) => (t.pnlPercent || 0) < -35).length;
  const total = userLosses.length;

  return (
    <div className="space-y-2">
      <MistakeBar label="Low signal entries (<50)" count={lowSignal} total={total} />
      <MistakeBar label="Held past stop loss (>35% loss)" count={bigLoss} total={total} />
    </div>
  );
}

function MistakeBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-mono mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">{count}/{total} losses ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 bg-bg-hover rounded-full">
        <div className="h-full bg-accent-red rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
