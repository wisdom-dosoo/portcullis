"use client";

import { Suspense } from "react";
import { Search } from "lucide-react";
import { GlobalSearch } from "@/components/global-search";

export default function DashboardSearchPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--pc-foreground)", display: "flex", alignItems: "center", gap: 10 }}>
          <Search size={20} style={{ color: "var(--pc-primary)" }} strokeWidth={1.75} />
          Global Search
        </h1>
        <p style={{ fontSize: 13, color: "var(--pc-muted)", marginTop: 4 }}>
          Search across servers, tools, policies, API keys, audit events, and documentation.
        </p>
      </div>
      <Suspense>
        <GlobalSearch context="org-admin" />
      </Suspense>
    </div>
  );
}
