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
      // Raw hex colors are banned — use var(--pz-*) design tokens instead.
      // Bucket A/B overrides below exempt intentional literal files.
      // globals.css is exempt (not a ts/tsx file).
      "no-restricted-syntax": [
        "error",
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
  // Bucket A — intentional hex literals: brand source, templates/pdf generation,
  // error boundaries, tests, QR-render files, lib/passes library hex
  {
    files: [
      "src/lib/brand.ts",
      "src/lib/templates/**",
      "src/lib/pdf/**",
      "src/app/global-error.tsx",
      "src/app/**/error.tsx",
      "src/__tests__/**",
      "**/qr-display.tsx",
      "**/VCardQR.tsx",
      "**/badges/print/route.ts",
      "src/lib/passes/**",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Bucket B — Phase 5b defer: marketing landing
  // TODO(phase-5b): tokenize remaining hex here
  {
    files: [
      "src/app/page.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // category-colors.ts is the single-source-of-truth for semantic color palettes;
  // hex literals are intentional here and managed as a unit
  {
    files: ["src/lib/ui/category-colors.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
