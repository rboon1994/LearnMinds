import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop `next dev` from generating apps/web/AGENTS.md (this repo uses CLAUDE.md).
  agentRules: false,
  // For LAN access (e.g. testing from phone) — update IP to match your machine's current LAN IP, then uncomment:
  // allowedDevOrigins: ["192.168.100.226"],
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: "http://localhost:3001/:path*",
      },
    ];
  },
};

export default nextConfig;
