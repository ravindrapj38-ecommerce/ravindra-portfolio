import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: [".next/**", "dist/**", "node_modules/**", "next-env.d.ts", "lib/core/generated/**", "test-results/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
