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

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_URL,
  launchBrowser,
  newFoundryPage,
  joinWorldAsGM,
  releaseWorldSession
} from "./foundry-playwright.js";

const ROOT         = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = "docker/compose.test.yml";
const ENV_FILE     = resolve(ROOT, ".env");
const QUENCH_ID    = "quench";

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

function composeArgs(subcommand) {
  const args = ["compose"];
  if (existsSync(ENV_FILE)) {
    args.push("--env-file", ENV_FILE);
  }
  args.push("-f", COMPOSE_FILE, ...subcommand);
  return args;
}

function dockerExec(script) {
  const args = composeArgs(["exec", "-T", "foundry", "bash", "-lc", script]);
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  if (result.status !== 0) {
    throw new Error(stderr || stdout || `docker exec failed (exit ${result.status})`);
  }

  return stdout;
}

function pathExists(containerPath) {
  try {
    dockerExec(`test -e ${containerPath}`);
    return true;
  } catch (err) {
    const detail = err.message ?? "";
    if (/couldn't find env file|is not running|no such service|no such container/i.test(detail)) {
      throw new Error(
        `Cannot reach Foundry container (${detail}). ` +
        "Ensure `npm run foundry:up` completed and, in CI, write a project-root `.env` " +
        "before bootstrap (see .github/workflows/ci.yml)."
      );
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Package verification (installed by container patches at boot)
// ---------------------------------------------------------------------------

function ensureDnd5e() {
  const systemJson = "/data/Data/systems/dnd5e/system.json";
  if (pathExists(systemJson)) {
    console.log("[ci-bootstrap] dnd5e system present ✓");
    return;
  }

  console.log("[ci-bootstrap] dnd5e missing — running docker/patches/09-install-dnd5e.sh …");
  dockerExec("bash /data/container_patches/09-install-dnd5e.sh");

  if (!pathExists(systemJson)) {
    throw new Error(
      "dnd5e not found at /data/Data/systems/dnd5e after install patch. " +
      "Check container logs for curl/unzip errors " +
      "(npm run foundry:logs or docker compose logs foundry)."
    );
  }
  console.log("[ci-bootstrap] dnd5e installed ✓");
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

  ensureDnd5e();
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
