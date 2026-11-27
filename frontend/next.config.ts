import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiOrigin =
      process.env.API_INTERNAL_ORIGIN ||
      process.env.NEXT_PUBLIC_API_ORIGIN ||
      "http://127.0.0.1:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
      {
        source: "/health",
        destination: `${apiOrigin}/health`,
      },
      {
        source: "/ready",
        destination: `${apiOrigin}/ready`,
      },
    ];
  },
};

export default nextConfig;
