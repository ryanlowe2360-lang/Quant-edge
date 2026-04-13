"use client";

import { useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";

let swRegistration: ServiceWorkerRegistration | null = null;

// Audio context for generating alert sounds
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  return audioCtx;
}

// Sound generators
function playSignalSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Rising chime — two ascending tones
  const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
  osc1.type = "sine"; osc1.frequency.setValueAtTime(587, ctx.currentTime); // D5
  gain1.gain.setValueAtTime(0.15, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc1.connect(gain1); gain1.connect(ctx.destination);
  osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.3);

  const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
  osc2.type = "sine"; osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc2.connect(gain2); gain2.connect(ctx.destination);
  osc2.start(ctx.currentTime + 0.15); osc2.stop(ctx.currentTime + 0.5);
}

function playExitSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Descending tone — sell/exit
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = "triangle"; osc.frequency.setValueAtTime(660, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
}

function playWarningSound() {
  const ctx = getAudioCtx(); if (!ctx) return;
  // Two short beeps — warning
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = "square"; osc.frequency.setValueAtTime(440, ctx.currentTime + i * 0.2);
    gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.1);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.2); osc.stop(ctx.currentTime + i * 0.2 + 0.1);
  }
}

export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => { swRegistration = reg; })
      .catch((err) => console.error("SW registration failed:", err));
    if ("Notification" in window) permissionRef.current = Notification.permission;
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") { permissionRef.current = "granted"; return true; }
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === "granted";
  }, []);

  const sendNotification = useCallback((title: string, body: string, tag?: string) => {
    if (permissionRef.current !== "granted") return;
    if (swRegistration) {
      swRegistration.showNotification(title, {
        body, icon: "/icon-192.png", tag: tag || `qe-${Date.now()}`, vibrate: [200, 100, 200],
      });
    } else if ("Notification" in window) {
      new Notification(title, { body, icon: "/icon-192.png", tag });
    }
  }, []);

  const notifySignal = useCallback((symbol: string, score: number, type: "ENTRY" | "EXIT", details?: string) => {
    const emoji = type === "ENTRY" ? "🟢" : "🔴";
    const title = `${emoji} ${symbol} — ${type} Signal (${score})`;
    const body = details || `${symbol} signal score: ${score}`;
    sendNotification(title, body, `qe-${symbol}-${type}`);

    // Play sound based on type (check store for sound setting)
    const soundOn = useStore.getState().soundEnabled;
    if (soundOn) {
      if (type === "ENTRY" && score >= 80) playSignalSound();
      else if (type === "EXIT") playExitSound();
    }
  }, [sendNotification]);

  const notifyAutoTrade = useCallback((symbol: string, action: string, details: string) => {
    const title = `⚡ AUTO: ${symbol} — ${action}`;
    sendNotification(title, details, `qe-auto-${symbol}`);
  }, [sendNotification]);

  const notifyRisk = useCallback((message: string) => {
    sendNotification("⚠️ Risk Warning", message, `qe-risk-${Date.now()}`);
    if (useStore.getState().soundEnabled) playWarningSound();
  }, [sendNotification]);

  return {
    requestPermission, sendNotification, notifySignal, notifyAutoTrade, notifyRisk,
    playSignalSound, playExitSound, playWarningSound,
    isSupported: typeof window !== "undefined" && "Notification" in window,
    permission: permissionRef.current,
  };
}
