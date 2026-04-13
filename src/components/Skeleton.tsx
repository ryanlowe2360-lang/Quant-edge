"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-bg-hover rounded ${className}`} />
  );
}

export function SignalCardSkeleton() {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div>
          <Skeleton className="w-16 h-5 mb-1.5" />
          <Skeleton className="w-24 h-3" />
        </div>
        <Skeleton className="w-14 h-10 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="w-full h-2" />
        <Skeleton className="w-3/4 h-2" />
        <Skeleton className="w-2/3 h-2" />
        <Skeleton className="w-4/5 h-2" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Market Pulse skeleton */}
      <Skeleton className="w-full h-14 rounded-xl" />

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* Heatmap skeleton */}
      <div>
        <Skeleton className="w-40 h-4 mb-2" />
        <div className="flex flex-wrap gap-1.5">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="w-16 h-7 rounded" />
          ))}
        </div>
      </div>

      {/* Signal cards skeleton */}
      <div>
        <Skeleton className="w-32 h-5 mb-3" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <SignalCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <Skeleton key={i} className="w-full h-14 rounded-xl" />
      ))}
    </div>
  );
}
