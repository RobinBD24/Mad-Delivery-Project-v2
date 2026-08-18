import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright build artifacts (generated bundles — not source to lint):
    "playwright-report/**",
    "test-results/**",
    // Ops/deploy config (PM2) — not application source, uses CJS require by design.
    "ecosystem.config.cjs",
  ]),
]);

export default eslintConfig;
