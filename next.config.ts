/* eslint-disable prettier/prettier */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis", "airtable"],
  webpack(config, { dev }) {
    if (dev) {
      // Windows: parentheses in route-group paths break atomic HMR file swaps.
      // Memory cache avoids the disk-rename step entirely in dev.
      config.cache = { type: "memory" };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/widget",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
