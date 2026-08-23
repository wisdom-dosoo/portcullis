"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Server,
  Wrench,
  Key,
  Plus,
  Play,
  FileText,
  Shield,
  Users,
  Building2,
  Layers,
  BookOpen,
  ArrowRight,
  Clock,
  Hash,
  CornerDownLeft,
  ScrollText,
  Eye,
  Command,
} from "lucide-react";
import { useListServersV1ServersGet, useListApiKeysV1ApiKeysGet, type ServerView } from "@/api/generated";
import type { NavContext } from "./nav-shell";

/* ── Types ───────────────────────────────────────────────────────────────── */

interface Cmd {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  group: string;
  href?: string;
  action?: () => void;
  keywords?: string[];
  context?: NavContext[];
  /** Kbd shortcut hint shown on the row e.g. ["⌃", "K"] */
  hint?: string[];
}

interface LiveResult {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  href: string;
  group: string;
}

/* ── Recent commands (localStorage, capped at 6) ────────────────────────── */

const RECENT_KEY = "pc_cmd_recent";

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const prev = getRecent().filter((x) => x !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, 6)));
  } catch { /* ignore */ }
}

/* ── Static command definitions ──────────────────────────────────────────── */

function buildCommands(context: NavContext, router: ReturnType<typeof useRouter>): Cmd[] {
  const nav: Cmd[] = [
    {
      id: "go-overview",
      label: "Go to Overview",
      description: "Dashboard home",
      icon: <Layers size={14} />,
      group: "Navigation",
      href: "/dashboard",
      context: ["org-admin"],
      keywords: ["overview", "home", "dashboard"],
    },
    {
      id: "go-servers",
      label: "Go to Servers",
      description: "Manage MCP servers",
      icon: <Server size={14} />,
      group: "Navigation",
      href: context === "developer" ? "/developer/servers" : "/dashboard/servers",
      keywords: ["server", "mcp", "connection", "gateway"],
    },
    {
      id: "go-tools",
      label: "Go to Tool Explorer",
      description: "Browse and search available tools",
      icon: <Wrench size={14} />,
      group: "Navigation",
      href: context === "developer" ? "/developer/tools" : "/dashboard/tools",
      keywords: ["tool", "function", "browse", "search", "explorer"],
    },
    {
      id: "go-playground",
      label: "Open Playground",
      description: "Invoke tools interactively",
      icon: <Play size={14} />,
      group: "Navigation",
      href: context === "developer" ? "/developer/playground" : "/dashboard/playground",
      keywords: ["play", "test", "invoke", "run", "playground"],
    },
    {
      id: "go-api-keys",
      label: "Go to API Keys",
      description: "Manage personal access keys",
      icon: <Key size={14} />,
      group: "Navigation",
      href: context === "developer" ? "/developer/api-keys" : "/dashboard/api-keys",
      keywords: ["key", "token", "auth", "api"],
    },
    {
      id: "go-policies",
      label: "Go to Policies",
      description: "RBAC and access control rules",
      icon: <Shield size={14} />,
      group: "Navigation",
      href: "/dashboard/policies",
      context: ["org-admin", "platform-admin"],
      keywords: ["policy", "rbac", "permission", "access", "rule"],
    },
    {
      id: "go-audit",
      label: "Go to Audit Log",
      description: "Browse all platform events",
      icon: <FileText size={14} />,
      group: "Navigation",
      href: "/dashboard/audit",
      context: ["org-admin"],
      keywords: ["audit", "log", "history", "events", "trail"],
    },
    {
      id: "view-requests",
      label: "View Recent Requests",
      description: "See the latest tool invocations",
      icon: <Eye size={14} />,
      group: "Navigation",
      href: "/dashboard/audit",
      keywords: ["request", "invocation", "call", "recent", "view", "history", "log"],
    },
    {
      id: "go-team",
      label: "Go to Access Control",
      description: "Manage members, teams, and roles",
      icon: <Users size={14} />,
      group: "Navigation",
      href: "/dashboard/access-control",
      context: ["org-admin"],
      keywords: ["team", "member", "user", "role", "access", "permission"],
    },
    {
      id: "go-docs",
      label: "Open Documentation",
      description: "Guides, API reference, SDK examples",
      icon: <BookOpen size={14} />,
      group: "Navigation",
      href: "/developer/docs",
      keywords: ["docs", "documentation", "help", "guide", "reference", "sdk"],
    },
    {
      id: "go-billing",
      label: "Go to Billing",
      description: "Subscription and usage",
      icon: <Building2 size={14} />,
      group: "Navigation",
      href: "/dashboard/billing/usage",
      context: ["org-admin"],
      keywords: ["billing", "usage", "subscription", "plan", "invoice"],
    },
    {
      id: "go-traffic",
      label: "Go to Traffic",
      description: "Real-time request metrics",
      icon: <ScrollText size={14} />,
      group: "Navigation",
      href: "/dashboard/traffic",
      context: ["org-admin"],
      keywords: ["traffic", "requests", "metrics", "throughput", "latency"],
    },
  ];

  const actions: Cmd[] = [
    {
      id: "create-api-key",
      label: "Create API Key",
      description: "Generate a new personal access key",
      icon: <Plus size={14} />,
      group: "Actions",
      href: context === "developer" ? "/developer/api-keys?new=1" : "/dashboard/api-keys?new=1",
      keywords: ["create", "new", "key", "token", "generate"],
    },
    {
      id: "add-server",
      label: "Add MCP Server",
      description: "Register a new MCP server endpoint",
      icon: <Plus size={14} />,
      group: "Actions",
      href: "/dashboard/servers?new=1",
      context: ["org-admin", "platform-admin"],
      keywords: ["add", "register", "server", "new", "connect"],
    },
    {
      id: "search-tool",
      label: "Search Tool",
      description: "Find a tool by name or category",
      icon: <Wrench size={14} />,
      group: "Actions",
      href: context === "developer" ? "/developer/tools" : "/dashboard/tools",
      keywords: ["search", "find", "tool", "function", "lookup"],
    },
    {
      id: "create-policy",
      label: "Create Policy",
      description: "Define a new RBAC access rule",
      icon: <Plus size={14} />,
      group: "Actions",
      href: "/dashboard/policies?new=1",
      context: ["org-admin", "platform-admin"],
      keywords: ["create", "policy", "rbac", "rule", "permission", "new"],
    },
    {
      id: "invite-user",
      label: "Invite User",
      description: "Add a team member by email",
      icon: <Users size={14} />,
      group: "Actions",
      href: "/dashboard/access-control?tab=members",
      context: ["org-admin"],
      keywords: ["invite", "user", "member", "add", "email"],
    },
    {
      id: "switch-org",
      label: "Switch Organization",
      description: "Change your active workspace",
      icon: <Building2 size={14} />,
      group: "Actions",
      action: () => router.push("/dashboard"),
      keywords: ["switch", "org", "organization", "change", "workspace"],
    },
    {
      id: "switch-env-prod",
      label: "Switch to Production",
      description: "Connect to the production MCP server",
      icon: <Layers size={14} />,
      group: "Actions",
      action: () => router.push("/developer/tools?server=production-mcp"),
      keywords: ["switch", "environment", "production", "prod", "env"],
    },
    {
      id: "switch-env-staging",
      label: "Switch to Staging",
      description: "Connect to the staging MCP server",
      icon: <Layers size={14} />,
      group: "Actions",
      action: () => router.push("/developer/tools?server=staging-mcp"),
      keywords: ["switch", "environment", "staging", "stage", "env"],
    },
    {
      id: "switch-env-dev",
      label: "Switch to Development",
      description: "Connect to the local dev MCP server",
      icon: <Layers size={14} />,
      group: "Actions",
      action: () => router.push("/developer/tools?server=dev-mcp"),
      keywords: ["switch", "environment", "development", "dev", "local", "env"],
    },
  ];

  return [...nav, ...actions].filter(
    (cmd) => !cmd.context || cmd.context.includes(context)
  );
}

