// Flat config. The one rule that matters most here is `no-undef` — three
// separate bugs in this codebase (cipher, contentKeyFile, gasless) were state
// variables used before they were declared, and each one only surfaced at
// runtime after a minute of proof generation. This catches them on save.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", "node_modules/", "public/circuits/"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, BigInt: "readonly" },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.2" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/__tests__/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["src/workers/**"],
    languageOptions: { globals: { ...globals.worker } },
  },
];
