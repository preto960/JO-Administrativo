import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-896f3880-631a-4805-94c3-6d65bfe77bfc.space-z.ai",
    ".space-z.ai",
  ],
};

export default nextConfig;
