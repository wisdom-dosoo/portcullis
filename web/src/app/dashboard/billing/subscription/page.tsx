"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  FileText,
  AlertTriangle,
  ChevronRight,
  Plus,
  Trash2,
  Download,
  Zap,
  Shield,
  Building2,
  X,
} from "lucide-react";

/* ── types ───────────────────────────────────────────────────────────────── */

type PlanId = "free" | "starter" | "pro" | "enterprise";
type BillingCycle = "monthly" | "annual";
type InvoiceStatus = "paid" | "open" | "void";

interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  requestLimit: number;
  serverLimit: number;
  memberLimit: number;
  retentionDays: number;
  retentionGB: number;
  transferGB: number;
  features: string[];
  highlight?: boolean;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  description: string;
  pdfUrl: string;
}

/* ── data ────────────────────────────────────────────────────────────────── */

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    requestLimit: 10_000,
    serverLimit: 2,
    memberLimit: 3,
    retentionDays: 7,
    retentionGB: 1,
    transferGB: 5,
    features: [
      "10,000 requests / month",
      "2 MCP servers",
      "3 team members",
      "7-day log retention",
      "Community support",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 49,
    annualPrice: 39,
    requestLimit: 100_000,
    serverLimit: 5,
    memberLimit: 10,
    retentionDays: 30,
    retentionGB: 10,
    transferGB: 25,
    features: [
      "100,000 requests / month",
      "5 MCP servers",
      "10 team members",
      "30-day log retention",
      "Slack & email alerts",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 149,
    annualPrice: 119,
    requestLimit: 500_000,
    serverLimit: 20,
    memberLimit: 25,
    retentionDays: 90,
    retentionGB: 50,
    transferGB: 100,
    features: [
      "500,000 requests / month",
      "20 MCP servers",
      "25 team members",
      "90-day log retention",
      "All notification channels",
      "Audit log export",
      "Priority support",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 0,
    annualPrice: 0,
    requestLimit: -1,
    serverLimit: -1,
    memberLimit: -1,
    retentionDays: 365,
    retentionGB: -1,
    transferGB: -1,
    features: [
      "Unlimited requests",
      "Unlimited servers",
      "Unlimited members",
      "1-year log retention",
      "Custom retention",
      "SSO / SAML",
      "SLA guarantee",
      "Dedicated support",
    ],
  },
];

const CURRENT_PLAN: PlanId = "pro";

const INITIAL_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "pm-1",
    brand: "Visa",
    last4: "4242",
    expMonth: 11,
    expYear: 2027,
    isDefault: true,
  },
  {
    id: "pm-2",
    brand: "Mastercard",
    last4: "5555",
    expMonth: 3,
    expYear: 2026,
    isDefault: false,
  },
];

const INVOICES: Invoice[] = [
  {
    id: "inv-1",
    number: "INV-2026-008",
    date: "2026-08-01",
    dueDate: "2026-08-01",
    amount: 149.0,
    status: "paid",
    description: "Portcullis Pro — August 2026",
    pdfUrl: "#",
  },
  {
    id: "inv-2",
    number: "INV-2026-007",
    date: "2026-07-01",
    dueDate: "2026-07-01",
    amount: 149.0,
    status: "paid",
    description: "Portcullis Pro — July 2026",
    pdfUrl: "#",
  },
  {
    id: "inv-3",
    number: "INV-2026-006",
    date: "2026-06-01",
    dueDate: "2026-06-01",
    amount: 149.0,
    status: "paid",
    description: "Portcullis Pro — June 2026",
    pdfUrl: "#",
  },
  {
    id: "inv-4",
    number: "INV-2026-005",
    date: "2026-05-01",
    dueDate: "2026-05-01",
    amount: 149.0,
    status: "paid",
    description: "Portcullis Pro — May 2026",
    pdfUrl: "#",
  },
  {
    id: "inv-5",
    number: "INV-2026-004",
    date: "2026-04-01",
    dueDate: "2026-04-01",
    amount: 149.0,
    status: "paid",
    description: "Portcullis Pro — April 2026",
    pdfUrl: "#",
  },
  {
    id: "inv-6",
    number: "INV-2026-003",
    date: "2026-03-01",
    dueDate: "2026-03-01",
    amount: 49.0,
    status: "paid",
    description: "Portcullis Starter — March 2026",
    pdfUrl: "#",
  },
];

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtLimit(n: number, unit = "") {
  if (n < 0) return "Unlimited";
  if (n >= 1_000_000) return `${n / 1_000_000}M${unit}`;
  if (n >= 1_000) return `${n / 1_000}k${unit}`;
  return `${n}${unit}`;
}

