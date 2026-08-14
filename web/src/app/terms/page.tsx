import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Portcullis",
  description: "Terms that govern access to and use of Portcullis.",
};

const sections = [
  {
    title: "1. Acceptance",
    body: "By creating an account, signing in, or using Portcullis, you agree to these Terms. If you use Portcullis on behalf of an organization, you confirm that you have authority to bind that organization to these Terms.",
  },
  {
    title: "2. Service Use",
    body: "Portcullis provides gateway controls for MCP servers, including access policies, rate limits, audit events, and operational dashboards. You are responsible for configuring policies, upstream servers, credentials, and user permissions appropriately for your environment.",
  },
  {
    title: "3. Accounts and Credentials",
    body: "You must provide accurate account information and protect passwords, API keys, OAuth sessions, and other credentials. You are responsible for activity that occurs through your account or credentials unless caused by our breach of these Terms.",
  },
  {
    title: "4. Acceptable Use",
    body: "You may not use Portcullis to violate laws, bypass security controls, attack or overload systems, access data without permission, distribute malware, or interfere with the service or other users.",
  },
  {
    title: "5. Customer Data",
    body: "You retain ownership of data, configuration, logs, prompts, metadata, and other content you submit to Portcullis. You grant us the rights needed to operate, secure, troubleshoot, and improve the service.",
  },
  {
    title: "6. Third-Party Services",
    body: "Portcullis may connect to third-party identity providers, infrastructure, APIs, or MCP servers. Third-party services remain governed by their own terms, and you are responsible for permissions and data shared with them.",
  },
  {
    title: "7. Security",
    body: "We use reasonable technical and organizational safeguards, but no system is perfectly secure. You must promptly report suspected unauthorized access, compromised credentials, or security vulnerabilities.",
  },
  {
    title: "8. Availability and Changes",
    body: "We may update, suspend, or discontinue parts of Portcullis as needed for security, reliability, legal compliance, or product improvement. We will try to avoid material disruption where practical.",
  },
  {
    title: "9. Disclaimers",
    body: "Portcullis is provided as-is and as-available to the fullest extent permitted by law. We disclaim implied warranties, including merchantability, fitness for a particular purpose, and non-infringement.",
  },
  {
    title: "10. Liability",
    body: "To the fullest extent permitted by law, neither party will be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, goodwill, or data.",
  },
  {
    title: "11. Termination",
    body: "You may stop using Portcullis at any time. We may suspend or terminate access if you materially breach these Terms, create security risk, or use the service unlawfully.",
  },
  {
    title: "12. Contact",
    body: "Questions about these Terms can be sent to legal@portcullis.dev.",
  },
];

export default function TermsPage() {
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
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--pc-muted)" }}>
            Last updated August 14, 2026. These Terms describe the rules for using Portcullis and related services.
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
