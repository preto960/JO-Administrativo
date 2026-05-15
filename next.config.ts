import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-896f3880-631a-4805-94c3-6d65bfe77bfc.space-z.ai",
    ".space-z.ai",
  ],
  serverExternalPackages: ["bcryptjs"],
  env: {
    DATABASE_URL: process.env.DATABASE_URL?.startsWith("postgresql")
      ? process.env.DATABASE_URL
      : "postgresql://neondb_owner:npg_ICHtoF39sBOg@ep-flat-salad-apfgfrde-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require",
  },
  async rewrites() {
    return [
      {
        source: "/bcv-proxy/:path*",
        destination: "https://www.bcv.org.ve/:path*",
      },
    ]
  },
};

export default nextConfig;
