import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "public/sw.js.map",
    "public/workbox-*.js",
    "public/workbox-*.js.map",
  ]),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@next/next/no-img-element": "off",
      // Warn on raw hex colors so styling stays on design tokens.
      // Set to warn (not error) until Phase 4 hex codemod clears pre-existing violations.
      // globals.css is exempt (not a ts/tsx file).
      "no-restricted-syntax": [
        "warn",
        {
          "selector": "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          "message": "Tailwind arbitrary hex color — use a var(--pz-*) design token instead."
        },
        {
          "selector": "Property > Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          "message": "Raw hex color in style prop — use a var(--pz-*) design token instead."
        }
      ],
    },
  },
  {
    files: ["scripts/**/*.ts", "e2e/**/*.ts", "e2e/**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
