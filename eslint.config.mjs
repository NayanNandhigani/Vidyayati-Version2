import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    rules: {
      // Purely cosmetic (HTML-entity purism for straight quotes/apostrophes
      // in JSX text) — zero runtime or rendering effect either way. Off so
      // CI's lint gate stays meaningful without hand-escaping quotes across
      // ~30 largely text-heavy admin screens.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
