#!/usr/bin/env node
/**
 * CI bootstrap — ensures the Dockerised Foundry instance has everything the
 * Quench integration tests need:
 *   • dnd5e game system (via Foundry Setup + package manager)
 *   • Quench module (usually pre-installed by docker/patches/10-install-quench.sh)
 *
 * Run after `npm run foundry:wait` and before `npm run test:integration`.
 *
 * Usage:
 *   FOUNDRY_URL=http://localhost:30000 \
 *   FOUNDRY_ADMIN_KEY=secret            \
 *   node scripts/ci-bootstrap.js
 */

import { execSync } from "node:child_process";
import {
  BASE_URL,
  launchBrowser,
  openSetup,
  authenticateSetup,
  gotoWithRetry
} from "./foundry-playwright.js";

const COMPOSE_FILE = "docker/compose.test.yml";
const DND5E_ID     = "dnd5e";
const QUENCH_ID    = "quench";

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

function dockerExec(script) {
  const cmd = `docker compose -f ${COMPOSE_FILE} exec -T foundry bash -lc ${JSON.stringify(script)}`;
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function pathExists(containerPath) {
  try {
    dockerExec(`test -e ${containerPath}`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Quench verification
// ---------------------------------------------------------------------------

function verifyQuench() {
  const moduleJson = "/data/modules/quench/module.json";
  if (!pathExists(moduleJson)) {
    throw new Error(
      "Quench module not found at /data/modules/quench. " +
      "Ensure docker/patches/10-install-quench.sh ran (CONTAINER_PATCHES)."
    );
  }
  console.log("[ci-bootstrap] Quench module present ✓");
}

// ---------------------------------------------------------------------------
// dnd5e installation via Setup UI
// ---------------------------------------------------------------------------

async function installDnd5e(page) {
  if (pathExists("/data/systems/dnd5e/system.json")) {
    console.log("[ci-bootstrap] dnd5e already installed ✓");
    return;
  }

  console.log("[ci-bootstrap] Installing dnd5e via Foundry Setup…");
  await openSetup(page);

  // Try the Setup REST endpoint first (works on many v14 builds once authenticated).
  const apiResult = await page.evaluate(async (systemId) => {
    try {
      const res = await fetch("/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "installPackage",
          packageType: "system",
          packageId: systemId
        })
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
    } catch (err) {
      return { ok: false, status: 0, text: err.message };
    }
  }, DND5E_ID);

  if (apiResult.ok) {
    console.log("[ci-bootstrap] dnd5e install requested via Setup API");
  } else {
    console.warn(`[ci-bootstrap] Setup API install returned ${apiResult.status}: ${apiResult.text}`);
    console.log("[ci-bootstrap] Falling back to Setup UI…");
    await installDnd5eViaUI(page);
  }

  // Wait for the system files to appear (download can take a while on first boot).
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (pathExists("/data/systems/dnd5e/system.json")) {
      console.log("[ci-bootstrap] dnd5e installed ✓");
      return;
    }
    await page.waitForTimeout(5_000);
  }

  throw new Error("Timed out waiting for dnd5e to install.");
}

async function installDnd5eViaUI(page) {
  await openSetup(page);

  // Setup v14 sidebar — open the Install Systems view.
  const systemsTab = page.locator(
    "a[data-tab='systems'], nav a:has-text('Systems'), button:has-text('Install System')"
  ).first();
  if (await systemsTab.count() > 0) {
    await systemsTab.click({ timeout: 30_000 });
  }

  // Search / filter for dnd5e
  const search = page.locator(
    "input[type='search'], input[placeholder*='Search'], input[name='search']"
  ).first();
  if (await search.count() > 0) {
    await search.fill("D&D Fifth Edition");
    await page.waitForTimeout(1_500);
  }

  // Click Install on the dnd5e row
  const installBtn = page.locator(
    `[data-package-id='${DND5E_ID}'] button:has-text('Install'), ` +
    `article:has-text('D&D Fifth Edition') button:has-text('Install'), ` +
    `li:has-text('D&D Fifth Edition') button:has-text('Install')`
  ).first();

  if (await installBtn.count() === 0) {
    throw new Error("Could not locate dnd5e Install button in Setup UI.");
  }

  await installBtn.click({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// World + module sanity check
// ---------------------------------------------------------------------------

async function verifyWorldModules(page) {
  // Launch the CI world once to ensure traveler + quench load without errors.
  await gotoWithRetry(page, `${BASE_URL}/join`);
  await authenticateSetup(page);

  if (page.url().includes("/join")) {
    const joinBtn = page.locator("button[name='join'], button:has-text('Join Game Session')").first();
    if (await joinBtn.count() > 0) {
      await joinBtn.click({ timeout: 60_000 });
    }
  }

  await page.waitForSelector("#board", { timeout: 120_000 });
  await page.waitForTimeout(2_000);

  const modules = await page.evaluate(() =>
    [...(game.modules?.contents ?? [])].map((m) => ({ id: m.id, active: m.active }))
  );

  const traveler = modules.find((m) => m.id === "traveler");
  const quench   = modules.find((m) => m.id === QUENCH_ID);

  if (!traveler?.active) {
    throw new Error("Traveler module is not active in the CI world.");
  }
  if (!quench?.active) {
    throw new Error("Quench module is not active in the CI world.");
  }

  console.log("[ci-bootstrap] World loaded with traveler + quench active ✓");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[ci-bootstrap] Bootstrapping Foundry at ${BASE_URL}`);

  verifyQuench();

  const browser = await launchBrowser();
  const page    = await browser.newPage();

  try {
    await installDnd5e(page);
    await verifyWorldModules(page);
    console.log("[ci-bootstrap] Bootstrap complete.");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("[ci-bootstrap] Error:", err.message);
    try {
      const logTail = dockerExec("tail -n 40 /data/Logs/*.log 2>/dev/null || echo '(no logs)'");
      console.error("[ci-bootstrap] Recent Foundry logs:\n", logTail);
    } catch {}
    await browser.close();
    process.exit(1);
  }
}

main();
