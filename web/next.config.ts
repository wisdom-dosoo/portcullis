import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Ship-checklist: standalone output for the production container
  // (see web/Dockerfile — only .next/standalone + static ship).
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/mcp/:path*",
        destination: `${API_URL}/mcp/:path*`,
      },
    ];
  },
};

export default nextConfig;