"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { AlertCircle, RefreshCw, Settings, ChevronDown, ChevronUp, BookOpen, Copy, Check } from "lucide-react";

interface ErrorStateProps {
  title: string;
  description: string;
  cause?: string;
  traceId?: string;
  configSaved?: boolean;
  onRetry?: () => void;
  onEdit?: () => void;
  docsHref?: string;
  compact?: boolean;
}

export function ErrorState({
  title,
  description,
  cause,
  traceId,
  configSaved,
  onRetry,
  onEdit,
  docsHref,
  compact = false,
}: ErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyTrace() {
    if (!traceId) return;
    copyToClipboard(traceId).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid rgba(240,93,94,0.25)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* header bar */}
      <div style={{ height: 3, background: "var(--pc-critical)" }} />

      <div style={{ padding: compact ? 18 : 28 }}>
        {/* icon + title */}
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(240,93,94,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertCircle size={20} style={{ color: "var(--pc-critical)" }} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--pc-foreground)", marginBottom: 4 }}>
              {title}
            </h3>
            <p style={{ fontSize: 13, color: "var(--pc-muted)", lineHeight: 1.65 }}>
              {description}
            </p>
          </div>
        </div>

        {/* cause */}
        {cause && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(240,93,94,0.06)",
              border: "1px solid rgba(240,93,94,0.15)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--pc-muted)",
              lineHeight: 1.6,
              marginBottom: 14,
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--pc-critical)" }}>Possible cause: </span>
            {cause}
          </div>
        )}

        {/* config saved notice */}
        {configSaved !== undefined && (
          <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 14 }}>
            <span
              style={{
                fontWeight: 600,
                color: configSaved ? "var(--pc-success)" : "var(--pc-warning)",
              }}
            >
              {configSaved ? "✓ Configuration was saved." : "⚠ Configuration was not saved."}
            </span>{" "}
            {configSaved
              ? "Your settings have been persisted and will apply on next connection."
              : "Please try again — no changes were written."}
          </p>
        )}

        {/* action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: traceId ? 14 : 0 }}>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                background: "var(--pc-primary)",
                border: "none",
                borderRadius: 7,
                color: "#0C1116",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={13} />
              Retry
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 7,
                color: "var(--pc-foreground)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Settings size={13} />
              Edit connection
            </button>
          )}
          {docsHref && (
            <a
              href={docsHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 7,
                color: "var(--pc-muted)",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              <BookOpen size={13} />
              Open documentation
            </a>
          )}
        </div>

        {/* technical details */}
        {traceId && (
          <div>
            <button
              onClick={() => setShowDetails((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "var(--pc-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              View technical details
            </button>

            {showDetails && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: "#0A0F14",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--pc-muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Trace ID
                  </div>
                  <code style={{ fontSize: 11, color: "var(--pc-secondary)", fontFamily: "monospace" }}>
                    {traceId}
                  </code>
                </div>
                <button
                  onClick={copyTrace}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: copied ? "var(--pc-success)" : "var(--pc-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: 5,
                    flexShrink: 0,
                  }}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pre-built error states ──────────────────────────────────────────────── */

export function ServerConnectionError({
  serverSlug,
  traceId,
  onRetry,
  onEdit,
}: {
  serverSlug: string;
  traceId?: string;
  onRetry?: () => void;
  onEdit?: () => void;
}) {
  return (
    <ErrorState
      title={`Could not connect to ${serverSlug}`}
      description="Portcullis could not connect to this MCP server. The connection timed out after 10 seconds."
      cause="Verify the server URL is reachable, the network allows outbound connections on this port, and the authentication credentials are correct."
      traceId={traceId}
      configSaved={false}
      onRetry={onRetry}
      onEdit={onEdit}
      docsHref="/developer/docs?topic=server-connection"
    />
  );
}

export function HealthCheckError({
  serverSlug,
  failures,
  traceId,
  onRetry,
}: {
  serverSlug: string;
  failures: number;
  traceId?: string;
  onRetry?: () => void;
}) {
  return (
    <ErrorState
      title={`Health check failing — ${serverSlug}`}
      description={`This server has failed ${failures} consecutive health check${failures !== 1 ? "s" : ""}. Tools on this server may be unavailable.`}
      cause="The server process may have crashed, be under high load, or the health check path may have changed."
      traceId={traceId}
      onRetry={onRetry}
      docsHref="/developer/docs?topic=health-checks"
    />
  );
}

export function ApiError({
  statusCode,
  message,
  traceId,
  onRetry,
}: {
  statusCode: number;
  message: string;
  traceId?: string;
  onRetry?: () => void;
}) {
  return (
    <ErrorState
      title={`Request failed (${statusCode})`}
      description={message}
      cause={
        statusCode === 401
          ? "Your session may have expired. Try signing out and back in."
          : statusCode === 403
          ? "Your role doesn't have permission to perform this action."
          : statusCode >= 500
          ? "The server encountered an unexpected error. This is not a problem with your request."
          : undefined
      }
      traceId={traceId}
      onRetry={onRetry}
    />
  );
}
