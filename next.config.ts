import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json one directory up
  // (PersonalProjects/) makes Next infer the wrong root. This dir is ours.
  turbopack: {
    root: path.join(__dirname),
  },
  // Playwright drives the dev server over 127.0.0.1; allow its HMR/dev requests.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
