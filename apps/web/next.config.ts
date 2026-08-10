import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
