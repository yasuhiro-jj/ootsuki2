import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Tenant pages must not use `use cache`. Data is dynamic per user and organization.
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["@neondatabase/serverless", "ws", "@electric-sql/pglite"],
  // The repo root has an unrelated package-lock.json. Keep Turbopack rooted here.
  turbopack: {
    root: path.resolve(process.cwd()),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
