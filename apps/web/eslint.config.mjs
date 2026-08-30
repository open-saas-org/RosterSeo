import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

// eslint-config-next ships as a legacy (non-flat) config - FlatCompat is
// Next.js's own documented bridge for using it under ESLint 9's flat
// config, same pattern `create-next-app`'s own scaffold generates.
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
];

export default eslintConfig;
