"use client";

import { useState } from "react";
import Link from "next/link";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Rocket,
  Key,
  Plug,
  Wrench,
  Gauge,
  AlertCircle,
  Copy,
  CheckCircle2,
} from "lucide-react";

// ─── Getting started code block ────────────────────────────────────────────

const GETTING_STARTED_JSON = `{
  "mcpServers": {
    "portcullis": {
      "command": "npx",
      "args": ["-y", "@portcullis/mcp-client"],
      "env": {
        "PORTCULLIS_URL": "http://localhost:8000",
        "PORTCULLIS_API_KEY": "your-api-key"
      }
    }
  }
}`;

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    copyToClipboard(code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--pc-border)" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: "var(--pc-elevated)",
          borderBottom: "1px solid var(--pc-border)",
        }}
      >
        <span className="text-xs font-mono font-medium" style={{ color: "var(--pc-muted)" }}>
          mcp-config.json
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: copied ? "var(--pc-success)" : "var(--pc-muted)" }}
        >
          {copied ? (
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.5} />
          ) : (
            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <pre
        style={{
          margin: 0,
          padding: "16px 20px",
          background: "#0A0F14",
          fontSize: 13,
          fontFamily: "monospace",
          color: "var(--pc-foreground)",
          overflowX: "auto",
          lineHeight: 1.7,
        }}
      >
        {code}
      </pre>
    </div>
  );
}

// ─── Doc Section Card ──────────────────────────────────────────────────────

interface DocSection {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  href: string;
}

const DOC_SECTIONS: DocSection[] = [
  {
    icon: Rocket,
    iconColor: "#2DD4A7",
    iconBg: "rgba(45,212,167,0.12)",
    title: "Quick Start",
    description: "Connect your first MCP tool in under 5 minutes",
    href: "#",
  },
  {
    icon: Key,
    iconColor: "#F4B942",
    iconBg: "rgba(244,185,66,0.12)",
    title: "Authentication",
    description: "API keys, OAuth, and bearer tokens",
    href: "#",
  },
  {
    icon: Plug,
    iconColor: "#48B8E8",
    iconBg: "rgba(72,184,232,0.12)",
    title: "MCP Connection Guide",
    description: "Configure clients to use the gateway",
    href: "#",
  },
  {
    icon: Wrench,
    iconColor: "#35C88A",
    iconBg: "rgba(53,200,138,0.12)",
    title: "Tool Usage",
    description: "Discover, test, and invoke tools",
    href: "#",
  },
  {
    icon: Gauge,
    iconColor: "#F4B942",
    iconBg: "rgba(244,185,66,0.12)",
    title: "Rate Limits",
    description: "Understand quotas and throttling",
    href: "#",
  },
  {
    icon: AlertCircle,
    iconColor: "#F05D5E",
    iconBg: "rgba(240,93,94,0.12)",
    title: "Error Codes",
    description: "Troubleshoot common gateway errors",
    href: "#",
  },
];

function DocCard({ section }: { section: DocSection }) {
  const Icon = section.icon;
  return (
    <Link href={section.href}>
      <div
        className="rounded-2xl border p-5 flex flex-col gap-4 group cursor-pointer transition-colors h-full"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = section.iconColor)
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--pc-border)")
        }
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: section.iconBg }}
        >
          <Icon className="w-5 h-5" strokeWidth={1.75} style={{ color: section.iconColor }} />
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--pc-foreground)" }}>
            {section.title}
          </p>
          <p className="text-xs" style={{ color: "var(--pc-muted)", lineHeight: 1.55 }}>
            {section.description}
          </p>
        </div>

        <div
          className="text-xs font-medium flex items-center gap-1"
          style={{ color: section.iconColor }}
        >
          View →
        </div>
      </div>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperDocsPage() {
  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--pc-foreground)" }}
        >
          Documentation
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
          Guides, references, and examples
        </p>
      </div>

      {/* Getting Started */}
      <div
        className="rounded-2xl border p-6"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        <div className="flex items-start gap-4 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(45,212,167,0.12)" }}
          >
            <Rocket className="w-5 h-5" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
              Getting Started
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
              Add the Portcullis gateway to your MCP client configuration file to get started.
            </p>
          </div>
        </div>
        <CodeBlock code={GETTING_STARTED_JSON} />
        <div className="mt-4 space-y-1.5">
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>PORTCULLIS_URL</span>
            {" — "}The base URL of your Portcullis gateway instance.
          </p>
          <p className="text-xs" style={{ color: "var(--pc-muted)" }}>
            <span style={{ color: "var(--pc-foreground)", fontWeight: 600 }}>PORTCULLIS_API_KEY</span>
            {" — "}Generate a personal API key from the{" "}
            <Link href="/developer/api-keys" style={{ color: "var(--pc-primary)" }}>
              API Keys
            </Link>{" "}
            page.
          </p>
        </div>
      </div>

      {/* Doc section grid */}
      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--pc-foreground)" }}>
          Reference
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DOC_SECTIONS.map((section) => (
            <DocCard key={section.title} section={section} />
          ))}
        </div>
      </div>

      {/* Support callout */}
      <div
        className="rounded-2xl border px-6 py-5 flex items-center gap-4"
        style={{
          background: "rgba(45,212,167,0.05)",
          borderColor: "rgba(45,212,167,0.2)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(45,212,167,0.12)" }}
        >
          <AlertCircle className="w-5 h-5" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--pc-foreground)" }}>
            Need help?
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--pc-muted)" }}>
            Check the{" "}
            <Link href="/developer/logs" style={{ color: "var(--pc-primary)" }}>
              request logs
            </Link>{" "}
            for errors, or reach out to your workspace administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
