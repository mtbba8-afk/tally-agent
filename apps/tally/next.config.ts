import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");

const nextConfig: NextConfig = {
  // The ledger changes on every request. Leave it dynamic instead of caching a seed snapshot.
  cacheComponents: false,
  partialPrefetching: false,
  outputFileTracingRoot: repoRoot,
  transpilePackages: [
    "@tounkara/front-office",
    "@tounkara/invoice-drafting",
    "@tounkara/payment-links",
    "@tounkara/payment-followups",
    "@tounkara/reconciliation",
  ],
  turbopack: {
    // Skills live outside this app. The Vercel root is apps/tally, so resolution
    // has to start at the repo root or @tounkara/* never leaves the app folder.
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
