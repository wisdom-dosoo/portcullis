"use client";

import { CheckCircle2, Shield, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useOrgGetLicenseV1LicenseGet } from "@/api/generated";

export default function SubscriptionPage() {
  const { data: licenseResp, isLoading } = useOrgGetLicenseV1LicenseGet();
  const license = licenseResp?.data as unknown as { plan?: string; seat_limit?: number; server_limit?: number | null; status?: string } | null;

  return (
    <div style={{ padding: 24, minHeight: "100vh", background: "var(--pc-bg)", color: "var(--pc-foreground)" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={20} style={{ color: "var(--pc-primary)" }} />
          Open Source
        </h1>
        <p style={{ fontSize: 13, color: "var(--pc-muted)", marginTop: 4 }}>
          Portcullis is free and open source under Apache 2.0. No subscription, no payment method, no invoices.
        </p>
      </div>

      <div
        style={{
          border: "1px solid var(--pc-border)",
          borderRadius: 16,
          background: "var(--pc-surface)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <CheckCircle2 size={18} style={{ color: "var(--pc-success)" }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Apache 2.0 — Free Forever</span>
          {license?.plan && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 9999,
                background: "var(--pc-elevated)",
                border: "1px solid var(--pc-border)",
                color: "var(--pc-muted)",
              }}
            >
              plan: {license.plan}
            </span>
          )}
        </div>

        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--pc-muted)", fontSize: 13, lineHeight: "1.7" }}>
          <li>Unlimited servers, tools, and API keys — self-hosted, no seat limits enforced in code.</li>
          <li>Commercial product is Portcullis Cloud (managed hosting), not unlocked features.</li>
          <li>License: Apache-2.0 — see <code>LICENSE</code> and <code>docs/strategy.md</code>.</li>
          {license && (
            <>
              <li>
                Current entitlements{license.status ? ` (${license.status})` : ""}: {license.seat_limit ?? "—"} seats
                {license.server_limit != null ? `, ${license.server_limit} servers` : ", unlimited servers"}
              </li>
            </>
          )}
        </ul>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="https://github.com/wisdom-dosoo/portcullis"
            target="_blank"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 9999,
              background: "var(--pc-primary)",
              color: "#0B1410",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View on GitHub <ExternalLink size={14} />
          </Link>
          <Link
            href="/dashboard/billing/usage"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 9999,
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              color: "var(--pc-foreground)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            View Usage
          </Link>
        </div>

        {isLoading && <p style={{ marginTop: 12, fontSize: 12, color: "var(--pc-muted)" }}>Loading entitlements…</p>}
      </div>
    </div>
  );
}
