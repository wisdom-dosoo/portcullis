"use client";

import Link from "next/link";
import { useListServersV1ServersGet, type ServerView } from "@/api/generated";
import { Wrench, Server, ArrowRight, Globe, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ── status pill ─────────────────────────────────────────────────── */

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={
        active
          ? { background: "rgba(45,212,167,0.12)", color: "#2DD4A7" }
          : { background: "rgba(139,152,167,0.1)", color: "var(--pc-muted)" }
      }
    >
      {active ? (
        <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
      ) : (
        <XCircle className="w-3 h-3" strokeWidth={2.5} />
      )}
      {status}
    </span>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminToolsPage() {
  const { data: resp, isLoading } = useListServersV1ServersGet();
  const servers = (resp?.data ?? []) as ServerView[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Tool Registry
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Discover tools across all registered MCP servers
        </p>
      </div>

      {/* Info banner */}
      <div
        className="rounded-2xl border px-5 py-4 flex items-start gap-3"
        style={{
          background: "rgba(45,212,167,0.06)",
          borderColor: "rgba(45,212,167,0.2)",
        }}
      >
        <Wrench
          className="w-4 h-4 mt-0.5 flex-shrink-0"
          strokeWidth={1.75}
          style={{ color: "#2DD4A7" }}
        />
        <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
          Tools are discovered per-server. Click{" "}
          <span className="font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Browse Tools →
          </span>{" "}
          on any row to explore that server&apos;s available tools in the org dashboard.
        </p>
      </div>

      {/* Stats bar */}
      {!isLoading && (
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(72,184,232,0.15)" }}
          >
            <Server className="w-4 h-4" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
          </div>
          <p className="text-sm" style={{ color: "var(--pc-muted)" }}>
            <span
              className="font-semibold tabular-nums"
              style={{ color: "var(--pc-foreground)" }}
            >
              {servers.length}
            </span>{" "}
            server{servers.length !== 1 ? "s" : ""} registered
          </p>
        </div>
      )}

      {/* Servers table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-12 w-full rounded-lg"
                style={{ background: "var(--pc-elevated)" }}
              />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--pc-elevated)" }}
            >
              <Wrench
                className="w-5 h-5"
                strokeWidth={1.5}
                style={{ color: "var(--pc-muted)", opacity: 0.5 }}
              />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              No servers registered
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              Register an MCP server to start discovering tools
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead
                style={{
                  background: "var(--pc-elevated)",
                  borderBottom: "1px solid var(--pc-border)",
                }}
              >
                <tr>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Server
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Upstream URL
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Status
                  </th>
                  <th
                    className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Tools
                  </th>
                </tr>
              </thead>
              <tbody>
                {servers.map((s) => (
                  <tr
                    key={s.slug}
                    className="transition-colors group"
                    style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "";
                    }}
                  >
                    {/* Server */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(72,184,232,0.15)" }}
                        >
                          <Server
                            className="w-3.5 h-3.5"
                            strokeWidth={1.75}
                            style={{ color: "#48B8E8" }}
                          />
                        </div>
                        <div>
                          <p
                            className="font-mono font-medium text-xs"
                            style={{ color: "var(--pc-foreground)" }}
                          >
                            {s.slug}
                          </p>
                          {s.name && s.name !== s.slug && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
                              {s.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Upstream URL */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Globe
                          className="w-3.5 h-3.5 flex-shrink-0"
                          strokeWidth={1.5}
                          style={{ color: "var(--pc-muted)" }}
                        />
                        <span
                          className="truncate max-w-[240px]"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {s.upstream_url}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusPill status={s.status} />
                    </td>

                    {/* Browse tools link */}
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/dashboard/servers/${s.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ color: "var(--pc-primary)" }}
                      >
                        Browse Tools
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
