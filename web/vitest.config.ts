import { defineConfig } from "vitest/config";
import path from "path";

// P2 (v1.1 roadmap): first frontend unit suite. Run with `npm run test:unit`.
// No React plugin: initial tests cover framework-free lib modules (auth
// cookies/token storage). Add @vitejs/plugin-react when testing components.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
