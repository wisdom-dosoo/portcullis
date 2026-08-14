"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Server,
  Plus,
  Trash2,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LayoutList,
  LayoutGrid,
  Download,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  useListServersV1ServersGet,
  useDeleteServerV1ServersSlugDelete,
  type ServerView,
} from "@/api/generated";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState, FilterEmpty, EMPTY_STATES } from "@/components/empty-state";

/* ── helpers ─────────────────────────────────────────────────────── */

function statusStyle(status: string) {
  if (status === "active")    return { color: "#2DD4A7", bg: "rgba(45,212,167,0.12)",  dot: "#2DD4A7" };
  if (status === "unhealthy") return { color: "#F05D5E", bg: "rgba(240,93,94,0.12)",   dot: "#F05D5E" };
  return                             { color: "#8B98A7", bg: "rgba(139,152,167,0.1)",   dot: "#8B98A7" };
}

function StatusPill({ status }: { status: string }) {
  const s = statusStyle(status);
  const Icon = status === "active" ? CheckCircle2 : status === "unhealthy" ? AlertTriangle : XCircle;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {status}
    </span>
  );
}

function HealthDot({ failures }: { failures: number }) {
  const color = failures === 0 ? "#35C88A" : "#F05D5E";
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: color }}
      title={failures === 0 ? "Healthy" : `${failures} consecutive failure${failures !== 1 ? "s" : ""}`}
    />
  );
}

function relativeTime(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── card view ───────────────────────────────────────────────────── */

function ServerCard({
  server,
  onDelete,
  onHealthCheck,
}: {
  server: ServerView;
  onDelete: (slug: string) => void;
  onHealthCheck: (server: ServerView) => void;
}) {
  const s = statusStyle(server.status);
  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-4 transition-colors group"
      style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,167,0.2)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--pc-border)")}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: s.bg }}
        >
          <Server className="w-4 h-4" strokeWidth={1.75} style={{ color: s.color }} />
        </div>
        <StatusPill status={server.status} />
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/dashboard/servers/${server.slug}`}
          className="font-mono font-semibold text-sm hover:underline"
          style={{ color: "var(--pc-primary)" }}
        >
          {server.slug}
        </Link>
        <p className="text-xs mt-1 truncate" style={{ color: "var(--pc-muted)" }} title={server.upstream_url}>
          {server.upstream_url}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="font-mono text-[10px] px-2 py-0.5 rounded-md"
          style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
        >
          {server.transport}
        </span>
        <span className="text-[10px]" style={{ color: "var(--pc-muted)" }}>
          Last check: {relativeTime(server.last_health_check_at)}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid var(--pc-border)" }}>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/servers/${server.slug}`}
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: "var(--pc-primary)" }}
          >
            View <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
          </Link>
          <button
            onClick={() => onHealthCheck(server)}
            className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--pc-muted)" }}
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.75} />
            Check
          </button>
        </div>
        <button
          onClick={() => onDelete(server.slug)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--pc-critical)" }}
          title="Delete server"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

type ViewMode = "table" | "card";