/* ── Demo tools for live search (mirrors developer/tools page) ───────────── */

const DEMO_TOOL_NAMES = [
  { name: "memory_store",        server: "production-mcp",  desc: "Persist key-value data across sessions" },
  { name: "memory_retrieve",     server: "production-mcp",  desc: "Retrieve stored memories by key" },
  { name: "filesystem_read",     server: "production-mcp",  desc: "Read file contents from the sandbox" },
  { name: "filesystem_write",    server: "production-mcp",  desc: "Write or append to sandbox files" },
  { name: "github_create_issue", server: "staging-mcp",     desc: "Open a GitHub issue via API" },
  { name: "github_list_prs",     server: "staging-mcp",     desc: "List open pull requests for a repo" },
  { name: "slack_post_message",  server: "staging-mcp",     desc: "Send a message to a Slack channel" },
  { name: "sqlite_query",        server: "production-mcp",  desc: "Execute SQL queries on a SQLite DB" },
  { name: "http_request",        server: "production-mcp",  desc: "Make arbitrary HTTP requests" },
  { name: "shell_exec",          server: "dev-mcp",         desc: "Run shell commands in the sandbox" },
  { name: "code_interpreter",    server: "production-mcp",  desc: "Execute and evaluate code snippets" },
  { name: "web_search",          server: "production-mcp",  desc: "Search the web and return results" },
];

