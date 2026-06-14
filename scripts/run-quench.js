#!/usr/bin/env node
/**
 * Playwright CI driver — connects to the Dockerised Foundry instance,
 * logs in as the admin GM, triggers quench.runBatches("traveler.**"), waits
 * for completion, and exits 0 (pass) or 1 (fail) based on test results.
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
  newFoundryPage,
  joinWorldAsGM,
  releaseWorldSession,
  authenticateSetup
} from "./foundry-playwright.js";

const KEEP_WORLD = process.env.TRAVELER_KEEP_WORLD === "true";
const BATCH_GLOB = "traveler.**";

/** @param {Array<{ fullTitle?: string, title?: string, err?: { message?: string, stack?: string } }>} failures */
function printFailures(failures) {
  if (!failures?.length) return;

  console.error("\n──────────────────────────────────────────");
  console.error("Failed Tests");
  console.error("──────────────────────────────────────────");

  failures.forEach((test, index) => {
    const title = test.fullTitle ?? test.title ?? "(unknown test)";
    console.error(`\n${index + 1}) ${title}`);

    const message = test.err?.message?.trim();
    if (message) {
      for (const line of message.split("\n")) {
        console.error(`   ${line}`);
      }
    }

    const stack = test.err?.stack?.trim();
    if (stack) {
      const stackLines = stack.split("\n").slice(message ? 1 : 0);
      for (const line of stackLines) {
        console.error(`   ${line}`);
      }
    }
  });

  console.error("\n──────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`[run-quench] Connecting to Foundry at ${BASE_URL}`);

  const browser = await launchBrowser();
  const page    = await newFoundryPage(browser);

  try {
    await page.goto(`${BASE_URL}/setup`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await authenticateSetup(page);
    await releaseWorldSession(page);

    await joinWorldAsGM(page);

    if (KEEP_WORLD) {
      console.log("[run-quench] TRAVELER_KEEP_WORLD=true — test artifacts will NOT be deleted.");
      await page.evaluate(() => { window.TRAVELER_KEEP_WORLD = true; });
    }

    const quenchAvailable = await page.evaluate(() =>
      typeof window.quench?.runBatches === "function"
    );
    if (!quenchAvailable) {
      throw new Error(
        "Quench is not available. Run `npm run foundry:bootstrap` before integration tests."
      );
    }

    await page.waitForFunction(() => {
      const batches = globalThis.quench?._testBatches;
      if (!batches?.size) return false;
      return [...batches.keys()].some((key) => key.startsWith("traveler."));
    }, { timeout: 60_000 });

    const batchNames = await page.evaluate(() =>
      [...globalThis.quench._testBatches.keys()].filter((key) => key.startsWith("traveler."))
    );
    console.log(`[run-quench] Registered batches: ${batchNames.join(", ")}`);

    console.log("[run-quench] Running Quench test suites…");
    const results = await page.evaluate(async (glob) => {
      if (quench._currentRunner) quench.abort();

      // Quench v0.10 on Foundry v14 requires the runner app to be rendered
      // before programmatic runBatches() will execute (otherwise Mocha hangs).
      await quench.app.render(true);
      quench.mocha.timeout(180_000);

      const runner = await quench.runBatches(glob);
      const runEnd = Mocha.Runner.constants.EVENT_RUN_END;

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Quench run did not finish within 4 minutes"));
        }, 4 * 60 * 1000);

        runner.once(runEnd, () => {
          clearTimeout(timer);
          resolve();
        });
      });

      const report = quench.reports?.json ? JSON.parse(quench.reports.json) : null;
      const stats = report?.stats ?? runner.stats ?? {};
      const batches = [...quench._testBatches.values()]
        .filter((batch) => batch.key.startsWith("traveler."))
        .map((batch) => ({
          name: batch.displayName ?? batch.key,
          key:  batch.key
        }));

      const failedTests = report?.failures?.length
        ? report.failures
        : (report?.tests ?? []).filter((t) => t.state === "failed");

      return {
        totalPassed:  stats.passes   ?? 0,
        totalFailed:  stats.failures ?? 0,
        totalPending: stats.pending  ?? 0,
        totalTests:   stats.tests    ?? 0,
        batches,
        failures: failedTests.map((t) => ({
          fullTitle: t.fullTitle ?? t.title,
          title:     t.title,
          err:       t.err ? { message: t.err.message, stack: t.err.stack } : undefined
        }))
      };
    }, BATCH_GLOB);

    console.log("\n──────────────────────────────────────────");
    console.log("Quench Results");
    console.log("──────────────────────────────────────────");
    for (const b of results.batches) {
      console.log(`  • ${b.name} (${b.key})`);
    }
    console.log("──────────────────────────────────────────");
    console.log(
      `Total: ${results.totalPassed} passed / ${results.totalFailed} failed / ` +
      `${results.totalPending} pending (${results.totalTests} tests)`
    );
    console.log("──────────────────────────────────────────\n");

    await browser.close();

    if (results.totalTests === 0) {
      console.error("[run-quench] No Traveler tests ran — batches may not have registered.");
      process.exit(1);
    }

    if (results.totalFailed > 0) {
      printFailures(results.failures);
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
