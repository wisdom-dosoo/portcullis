"use client";

import { AlertTriangle, Info } from "lucide-react";

/**
 * Ship-checklist: every screen without full backend persistence must say so.
 * Security-product rule: never render operational-looking fake data as live.
 *
 * - `live`: all widgets are backed by API data — no banner rendered.
 * - `mixed`: some widgets live, some local/empty — amber banner naming both.
 * - `local-only`: no backend persistence yet — grey banner, empty states only.
 */
export function DemoBanner({
  mode,
  live = "",
  local = "",
}: {
  mode: "live" | "mixed" | "local-only";
  live?: string;
  local?: string;
}) {
  if (mode === "live") return null;
  const isMixed = mode === "mixed";
  return (
    <div
      data-testid="demo-banner"
      className="mb-4 rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2"
      style={{
        background: isMixed ? "rgba(244,185,66,0.10)" : "rgba(139,152,167,0.10)",
        borderColor: isMixed ? "rgba(244,185,66,0.35)" : "rgba(139,152,167,0.35)",
        color: isMixed ? "#F4B942" : "var(--pc-muted)",
      }}
      role="note"
      aria-label={isMixed ? "Partial demo data" : "Local-only demo data"}
    >
      {isMixed ? (
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
      ) : (
        <Info className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
      )}
      <span className="font-semibold">
        {isMixed ? "Partial demo data" : "Local only — no backend persistence yet"}
      </span>
      <span style={{ color: "var(--pc-muted)" }}>
        {isMixed
          ? `Live: ${live}. Local: ${local}.`
          : `${local} Do not use for compliance or on-call decisions.`}
      </span>
    </div>
  );
}
