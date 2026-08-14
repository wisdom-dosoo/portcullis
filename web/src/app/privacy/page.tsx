import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Portcullis",
  description: "How Portcullis collects, uses, protects, and retains information.",
};

const sections = [
  {
    title: "1. Information We Collect",
    body: "We collect account information such as name, email address, organization details, authentication provider identifiers, and security settings. We also collect configuration data for MCP servers, policies, rate limits, roles, and integrations.",
  },
  {
    title: "2. Usage and Audit Data",
    body: "Portcullis may process operational telemetry, audit logs, API request metadata, tool names, outcomes, timestamps, IP addresses, device information, and diagnostic events to provide security, observability, and reliability features.",
  },
  {
    title: "3. Credentials and Secrets",
    body: "API keys, service tokens, OAuth tokens, and secrets should be stored only in supported secret fields or environment variables. We use safeguards designed to avoid exposing secret values in dashboards, generated clients, and logs.",
  },
  {
    title: "4. How We Use Information",
    body: "We use information to operate Portcullis, authenticate users, enforce access controls, route requests, monitor reliability, investigate abuse, improve product quality, provide support, and comply with legal obligations.",
  },
  {
    title: "5. Sharing",
    body: "We do not sell personal information. We may share information with service providers that help us operate Portcullis, with connected third-party services you authorize, within your organization, or when required by law.",
  },
  {
    title: "6. Retention",
    body: "We retain information for as long as needed to provide the service, meet security and audit requirements, resolve disputes, enforce agreements, and comply with law. Administrators may configure or request deletion where supported.",
  },
  {
    title: "7. Security",
    body: "We use reasonable administrative, technical, and physical safeguards for information we process. You remain responsible for protecting local environments, connected servers, credentials, and account access.",
  },
  {
    title: "8. International Processing",
    body: "Information may be processed in countries where we or our service providers operate. We use appropriate safeguards when transferring information across borders as required by applicable law.",
  },
  {
    title: "9. Your Choices",
    body: "Depending on your location and account type, you may request access, correction, export, deletion, or restriction of certain personal information. Organization-managed accounts may require requests through an administrator.",
  },
  {
    title: "10. Changes",
    body: "We may update this Privacy Policy to reflect product, legal, or operational changes. Material changes will be communicated through reasonable means.",
  },
  {
    title: "11. Contact",
    body: "Questions about privacy can be sent to privacy@portcullis.dev.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-8 lg:px-12" style={{ background: "var(--pc-bg)", color: "var(--pc-foreground)" }}>
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm hover:underline" style={{ color: "var(--pc-primary)" }}>
          Back to sign in
        </Link>
        <header className="mt-8 border-b pb-8" style={{ borderColor: "var(--pc-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pc-muted)" }}>
            Portcullis legal
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--pc-muted)" }}>
            Last updated August 14, 2026. This policy explains how Portcullis handles information when you use the service.
          </p>
        </header>

        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--pc-muted)" }}>
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
