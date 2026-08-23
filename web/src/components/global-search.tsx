"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Server,
  Wrench,
  Key,
  Shield,
  FileText,
  BookOpen,
  Users,
  ScrollText,
  ArrowRight,
  X,
  Loader2,
  Command,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Hash,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from "lucide-react";
import {
  useListServersV1ServersGet,
  useListApiKeysV1ApiKeysGet,
  useListRolesV1RolesGet,
  useListPoliciesV1RateLimitPoliciesGet,
  useListAuditLogsV1AuditGet,
  type ServerView,
  type ApiKeyView,
  type RoleView,
  type RateLimitPolicyView,
  type AuditLogView,
} from "@/api/generated";
import type { NavContext } from "./nav-shell";

/* ── Resource types ──────────────────────────────────────────────────────── */

export type ResourceType =
  | "server"
  | "tool"
  | "user"
  | "policy"
  | "api_key"
  | "request"
  | "audit_event"
  | "documentation";

const RESOURCE_META: Record<ResourceType, {
  label: string;
  plural: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  server:        { label: "Server",        plural: "Servers",        icon: Server,      color: "var(--pc-secondary)",  bg: "rgba(72,184,232,0.12)" },
  tool:          { label: "Tool",          plural: "Tools",          icon: Wrench,      color: "var(--pc-primary)",    bg: "rgba(45,212,167,0.12)" },
  user:          { label: "User",          plural: "Users",          icon: Users,       color: "#A78BFA",              bg: "rgba(167,139,250,0.12)" },
  policy:        { label: "Policy",        plural: "Policies",       icon: Shield,      color: "var(--pc-warning)",    bg: "rgba(244,185,66,0.12)" },
  api_key:       { label: "API Key",       plural: "API Keys",       icon: Key,         color: "var(--pc-warning)",    bg: "rgba(244,185,66,0.12)" },
  request:       { label: "Request",       plural: "Requests",       icon: ScrollText,  color: "var(--pc-muted)",      bg: "rgba(139,152,167,0.12)" },
  audit_event:   { label: "Audit Event",   plural: "Audit Events",   icon: FileText,    color: "#F97316",              bg: "rgba(249,115,22,0.12)" },
  documentation: { label: "Doc",           plural: "Documentation",  icon: BookOpen,    color: "var(--pc-muted)",      bg: "rgba(139,152,167,0.12)" },
};

/* ── Unified result shape ────────────────────────────────────────────────── */

interface SearchResult {
  id: string;
  type: ResourceType;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: { label: string; color: string; bg: string };
  href: string;
}

/* ── Demo data for non-API resources ─────────────────────────────────────── */

const DEMO_TOOLS = [
  { name: "memory_store",        server: "production-mcp",  desc: "Persist key-value data across sessions" },
  { name: "memory_retrieve",     server: "production-mcp",  desc: "Retrieve stored memories by key" },
  { name: "filesystem_read",     server: "production-mcp",  desc: "Read file contents from the sandbox" },
  { name: "filesystem_write",    server: "production-mcp",  desc: "Write or append to sandbox files" },
  { name: "filesystem_list",     server: "production-mcp",  desc: "List directory contents" },
  { name: "github_create_issue", server: "staging-mcp",     desc: "Open a GitHub issue via REST API" },
  { name: "github_list_prs",     server: "staging-mcp",     desc: "List open pull requests for a repo" },
  { name: "github_merge_pr",     server: "staging-mcp",     desc: "Merge a pull request" },
  { name: "slack_post_message",  server: "staging-mcp",     desc: "Send a message to a Slack channel" },
  { name: "slack_list_channels", server: "staging-mcp",     desc: "List Slack channels in your workspace" },
  { name: "sqlite_query",        server: "production-mcp",  desc: "Execute SQL queries on a SQLite DB" },
  { name: "sqlite_schema",       server: "production-mcp",  desc: "Introspect table schemas" },
  { name: "http_request",        server: "production-mcp",  desc: "Make arbitrary HTTP requests" },
  { name: "shell_exec",          server: "dev-mcp",         desc: "Run shell commands in the sandbox" },
  { name: "code_interpreter",    server: "production-mcp",  desc: "Execute and evaluate code snippets" },
  { name: "web_search",          server: "production-mcp",  desc: "Search the web and return structured results" },
];