export default function ServersPage() {
  const qc = useQueryClient();
  const { data: resp, isLoading } = useListServersV1ServersGet();
  const servers = (resp?.data ?? []) as ServerView[];
  const deleteServer = useDeleteServerV1ServersSlugDelete();

  const [view, setView]             = useState<ViewMode>("table");
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState<string>("all");
  const [transportFilter, setTransport] = useState<string>("all");

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.slug.toLowerCase().includes(q) || s.upstream_url.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchTransport = transportFilter === "all" || s.transport === transportFilter;
      return matchSearch && matchStatus && matchTransport;
    });
  }, [servers, search, statusFilter, transportFilter]);

  async function handleDelete(slug: string) {
    if (!confirm(`Delete server "${slug}"?`)) return;
    try {
      await deleteServer.mutateAsync({ slug });
      toast.success("Server deleted");
      qc.invalidateQueries({ queryKey: ["/v1/servers"] });
    } catch { toast.error("Failed to delete server"); }
  }

  async function handleHealthCheck(server: ServerView) {
    const url = `${server.upstream_url}${server.health_check_path}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        toast.success(`Health check passed (${res.status})`);
      } else {
        toast.error(`Health check failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      toast.error(`Health check error: ${(err as Error).message}`);
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(servers, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "portcullis-servers.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectStyle = {
    background: "var(--pc-elevated)",
    borderColor: "var(--pc-border)",
    color: "var(--pc-foreground)",
  } as React.CSSProperties;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>Servers</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>Upstream MCP servers routed through the gateway</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-opacity hover:opacity-80"
            style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)", color: "var(--pc-muted)" }}
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
            Export
          </button>
          <Link
            href="/dashboard/servers/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--pc-primary)", color: "#0C1116" }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Add Server
          </Link>
        </div>
      </div>

      {/* Search + filter + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by slug or URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-xl border outline-none"
          style={{ background: "var(--pc-elevated)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border outline-none cursor-pointer"
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="unhealthy">Unhealthy</option>
        </select>
        <select
          value={transportFilter}
          onChange={(e) => setTransport(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border outline-none cursor-pointer"
          style={selectStyle}
        >
          <option value="all">All transports</option>
          <option value="streamable_http">streamable_http</option>
          <option value="sse">sse</option>
          <option value="stdio">stdio</option>
        </select>
        <div
          className="flex items-center rounded-xl border overflow-hidden flex-shrink-0"
          style={{ borderColor: "var(--pc-border)", background: "var(--pc-elevated)" }}
        >
          <button
            onClick={() => setView("table")}
            className="p-2 transition-colors"
            style={{ background: view === "table" ? "rgba(45,212,167,0.12)" : "transparent", color: view === "table" ? "var(--pc-primary)" : "var(--pc-muted)" }}
            title="Table view"
          >
            <LayoutList className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setView("card")}
            className="p-2 transition-colors"
            style={{ background: view === "card" ? "rgba(45,212,167,0.12)" : "transparent", color: view === "card" ? "var(--pc-primary)" : "var(--pc-muted)" }}
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-5 space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />)}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={Server}
          title={EMPTY_STATES.servers.title}
          description={EMPTY_STATES.servers.description}
          features={[...EMPTY_STATES.servers.features]}
          actions={[
            { label: EMPTY_STATES.servers.primaryAction.label, href: EMPTY_STATES.servers.primaryAction.href },
            { label: EMPTY_STATES.servers.docsAction.label,    href: EMPTY_STATES.servers.docsAction.href, variant: "secondary" },
          ]}
        />
      ) : filtered.length === 0 ? (
        <FilterEmpty
          subject="servers"
          onClear={() => { setSearch(""); setStatus("all"); setTransport("all"); }}
        />
      ) : view === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <ServerCard
              key={s.slug}
              server={s}
              onDelete={handleDelete}
              onHealthCheck={handleHealthCheck}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <table className="w-full text-sm">
            <thead style={{ background: "var(--pc-elevated)" }}>
              <tr>
                {["Slug", "Upstream URL", "Transport", "Status", "Health", "Last Check", ""].map((h, i) => (
                  <th
                    key={i}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${i === 6 ? "" : "text-left"}`}
                    style={{ color: "var(--pc-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.slug}
                  className="transition-colors group"
                  style={{ borderBottom: "1px solid var(--pc-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(72,184,232,0.15)" }}
                      >
                        <Server className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#48B8E8" }} />
                      </div>
                      <Link
                        href={`/dashboard/servers/${s.slug}`}
                        className="font-mono font-medium text-xs hover:underline"
                        style={{ color: "var(--pc-primary)" }}
                      >
                        {s.slug}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Globe className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: "var(--pc-muted)" }} />
                      <span className="truncate max-w-[200px]" style={{ color: "var(--pc-muted)" }}>{s.upstream_url}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded-md"
                      style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                    >
                      {s.transport}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <HealthDot failures={s.consecutive_health_failures} />
                  </td>
                  <td className="px-5 py-3.5 text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>
                    {relativeTime(s.last_health_check_at)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleHealthCheck(s)}
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        style={{ color: "var(--pc-muted)" }}
                        title="Run health check"
                      >
                        <RefreshCw className="w-3 h-3" strokeWidth={1.75} />
                        Check
                      </button>
                      <button
                        onClick={() => handleDelete(s.slug)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: "var(--pc-critical)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