/* ── Fuzzy match + highlight ─────────────────────────────────────────────── */

function matchStr(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Wrap matched substring in a <mark>-like span */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "var(--pc-primary)", fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

/* ── Keyboard key badge ──────────────────────────────────────────────────── */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        fontSize: 10,
        fontFamily: "monospace",
        padding: "2px 5px",
        borderRadius: 4,
        background: "var(--pc-elevated)",
        color: "var(--pc-muted)",
        border: "1px solid var(--pc-border)",
        lineHeight: 1.4,
      }}
    >
      {children}
    </kbd>
  );
}

/* ── Main palette ────────────────────────────────────────────────────────── */

export function CommandPalette({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context: NavContext;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: serversResp } = useListServersV1ServersGet();
  const { data: keysResp }    = useListApiKeysV1ApiKeysGet();
  const servers = (Array.isArray(serversResp?.data) ? serversResp!.data : []) as ServerView[];

  const commands = useMemo(() => buildCommands(context, router), [context, router]);

  /* load recent on open */
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setRecentIds(getRecent());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  /* filtered commands */
  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    return commands.filter((cmd) =>
      matchStr(cmd.label, query) ||
      matchStr(cmd.description ?? "", query) ||
      (cmd.keywords ?? []).some((k) => matchStr(k, query))
    );
  }, [commands, query]);

  /* live search results from real + demo data */
  const liveResults = useMemo((): LiveResult[] => {
    if (!query || query.length < 2) return [];
    const results: LiveResult[] = [];

    /* Servers */
    servers
      .filter((s) => matchStr(s.slug, query) || matchStr(s.upstream_url, query))
      .slice(0, 4)
      .forEach((s) => {
        results.push({
          id: `server-${s.id}`,
          label: s.slug,
          sublabel: s.upstream_url,
          icon: <Server size={13} style={{ color: "var(--pc-secondary)" }} />,
          href: context === "developer" ? "/developer/servers" : "/dashboard/servers",
          group: "Servers",
        });
      });

    /* API Keys */
    const keys = (Array.isArray(keysResp?.data) ? keysResp!.data : []) as Array<{
      id: string; name: string; key_prefix?: string;
    }>;
    keys.filter((k) => matchStr(k.name, query)).slice(0, 3).forEach((k) => {
      results.push({
        id: `key-${k.id}`,
        label: k.name,
        sublabel: k.key_prefix ? `${k.key_prefix}…` : undefined,
        icon: <Key size={13} style={{ color: "var(--pc-warning)" }} />,
        href: "/dashboard/api-keys",
        group: "API Keys",
      });
    });

    /* Tools (demo catalogue) */
    DEMO_TOOL_NAMES
      .filter((t) => matchStr(t.name, query) || matchStr(t.desc, query))
      .slice(0, 5)
      .forEach((t) => {
        results.push({
          id: `tool-${t.name}`,
          label: t.name,
          sublabel: t.server,
          icon: <Wrench size={13} style={{ color: "var(--pc-primary)" }} />,
          href: context === "developer" ? `/developer/tools?q=${encodeURIComponent(t.name)}` : `/dashboard/tools?q=${encodeURIComponent(t.name)}`,
          group: "Tools",
        });
      });

    /* Documentation */
    const DOCS = [
      "Quick Start Guide", "Authentication & API Keys", "Tool Reference",
      "Rate Limits & Quotas", "SDK & Code Examples", "RBAC & Policies",
      "MCP Server Setup", "Webhooks & Events", "Billing & Subscriptions",
    ];
    DOCS.filter((d) => matchStr(d, query)).forEach((d) => {
      results.push({
        id: `doc-${d}`,
        label: d,
        icon: <BookOpen size={13} style={{ color: "var(--pc-muted)" }} />,
        href: "/developer/docs",
        group: "Documentation",
      });
    });

    return results.slice(0, 15);
  }, [query, servers, keysResp, context]);

  /* recent commands when idle */
  const recentCommands = useMemo(() => {
    if (query) return [];
    return recentIds
      .map((id) => commands.find((c) => c.id === id))
      .filter((c): c is Cmd => c !== undefined)
      .slice(0, 5);
  }, [query, recentIds, commands]);

  /* flatten for keyboard nav */
  const allItems = useMemo(() => {
    type Item = { href?: string; action?: () => void; label: string; id?: string };
    const items: Item[] = [];
    if (query) {
      filteredCommands.forEach((c) => items.push({ href: c.href, action: c.action, label: c.label, id: c.id }));
      liveResults.forEach((r) => items.push({ href: r.href, label: r.label }));
    } else {
      if (recentCommands.length) {
        recentCommands.forEach((c) => items.push({ href: c.href, action: c.action, label: c.label, id: c.id }));
      }
      commands.forEach((c) => items.push({ href: c.href, action: c.action, label: c.label, id: c.id }));
    }
    return items;
  }, [query, filteredCommands, liveResults, commands, recentCommands]);

  const activate = useCallback(
    (item: { href?: string; action?: () => void; label: string; id?: string }) => {
      if (item.id) pushRecent(item.id);
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
      onClose();
    },
    [router, onClose]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, allItems.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (allItems[selectedIdx]) activate(allItems[selectedIdx]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, allItems, selectedIdx, onClose, activate]);

  /* scroll selected into view */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  /* group commands for display */
  const displayCommands = query ? filteredCommands : commands;
  const groupedCommands: Record<string, Cmd[]> = {};
  displayCommands.forEach((cmd) => {
    if (!groupedCommands[cmd.group]) groupedCommands[cmd.group] = [];
    groupedCommands[cmd.group].push(cmd);
  });

  const groupedResults: Record<string, LiveResult[]> = {};
  liveResults.forEach((r) => {
    if (!groupedResults[r.group]) groupedResults[r.group] = [];
    groupedResults[r.group].push(r);
  });

  /* Running index shared across renderCmd / renderResult */
  let globalIdx = -1;

  function renderCmd(cmd: Cmd, overrideGroup?: string) {
    globalIdx++;
    const idx = globalIdx;
    const isSelected = selectedIdx === idx;

    const el = (
      <div
        key={cmd.id}
        data-idx={idx}
        onMouseEnter={() => setSelectedIdx(idx)}
        onClick={() => activate({ href: cmd.href, action: cmd.action, label: cmd.label, id: cmd.id })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 8,
          cursor: "pointer",
          background: isSelected ? "rgba(45,212,167,0.08)" : "transparent",
          border: isSelected ? "1px solid rgba(45,212,167,0.18)" : "1px solid transparent",
          transition: "background 0.1s",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            background: isSelected ? "rgba(45,212,167,0.12)" : "var(--pc-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isSelected ? "var(--pc-primary)" : "var(--pc-muted)",
            flexShrink: 0,
          }}
        >
          {cmd.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--pc-foreground)", lineHeight: 1.3 }}>
            <Highlight text={cmd.label} query={query} />
          </div>
          {cmd.description && (
            <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 1 }}>
              <Highlight text={cmd.description} query={query} />
            </div>
          )}
        </div>
        {cmd.hint && (
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {cmd.hint.map((k) => <Kbd key={k}>{k}</Kbd>)}
          </div>
        )}
        {isSelected && !cmd.hint && (
          <CornerDownLeft size={12} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />
        )}
      </div>
    );

    return cmd.href ? (
      <Link key={cmd.id} href={cmd.href} onClick={() => { pushRecent(cmd.id); onClose(); }} style={{ textDecoration: "none", display: "block" }}>
        {el}
      </Link>
    ) : el;
  }

  function renderResult(res: LiveResult) {
    globalIdx++;
    const idx = globalIdx;
    const isSelected = selectedIdx === idx;

    return (
      <Link
        key={res.id}
        href={res.href}
        onClick={onClose}
        style={{ textDecoration: "none", display: "block" }}
      >
        <div
          data-idx={idx}
          onMouseEnter={() => setSelectedIdx(idx)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            borderRadius: 7,
            cursor: "pointer",
            background: isSelected ? "rgba(45,212,167,0.08)" : "transparent",
            border: isSelected ? "1px solid rgba(45,212,167,0.18)" : "1px solid transparent",
          }}
        >
          <div style={{ width: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {res.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--pc-foreground)", fontFamily: "monospace" }}>
              <Highlight text={res.label} query={query} />
            </span>
            {res.sublabel && (
              <span style={{ fontSize: 10, color: "var(--pc-muted)", marginLeft: 8, fontFamily: "monospace" }}>
                {res.sublabel}
              </span>
            )}
          </div>
          {isSelected && <ArrowRight size={12} style={{ color: "var(--pc-muted)", flexShrink: 0 }} />}
        </div>
      </Link>
    );
  }

  const showRecent = !query && recentCommands.length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          borderRadius: 14,
          border: "1px solid var(--pc-border)",
          background: "var(--pc-surface)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(45,212,167,0.06)",
          overflow: "hidden",
          margin: "0 16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search input ─────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid var(--pc-border)",
          }}
        >
          <Search size={16} style={{ color: "var(--pc-muted)", flexShrink: 0 }} strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, servers, tools, docs…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--pc-foreground)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <Kbd><Command size={9} style={{ display: "inline" }} /></Kbd>
            <Kbd>K</Kbd>
          </div>
        </div>

        {/* ── Results list ─────────────────────────────────────── */}
        <div ref={listRef} style={{ maxHeight: 440, overflowY: "auto", padding: "6px 8px" }}>

          {/* Recently used (idle state) */}
          {showRecent && (
            <div>
              <SectionHeader icon={<Clock size={9} />} label="Recently Used" />
              {recentCommands.map((cmd) => renderCmd(cmd, "Recent"))}
            </div>
          )}

          {/* Static commands grouped */}
          {Object.entries(groupedCommands).map(([group, cmds]) => (
            <div key={group} style={{ marginBottom: 4 }}>
              {(!showRecent || query) && (
                <SectionHeader label={group} />
              )}
              {cmds.map((cmd) => renderCmd(cmd))}
            </div>
          ))}

          {/* Live search results */}
          {query.length >= 2 && Object.entries(groupedResults).map(([group, results]) => (
            <div key={group} style={{ marginBottom: 4 }}>
              <SectionHeader icon={<Hash size={9} />} label={group} />
              {results.map(renderResult)}
            </div>
          ))}

          {/* No results */}
          {query && filteredCommands.length === 0 && liveResults.length === 0 && (
            <div style={{ padding: "32px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--pc-muted)" }}>
                No results for &ldquo;<span style={{ color: "var(--pc-foreground)" }}>{query}</span>&rdquo;
              </div>
              <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 6 }}>
                Try a command name, page name, or tool
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 14px",
            borderTop: "1px solid var(--pc-border)",
            background: "var(--pc-elevated)",
          }}
        >
          <FooterHint keys={["↑", "↓"]} label="navigate" />
          <FooterHint keys={["↵"]} label="open" />
          <FooterHint keys={["esc"]} label="close" />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--pc-muted)", opacity: 0.6 }}>
            Portcullis
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

function SectionHeader({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color: "var(--pc-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.9,
        padding: "6px 10px 3px",
        opacity: 0.7,
      }}
    >
      {icon}
      {label}
    </div>
  );
}

function FooterHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--pc-muted)" }}>
      {keys.map((k) => (
        <kbd
          key={k}
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            padding: "1px 4px",
            borderRadius: 3,
            background: "var(--pc-surface)",
            color: "var(--pc-muted)",
            border: "1px solid var(--pc-border)",
          }}
        >
          {k}
        </kbd>
      ))}
      <span style={{ opacity: 0.6 }}>{label}</span>
    </div>
  );
}