const DEMO_DOCS = [
  { title: "Quick Start Guide",          subtitle: "Get your first tool call working in 5 minutes", href: "/developer/docs#quickstart" },
  { title: "Authentication & API Keys",  subtitle: "How to generate and rotate personal access keys", href: "/developer/docs#auth" },
  { title: "Tool Reference",             subtitle: "Full reference for every available MCP tool", href: "/developer/docs#tools" },
  { title: "Rate Limits & Quotas",       subtitle: "Request limits, burst allowances, and backoff", href: "/developer/docs#rate-limits" },
  { title: "SDK & Code Examples",        subtitle: "Python, Node.js, and Go SDK usage examples", href: "/developer/docs#sdk" },
  { title: "RBAC & Policies",            subtitle: "Role-based access control and policy enforcement", href: "/developer/docs#rbac" },
  { title: "MCP Server Setup",           subtitle: "Registering and configuring upstream MCP servers", href: "/developer/docs#servers" },
  { title: "Webhooks & Events",          subtitle: "Subscribe to gateway events via webhook", href: "/developer/docs#webhooks" },
  { title: "Billing & Subscriptions",    subtitle: "Plans, limits, invoices, and payment methods", href: "/developer/docs#billing" },
  { title: "Observability & Tracing",    subtitle: "Request tracing, audit log, and traffic dashboards", href: "/developer/docs#observability" },
];

/* ── Text match helper ───────────────────────────────────────────────────── */

function matches(text: string | undefined | null, q: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(q.toLowerCase());
}

/* ── Highlight matched text ──────────────────────────────────────────────── */

function HL({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ color: "var(--pc-primary)", fontWeight: 700 }}>
        {text.slice(i, i + q.length)}
      </span>
      {text.slice(i + q.length)}
    </>
  );
}

/* ── Relative time ───────────────────────────────────────────────────────── */

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── Type filter pill ────────────────────────────────────────────────────── */

const ALL_TYPES: ResourceType[] = [
  "server", "tool", "user", "policy", "api_key", "request", "audit_event", "documentation",
];

/* ── Main component ──────────────────────────────────────────────────────── */

