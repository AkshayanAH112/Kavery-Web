import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ported from KCSC with their logic untouched. They take loosely typed API
  // JSON throughout; tightening that is a refactor, not part of the port.
  {
    files: ["components/cricket/**", "lib/cricket/**", "components/live/**", "components/site/ResultsView.tsx", "components/keda/**", "components/content/**", "components/members/**", "components/console/confirm-dialog.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // The KEDA screens (also ported from KCSC) load their data with the classic
  // "fetch in an effect, set loading state" pattern. It works; moving nine screens
  // to another data-loading approach is its own piece of work, not part of the port.
  {
    files: ["components/keda/**", "components/content/**", "components/members/**"],
    rules: { "react-hooks/set-state-in-effect": "off", "react-hooks/exhaustive-deps": "off", "@typescript-eslint/no-unused-vars": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare build output and generated files.
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    "drizzle/**",
  ]),
]);

export default eslintConfig;
