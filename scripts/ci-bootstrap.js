#!/usr/bin/env node
/**
 * CI bootstrap — ensures the Dockerised Foundry instance has everything the
 * Quench integration tests need:
 *   • dnd5e game system (docker/patches/09-install-dnd5e.sh)
 *   • Quench module (docker/patches/10-install-quench.sh)
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
  newFoundryPage,
  joinWorldAsGM,
  releaseWorldSession
} from "./foundry-playwright.js";

const COMPOSE_FILE = "docker/compose.test.yml";
const QUENCH_ID    = "quench";

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

function dockerExec(script) {
  const cmd =
    `docker compose --env-file .env -f ${COMPOSE_FILE} exec -T foundry bash -lc ` +
    JSON.stringify(script);
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
// Package verification (installed by container patches at boot)
// ---------------------------------------------------------------------------

function verifyDnd5e() {
  const systemJson = "/data/Data/systems/dnd5e/system.json";
  if (!pathExists(systemJson)) {
    throw new Error(
      "dnd5e not found at /data/Data/systems/dnd5e. " +
      "Restart the container so docker/patches/09-install-dnd5e.sh runs " +
      "(npm run foundry:down:clean && npm run foundry:up)."
    );
  }
  console.log("[ci-bootstrap] dnd5e system present ✓");
}

function verifyQuench() {
  const moduleJson = "/data/Data/modules/quench/module.json";
  if (!pathExists(moduleJson)) {
    throw new Error(
      "Quench module not found at /data/Data/modules/quench. " +
      "Ensure docker/patches/10-install-quench.sh ran (CONTAINER_PATCHES)."
    );
  }
  console.log("[ci-bootstrap] Quench module present ✓");
}

// ---------------------------------------------------------------------------
// World + module sanity check
// ---------------------------------------------------------------------------

async function verifyWorldModules(page) {
  await joinWorldAsGM(page);

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

  verifyDnd5e();
  verifyQuench();

  const browser = await launchBrowser();
  const page    = await newFoundryPage(browser);

  try {
    await verifyWorldModules(page);
    await releaseWorldSession(page);
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
