#!/usr/bin/env node
/**
 * Playwright CI driver — connects to the Dockerised Foundry instance,
 * logs in as the admin GM, triggers quench.runAll(), waits for completion,
 * and exits 0 (pass) or 1 (fail) based on test results.
 *
 * Prerequisites: run `npm run foundry:bootstrap` first to install dnd5e + Quench.
 *
 * Usage:
 *   FOUNDRY_URL=http://localhost:30000 \
 *   FOUNDRY_ADMIN_KEY=admin            \
 *   node scripts/run-quench.js
 */

import {
  BASE_URL,
  launchBrowser,
  joinWorldAsGM
} from "./foundry-playwright.js";

const TIMEOUT_MS = parseInt(process.env.QUENCH_TIMEOUT_MS ?? "300000", 10);
const KEEP_WORLD = process.env.TRAVELER_KEEP_WORLD === "true";

// ---------------------------------------------------------------------------

async function main() {
  console.log(`[run-quench] Connecting to Foundry at ${BASE_URL}`);

  const browser = await launchBrowser();
  const page    = await browser.newPage();

  try {
    await joinWorldAsGM(page);

    if (KEEP_WORLD) {
      console.log("[run-quench] TRAVELER_KEEP_WORLD=true — test artifacts will NOT be deleted.");
      await page.evaluate(() => { window.TRAVELER_KEEP_WORLD = true; });
    }

    const quenchAvailable = await page.evaluate(() => typeof window.quench !== "undefined");
    if (!quenchAvailable) {
      throw new Error(
        "Quench is not available. Run `npm run foundry:bootstrap` before integration tests."
      );
    }

    console.log("[run-quench] Running Quench test suites…");
    const results = await page.evaluate(async () => {
      await quench.runAll();

      const stats = quench.stats ?? {};
      const batches = [...(quench.suites?.values?.() ?? [])].map((suite) => ({
        name:    suite.displayName ?? suite.packageName,
        passed:  suite.stats?.passes ?? 0,
        failed:  suite.stats?.failures ?? 0,
        pending: suite.stats?.pending ?? 0
      }));

      return {
        totalPassed:  stats.passes   ?? batches.reduce((n, b) => n + b.passed,  0),
        totalFailed:  stats.failures ?? batches.reduce((n, b) => n + b.failed,  0),
        totalPending: stats.pending  ?? batches.reduce((n, b) => n + b.pending, 0),
        batches
      };
    });

    console.log("\n──────────────────────────────────────────");
    console.log("Quench Results");
    console.log("──────────────────────────────────────────");
    for (const b of results.batches) {
      const status = b.failed > 0 ? "✗" : "✓";
      console.log(`  ${status}  ${b.name}  (${b.passed} passed, ${b.failed} failed, ${b.pending} pending)`);
    }
    console.log("──────────────────────────────────────────");
    console.log(`Total: ${results.totalPassed} passed / ${results.totalFailed} failed / ${results.totalPending} pending`);
    console.log("──────────────────────────────────────────\n");

    await browser.close();

    if (results.totalFailed > 0) {
      console.error(`[run-quench] ${results.totalFailed} test(s) failed.`);
      process.exit(1);
    }

    console.log("[run-quench] All tests passed.");
    if (KEEP_WORLD) {
      console.log("\n──────────────────────────────────────────");
      console.log("INSPECT MODE — container still running.");
      console.log(`Open ${BASE_URL} in a browser and log in as GM.`);
      console.log("Test scenes, actors, notes and tokens are preserved.");
      console.log("Run `npm run world:clean` when you are done.");
      console.log("──────────────────────────────────────────\n");
    }
    process.exit(0);

  } catch (err) {
    console.error("[run-quench] Error:", err.message);
    await browser.close();
    process.exit(1);
  }
}

main();
