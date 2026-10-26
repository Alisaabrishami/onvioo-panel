import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image
  output: "standalone",
  cacheComponents: true,
  // Subtitle font for burning text into videos (read by ffmpeg at runtime)
  outputFileTracingIncludes: { "/*": ["./assets/fonts/**/*"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