export function GlobalSearch({ context }: { context: NavContext }) {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [query, setQuery]         = useState(initialQ);
  const [debouncedQ, setDebQ]     = useState(initialQ);
  const [activeType, setType]     = useState<ResourceType | null>(null);
  const [selectedIdx, setIdx]     = useState(0);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const resultsRef                = useRef<HTMLDivElement>(null);

  /* debounce */
  useEffect(() => {
    const t = setTimeout(() => setDebQ(query), 160);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { setIdx(0); }, [debouncedQ, activeType]);

  /* focus input on mount */
  useEffect(() => { inputRef.current?.focus(); }, []);

  /* sync URL */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (debouncedQ) url.searchParams.set("q", debouncedQ);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [debouncedQ]);

  /* ── API fetches ──────────────────────────────────────────────────────── */
  const { data: srResp,   isLoading: srLoading }  = useListServersV1ServersGet();
  const { data: keyResp,  isLoading: keyLoading } = useListApiKeysV1ApiKeysGet();
  const { data: roleResp, isLoading: rlLoading }  = useListRolesV1RolesGet();
  const { data: polResp,  isLoading: polLoading } = useListPoliciesV1RateLimitPoliciesGet();
  const { data: auditResp,isLoading: auLoading }  = useListAuditLogsV1AuditGet({ limit: 200 });

  const isLoading = srLoading || keyLoading || rlLoading || polLoading || auLoading;

  const servers  = (Array.isArray(srResp?.data)    ? srResp!.data    : []) as ServerView[];
  const apiKeys  = (Array.isArray(keyResp?.data)   ? keyResp!.data   : []) as ApiKeyView[];
  const roles    = (Array.isArray(roleResp?.data)  ? roleResp!.data  : []) as RoleView[];
  const policies = (Array.isArray(polResp?.data)   ? polResp!.data   : []) as RateLimitPolicyView[];
  const audits   = (Array.isArray(auditResp?.data) ? auditResp!.data : []) as AuditLogView[];

  /* ── Build results ──────────────────────────────────────────────────────── */
  const allResults = useMemo((): Record<ResourceType, SearchResult[]> => {
    const q = debouncedQ;
    const ctx = context;

    const serverBase  = ctx === "developer" ? "/developer/servers"  : "/dashboard/servers";
    const toolBase    = ctx === "developer" ? "/developer/tools"     : "/dashboard/tools";
    const keyBase     = ctx === "developer" ? "/developer/api-keys"  : "/dashboard/api-keys";

    /* Servers */
    const serverResults: SearchResult[] = (!q ? servers : servers.filter(
      (s) => matches(s.slug, q) || matches(s.upstream_url, q) || matches(s.status, q)
    )).map((s) => ({
      id:       `server-${s.id}`,
      type:     "server" as ResourceType,
      title:    s.slug,
      subtitle: s.upstream_url,
      badge:    s.status === "active"
        ? { label: "active",   color: "var(--pc-success)",   bg: "rgba(53,200,138,0.12)" }
        : s.status === "unhealthy"
        ? { label: "unhealthy",color: "var(--pc-critical)",  bg: "rgba(240,93,94,0.12)" }
        : { label: "disabled", color: "var(--pc-muted)",     bg: "rgba(139,152,167,0.12)" },
      href: `${serverBase}/${s.slug}`,
    }));

    /* Tools */
    const toolResults: SearchResult[] = (!q ? DEMO_TOOLS : DEMO_TOOLS.filter(
      (t) => matches(t.name, q) || matches(t.desc, q) || matches(t.server, q)
    )).map((t) => ({
      id:       `tool-${t.name}`,
      type:     "tool" as ResourceType,
      title:    t.name,
      subtitle: t.desc,
      meta:     t.server,
      href:     `${toolBase}?q=${encodeURIComponent(t.name)}`,
    }));

    /* Users (from roles — only name is available) */
    const userResults: SearchResult[] = (!q ? roles : roles.filter(
      (r) => matches(r.name, q)
    )).map((r) => ({
      id:       `user-${r.id}`,
      type:     "user" as ResourceType,
      title:    r.name,
      subtitle: `Role · created ${new Date(r.created_at).toLocaleDateString()}`,
      href:     "/dashboard/access-control?tab=roles",
    }));

    /* Policies (rate-limit policies — keyed on subject_id / server_pattern / tool_pattern) */
    const policyResults: SearchResult[] = (!q ? policies : policies.filter(
      (p) => matches(p.subject_id ?? "", q) || matches(p.server_pattern ?? "", q) || matches(p.tool_pattern ?? "", q) || matches(p.algorithm, q)
    )).map((p) => ({
      id:       `policy-${p.id}`,
      type:     "policy" as ResourceType,
      title:    p.server_pattern ?? p.subject_id ?? `Policy ${p.id.slice(0, 8)}`,
      subtitle: p.tool_pattern ? `tool: ${p.tool_pattern}` : undefined,
      meta:     `${p.request_limit} req / ${p.window_seconds}s`,
      href:     "/dashboard/policies",
    }));

    /* API Keys */
    const keyResults: SearchResult[] = (!q ? apiKeys : apiKeys.filter(
      (k) => matches(k.name, q) || matches(k.key_prefix, q)
    )).map((k) => ({
      id:       `key-${k.id}`,
      type:     "api_key" as ResourceType,
      title:    k.name,
      subtitle: `${k.key_prefix}…`,
      meta:     k.last_used_at ? `used ${relTime(k.last_used_at)}` : "never used",
      href:     keyBase,
    }));

    /* Requests (tool_call events) */
    const reqs = audits.filter((a) => a.event_type === "tool_call");
    const requestResults: SearchResult[] = (!q ? reqs.slice(0, 30) : reqs.filter(
      (a) => matches(a.tool_name ?? "", q) || matches(a.server_slug ?? "", q) || matches(a.subject_id ?? "", q)
    ).slice(0, 30)).map((a) => ({
      id:       `req-${a.id}`,
      type:     "request" as ResourceType,
      title:    a.tool_name ?? a.event_type,
      subtitle: a.server_slug ?? undefined,
      meta:     relTime(a.created_at),
      badge:    a.outcome === "allowed"
        ? { label: "allowed", color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)" }
        : a.outcome === "denied"
        ? { label: "denied",  color: "var(--pc-critical)", bg: "rgba(240,93,94,0.12)" }
        : { label: a.outcome, color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.12)" },
      href: "/dashboard/audit",
    }));

    /* Audit events (non-tool_call events: auth_failure, rbac_deny, etc.) */
    const evts = audits.filter((a) => a.event_type !== "tool_call");
    const auditResults: SearchResult[] = (!q ? evts.slice(0, 20) : evts.filter(
      (a) => matches(a.event_type, q) || matches(a.server_slug ?? "", q) || matches(a.subject_id ?? "", q)
    ).slice(0, 20)).map((a) => ({
      id:       `audit-${a.id}`,
      type:     "audit_event" as ResourceType,
      title:    a.event_type,
      subtitle: a.subject_id ?? undefined,
      meta:     relTime(a.created_at),
      badge:    a.outcome === "allowed"
        ? { label: "allowed", color: "var(--pc-success)",  bg: "rgba(53,200,138,0.12)" }
        : { label: a.outcome, color: "var(--pc-muted)",    bg: "rgba(139,152,167,0.12)" },
      href: "/dashboard/audit",
    }));

    /* Documentation */
    const docResults: SearchResult[] = (!q ? DEMO_DOCS : DEMO_DOCS.filter(
      (d) => matches(d.title, q) || matches(d.subtitle, q)
    )).map((d) => ({
      id:       `doc-${d.title}`,
      type:     "documentation" as ResourceType,
      title:    d.title,
      subtitle: d.subtitle,
      href:     d.href,
    }));

    return {
      server:        serverResults,
      tool:          toolResults,
      user:          userResults,
      policy:        policyResults,
      api_key:       keyResults,
      request:       requestResults,
      audit_event:   auditResults,
      documentation: docResults,
    };
  }, [debouncedQ, servers, apiKeys, roles, policies, audits, context]);

  /* visible results after type filter, capped per group */
  const visibleGroups = useMemo(() => {
    const types = activeType ? [activeType] : ALL_TYPES;
    return types
      .map((t) => ({ type: t, results: (allResults[t] ?? []).slice(0, activeType ? 50 : 6) }))
      .filter((g) => g.results.length > 0);
  }, [allResults, activeType]);

  /* flat list for keyboard nav */
  const flatResults = useMemo(() =>
    visibleGroups.flatMap((g) => g.results),
    [visibleGroups]
  );

  const totalCount = Object.values(allResults).reduce((s, arr) => s + arr.length, 0);

  const activate = useCallback((r: SearchResult) => {
    router.push(r.href);
  }, [router]);

  /* keyboard navigation */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = flatResults[selectedIdx];
        if (r) activate(r);
      } else if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatResults, selectedIdx, activate]);

  /* scroll selected result into view */
  useEffect(() => {
    const el = resultsRef.current?.querySelector(`[data-ridx="${selectedIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  /* ── Render ──────────────────────────────────────────────────────────── */

  const showEmpty = !debouncedQ;
  const showNoResults = debouncedQ && !isLoading && totalCount === 0;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>

      {/* ── Search bar ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          borderRadius: 14,
          border: "1px solid var(--pc-border)",
          background: "var(--pc-surface)",
          boxShadow: debouncedQ ? "0 0 0 2px rgba(45,212,167,0.18)" : undefined,
          marginBottom: 24,
          transition: "box-shadow 0.2s",
        }}
      >
        {isLoading && debouncedQ
          ? <Loader2 size={18} style={{ color: "var(--pc-primary)", flexShrink: 0, animation: "spin 1s linear infinite" }} />
          : <Search size={18} style={{ color: "var(--pc-muted)", flexShrink: 0 }} strokeWidth={1.5} />
        }
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search servers, tools, policies, API keys, requests, docs…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 16,
            color: "var(--pc-foreground)",
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setDebQ(""); inputRef.current?.focus(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 2, display: "flex" }}
          >
            <X size={14} />
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, opacity: 0.5 }}>
          <kbd style={{ fontSize: 10, fontFamily: "monospace", padding: "2px 5px", borderRadius: 4, background: "var(--pc-elevated)", color: "var(--pc-muted)", border: "1px solid var(--pc-border)" }}>
            <Command size={9} style={{ display: "inline", verticalAlign: "middle" }} />
          </kbd>
          <kbd style={{ fontSize: 10, fontFamily: "monospace", padding: "2px 5px", borderRadius: 4, background: "var(--pc-elevated)", color: "var(--pc-muted)", border: "1px solid var(--pc-border)" }}>
            K
          </kbd>
          <span style={{ fontSize: 10, color: "var(--pc-muted)", marginLeft: 2 }}>quick launch</span>
        </div>
      </div>

      {/* ── Type filter pills ───────────────────────────────────────── */}
      {debouncedQ && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          <FilterPill
            label="All"
            count={totalCount}
            active={activeType === null}
            color="var(--pc-primary)"
            bg="rgba(45,212,167,0.1)"
            onClick={() => setType(null)}
          />
          {ALL_TYPES.map((t) => {
            const count = allResults[t]?.length ?? 0;
            if (count === 0) return null;
            const m = RESOURCE_META[t];
            return (
              <FilterPill
                key={t}
                label={m.plural}
                count={count}
                active={activeType === t}
                color={m.color}
                bg={m.bg}
                onClick={() => setType((prev) => (prev === t ? null : t))}
              />
            );
          })}
        </div>
      )}

      {/* ── Keyboard hint bar ──────────────────────────────────────── */}
      {debouncedQ && flatResults.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <HintItem keys={["↑", "↓"]} label="navigate" />
          <HintItem keys={["↵"]} label="open" />
          <HintItem keys={["esc"]} label="clear" />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--pc-muted)", opacity: 0.5 }}>
            {flatResults.length} result{flatResults.length !== 1 ? "s" : ""} shown
          </span>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      <div ref={resultsRef}>

        {/* Empty / landing state */}
        {showEmpty && (
          <EmptyLanding context={context} />
        )}

        {/* No results */}
        {showNoResults && !isLoading && (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--pc-foreground)" }}>
              No results for &ldquo;{debouncedQ}&rdquo;
            </p>
            <p style={{ fontSize: 13, color: "var(--pc-muted)", marginTop: 6 }}>
              Try a server slug, tool name, policy, or doc title
            </p>
          </div>
        )}

        {/* Grouped results */}
        {visibleGroups.map((group) => {
          const meta = RESOURCE_META[group.type];
          const Icon = meta.icon;
          const groupTotal = allResults[group.type]?.length ?? 0;
          const showing = group.results.length;

          return (
            <div key={group.type} style={{ marginBottom: 28 }}>
              {/* Group header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  paddingBottom: 6,
                  borderBottom: "1px solid var(--pc-border)",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: meta.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={12} style={{ color: meta.color }} strokeWidth={1.75} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {meta.plural}
                </span>
                <span style={{ fontSize: 11, color: "var(--pc-muted)", opacity: 0.6 }}>
                  {groupTotal}
                </span>
                {groupTotal > showing && (
                  <button
                    onClick={() => setType(group.type)}
                    style={{ marginLeft: "auto", fontSize: 11, color: "var(--pc-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    View all {groupTotal} →
                  </button>
                )}
              </div>

              {/* Result rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.results.map((r) => {
                  const ridx = flatResults.indexOf(r);
                  const isSelected = ridx === selectedIdx;
                  return (
                    <ResultRow
                      key={r.id}
                      result={r}
                      query={debouncedQ}
                      isSelected={isSelected}
                      ridx={ridx}
                      onHover={() => setIdx(ridx)}
                      onClick={() => activate(r)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Result row ──────────────────────────────────────────────────────────── */

function ResultRow({
  result,
  query,
  isSelected,
  ridx,
  onHover,
  onClick,
}: {
  result: SearchResult;
  query: string;
  isSelected: boolean;
  ridx: number;
  onHover: () => void;
  onClick: () => void;
}) {
  const meta = RESOURCE_META[result.type];
  const Icon = meta.icon;
  const OutcomeIcon = result.badge
    ? result.badge.label === "allowed" || result.badge.label === "active" || result.badge.label === "allow"
      ? CheckCircle2
      : result.badge.label === "denied" || result.badge.label === "deny"
      ? XCircle
      : AlertTriangle
    : null;

  return (
    <Link href={result.href} onClick={onClick} style={{ textDecoration: "none", display: "block" }}>
      <div
        data-ridx={ridx}
        onMouseEnter={onHover}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 9,
          background: isSelected ? "rgba(45,212,167,0.07)" : "transparent",
          border: isSelected ? "1px solid rgba(45,212,167,0.15)" : "1px solid transparent",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isSelected ? meta.bg : "var(--pc-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={14} style={{ color: isSelected ? meta.color : "var(--pc-muted)" }} strokeWidth={1.75} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pc-foreground)", fontFamily: result.type === "tool" || result.type === "server" || result.type === "api_key" ? "monospace" : "inherit" }}>
              <HL text={result.title} q={query} />
            </span>
            {result.badge && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 20,
                  background: result.badge.bg,
                  color: result.badge.color,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  flexShrink: 0,
                }}
              >
                {OutcomeIcon && <OutcomeIcon size={9} strokeWidth={2.5} />}
                {result.badge.label}
              </span>
            )}
          </div>
          {result.subtitle && (
            <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <HL text={result.subtitle} q={query} />
            </div>
          )}
        </div>

        {/* Meta + arrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {result.meta && (
            <span style={{ fontSize: 10, color: "var(--pc-muted)", fontFamily: "monospace", opacity: 0.7 }}>
              {result.meta}
            </span>
          )}
          {isSelected
            ? <CornerDownLeft size={12} style={{ color: "var(--pc-primary)" }} />
            : <ArrowRight size={12} style={{ color: "var(--pc-border)" }} />
          }
        </div>
      </div>
    </Link>
  );
}

/* ── Empty / landing state ───────────────────────────────────────────────── */

const SUGGESTED: Array<{ label: string; icon: React.ElementType; href: (ctx: NavContext) => string; color: string; bg: string }> = [
  { label: "Servers",       icon: Server,     href: (c) => c === "developer" ? "/developer/servers"    : "/dashboard/servers",    color: "var(--pc-secondary)", bg: "rgba(72,184,232,0.12)" },
  { label: "Tools",         icon: Wrench,     href: (c) => c === "developer" ? "/developer/tools"      : "/dashboard/tools",      color: "var(--pc-primary)",   bg: "rgba(45,212,167,0.12)" },
  { label: "Policies",      icon: Shield,     href: () => "/dashboard/policies",   color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)" },
  { label: "API Keys",      icon: Key,        href: (c) => c === "developer" ? "/developer/api-keys"   : "/dashboard/api-keys",   color: "var(--pc-warning)",   bg: "rgba(244,185,66,0.12)" },
  { label: "Audit Log",     icon: FileText,   href: () => "/dashboard/audit",      color: "#F97316",             bg: "rgba(249,115,22,0.12)" },
  { label: "Documentation", icon: BookOpen,   href: () => "/developer/docs",       color: "var(--pc-muted)",     bg: "rgba(139,152,167,0.12)" },
  { label: "Access Control", icon: Users,      href: () => "/dashboard/access-control", color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  { label: "Traffic",       icon: Layers,     href: () => "/dashboard/traffic",    color: "var(--pc-primary)",   bg: "rgba(45,212,167,0.08)" },
];

function EmptyLanding({ context }: { context: NavContext }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--pc-muted)", marginBottom: 16 }}>
        Jump to a page or start typing to search across all resources.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {SUGGESTED.map(({ label, icon: Icon, href, color, bg }) => (
          <Link key={label} href={href(context)} style={{ textDecoration: "none" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--pc-border)",
                background: "var(--pc-surface)",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(45,212,167,0.3)";
                (e.currentTarget as HTMLElement).style.background  = "rgba(45,212,167,0.04)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--pc-border)";
                (e.currentTarget as HTMLElement).style.background  = "var(--pc-surface)";
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 7, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={13} style={{ color }} strokeWidth={1.75} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pc-foreground)" }}>{label}</span>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: "16px 20px", borderRadius: 10, border: "1px solid var(--pc-border)", background: "var(--pc-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Hash size={13} style={{ color: "var(--pc-muted)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>Search tips</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            ["memory_store",       "Find a tool by name"],
            ["production-mcp",     "Find a server by slug"],
            ["tool.invoke",        "Find audit events by type"],
            ["pk_live",            "Find API keys by prefix"],
            ["RBAC",               "Search documentation"],
            ["rate limit",         "Find policies by keyword"],
          ].map(([example, desc]) => (
            <div key={example} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--pc-muted)" }}>
              <code style={{ background: "var(--pc-elevated)", padding: "1px 5px", borderRadius: 4, color: "var(--pc-foreground)", fontSize: 11 }}>
                {example}
              </code>
              <span>— {desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

function FilterPill({
  label, count, active, color, bg, onClick,
}: {
  label: string; count: number; active: boolean; color: string; bg: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        border: "1px solid",
        borderColor: active ? color : "var(--pc-border)",
        background: active ? bg : "transparent",
        color: active ? color : "var(--pc-muted)",
        transition: "all 0.15s",
      }}
    >
      {label}
      <span style={{
        fontSize: 10,
        padding: "0 4px",
        borderRadius: 8,
        background: active ? "rgba(0,0,0,0.15)" : "var(--pc-elevated)",
        color: active ? color : "var(--pc-muted)",
      }}>
        {count}
      </span>
    </button>
  );
}

function HintItem({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--pc-muted)" }}>
      {keys.map((k) => (
        <kbd key={k} style={{ fontSize: 10, fontFamily: "monospace", padding: "1px 4px", borderRadius: 3, background: "var(--pc-surface)", color: "var(--pc-muted)", border: "1px solid var(--pc-border)" }}>
          {k}
        </kbd>
      ))}
      <span style={{ opacity: 0.6 }}>{label}</span>
    </div>
  );
}
