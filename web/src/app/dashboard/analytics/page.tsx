"use client";

import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>Analytics</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>Historical usage trends, top tools, and access patterns</p>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--pc-elevated)" }}
          >
            <BarChart3 className="w-5 h-5" strokeWidth={1.5} style={{ color: "var(--pc-muted)" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>Coming Soon</p>
          <p className="text-xs mt-1 max-w-xs leading-relaxed" style={{ color: "var(--pc-muted)" }}>
            Usage charts, per-server breakdowns, and trend analysis over custom date ranges are on the roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}
