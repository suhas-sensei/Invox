import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mailparser", "@zk-email/sdk"],
  turbopack: {},
};

export default nextConfig;
