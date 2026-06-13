#!/usr/bin/env node
/**
 * Playwright CI driver — connects to the Dockerised Foundry instance,
 * logs in as the admin GM, triggers quench.runAll(), waits for completion,
 * and exits 0 (pass) or 1 (fail) based on test results.
 *
 * Usage:
 *   FOUNDRY_URL=http://localhost:30000 \
 *   FOUNDRY_ADMIN_KEY=admin            \
 *   node scripts/run-quench.js
 */

import { chromium } from "playwright";

const BASE_URL    = process.env.FOUNDRY_URL        ?? "http://localhost:30000";
const ADMIN_KEY   = process.env.FOUNDRY_ADMIN_KEY  ?? "admin";
const TIMEOUT_MS  = parseInt(process.env.QUENCH_TIMEOUT_MS ?? "300000", 10); // 5 min
const KEEP_WORLD  = process.env.TRAVELER_KEEP_WORLD === "true";

// ---------------------------------------------------------------------------

async function main() {
  console.log(`[run-quench] Connecting to Foundry at ${BASE_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {
    // ── 1. Navigate to the join page and enter the world ────────────────
    await page.goto(`${BASE_URL}/game`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // If redirected to /setup or /auth, log in as admin first
    const url = page.url();
    if (url.includes("/setup") || url.includes("/auth")) {
      console.log("[run-quench] Logging in to admin panel…");
      await page.fill("input[name='adminKey'], input[type='password']", ADMIN_KEY);
      await page.click("button[type='submit']");
      await page.waitForURL(`${BASE_URL}/setup`, { timeout: 15_000 });
      await page.goto(`${BASE_URL}/game`, { waitUntil: "domcontentloaded" });
    }

    // ── 2. Wait for the join screen, pick the GM user ────────────────────
    // Foundry's join screen shows user selection before entering the world
    const joinUrl = `${BASE_URL}/join`;
    if (page.url().includes("/join")) {
      console.log("[run-quench] Joining world as Gamemaster…");
      // Select the first user that is a GM (or the only user if there's one)
      const gmOption = page.locator("select#userid option").filter({ hasText: /game\s*master|gm/i });
      if (await gmOption.count() > 0) {
        await page.selectOption("select#userid", { label: (await gmOption.first().innerText()).trim() });
      }
      await page.click("button[name='join']");
    }

    // ── 3. Wait for canvas — Foundry is fully loaded ────────────────────
    console.log("[run-quench] Waiting for Foundry canvas…");
    await page.waitForSelector("#board", { timeout: TIMEOUT_MS });
    await page.waitForTimeout(3_000); // allow modules to finish their init hooks

    // ── 4a. Inject inspect-mode flag so fixtures skip teardown ──────────
    if (KEEP_WORLD) {
      console.log("[run-quench] TRAVELER_KEEP_WORLD=true — test artifacts will NOT be deleted.");
      await page.evaluate(() => { window.TRAVELER_KEEP_WORLD = true; });
    }

    // ── 4b. Ensure Quench is available ──────────────────────────────────
    const quenchAvailable = await page.evaluate(() => typeof window.quench !== "undefined");
    if (!quenchAvailable) {
      throw new Error(
        "Quench is not available. Make sure the quench module is installed and active in the CI world."
      );
    }

    // ── 5. Run all registered Quench batches ────────────────────────────
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

    // ── 6. Print results ─────────────────────────────────────────────────
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
