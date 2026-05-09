import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default to node; hook tests opt in to happy-dom via the `// @vitest-environment` pragma.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
