import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../../"),
  serverExternalPackages: ["@sparticuz/chromium"],
};

export default nextConfig;
