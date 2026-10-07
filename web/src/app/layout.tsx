import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/providers/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portcullis",
  description: "MCP Gateway Admin",
};

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = <QueryProvider>{children}</QueryProvider>;
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        {/* Clerk wraps the app only once a publishable key is configured;
            without it the legacy email/API-key session still works. */}
        {CLERK_KEY ? (
          <ClerkProvider publishableKey={CLERK_KEY}>{content}</ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
