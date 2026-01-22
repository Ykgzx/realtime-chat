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
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Custom rule overrides
  {
    rules: {
      // Disable React Compiler rules that conflict with React 19 automatic batching
      "react-compiler/react-compiler": "off",
      // Allow img elements (we're not using next/image for simple images)
      "@next/next/no-img-element": "warn"
    }
  }
]);

export default eslintConfig;
