"use client";

import { useState, useEffect } from "react";

export default function HydrationGuard({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-accent-green font-mono text-sm animate-pulse">
          Loading QuantEdge...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