function planIcon(id: PlanId) {
  if (id === "free") return <Shield size={16} />;
  if (id === "starter") return <Zap size={16} />;
  if (id === "pro") return <CheckCircle2 size={16} />;
  return <Building2 size={16} />;
}

const INVOICE_STATUS_CFG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  paid: { label: "Paid", color: "var(--pc-success)", bg: "rgba(53,200,138,0.12)" },
  open: { label: "Open", color: "var(--pc-warning)", bg: "rgba(244,185,66,0.12)" },
  void: { label: "Void", color: "var(--pc-muted)", bg: "rgba(139,152,167,0.12)" },
};

const CARD_BRAND_COLOR: Record<string, string> = {
  Visa: "#1A1F71",
  Mastercard: "#EB001B",
  Amex: "#007BC1",
  Discover: "#FF6600",
};

/* ── sub-components ──────────────────────────────────────────────────────── */

function CardBrandIcon({ brand }: { brand: string }) {
  const color = CARD_BRAND_COLOR[brand] ?? "var(--pc-muted)";
  return (
    <div
      style={{
        width: 36,
        height: 24,
        borderRadius: 4,
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 800,
        color: "#fff",
        letterSpacing: 0.5,
        flexShrink: 0,
      }}
    >
      {brand.slice(0, 4).toUpperCase()}
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--pc-surface)",
        border: "1px solid var(--pc-border)",
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--pc-border)",
          background: "var(--pc-elevated)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

/* ── modals ──────────────────────────────────────────────────────────────── */

