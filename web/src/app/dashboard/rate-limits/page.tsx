"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Timer } from "lucide-react";
import { EmptyState, EMPTY_STATES } from "@/components/empty-state";
import {
  useListPoliciesV1RateLimitPoliciesGet,
  useCreatePolicyV1RateLimitPoliciesPost,
  useDeletePolicyV1RateLimitPoliciesPolicyIdDelete,
  RateLimitAlgorithm,
  type RateLimitPolicyView,
} from "@/api/generated";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";

export default function RateLimitsPage() {
  const qc = useQueryClient();
  const { data: resp, isLoading } = useListPoliciesV1RateLimitPoliciesGet();
  const policies = (resp?.data ?? []) as RateLimitPolicyView[];

  const createPolicy = useCreatePolicyV1RateLimitPoliciesPost();
  const deletePolicy = useDeletePolicyV1RateLimitPoliciesPolicyIdDelete();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    request_limit: 100,
    window_seconds: 60,
    algorithm: RateLimitAlgorithm.sliding_window,
    server_pattern: "",
    tool_pattern: "",
    priority: 0,
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createPolicy.mutateAsync({
        data: {
          request_limit: form.request_limit,
          window_seconds: form.window_seconds,
          algorithm: form.algorithm,
          server_pattern: form.server_pattern || null,
          tool_pattern: form.tool_pattern || null,
          priority: form.priority,
        },
      });
      toast.success("Rate limit policy created");
      setOpen(false);
      setForm({ request_limit: 100, window_seconds: 60, algorithm: RateLimitAlgorithm.sliding_window, server_pattern: "", tool_pattern: "", priority: 0 });
      qc.invalidateQueries({ queryKey: ["/v1/rate-limit-policies"] });
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to create policy"
      );
    }
  }

  async function handleDelete(policyId: string) {
    if (!confirm("Delete this rate limit policy?")) return;
    try {
      await deletePolicy.mutateAsync({ policyId });
      toast.success("Policy deleted");
      qc.invalidateQueries({ queryKey: ["/v1/rate-limit-policies"] });
    } catch {
      toast.error("Failed to delete policy");
    }
  }

  const inputStyle = { background: "var(--pc-elevated)", borderColor: "var(--pc-border)", color: "var(--pc-foreground)" };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--pc-foreground)" }}>Rate Limits</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pc-muted)" }}>Control request throughput per subject, server, and tool</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--pc-primary)", color: "#0C1116" }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Policy
        </button>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
      >
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : policies.length === 0 ? (
          <EmptyState
            icon={Zap}
            title={EMPTY_STATES.rateLimits.title}
            description={EMPTY_STATES.rateLimits.description}
            features={[...EMPTY_STATES.rateLimits.features]}
            actions={[
              { label: "Add Rate Limit Policy", onClick: () => setOpen(true) },
              { label: EMPTY_STATES.rateLimits.docsAction.label, href: EMPTY_STATES.rateLimits.docsAction.href, variant: "secondary" },
            ]}
          />
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: "var(--pc-elevated)" }}>
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Limit</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Window</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Algorithm</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Server</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Tool</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pc-muted)" }}>Priority</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr
                  key={p.id}
                  className="transition-colors group hover:brightness-110"
                  style={{ borderBottom: "1px solid var(--pc-border)" }}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(244,185,66,0.15)" }}
                      >
                        <Zap className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#F4B942" }} />
                      </div>
                      <span className="font-semibold tabular-nums" style={{ color: "var(--pc-foreground)" }}>{p.request_limit}</span>
                      <span className="text-xs" style={{ color: "var(--pc-muted)" }}>req</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Timer className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: "var(--pc-muted)" }} />
                      <span className="tabular-nums" style={{ color: "var(--pc-foreground)" }}>{p.window_seconds}s</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded-md"
                      style={{ background: "var(--pc-elevated)", color: "var(--pc-muted)" }}
                    >
                      {p.algorithm}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs" style={{ color: "var(--pc-secondary)" }}>
                    {p.server_pattern ?? <span style={{ color: "var(--pc-border)" }}>*</span>}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs" style={{ color: "var(--pc-secondary)" }}>
                    {p.tool_pattern ?? <span style={{ color: "var(--pc-border)" }}>*</span>}
                  </td>
                  <td className="px-5 py-3.5 text-xs tabular-nums" style={{ color: "var(--pc-muted)" }}>{p.priority}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 text-xs font-medium transition-all"
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
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-md rounded-2xl border"
          style={{ background: "var(--pc-surface)", borderColor: "var(--pc-border)" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base" style={{ color: "var(--pc-foreground)" }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(244,185,66,0.15)" }}
              >
                <Zap className="w-4 h-4" strokeWidth={1.75} style={{ color: "#F4B942" }} />
              </div>
              Add Rate Limit Policy
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>Request Limit</Label>
                <input
                  type="number"
                  min={1}
                  value={form.request_limit}
                  onChange={(e) => setForm({ ...form, request_limit: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>Window (seconds)</Label>
                <input
                  type="number"
                  min={1}
                  value={form.window_seconds}
                  onChange={(e) => setForm({ ...form, window_seconds: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>Algorithm</Label>
              <select
                value={form.algorithm}
                onChange={(e) => setForm({ ...form, algorithm: e.target.value as typeof form.algorithm })}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                style={inputStyle}
              >
                <option value={RateLimitAlgorithm.sliding_window}>Sliding Window</option>
                <option value={RateLimitAlgorithm.token_bucket}>Token Bucket</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
                Server Pattern
                <span className="ml-1.5 font-normal normal-case" style={{ color: "var(--pc-muted)" }}>optional · supports * wildcard</span>
              </Label>
              <input
                placeholder="github-* or leave blank for all"
                value={form.server_pattern}
                onChange={(e) => setForm({ ...form, server_pattern: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-mono"
                style={inputStyle}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
                Tool Pattern
                <span className="ml-1.5 font-normal normal-case" style={{ color: "var(--pc-muted)" }}>optional</span>
              </Label>
              <input
                placeholder="create_* or leave blank for all"
                value={form.tool_pattern}
                onChange={(e) => setForm({ ...form, tool_pattern: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-mono"
                style={inputStyle}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>Priority</Label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                style={inputStyle}
              />
              <p className="text-xs" style={{ color: "var(--pc-muted)" }}>Higher priority wins when multiple policies match.</p>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: "var(--pc-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPolicy.isPending}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "var(--pc-primary)", color: "#0C1116" }}
              >
                {createPolicy.isPending ? "Creating…" : "Create Policy"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
