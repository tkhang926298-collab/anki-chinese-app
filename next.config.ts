import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // Fix unoptimized images warning when exporting
  images: {
    unoptimized: true,
  },
  output: "standalone",
};

export default nextConfig;
