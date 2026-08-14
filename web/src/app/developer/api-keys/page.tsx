"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Key, Plus, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  useListApiKeysV1ApiKeysGet,
  useCreateApiKeyV1ApiKeysPost,
  useRevokeApiKeyV1ApiKeysKeyIdDelete,
  type ApiKeyView,
} from "@/api/generated";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState, EMPTY_STATES } from "@/components/empty-state";

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeveloperApiKeysPage() {
  const qc = useQueryClient();
  const { data: resp, isLoading } = useListApiKeysV1ApiKeysGet();
  const keys = (Array.isArray(resp?.data) ? resp.data : []) as ApiKeyView[];

  const createKey = useCreateApiKeyV1ApiKeysPost();
  const revokeKey = useRevokeApiKeyV1ApiKeysKeyIdDelete();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await createKey.mutateAsync({ data: { name } });
      // API returns ApiKeyCreateResponse: { key: ApiKeyView, plaintext: string }
      // Also handle older shape { raw_key: string } as fallback
      const data = result?.data as {
        plaintext?: string;
        raw_key?: string;
        key?: ApiKeyView;
      };
      const plaintext = data?.plaintext ?? data?.raw_key ?? null;
      setNewKey(plaintext);
      setName("");
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Failed to create key";
      toast.error(detail);
    }
  }

  async function handleRevoke(keyId: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? This action cannot be undone.`)) return;
    try {
      await revokeKey.mutateAsync({ keyId });
      toast.success(`"${keyName}" revoked`);
      qc.invalidateQueries({ queryKey: ["/v1/api-keys"] });
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeDialog() {
    setOpen(false);
    setNewKey(null);
    setCopied(false);
    setName("");
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--pc-foreground)" }}
          >
            My API Keys
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>
            Personal API keys for authenticating gateway requests
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Create Key
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ background: "var(--pc-elevated)" }} />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={Key}
            title={EMPTY_STATES.devApiKeys.title}
            description={EMPTY_STATES.devApiKeys.description}
            features={[...EMPTY_STATES.devApiKeys.features]}
            actions={[
              { label: "Create API Key", onClick: () => setOpen(true) },
              { label: EMPTY_STATES.devApiKeys.docsAction.label, href: EMPTY_STATES.devApiKeys.docsAction.href, variant: "secondary" },
            ]}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--pc-elevated)", borderBottom: "1px solid var(--pc-border)" }}>
                <tr>
                  {["Name", "Prefix", "Scopes", "Created", "Last Used", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr
                    key={k.id}
                    className="group transition-colors"
                    style={{ borderBottom: "1px solid rgba(38,48,58,0.5)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "")
                    }
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(45,212,167,0.15)" }}
                        >
                          <Key
                            className="w-3.5 h-3.5"
                            strokeWidth={1.75}
                            style={{ color: "#2DD4A7" }}
                          />
                        </div>
                        <span
                          className="font-medium"
                          style={{ color: "var(--pc-foreground)" }}
                        >
                          {k.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <code
                        className="text-xs font-mono px-2 py-0.5 rounded-md"
                        style={{
                          color: "var(--pc-secondary)",
                          background: "var(--pc-elevated)",
                        }}
                      >
                        {k.key_prefix}…
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <span
                            key={s}
                            className="text-xs font-mono px-2 py-0.5 rounded-md"
                            style={{
                              background: "rgba(72,184,232,0.12)",
                              color: "#48B8E8",
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td
                      className="px-5 py-3.5 text-xs tabular-nums"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td
                      className="px-5 py-3.5 text-xs tabular-nums"
                      style={{ color: "var(--pc-muted)" }}
                    >
                      {k.last_used_at ? (
                        new Date(k.last_used_at).toLocaleDateString()
                      ) : (
                        <span style={{ color: "var(--pc-border)" }}>Never</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleRevoke(k.id, k.name)}
                        className="opacity-0 group-hover:opacity-100 text-xs font-medium transition-all"
                        style={{ color: "var(--pc-critical)" }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent
          className="sm:max-w-md rounded-2xl border"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2.5 text-base"
              style={{ color: "var(--pc-foreground)" }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(45,212,167,0.15)" }}
              >
                <Key className="w-4 h-4" strokeWidth={1.75} style={{ color: "#2DD4A7" }} />
              </div>
              {newKey ? "Key Created" : "Create API Key"}
            </DialogTitle>
          </DialogHeader>

          {newKey ? (
            <div className="space-y-4 pt-1">
              {/* Warning banner */}
              <div
                className="rounded-xl p-3 flex gap-2.5 border"
                style={{
                  background: "rgba(244,185,66,0.1)",
                  borderColor: "rgba(244,185,66,0.3)",
                }}
              >
                <AlertTriangle
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  strokeWidth={2}
                  style={{ color: "#F4B942" }}
                />
                <p
                  className="text-xs font-medium leading-relaxed"
                  style={{ color: "#F4B942" }}
                >
                  Copy this key now — it will not be shown again after you close this dialog.
                </p>
              </div>

              {/* Key display */}
              <div
                className="rounded-xl p-3.5 flex items-center gap-3"
                style={{ background: "#0A0F14" }}
              >
                <code
                  className="flex-1 text-xs font-mono break-all leading-relaxed"
                  style={{ color: "#2DD4A7" }}
                >
                  {newKey}
                </code>
                <button
                  onClick={copyKey}
                  className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                  style={{ color: copied ? "#2DD4A7" : "var(--pc-muted)" }}
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <Copy className="w-4 h-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>

              <DialogFooter>
                <button
                  onClick={closeDialog}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: "var(--pc-primary)", color: "#0C1116" }}
                >
                  Done
                </button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--pc-muted)" }}
                >
                  Key Name
                </Label>
                <input
                  placeholder="e.g. My MCP Client, CI pipeline"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{
                    background: "var(--pc-elevated)",
                    borderColor: "var(--pc-border)",
                    color: "var(--pc-foreground)",
                  }}
                  onFocus={(e) =>
                    (e.target.style.borderColor = "var(--pc-primary)")
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = "var(--pc-border)")
                  }
                />
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="px-4 py-2 text-sm transition-colors"
                  style={{ color: "var(--pc-muted)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createKey.isPending || !name.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: "var(--pc-primary)", color: "#0C1116" }}
                >
                  {createKey.isPending ? "Creating…" : "Create Key"}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
