"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Wrench,
  Search,
  Grid2x2,
  List,
  Server as ServerIcon,
  Hash,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Filter,
  X,
  Info,
  Code2,
  BarChart2,
  Lock,
  Clock,
} from "lucide-react";
import {
  useListServersV1ServersGet,
  useListAuditLogsV1AuditGet,
  type ServerView,
  type AuditLogView,
} from "@/api/generated";
import { getToken } from "@/lib/auth";

// ─── Types ─────────────────────────────────────────────────────────────────

interface McpToolProperty {
  type?: string;
  description?: string;
  enum?: string[];
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, McpToolProperty>;
    required?: string[];
  };
}

type RiskLevel = "low" | "medium" | "high" | "critical";

interface EnrichedTool extends McpTool {
  serverSlug: string;
  riskLevel: RiskLevel;
  paramCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchTools(slug: string, token: string | null): Promise<McpTool[]> {
  const res = await fetch(`${API_BASE}/mcp/${slug}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result?.tools ?? [];
}

function deriveRiskLevel(tool: McpTool): RiskLevel {
  const n = tool.name.toLowerCase();
  const d = (tool.description ?? "").toLowerCase();
  const text = `${n} ${d}`;

  if (/\b(delete|drop|destroy|truncate|purge|wipe|remove|kill)\b/.test(text)) {
    return "critical";
  }
  if (/\b(create|write|update|modify|patch|post|insert|execute|run|send)\b/.test(text)) {
    return "high";
  }
  const paramCount = tool.inputSchema?.properties
    ? Object.keys(tool.inputSchema.properties).length
    : 0;
  if (/\b(search|query|list|find|get)\b/.test(text) && paramCount > 3) {
    return "medium";
  }
  return "low";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function riskConfig(level: RiskLevel): { bg: string; color: string; label: string; icon: React.ReactNode } {
  switch (level) {
    case "critical":
      return {
        bg: "rgba(240,93,94,0.12)",
        color: "#F05D5E",
        label: "Critical",
        icon: <ShieldAlert style={{ width: 11, height: 11 }} strokeWidth={1.75} />,
      };
    case "high":
      return {
        bg: "rgba(244,185,66,0.12)",
        color: "#F4B942",
        label: "High",
        icon: <AlertTriangle style={{ width: 11, height: 11 }} strokeWidth={1.75} />,
      };
    case "medium":
      return {
        bg: "rgba(72,184,232,0.12)",
        color: "#48B8E8",
        label: "Medium",
        icon: <Shield style={{ width: 11, height: 11 }} strokeWidth={1.75} />,
      };
    case "low":
      return {
        bg: "rgba(53,200,138,0.12)",
        color: "#35C88A",
        label: "Low",
        icon: <ShieldCheck style={{ width: 11, height: 11 }} strokeWidth={1.75} />,
      };
  }
}

function iconBgForRisk(level: RiskLevel): string {
  switch (level) {
    case "critical": return "rgba(240,93,94,0.15)";
    case "high": return "rgba(244,185,66,0.15)";
    case "medium": return "rgba(72,184,232,0.15)";
    case "low": return "rgba(45,212,167,0.15)";
  }
}

function iconColorForRisk(level: RiskLevel): string {
  switch (level) {
    case "critical": return "#F05D5E";
    case "high": return "#F4B942";
    case "medium": return "#48B8E8";
    case "low": return "#2DD4A7";
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  const cfg = riskConfig(level);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
        lineHeight: 1.6,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function AccessDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        color: active ? "#35C88A" : "#F05D5E",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? "#35C88A" : "#F05D5E",
          flexShrink: 0,
        }}
      />
      {active ? "Available" : "Restricted"}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      {[60, 90, 75].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 16 : 12,
            width: `${w}%`,
            background: "var(--pc-elevated)",
            borderRadius: 6,
            marginBottom: i < 2 ? 10 : 0,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 16,
        padding: 64,
        textAlign: "center",
        gridColumn: "1 / -1",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "var(--pc-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <Wrench style={{ width: 20, height: 20, color: "var(--pc-muted)" }} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>{message}</p>
      <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>{sub}</p>
    </div>
  );
}

// ─── ToolCard ──────────────────────────────────────────────────────────────

function ToolCard({
  tool,
  server,
  invocations,
  lastUsed,
  onSelect,
  selected,
}: {
  tool: EnrichedTool;
  server: ServerView;
  invocations: number;
  lastUsed: string | null;
  onSelect: () => void;
  selected: boolean;
}) {
  const isActive = server.status === "active";

  return (
    <div
      onClick={onSelect}
      style={{
        background: "var(--pc-surface)",
        border: `1px solid ${selected ? "var(--pc-primary)" : "var(--pc-border)"}`,
        borderRadius: 16,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? "0 0 0 1px var(--pc-primary)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--pc-primary)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--pc-border)";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: iconBgForRisk(tool.riskLevel),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Wrench
              style={{ width: 15, height: 15, color: iconColorForRisk(tool.riskLevel) }}
              strokeWidth={1.75}
            />
          </div>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--pc-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tool.name}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <RiskBadge level={tool.riskLevel} />
          <AccessDot active={isActive} />
        </div>
      </div>

      {/* Server slug */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <ServerIcon style={{ width: 12, height: 12, color: "var(--pc-muted)" }} strokeWidth={1.5} />
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--pc-muted)" }}>
          {tool.serverSlug}
        </span>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 12,
          color: "var(--pc-muted)",
          lineHeight: 1.6,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          flexGrow: 1,
        }}
      >
        {tool.description ?? "No description provided."}
      </p>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--pc-border)" }} />

      {/* Footer stats */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--pc-muted)" }}>
            <Hash style={{ width: 11, height: 11 }} strokeWidth={1.5} />
            {tool.paramCount} param{tool.paramCount !== 1 ? "s" : ""}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--pc-muted)" }}>
            <BarChart2 style={{ width: 11, height: 11 }} strokeWidth={1.5} />
            {invocations} call{invocations !== 1 ? "s" : ""}
          </span>
          {lastUsed && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--pc-muted)" }}>
              <Clock style={{ width: 11, height: 11 }} strokeWidth={1.5} />
              {relativeTime(lastUsed)}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            color: "var(--pc-primary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          View details
          <ChevronRight style={{ width: 12, height: 12 }} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ─── Table View ────────────────────────────────────────────────────────────

function ToolTable({
  tools,
  servers,
  auditMap,
  onSelect,
  selectedTool,
}: {
  tools: EnrichedTool[];
  servers: ServerView[];
  auditMap: Map<string, { count: number; lastUsed: string | null }>;
  onSelect: (tool: EnrichedTool) => void;
  selectedTool: EnrichedTool | null;
}) {
  const serverMap = useMemo(() => {
    const m = new Map<string, ServerView>();
    servers.forEach((s) => m.set(s.slug, s));
    return m;
  }, [servers]);

  const th: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--pc-muted)",
    textAlign: "left",
    borderBottom: "1px solid var(--pc-border)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 13,
    color: "var(--pc-foreground)",
    borderBottom: "1px solid var(--pc-border)",
    verticalAlign: "middle",
  };

  return (
    <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--pc-border)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--pc-elevated)" }}>
            <th style={th}>Tool Name</th>
            <th style={th}>Server</th>
            <th style={th}>Risk</th>
            <th style={{ ...th, textAlign: "center" }}>Params</th>
            <th style={{ ...th, textAlign: "center" }}>Invocations</th>
            <th style={th}>Last Used</th>
            <th style={th}>Access</th>
            <th style={{ ...th, textAlign: "center" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => {
            const key = `${tool.serverSlug}::${tool.name}`;
            const stats = auditMap.get(key);
            const server = serverMap.get(tool.serverSlug);
            const isActive = server?.status === "active";
            const isSelected = selectedTool?.name === tool.name && selectedTool?.serverSlug === tool.serverSlug;

            return (
              <tr
                key={key}
                onClick={() => onSelect(tool)}
                style={{
                  cursor: "pointer",
                  background: isSelected ? "rgba(45,212,167,0.05)" : "var(--pc-surface)",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "var(--pc-elevated)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "var(--pc-surface)";
                }}
              >
                <td style={td}>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--pc-foreground)" }}>
                    {tool.name}
                  </span>
                </td>
                <td style={td}>
                  <span
                    style={{
                      display: "inline-block",
                      fontFamily: "monospace",
                      fontSize: 11,
                      background: "var(--pc-elevated)",
                      border: "1px solid var(--pc-border)",
                      borderRadius: 6,
                      padding: "2px 8px",
                      color: "var(--pc-muted)",
                    }}
                  >
                    {tool.serverSlug}
                  </span>
                </td>
                <td style={td}>
                  <RiskBadge level={tool.riskLevel} />
                </td>
                <td style={{ ...td, textAlign: "center", color: "var(--pc-muted)" }}>
                  {tool.paramCount}
                </td>
                <td style={{ ...td, textAlign: "center", color: "var(--pc-muted)" }}>
                  {stats?.count ?? 0}
                </td>
                <td style={{ ...td, color: "var(--pc-muted)", fontSize: 12 }}>
                  {stats?.lastUsed ? relativeTime(stats.lastUsed) : "Never"}
                </td>
                <td style={td}>
                  <AccessDot active={isActive} />
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelect(tool); }}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--pc-primary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 8px",
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────────────

function DetailPanel({
  tool,
  server,
  auditMap,
  onClose,
}: {
  tool: EnrichedTool;
  server: ServerView | undefined;
  auditMap: Map<string, { count: number; lastUsed: string | null; successCount: number; uniqueCallers: Set<string> }>;
  onClose: () => void;
}) {
  const key = `${tool.serverSlug}::${tool.name}`;
  const stats = auditMap.get(key);
  const properties = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];
  const hasParams = Object.keys(properties).length > 0;
  const successRate = stats && stats.count > 0
    ? Math.round((stats.successCount / stats.count) * 100)
    : null;

  const sectionLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--pc-muted)",
    marginBottom: 10,
  };

  return (
    <div
      style={{
        width: 384,
        flexShrink: 0,
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        maxHeight: "calc(100vh - 120px)",
        position: "sticky",
        top: 24,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--pc-border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--pc-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tool.name}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 6,
                padding: "1px 7px",
                color: "var(--pc-muted)",
              }}
            >
              {tool.serverSlug}
            </span>
            <RiskBadge level={tool.riskLevel} />
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X style={{ width: 14, height: 14, color: "var(--pc-muted)" }} strokeWidth={2} />
        </button>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--pc-border)",
          display: "flex",
          gap: 8,
        }}
      >
        <Link
          href={`/dashboard/playground?server=${encodeURIComponent(tool.serverSlug)}&tool=${encodeURIComponent(tool.name)}`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#0C1116",
            background: "var(--pc-primary)",
            borderRadius: 8,
            padding: "7px 12px",
            textDecoration: "none",
          }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} strokeWidth={2} />
          Try in Playground
        </Link>
        <Link
          href={`/dashboard/tools/${tool.serverSlug}/${encodeURIComponent(tool.name)}`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--pc-foreground)",
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 8,
            padding: "7px 12px",
            textDecoration: "none",
          }}
        >
          <ChevronRight style={{ width: 12, height: 12 }} strokeWidth={2} />
          Full detail page
        </Link>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "20px" }}>

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Description</p>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", lineHeight: 1.65 }}>
            {tool.description ?? "No description provided."}
          </p>
        </div>

        {/* Input Parameters */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Input Parameters</p>
          {hasParams ? (
            <div
              style={{
                border: "1px solid var(--pc-border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--pc-elevated)" }}>
                    {["Name", "Type", "Req", "Description"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "7px 10px",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--pc-muted)",
                          textAlign: "left",
                          borderBottom: "1px solid var(--pc-border)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(properties).map(([name, prop], idx) => (
                    <tr
                      key={name}
                      style={{
                        background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                      }}
                    >
                      <td
                        style={{
                          padding: "7px 10px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "var(--pc-foreground)",
                          fontWeight: 600,
                          borderBottom: idx < Object.keys(properties).length - 1 ? "1px solid var(--pc-border)" : "none",
                        }}
                      >
                        {name}
                        {required.includes(name) && (
                          <span style={{ color: "#F05D5E", marginLeft: 2 }}>*</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "7px 10px",
                          fontSize: 11,
                          color: "#48B8E8",
                          fontFamily: "monospace",
                          borderBottom: idx < Object.keys(properties).length - 1 ? "1px solid var(--pc-border)" : "none",
                        }}
                      >
                        {prop.type ?? "any"}
                      </td>
                      <td
                        style={{
                          padding: "7px 10px",
                          fontSize: 11,
                          color: required.includes(name) ? "#F05D5E" : "var(--pc-muted)",
                          borderBottom: idx < Object.keys(properties).length - 1 ? "1px solid var(--pc-border)" : "none",
                        }}
                      >
                        {required.includes(name) ? "Yes" : "No"}
                      </td>
                      <td
                        style={{
                          padding: "7px 10px",
                          fontSize: 11,
                          color: "var(--pc-muted)",
                          lineHeight: 1.5,
                          borderBottom: idx < Object.keys(properties).length - 1 ? "1px solid var(--pc-border)" : "none",
                          maxWidth: 140,
                        }}
                      >
                        {prop.description ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--pc-muted)", fontStyle: "italic" }}>
              No input parameters.
            </p>
          )}
        </div>

        {/* Output Schema note */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Output Schema</p>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <Info style={{ width: 13, height: 13, color: "var(--pc-muted)", marginTop: 1, flexShrink: 0 }} strokeWidth={1.75} />
            <p style={{ fontSize: 12, color: "var(--pc-muted)", lineHeight: 1.55 }}>
              MCP tools/list does not expose output schemas. View the full detail page for inferred output documentation.
            </p>
          </div>
        </div>

        {/* Usage Stats */}
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Usage Stats</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {[
              { label: "Total Invocations", value: stats?.count ?? 0 },
              { label: "Success Rate", value: successRate !== null ? `${successRate}%` : "N/A" },
              { label: "Last Invoked", value: stats?.lastUsed ? relativeTime(stats.lastUsed) : "Never" },
              { label: "Unique Callers", value: stats?.uniqueCallers.size ?? 0 },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "var(--pc-elevated)",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pc-muted)", marginBottom: 4 }}>
                  {label}
                </p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--pc-foreground)" }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <p style={sectionLabel}>Quick Actions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Link
              href={`/dashboard/tools/${tool.serverSlug}/${encodeURIComponent(tool.name)}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 9,
                padding: "10px 14px",
                textDecoration: "none",
                transition: "border-color 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--pc-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--pc-border)")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Code2 style={{ width: 13, height: 13, color: "var(--pc-primary)" }} strokeWidth={1.75} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--pc-foreground)" }}>
                  Full detail page
                </span>
              </div>
              <ChevronRight style={{ width: 13, height: 13, color: "var(--pc-muted)" }} strokeWidth={1.75} />
            </Link>
            <Link
              href={`/dashboard/audit?tool=${encodeURIComponent(tool.name)}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                borderRadius: 9,
                padding: "10px 14px",
                textDecoration: "none",
                transition: "border-color 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--pc-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--pc-border)")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2 style={{ width: 13, height: 13, color: "var(--pc-secondary)" }} strokeWidth={1.75} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--pc-foreground)" }}>
                  View audit logs
                </span>
              </div>
              <ChevronRight style={{ width: 13, height: 13, color: "var(--pc-muted)" }} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Per-server tool fetcher hook ──────────────────────────────────────────

function useServerTools(slug: string, enabled: boolean) {
  return useQuery<McpTool[], Error>({
    queryKey: ["mcp-tools", slug],
    queryFn: () => fetchTools(slug, getToken()),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });
}

// ─── ServerToolsLoader — renders nothing, accumulates results ───────────────

// We need a hook-based approach to fan out queries. Since hooks can't be
// called conditionally in loops, we use a component per server that calls
// one query and reports upward via a callback.

type ServerResult =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; tools: McpTool[] };

function ServerToolsFetcher({
  slug,
  onResult,
}: {
  slug: string;
  onResult: (slug: string, result: ServerResult) => void;
}) {
  const { data, isLoading, isError, error } = useServerTools(slug, true);

  useEffect(() => {
    if (isLoading) {
      onResult(slug, { status: "loading" });
    } else if (isError) {
      onResult(slug, { status: "error", error: (error as Error)?.message ?? "Unknown error" });
    } else {
      onResult(slug, { status: "success", tools: data ?? [] });
    }
  }, [slug, data, isLoading, isError, error, onResult]);

  return null;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [selectedTool, setSelectedTool] = useState<EnrichedTool | null>(null);

  // Server results accumulator — keyed by slug
  const [serverResults, setServerResults] = useState<Map<string, ServerResult>>(new Map());

  const handleServerResult = useCallback((slug: string, result: ServerResult) => {
    setServerResults((prev) => {
      const existing = prev.get(slug);
      // Avoid infinite re-render: only update if status or data changed
      if (
        existing?.status === result.status &&
        (result.status !== "success" ||
          (existing as Extract<ServerResult, { status: "success" }>).tools === result.tools)
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(slug, result);
      return next;
    });
  }, []);

  // Servers
  const { data: serversResp, isLoading: serversLoading } = useListServersV1ServersGet();
  const servers = (serversResp?.data ?? []) as ServerView[];
  const serverMap = useMemo(() => {
    const m = new Map<string, ServerView>();
    servers.forEach((s) => m.set(s.slug, s));
    return m;
  }, [servers]);

  // Audit logs — limit 200 (API max), aggregate client-side
  const { data: auditResp } = useListAuditLogsV1AuditGet({ limit: 200 });
  const auditLogs = (auditResp?.data ?? []) as AuditLogView[];

  const auditMap = useMemo(() => {
    const m = new Map<string, { count: number; lastUsed: string | null; successCount: number; uniqueCallers: Set<string> }>();
    for (const log of auditLogs) {
      if (!log.server_slug || !log.tool_name) continue;
      const key = `${log.server_slug}::${log.tool_name}`;
      if (!m.has(key)) {
        m.set(key, { count: 0, lastUsed: null, successCount: 0, uniqueCallers: new Set() });
      }
      const entry = m.get(key)!;
      entry.count++;
      if (log.outcome === "allow" || log.outcome === "success") {
        entry.successCount++;
      }
      if (!entry.lastUsed || log.created_at > entry.lastUsed) {
        entry.lastUsed = log.created_at;
      }
      if (log.subject_id) {
        entry.uniqueCallers.add(log.subject_id);
      }
    }
    return m;
  }, [auditLogs]);

  // Enriched tools from all servers
  const allTools: EnrichedTool[] = useMemo(() => {
    const result: EnrichedTool[] = [];
    for (const [slug, sr] of serverResults) {
      if (sr.status === "success") {
        for (const tool of sr.tools) {
          result.push({
            ...tool,
            serverSlug: slug,
            riskLevel: deriveRiskLevel(tool),
            paramCount: tool.inputSchema?.properties
              ? Object.keys(tool.inputSchema.properties).length
              : 0,
          });
        }
      }
    }
    return result;
  }, [serverResults]);

  // Filtered tools
  const filteredTools = useMemo(() => {
    const q = search.toLowerCase();
    return allTools.filter((tool) => {
      if (q && !tool.name.toLowerCase().includes(q) && !(tool.description ?? "").toLowerCase().includes(q)) return false;
      if (serverFilter !== "all" && tool.serverSlug !== serverFilter) return false;
      if (riskFilter !== "all" && tool.riskLevel !== riskFilter) return false;
      if (accessFilter !== "all") {
        const server = serverMap.get(tool.serverSlug);
        const isActive = server?.status === "active";
        if (accessFilter === "available" && !isActive) return false;
        if (accessFilter === "restricted" && isActive) return false;
      }
      return true;
    });
  }, [allTools, search, serverFilter, riskFilter, accessFilter, serverMap]);

  // Loading/error states per server
  const loadingServers = servers.filter((s) => {
    const r = serverResults.get(s.slug);
    return !r || r.status === "loading";
  });
  const errorServers = servers.filter((s) => serverResults.get(s.slug)?.status === "error");

  const activeServerCount = new Set(filteredTools.map((t) => t.serverSlug)).size;

  // Select/deselect
  const handleSelect = useCallback((tool: EnrichedTool) => {
    setSelectedTool((prev) =>
      prev?.name === tool.name && prev?.serverSlug === tool.serverSlug ? null : tool
    );
  }, []);

  const inputStyle: React.CSSProperties = {
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 9,
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--pc-foreground)",
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0 }}>
      {/* Mount one fetcher component per server */}
      {servers.map((s) => (
        <ServerToolsFetcher key={s.slug} slug={s.slug} onResult={handleServerResult} />
      ))}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--pc-foreground)",
              margin: 0,
            }}
          >
            Tool Explorer
          </h1>
          <p style={{ fontSize: 13, color: "var(--pc-muted)", marginTop: 4 }}>
            Browse tools across all MCP servers
          </p>
        </div>

        {/* View mode toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--pc-elevated)",
            border: "1px solid var(--pc-border)",
            borderRadius: 9,
            padding: 3,
            gap: 2,
          }}
        >
          {(["table", "grid"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              title={mode === "grid" ? "Grid view" : "Table view"}
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                background: viewMode === mode ? "var(--pc-surface)" : "transparent",
                border: viewMode === mode ? "1px solid var(--pc-border)" : "1px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: viewMode === mode ? "var(--pc-foreground)" : "var(--pc-muted)",
                transition: "all 0.12s",
              }}
            >
              {mode === "grid" ? (
                <Grid2x2 style={{ width: 14, height: 14 }} strokeWidth={1.75} />
              ) : (
                <List style={{ width: 14, height: 14 }} strokeWidth={1.75} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filter / Search bar */}
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
          <Search
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 13,
              height: 13,
              color: "var(--pc-muted)",
              pointerEvents: "none",
            }}
            strokeWidth={1.75}
          />
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              ...inputStyle,
              width: "100%",
              paddingLeft: 32,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Server filter */}
        <div style={{ position: "relative" }}>
          <Filter
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 12,
              height: 12,
              color: "var(--pc-muted)",
              pointerEvents: "none",
            }}
            strokeWidth={1.75}
          />
          <select
            value={serverFilter}
            onChange={(e) => setServerFilter(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 28, appearance: "none", cursor: "pointer" }}
          >
            <option value="all">All Servers</option>
            {servers.map((s) => (
              <option key={s.slug} value={s.slug}>{s.slug}</option>
            ))}
          </select>
        </div>

        {/* Risk filter */}
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
        >
          <option value="all">All Risk Levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>

        {/* Access filter */}
        <select
          value={accessFilter}
          onChange={(e) => setAccessFilter(e.target.value)}
          style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
        >
          <option value="all">All Status</option>
          <option value="available">Available</option>
          <option value="restricted">Restricted</option>
        </select>

        {/* Results count */}
        <span
          style={{
            fontSize: 12,
            color: "var(--pc-muted)",
            whiteSpace: "nowrap",
            marginLeft: "auto",
          }}
        >
          <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>{filteredTools.length}</span>
          {" "}tool{filteredTools.length !== 1 ? "s" : ""} across{" "}
          <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>{activeServerCount}</span>
          {" "}server{activeServerCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error banners for servers that failed */}
      {errorServers.map((s) => {
        const r = serverResults.get(s.slug) as Extract<ServerResult, { status: "error" }>;
        return (
          <div
            key={s.slug}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(240,93,94,0.08)",
              border: "1px solid rgba(240,93,94,0.25)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 10,
              fontSize: 12,
            }}
          >
            <AlertCircle style={{ width: 14, height: 14, color: "#F05D5E", flexShrink: 0 }} strokeWidth={1.75} />
            <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#F05D5E" }}>{s.slug}</span>
            <span style={{ color: "var(--pc-muted)" }}>— failed to load tools: {r.error}</span>
          </div>
        );
      })}

      {/* Two-panel layout */}
      <div
        style={{
          display: "flex",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        {/* Left panel — tool list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {serversLoading || loadingServers.length > 0 ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 48,
                      background: "var(--pc-elevated)",
                      borderRadius: 8,
                      border: "1px solid var(--pc-border)",
                    }}
                  />
                ))}
              </div>
            )
          ) : filteredTools.length === 0 ? (
            <EmptyState
              message="No tools found"
              sub={
                allTools.length === 0
                  ? "No MCP servers are exposing tools yet."
                  : "Try adjusting your search or filters."
              }
            />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTools.map((tool) => {
                const key = `${tool.serverSlug}::${tool.name}`;
                const stats = auditMap.get(key);
                const server = serverMap.get(tool.serverSlug)!;
                return (
                  <ToolCard
                    key={key}
                    tool={tool}
                    server={server}
                    invocations={stats?.count ?? 0}
                    lastUsed={stats?.lastUsed ?? null}
                    onSelect={() => handleSelect(tool)}
                    selected={
                      selectedTool?.name === tool.name &&
                      selectedTool?.serverSlug === tool.serverSlug
                    }
                  />
                );
              })}
            </div>
          ) : (
            <ToolTable
              tools={filteredTools}
              servers={servers}
              auditMap={auditMap}
              onSelect={handleSelect}
              selectedTool={selectedTool}
            />
          )}
        </div>

        {/* Right detail panel */}
        {selectedTool && (
          <DetailPanel
            tool={selectedTool}
            server={serverMap.get(selectedTool.serverSlug)}
            auditMap={auditMap}
            onClose={() => setSelectedTool(null)}
          />
        )}
      </div>
    </div>
  );
}
