"use client";

import { useState, useRef, useEffect } from "react";
import { AlertTriangle, X, Trash2, ShieldOff } from "lucide-react";

type Variant = "danger" | "warning";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  /** If set, user must type this exact string before the confirm button activates */
  typedConfirmation?: string;
  loading?: boolean;
}

const VARIANT_CFG = {
  danger:  { color: "var(--pc-critical)", bg: "rgba(240,93,94,0.08)",  border: "rgba(240,93,94,0.25)",  icon: <Trash2 size={18} />,    label: "Delete" },
  warning: { color: "var(--pc-warning)",  bg: "rgba(244,185,66,0.08)", border: "rgba(244,185,66,0.25)", icon: <ShieldOff size={18} />, label: "Confirm" },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  consequences = [],
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "danger",
  typedConfirmation,
  loading = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cfg = VARIANT_CFG[variant];
  const label = confirmLabel ?? cfg.label;

  const canConfirm = typedConfirmation
    ? typed === typedConfirmation
    : true;

  useEffect(() => {
    if (open) {
      setTyped("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--pc-surface)",
          border: `1px solid ${cfg.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: 440,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* accent bar */}
        <div style={{ height: 3, background: cfg.color }} />

        <div style={{ padding: 24 }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: cfg.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: cfg.color,
                  flexShrink: 0,
                }}
              >
                {cfg.icon}
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--pc-foreground)" }}>
                {title}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)", padding: 2, marginTop: -2 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* description */}
          <p style={{ fontSize: 13, color: "var(--pc-muted)", lineHeight: 1.65, marginBottom: consequences.length > 0 ? 14 : 0 }}>
            {description}
          </p>

          {/* consequences list */}
          {consequences.length > 0 && (
            <ul style={{ margin: "0 0 16px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
              {consequences.map((c) => (
                <li
                  key={c}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--pc-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  <AlertTriangle
                    size={12}
                    style={{ color: cfg.color, flexShrink: 0, marginTop: 2 }}
                  />
                  {c}
                </li>
              ))}
            </ul>
          )}

          {/* typed confirmation */}
          {typedConfirmation && (
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "var(--pc-muted)",
                  display: "block",
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}
              >
                To confirm, type{" "}
                <code
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    fontWeight: 700,
                    color: cfg.color,
                    background: cfg.bg,
                    padding: "1px 5px",
                    borderRadius: 4,
                  }}
                >
                  {typedConfirmation}
                </code>{" "}
                below:
              </label>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canConfirm && !loading) onConfirm();
                }}
                placeholder={typedConfirmation}
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "var(--pc-elevated)",
                  border: `1px solid ${typed && typed !== typedConfirmation ? cfg.color : "var(--pc-border)"}`,
                  borderRadius: 7,
                  color: "var(--pc-foreground)",
                  fontSize: 13,
                  fontFamily: "monospace",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
              />
            </div>
          )}

          {/* buttons */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "8px 18px",
                background: "transparent",
                border: "1px solid var(--pc-border)",
                borderRadius: 7,
                color: "var(--pc-muted)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={!canConfirm || loading}
              style={{
                padding: "8px 18px",
                background: canConfirm && !loading ? cfg.color : "var(--pc-elevated)",
                border: "none",
                borderRadius: 7,
                color: canConfirm && !loading ? (variant === "danger" ? "#fff" : "#0C1116") : "var(--pc-muted)",
                fontSize: 13,
                fontWeight: 700,
                cursor: canConfirm && !loading ? "pointer" : "default",
                transition: "background 0.15s, color 0.15s",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Processing…" : label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pre-built typed confirmations ───────────────────────────────────────── */

export function DeleteServerDialog({
  serverSlug,
  open,
  onClose,
  onConfirm,
  loading,
}: {
  serverSlug: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title={`Delete ${serverSlug}`}
      description="This server and all its associated configuration will be permanently removed. This action cannot be undone."
      consequences={[
        "All tool permission rules for this server will be deleted",
        "Active API keys scoped to this server will stop working",
        "Historical audit logs will be retained but the server won't be resolvable",
      ]}
      typedConfirmation={`delete-${serverSlug}`}
      confirmLabel="Delete server"
      variant="danger"
    />
  );
}

export function RevokeAllKeysDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title="Revoke all API keys"
      description="All active API keys in this organization will be immediately revoked. Any integrations or CI/CD pipelines using these keys will stop working."
      consequences={[
        "All in-flight requests using a revoked key will return 401",
        "Automated systems will need new keys to resume operation",
        "This affects all members' keys, not just yours",
      ]}
      typedConfirmation="revoke-all-keys"
      confirmLabel="Revoke all keys"
      variant="danger"
    />
  );
}

export function DisableToolDialog({
  toolName,
  environment,
  open,
  onClose,
  onConfirm,
  loading,
}: {
  toolName: string;
  environment: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title={`Disable ${toolName} in ${environment}`}
      description={`Disabling this tool in ${environment} will immediately prevent all callers from invoking it, regardless of their role or permissions.`}
      consequences={[
        "Callers will receive a policy-denied error immediately",
        "No data will be lost, but in-progress operations may fail",
        "The tool can be re-enabled at any time",
      ]}
      typedConfirmation={`disable-${environment}`}
      confirmLabel="Disable tool"
      variant="warning"
    />
  );
}

export function RemoveOrganizationDialog({
  orgName,
  open,
  onClose,
  onConfirm,
  loading,
}: {
  orgName: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title={`Remove ${orgName}`}
      description="This organization and all its data will be permanently deleted. This action cannot be undone and affects all members."
      consequences={[
        "All servers, tools, and policies will be deleted",
        "All API keys will be immediately revoked",
        "All audit logs and billing history will be erased",
        "All team members will lose access immediately",
      ]}
      typedConfirmation={`remove-${orgName.toLowerCase().replace(/\s+/g, "-")}`}
      confirmLabel="Remove organization"
      variant="danger"
    />
  );
}
