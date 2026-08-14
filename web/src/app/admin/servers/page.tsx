"use client";

import { toast } from "sonner";
import {
  useListServersV1ServersGet,
  useDeleteServerV1ServersSlugDelete,
  type ServerView,
} from "@/api/generated";
import { Server, Trash2, Globe, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";

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

/* ── health failures badge ───────────────────────────────────────── */

function HealthBadge({ failures }: { failures: number }) {
  if (failures === 0) {
    return <span className="text-xs tabular-nums" style={{ color: "#35C88A" }}>0</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
      style={{ background: "rgba(240,93,94,0.12)", color: "#F05D5E" }}
    >
      <AlertCircle className="w-3 h-3" strokeWidth={2.5} />
      {failures}
    </span>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function AdminServersPage() {
  const qc = useQueryClient();
  const { data: resp, isLoading } = useListServersV1ServersGet();
  const servers = (resp?.data ?? []) as ServerView[];
  const deleteServer = useDeleteServerV1ServersSlugDelete();

  async function handleDelete(slug: string) {
    if (!confirm(`Delete server "${slug}"? This action cannot be undone.`)) return;
    try {
      await deleteServer.mutateAsync({ slug });
      toast.success(`Server "${slug}" deleted`);
      qc.invalidateQueries({ queryKey: ["/v1/servers"] });
    } catch {
      toast.error("Failed to delete server");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          MCP Servers
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          All registered upstream MCP servers across the platform
        </p>
      </div>

      {/* Table */}
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
              <Server
                className="w-5 h-5"
                strokeWidth={1.5}
                style={{ color: "var(--pc-muted)", opacity: 0.5 }}
              />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--pc-foreground)" }}>
              No servers registered
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pc-muted)" }}>
              Register an MCP server from the dashboard to get started
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
                    Slug
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
                    Transport
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Status
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Health Failures
                  </th>
                  <th
                    className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--pc-muted)" }}
                  >
                    Last Check
                  </th>
                  <th className="px-5 py-3" />
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
                    {/* Slug */}
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
                        <span
                          className="font-mono font-medium text-xs"
                          style={{ color: "var(--pc-primary)" }}
                        >
                          {s.slug}
                        </span>
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
                          className="truncate max-w-[220px]"
                          style={{ color: "var(--pc-muted)" }}
                        >
                          {s.upstream_url}
                        </span>
                      </div>
                    </td>

                    {/* Transport */}
                    <td className="px-5 py-3.5">
                      <span
                        className="font-mono text-xs px-2 py-0.5 rounded-md"
                        style={{
                          background: "var(--pc-elevated)",
                          color: "var(--pc-muted)",
                        }}
                      >
                        {s.transport}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusPill status={s.status} />
                    </td>

                    {/* Health failures */}
                    <td className="px-5 py-3.5">
                      <HealthBadge failures={s.consecutive_health_failures ?? 0} />
                    </td>

                    {/* Last check */}
                    <td
                      className="px-5 py-3.5 text-xs tabular-nums whitespace-nowrap"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {s.last_health_check_at
                        ? new Date(s.last_health_check_at).toLocaleString()
                        : <span style={{ color: "var(--pc-border)" }}>—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(s.slug)}
                        disabled={deleteServer.isPending}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 text-xs font-medium transition-all disabled:opacity-30"
                        style={{ color: "var(--pc-critical)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Delete
                      </button>
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
