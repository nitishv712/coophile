import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually traced as reachable. Without it a container image
  // has to carry the whole dependency tree.
  output: "standalone",
};

export default nextConfig;
