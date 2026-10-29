// Shared ESLint (flat) config for the Vite/React frontend and the Express server.
//
// Style is intentionally NOT enforced here — formatting (indent, quotes,
// line width) belongs to Prettier (see .prettierrc.json). eslint-config-prettier
// disables every formatting rule so the two tools never fight. Run both:
//   npm run lint          (code quality: unused vars, hook rules, etc.)
//   npm run format:check  (formatting)
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  // Build output, generated files, and the compiled Redoc docs bundle.
  {
    ignores: ["dist/", "node_modules/", "docs/index.html"],
  },

  // Code-quality baseline for everything JS-ish (incl. server + tests),
  // with every formatting rule turned off (Prettier owns those).
  {
    files: ["**/*.{js,jsx,mjs}"],
    ...js.configs.recommended,
    ...prettier,
  },

  // Frontend: browser globals + React hook / refresh rules.
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "off",
    },
  },

  // Server + tests: Node globals (console, process, crypto, ...).
  {
    files: ["server/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
    },
    // Express-style callbacks legitimately declare fixed signatures they
    // don't use (the error handler's `next` marks it as an error handler).
    // Only allow that one; everything else must still be clean.
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^next$" }],
    },
  },
];
