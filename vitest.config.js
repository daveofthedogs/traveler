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

      // Measure only modules exercised by Vitest unit tests.  ApplicationV2 UI,
      // the module entry point, PIXI renderers, and CLI scripts are covered by
      // Quench integration tests instead — including them here would make the
      // 70 % threshold unreachable without a full browser runtime.
      include: [
        "scripts/constants.js",
        "scripts/party.js",
        "scripts/proposals.js",
        "scripts/clock.js",
        "scripts/smoothing.js",
        "scripts/routes.js",
        "scripts/settings.js",
        "scripts/encounters.js",
        "scripts/pathfinding/**/*.js",
        "scripts/behaviors/**/*.js",
        "scripts/apps/player-speed-dialog.js",
        "scripts/apps/party-check-collector.js"
      ],
      exclude: [
        "scripts/vendor/**",
        // Canvas tools — require live PIXI / Foundry canvas
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
