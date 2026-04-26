import eslint from "@eslint/js";
import eslintComments from "eslint-plugin-eslint-comments";
import jest from "eslint-plugin-jest";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "evals/", "bin/", ".claude/**", "coverage/"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    plugins: {
      "eslint-comments": eslintComments,
      "unused-imports": unusedImports,
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/require-await": "off",
      // Agent edits should not accumulate stale suppressions or dead imports;
      // both hide real drift and are cheap for ESLint to catch.
      "eslint-comments/no-unused-disable": "error",
      "unused-imports/no-unused-imports": "error",
      // Prefer explicit, searchable structures so automated changes remain
      // reviewable and easy to repair from lint feedback.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message: "Use explicit named exports so public API changes stay reviewable.",
        },
        {
          selector: "ForInStatement",
          message: "Use Object.keys, Object.values, or Object.entries instead of for..in.",
        },
      ],
    },
  },
  {
    files: ["lib/**/*.ts", "script.ts", "tests/**/*.ts"],
    rules: {
      // Source and tests use named exports for grepability. Tooling config files
      // are excluded because many loaders expect default exports.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportAllDeclaration",
          message: "Use explicit named exports so public API changes stay reviewable.",
        },
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports in source and test files.",
        },
        {
          selector: "ForInStatement",
          message: "Use Object.keys, Object.values, or Object.entries instead of for..in.",
        },
      ],
    },
  },
  {
    files: ["eslint.config.js"],
    rules: {
      // Some ESLint plugin packages expose weak JS typings; keep that noise
      // local to this config instead of weakening application source checks.
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    // Tests are part of the agent contract too: focused/disabled tests and
    // invalid expectations should fail before review or CI.
    ...jest.configs["flat/recommended"],
  },
);
