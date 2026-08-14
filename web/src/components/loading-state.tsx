"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";

/* ── Inline spinner ──────────────────────────────────────────────────────── */

export function InlineSpinner({ size = 16, color = "var(--pc-primary)" }: { size?: number; color?: string }) {
  return (
    <Loader2
      size={size}
      style={{ color, animation: "spin 1s linear infinite" }}
    />
  );
}

/* ── Skeleton primitives ─────────────────────────────────────────────────── */

export function SkeletonBox({
  width = "100%",
  height = 16,
  radius = 6,
}: {
  width?: string | number;
  height?: number;
  radius?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: "var(--pc-elevated)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 16,
          padding: "10px 16px",
          borderBottom: "1px solid var(--pc-border)",
          background: "var(--pc-elevated)",
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBox key={i} height={11} width="60%" />
        ))}
      </div>
      {/* rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 16,
            padding: "13px 16px",
            borderBottom: r < rows - 1 ? "1px solid var(--pc-border)" : "none",
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBox key={c} height={13} width={c === 0 ? "80%" : c === cols - 1 ? "40%" : "65%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({
  count = 3,
  height = 100,
}: {
  count?: number;
  height?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            background: "var(--pc-surface)",
            border: "1px solid var(--pc-border)",
            borderRadius: 10,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SkeletonBox width={36} height={36} radius={9} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <SkeletonBox height={12} width="70%" />
              <SkeletonBox height={10} width="50%" />
            </div>
          </div>
          <SkeletonBox height={10} width="90%" />
          <SkeletonBox height={10} width="75%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 180 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <SkeletonBox height={12} width="40%" />
      <div style={{ flex: 1, background: "var(--pc-elevated)", borderRadius: 6 }} />
    </div>
  );
}

/* ── Long-running operation progress ─────────────────────────────────────── */

type StepStatus = "pending" | "running" | "done" | "error";

export interface OperationStep {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
}

interface ProgressOperationProps {
  title: string;
  steps: OperationStep[];
  onCancel?: () => void;
  estimatedMs?: number;
  completionMessage?: string;
  backgroundable?: boolean;
  onBackground?: () => void;
}

export function ProgressOperation({
  title,
  steps,
  onCancel,
  estimatedMs,
  completionMessage,
  backgroundable,
  onBackground,
}: ProgressOperationProps) {
  const [elapsed, setElapsed] = useState(0);
  const doneCount = steps.filter((s) => s.status === "done").length;
  const hasError = steps.some((s) => s.status === "error");
  const allDone = doneCount === steps.length && !hasError;
  const pct = Math.round((doneCount / steps.length) * 100);

  useEffect(() => {
    if (allDone || hasError) return;
    const t = setInterval(() => setElapsed((e) => e + 250), 250);
    return () => clearInterval(t);
  }, [allDone, hasError]);

  const estLabel = estimatedMs
    ? (() => {
        const remaining = Math.max(0, estimatedMs - elapsed);
        if (remaining < 1000) return "Almost done…";
        if (remaining < 60_000) return `~${Math.ceil(remaining / 1000)}s remaining`;
        return `~${Math.ceil(remaining / 60_000)}m remaining`;
      })()
    : null;

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 12,
        padding: 24,
        maxWidth: 480,
        width: "100%",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {allDone ? (
            <CheckCircle2 size={18} style={{ color: "var(--pc-success)" }} />
          ) : hasError ? (
            <AlertTriangle size={18} style={{ color: "var(--pc-critical)" }} />
          ) : (
            <InlineSpinner size={18} />
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-foreground)" }}>
            {allDone ? (completionMessage ?? "Complete") : hasError ? "Operation failed" : title}
          </span>
        </div>
        {onCancel && !allDone && (
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", display: "flex", alignItems: "center" }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* progress bar */}
      <div
        style={{
          height: 4,
          background: "var(--pc-elevated)",
          borderRadius: 9999,
          marginBottom: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 9999,
            background: hasError ? "var(--pc-critical)" : allDone ? "var(--pc-success)" : "var(--pc-primary)",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step) => (
          <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              {step.status === "done" && <CheckCircle2 size={14} style={{ color: "var(--pc-success)" }} />}
              {step.status === "running" && <InlineSpinner size={14} />}
              {step.status === "error" && <AlertTriangle size={14} style={{ color: "var(--pc-critical)" }} />}
              {step.status === "pending" && (
                <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--pc-border)", marginTop: 0 }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: step.status === "running" ? 600 : 400,
                  color: step.status === "pending" ? "var(--pc-muted)" : step.status === "error" ? "var(--pc-critical)" : "var(--pc-foreground)",
                }}
              >
                {step.label}
              </div>
              {step.detail && step.status === "running" && (
                <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 1 }}>{step.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* footer */}
      {(estLabel || backgroundable) && !allDone && !hasError && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--pc-border)" }}>
          {estLabel && (
            <span style={{ fontSize: 11, color: "var(--pc-muted)" }}>{estLabel}</span>
          )}
          {backgroundable && onBackground && (
            <button
              onClick={onBackground}
              style={{
                fontSize: 11,
                color: "var(--pc-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                marginLeft: "auto",
              }}
            >
              Run in background →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Portcullis gate animation (brand loader) ────────────────────────────── */

export function PortcullisLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        gap: 16,
      }}
    >
      {/* animated grid (simplified portcullis grille) */}
      <svg width={48} height={48} viewBox="0 0 48 48" fill="none">
        <style>{`
          @keyframes pc-bar-v { 0%,100%{opacity:.25} 50%{opacity:1} }
          @keyframes pc-bar-h { 0%,100%{opacity:.25} 50%{opacity:1} }
          .v1{animation:pc-bar-v 1.2s ease-in-out infinite 0s}
          .v2{animation:pc-bar-v 1.2s ease-in-out infinite .2s}
          .v3{animation:pc-bar-v 1.2s ease-in-out infinite .4s}
          .h1{animation:pc-bar-h 1.2s ease-in-out infinite .1s}
          .h2{animation:pc-bar-h 1.2s ease-in-out infinite .3s}
          .h3{animation:pc-bar-h 1.2s ease-in-out infinite .5s}
        `}</style>
        {/* vertical bars */}
        <rect className="v1" x="8"  y="4" width="6" height="40" rx="3" fill="#2DD4A7"/>
        <rect className="v2" x="21" y="4" width="6" height="40" rx="3" fill="#2DD4A7"/>
        <rect className="v3" x="34" y="4" width="6" height="40" rx="3" fill="#2DD4A7"/>
        {/* horizontal bars */}
        <rect className="h1" x="4" y="8"  width="40" height="5" rx="2.5" fill="#48B8E8" opacity=".7"/>
        <rect className="h2" x="4" y="21" width="40" height="5" rx="2.5" fill="#48B8E8" opacity=".7"/>
        <rect className="h3" x="4" y="34" width="40" height="5" rx="2.5" fill="#48B8E8" opacity=".7"/>
      </svg>
      <span style={{ fontSize: 13, color: "var(--pc-muted)" }}>{label}</span>
    </div>
  );
}

/* ── Pre-built operation configurations ──────────────────────────────────── */

export function buildDiscoverToolsSteps(status: "running" | "done" | "error"): OperationStep[] {
  if (status === "done") {
    return [
      { id: "connect",  label: "Connecting to MCP server",        status: "done" },
      { id: "init",     label: "Sending tools/list request",       status: "done" },
      { id: "parse",    label: "Parsing tool schemas",             status: "done" },
      { id: "store",    label: "Storing tool definitions",         status: "done" },
    ];
  }
  if (status === "error") {
    return [
      { id: "connect",  label: "Connecting to MCP server",        status: "done" },
      { id: "init",     label: "Sending tools/list request",       status: "error", detail: "Connection timed out after 10s" },
      { id: "parse",    label: "Parsing tool schemas",             status: "pending" },
      { id: "store",    label: "Storing tool definitions",         status: "pending" },
    ];
  }
  return [
    { id: "connect",  label: "Connecting to MCP server",          status: "done" },
    { id: "init",     label: "Sending tools/list request",         status: "running", detail: "Waiting for server response…" },
    { id: "parse",    label: "Parsing tool schemas",               status: "pending" },
    { id: "store",    label: "Storing tool definitions",           status: "pending" },
  ];
}

export function buildHealthCheckSteps(status: "running" | "done" | "error"): OperationStep[] {
  if (status === "done") {
    return [
      { id: "dns",    label: "Resolving hostname",       status: "done" },
      { id: "tcp",    label: "Opening TCP connection",   status: "done" },
      { id: "http",   label: "Sending HTTP health check",status: "done" },
      { id: "verify", label: "Verifying response",       status: "done" },
    ];
  }
  if (status === "error") {
    return [
      { id: "dns",    label: "Resolving hostname",       status: "done" },
      { id: "tcp",    label: "Opening TCP connection",   status: "error", detail: "Connection refused on port 443" },
      { id: "http",   label: "Sending HTTP health check",status: "pending" },
      { id: "verify", label: "Verifying response",       status: "pending" },
    ];
  }
  return [
    { id: "dns",    label: "Resolving hostname",         status: "done" },
    { id: "tcp",    label: "Opening TCP connection",     status: "running", detail: "Establishing TLS handshake…" },
    { id: "http",   label: "Sending HTTP health check",  status: "pending" },
    { id: "verify", label: "Verifying response",         status: "pending" },
  ];
}

export function buildExportSteps(status: "running" | "done"): OperationStep[] {
  if (status === "done") {
    return [
      { id: "query",    label: "Querying audit log",            status: "done" },
      { id: "filter",   label: "Applying filters",              status: "done" },
      { id: "format",   label: "Formatting as CSV",             status: "done" },
      { id: "download", label: "Preparing download",            status: "done" },
    ];
  }
  return [
    { id: "query",    label: "Querying audit log",              status: "done" },
    { id: "filter",   label: "Applying filters",                status: "done" },
    { id: "format",   label: "Formatting as CSV",               status: "running", detail: "Processing 12,450 records…" },
    { id: "download", label: "Preparing download",              status: "pending" },
  ];
}