function AddCardModal({ onClose, onAdd }: { onClose: () => void; onAdd: (pm: PaymentMethod) => void }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const last4 = number.replace(/\s/g, "").slice(-4) || "0000";
      const [em, ey] = expiry.split("/").map((s) => parseInt(s.trim(), 10));
      onAdd({
        id: `pm-${Date.now()}`,
        brand: number.startsWith("4") ? "Visa" : "Mastercard",
        last4,
        expMonth: em || 1,
        expYear: 2000 + (ey || 99),
        isDefault: false,
      });
      onClose();
    }, 800);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "var(--pc-elevated)",
    border: "1px solid var(--pc-border)",
    borderRadius: 6,
    color: "var(--pc-foreground)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--pc-muted)",
    display: "block",
    marginBottom: 5,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 10,
          width: 400,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Add payment method</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Cardholder name</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />
          </div>
          <div>
            <label style={labelStyle}>Card number</label>
            <input
              style={inputStyle}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="4242 4242 4242 4242"
              maxLength={19}
              required
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Expiry</label>
              <input style={inputStyle} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM / YY" required />
            </div>
            <div>
              <label style={labelStyle}>CVC</label>
              <input style={inputStyle} value={cvc} onChange={(e) => setCvc(e.target.value)} placeholder="123" maxLength={4} required />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: "10px 0",
              background: "var(--pc-primary)",
              border: "none",
              borderRadius: 6,
              color: "#0C1116",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Adding…" : "Add card"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ChangePlanModal({
  currentPlan,
  targetPlan,
  cycle,
  onClose,
  onConfirm,
}: {
  currentPlan: Plan;
  targetPlan: Plan;
  cycle: BillingCycle;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const price = cycle === "annual" ? targetPlan.annualPrice : targetPlan.monthlyPrice;
  const currentPrice = cycle === "annual" ? currentPlan.annualPrice : currentPlan.monthlyPrice;
  const isUpgrade = price > currentPrice;
  const isDowngrade = price < currentPrice;
  const isEnterprise = targetPlan.id === "enterprise";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 10,
          width: 440,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {isEnterprise ? "Contact sales" : isUpgrade ? "Upgrade plan" : "Downgrade plan"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}>
            <X size={16} />
          </button>
        </div>

        {isEnterprise ? (
          <div style={{ fontSize: 13, color: "var(--pc-muted)", lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              Enterprise plans are custom-quoted. Reach out to discuss volume pricing, SLA guarantees, SSO/SAML, and dedicated infrastructure.
            </p>
            <a
              href="mailto:sales@portcullis.dev"
              style={{
                display: "inline-block",
                padding: "9px 18px",
                background: "var(--pc-primary)",
                color: "#0C1116",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Contact sales →
            </a>
          </div>
        ) : (
          <>
            <div
              style={{
                padding: 14,
                background: "var(--pc-elevated)",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--pc-muted)" }}>Current plan</span>
                <span style={{ fontWeight: 600 }}>{currentPlan.name} — {fmtUsd(currentPrice)}/mo</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--pc-muted)" }}>New plan</span>
                <span style={{ fontWeight: 600, color: isUpgrade ? "var(--pc-primary)" : "var(--pc-warning)" }}>
                  {targetPlan.name} — {fmtUsd(price)}/mo
                </span>
              </div>
            </div>

            {isDowngrade && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 12,
                  background: "rgba(244,185,66,0.08)",
                  border: "1px solid rgba(244,185,66,0.25)",
                  borderRadius: 7,
                  fontSize: 12,
                  color: "var(--pc-warning)",
                  marginBottom: 16,
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Downgrading will take effect at the end of your current billing period. Some features may become unavailable.
              </div>
            )}

            <p style={{ fontSize: 12, color: "var(--pc-muted)", marginBottom: 16 }}>
              {isUpgrade
                ? "Your card on file will be charged a prorated amount immediately. Future invoices will reflect the new plan price."
                : "No charge today. The downgrade takes effect on your next billing date (September 1, 2026)."}
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--pc-border)",
                  borderRadius: 6,
                  color: "var(--pc-muted)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                style={{
                  padding: "8px 16px",
                  background: isUpgrade ? "var(--pc-primary)" : "var(--pc-warning)",
                  border: "none",
                  borderRadius: 6,
                  color: isUpgrade ? "#0C1116" : "#0C1116",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isUpgrade ? `Upgrade to ${targetPlan.name}` : `Downgrade to ${targetPlan.name}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CancelModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 10,
          width: 440,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--pc-critical)" }}>Cancel subscription</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pc-muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: 12,
            background: "rgba(240,93,94,0.08)",
            border: "1px solid rgba(240,93,94,0.25)",
            borderRadius: 7,
            fontSize: 12,
            color: "var(--pc-critical)",
            marginBottom: 16,
            lineHeight: 1.7,
          }}
        >
          <strong>Warning:</strong> cancelling will downgrade your account to Free at the end of the current billing period (August 31, 2026).
          You&apos;ll lose access to all Pro features including servers above limit, logs older than 7 days, and team members above 3.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-muted)", display: "block", marginBottom: 6 }}>
            Reason for cancelling (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Help us improve…"
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "var(--pc-elevated)",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-foreground)",
              fontSize: 13,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <label
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 18 }}
        >
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I understand my account will be downgraded to Free on September 1, 2026</span>
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid var(--pc-border)",
              borderRadius: 6,
              color: "var(--pc-muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Keep my plan
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            style={{
              padding: "8px 16px",
              background: confirmed ? "var(--pc-critical)" : "var(--pc-border)",
              border: "none",
              borderRadius: 6,
              color: confirmed ? "#fff" : "var(--pc-muted)",
              fontSize: 13,
              fontWeight: 700,
              cursor: confirmed ? "pointer" : "default",
            }}
          >
            Cancel subscription
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── main page ────────────────────────────────────────────────────────────── */

export default function SubscriptionPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [activePlan, setActivePlan] = useState<PlanId>(CURRENT_PLAN);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(INITIAL_PAYMENT_METHODS);
  const [showAddCard, setShowAddCard] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<Plan | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const currentPlan = PLANS.find((p) => p.id === activePlan)!;
  const activeIndex = PLANS.findIndex((p) => p.id === activePlan);

  function flashSuccess(msg: string) {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 4000);
  }

  function handlePlanConfirm() {
    if (!changePlanTarget) return;
    setActivePlan(changePlanTarget.id);
    flashSuccess(`Plan changed to ${changePlanTarget.name}.`);
    setChangePlanTarget(null);
  }

  function handleCancelConfirm() {
    setShowCancelModal(false);
    flashSuccess("Subscription cancelled. Your plan will revert to Free on September 1, 2026.");
  }

  function addPaymentMethod(pm: PaymentMethod) {
    setPaymentMethods((prev) => [...prev, pm]);
    flashSuccess("Payment method added.");
  }

  function removePaymentMethod(id: string) {
    setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id));
  }

  function setDefaultPaymentMethod(id: string) {
    setPaymentMethods((prev) =>
      prev.map((pm) => ({ ...pm, isDefault: pm.id === id }))
    );
    flashSuccess("Default payment method updated.");
  }

  const currentMonthlyPrice = cycle === "annual" ? currentPlan.annualPrice : currentPlan.monthlyPrice;
  const nextBillingDate = "September 1, 2026";
  const nextInvoiceAmount = currentMonthlyPrice;

  return (
    <div
      style={{
        color: "var(--pc-foreground)",
        maxWidth: 900,
      }}
    >

      {/* success banner */}
      {successBanner && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(53,200,138,0.1)",
            border: "1px solid rgba(53,200,138,0.3)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--pc-success)",
            marginBottom: 20,
          }}
        >
          <CheckCircle2 size={15} />
          {successBanner}
        </div>
      )}

      {/* current plan banner */}
      <div
        style={{
          padding: 18,
          background: "var(--pc-surface)",
          border: "1px solid var(--pc-border)",
          borderRadius: 10,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "rgba(45,212,167,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--pc-primary)",
            }}
          >
            {planIcon(activePlan)}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{currentPlan.name}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 8,
                  background: "rgba(45,212,167,0.12)",
                  color: "var(--pc-primary)",
                }}
              >
                ACTIVE
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--pc-muted)", marginTop: 2 }}>
              {currentPlan.id === "enterprise"
                ? "Custom pricing"
                : currentPlan.monthlyPrice === 0
                ? "Free forever"
                : `${fmtUsd(currentMonthlyPrice)} / month · billed ${cycle}`}
              {" · "}Next invoice on {nextBillingDate}
            </div>
          </div>
        </div>

        {/* billing cycle toggle */}
        {currentPlan.id !== "free" && currentPlan.id !== "enterprise" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              background: "var(--pc-elevated)",
              borderRadius: 8,
              padding: 3,
              border: "1px solid var(--pc-border)",
            }}
          >
            {(["monthly", "annual"] as BillingCycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  background: cycle === c ? "var(--pc-primary)" : "transparent",
                  color: cycle === c ? "#0C1116" : "var(--pc-muted)",
                  cursor: "pointer",
                }}
              >
                {c === "monthly" ? "Monthly" : "Annual (20% off)"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* included limits */}
      <SectionCard title="Included limits">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Requests / month", value: fmtLimit(currentPlan.requestLimit) },
            { label: "MCP servers", value: fmtLimit(currentPlan.serverLimit) },
            { label: "Team members", value: fmtLimit(currentPlan.memberLimit) },
            { label: "Log retention", value: currentPlan.retentionDays < 0 ? "Unlimited" : `${currentPlan.retentionDays} days` },
            { label: "Retention storage", value: fmtLimit(currentPlan.retentionGB, " GB") },
            { label: "Data transfer", value: fmtLimit(currentPlan.transferGB, " GB") },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                padding: 12,
                background: "var(--pc-elevated)",
                borderRadius: 8,
                border: "1px solid var(--pc-border)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--pc-muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* plan comparison / change plan */}
      <SectionCard title="Change plan">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {PLANS.map((plan, idx) => {
            const price = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const isCurrent = plan.id === activePlan;
            const isEnterprise = plan.id === "enterprise";
            const isUpgrade = idx > activeIndex;
            const isDowngrade = idx < activeIndex;

            return (
              <div
                key={plan.id}
                style={{
                  padding: 16,
                  border: `1px solid ${isCurrent ? "var(--pc-primary)" : plan.highlight ? "var(--pc-border)" : "var(--pc-border)"}`,
                  borderRadius: 10,
                  background: isCurrent ? "rgba(45,212,167,0.05)" : plan.highlight ? "rgba(72,184,232,0.04)" : "var(--pc-elevated)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  position: "relative",
                }}
              >
                {plan.highlight && !isCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--pc-secondary)",
                      color: "#0C1116",
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    POPULAR
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: isCurrent ? "var(--pc-primary)" : "var(--pc-muted)" }}>
                    {planIcon(plan.id)}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{plan.name}</span>
                </div>

                <div>
                  {isEnterprise ? (
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pc-muted)" }}>Custom</span>
                  ) : price === 0 ? (
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Free</span>
                  ) : (
                    <span style={{ fontSize: 20, fontWeight: 800 }}>
                      {fmtUsd(price)}
                      <span style={{ fontSize: 12, fontWeight: 400, color: "var(--pc-muted)" }}>/mo</span>
                    </span>
                  )}
                </div>

                <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--pc-muted)", alignItems: "flex-start" }}>
                      <CheckCircle2 size={11} style={{ color: "var(--pc-success)", flexShrink: 0, marginTop: 2 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "rgba(45,212,167,0.12)",
                      color: "var(--pc-primary)",
                      fontSize: 12,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    Current plan
                  </div>
                ) : (
                  <button
                    onClick={() => setChangePlanTarget(plan)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: isEnterprise
                        ? "var(--pc-secondary)"
                        : isUpgrade
                        ? "var(--pc-primary)"
                        : "transparent",
                      border: isDowngrade ? "1px solid var(--pc-border)" : "none",
                      color: isEnterprise || isUpgrade ? "#0C1116" : "var(--pc-muted)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {isEnterprise ? "Contact sales" : isUpgrade ? `Upgrade →` : `Downgrade`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* payment methods */}
      <SectionCard
        title="Payment methods"
        action={
          <button
            onClick={() => setShowAddCard(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              background: "var(--pc-primary)",
              border: "none",
              borderRadius: 6,
              color: "#0C1116",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Plus size={12} />
            Add card
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paymentMethods.map((pm) => (
            <div
              key={pm.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                background: pm.isDefault ? "rgba(45,212,167,0.04)" : "var(--pc-elevated)",
                border: `1px solid ${pm.isDefault ? "rgba(45,212,167,0.2)" : "var(--pc-border)"}`,
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <CardBrandIcon brand={pm.brand} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {pm.brand} ···· {pm.last4}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--pc-muted)" }}>
                    Expires {pm.expMonth.toString().padStart(2, "0")}/{pm.expYear}
                  </div>
                </div>
                {pm.isDefault && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 8,
                      background: "rgba(45,212,167,0.12)",
                      color: "var(--pc-primary)",
                    }}
                  >
                    DEFAULT
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!pm.isDefault && (
                  <button
                    onClick={() => setDefaultPaymentMethod(pm.id)}
                    style={{
                      padding: "4px 10px",
                      background: "transparent",
                      border: "1px solid var(--pc-border)",
                      borderRadius: 5,
                      color: "var(--pc-muted)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => removePaymentMethod(pm.id)}
                  disabled={pm.isDefault}
                  title={pm.isDefault ? "Cannot remove default payment method" : "Remove"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: pm.isDefault ? "default" : "pointer",
                    color: pm.isDefault ? "var(--pc-border)" : "var(--pc-critical)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {paymentMethods.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: "var(--pc-muted)",
                background: "var(--pc-elevated)",
                borderRadius: 8,
                border: "1px dashed var(--pc-border)",
              }}
            >
              <CreditCard size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>No payment methods on file</div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* next invoice */}
      <SectionCard title="Next invoice">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 14,
            background: "var(--pc-elevated)",
            borderRadius: 8,
            border: "1px solid var(--pc-border)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Portcullis {currentPlan.name} — September 2026
            </div>
            <div style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 3 }}>
              Due on {nextBillingDate} · Charged to {paymentMethods.find((pm) => pm.isDefault)?.brand} ···· {paymentMethods.find((pm) => pm.isDefault)?.last4 ?? "—"}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {fmtUsd(nextInvoiceAmount)}
          </div>
        </div>
      </SectionCard>

      {/* invoice history */}
      <SectionCard title="Invoice history">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--pc-border)" }}>
              {["Invoice", "Date", "Description", "Amount", "Status", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--pc-muted)",
                    textAlign: "left",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INVOICES.map((inv) => {
              const cfg = INVOICE_STATUS_CFG[inv.status];
              return (
                <tr
                  key={inv.id}
                  style={{ borderBottom: "1px solid var(--pc-border)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--pc-elevated)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, color: "var(--pc-secondary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <FileText size={13} />
                      {inv.number}
                    </div>
                  </td>
                  <td style={{ padding: "10px 10px", fontSize: 12, color: "var(--pc-muted)" }}>{inv.date}</td>
                  <td style={{ padding: "10px 10px", fontSize: 12 }}>{inv.description}</td>
                  <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600 }}>{fmtUsd(inv.amount)}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 8,
                        background: cfg.bg,
                        color: cfg.color,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <a
                      href={inv.pdfUrl}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "var(--pc-muted)",
                        textDecoration: "none",
                      }}
                      onClick={(e) => e.preventDefault()}
                    >
                      <Download size={12} />
                      PDF
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      {/* danger zone: cancel */}
      <div
        style={{
          padding: 18,
          background: "rgba(240,93,94,0.04)",
          border: "1px solid rgba(240,93,94,0.2)",
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pc-critical)", marginBottom: 3 }}>
            Cancel subscription
          </div>
          <div style={{ fontSize: 12, color: "var(--pc-muted)" }}>
            Your account will revert to the Free plan at the end of the current billing period.
            Logs, servers, and members over the Free limit will be archived.
          </div>
        </div>
        <button
          onClick={() => setShowCancelModal(true)}
          style={{
            padding: "8px 16px",
            background: "transparent",
            border: "1px solid var(--pc-critical)",
            borderRadius: 6,
            color: "var(--pc-critical)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Cancel subscription
        </button>
      </div>

      {/* modals */}
      {showAddCard && (
        <AddCardModal onClose={() => setShowAddCard(false)} onAdd={addPaymentMethod} />
      )}

      {changePlanTarget && (
        <ChangePlanModal
          currentPlan={currentPlan}
          targetPlan={changePlanTarget}
          cycle={cycle}
          onClose={() => setChangePlanTarget(null)}
          onConfirm={handlePlanConfirm}
        />
      )}

      {showCancelModal && (
        <CancelModal onClose={() => setShowCancelModal(false)} onConfirm={handleCancelConfirm} />
      )}
    </div>
  );
}
