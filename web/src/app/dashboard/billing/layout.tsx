"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, BarChart2 } from "lucide-react";

const TABS = [
  { href: "/dashboard/billing/usage",        label: "Usage",        icon: BarChart2  },
  { href: "/dashboard/billing/subscription", label: "Subscription", icon: CreditCard },
];

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ padding: 24, minHeight: "100vh", background: "var(--pc-bg)", color: "var(--pc-foreground)" }}>
      {/* header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <CreditCard size={20} style={{ color: "var(--pc-primary)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Billing &amp; Usage</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--pc-muted)" }}>
          Monitor consumption, manage your plan, and review invoices.
        </p>
      </div>

      {/* tab bar */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--pc-border)",
          marginBottom: 24,
        }}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                color: active ? "var(--pc-primary)" : "var(--pc-muted)",
                borderBottom: `2px solid ${active ? "var(--pc-primary)" : "transparent"}`,
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              <Icon size={14} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* page content */}
      {children}
    </div>
  );
}
