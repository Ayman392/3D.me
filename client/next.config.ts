import type { NextConfig } from "next";

const engineBaseUrl = (
  process.env.ENGINE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "media.sketchfab.com" },
      { protocol: "https", hostname: "cdn.21st.dev" },
    ],
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/engine/:path*",
        destination: `${engineBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
