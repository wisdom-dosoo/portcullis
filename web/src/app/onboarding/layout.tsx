"use client";

import { Shield } from "lucide-react";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--pc-bg)" }}>
      {/* Top bar */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b" style={{ background: "#0A0F14", borderColor: "var(--pc-border)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--pc-primary)" }}>
            <Shield className="w-3.5 h-3.5" style={{ color: "#0C1116" }} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold leading-none" style={{ color: "var(--pc-foreground)" }}>Portcullis</p>
            <p className="text-[10px] font-mono" style={{ color: "var(--pc-muted)" }}>MCP Gateway</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-xs transition-colors hover:opacity-70" style={{ color: "var(--pc-muted)" }}>
          Skip setup →
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      <Toaster richColors position="top-right" />
    </div>
  );
}
