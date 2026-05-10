import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Needed so .tsx component tests get the React JSX runtime (jsx: "react-jsx").
  plugins: [react()],
  test: {
    // Default to node; hook/component tests opt in to happy-dom via the `// @vitest-environment` pragma.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
