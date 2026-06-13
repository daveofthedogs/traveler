import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run in Node — Foundry globals are stubbed in tests/setup.js
    environment: "node",

    // Runs before every test file; sets up all Foundry global stubs
    setupFiles: ["tests/setup.js"],

    // Make describe/it/expect available without importing
    globals: true,

    // Only pick up unit tests (Quench suites run inside Foundry, not here)
    include: ["tests/unit/**/*.test.js"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage",
      include: ["scripts/**/*.js"],
      exclude: [
        "scripts/vendor/**",
        // Exclude files that rely heavily on PIXI / canvas runtime
        "scripts/renderer.js",
        "scripts/tool.js",
        "scripts/tool-player.js"
      ],
      thresholds: {
        lines:      70,
        functions:  70,
        branches:   60,
        statements: 70
      }
    }
  }
});
