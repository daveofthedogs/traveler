#!/usr/bin/env node
/**
 * Build dist/traveler.zip — a Foundry-ready module folder for manual install.
 *
 * Copies runtime files into dist/package-staging/traveler/, then strips Quench
 * test registration from the staged scripts/traveler.js only (repo source unchanged).
 *
 * Unzip into your Foundry user data modules directory, e.g.:
 *   Data/modules/traveler/
 *
 * Usage: npm run traveler:package
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_ID = JSON.parse(readFileSync(join(ROOT, "module.json"), "utf8")).id;
const STAGING = join(ROOT, "dist", "package-staging", MODULE_ID);
const ZIP_PATH = join(ROOT, "dist", `${MODULE_ID}.zip`);

/** Top-level files shipped with the runtime module. */
const ROOT_FILES = [
  "module.json",
  "README.md",
  "DEVELOPER-README.md"
];

/** Optional runtime dirs (included when present). */
const RUNTIME_DIRS = ["templates", "styles", "packs", "lang", "language", "images"];

/** Dev/CI scripts under scripts/ — not needed on a game server. */
const EXCLUDED_SCRIPTS = new Set([
  "ci-bootstrap.js",
  "foundry-playwright.js",
  "foundry-wait.js",
  "load-env.js",
  "run-quench.js",
  "write-ci-env.js",
  "world-clean.js",
  "package-traveler.js"
]);

function log(msg) {
  console.log(`[traveler:package] ${msg}`);
}

function copyRuntimeTree() {
  rmSync(join(ROOT, "dist"), { recursive: true, force: true });
  mkdirSync(STAGING, { recursive: true });

  for (const file of ROOT_FILES) {
    const src = join(ROOT, file);
    if (!existsSync(src)) {
      throw new Error(`Missing required file: ${file}`);
    }
    cpSync(src, join(STAGING, file));
  }

  for (const dir of RUNTIME_DIRS) {
    const src = join(ROOT, dir);
    if (existsSync(src)) {
      cpSync(src, join(STAGING, dir), { recursive: true });
    }
  }

  const scriptsSrc = join(ROOT, "scripts");
  const scriptsDst = join(STAGING, "scripts");
  mkdirSync(scriptsDst, { recursive: true });

  cpSync(scriptsSrc, scriptsDst, {
    recursive: true,
    filter: (srcPath) => {
      if (statSync(srcPath).isDirectory()) return true;
      return !EXCLUDED_SCRIPTS.has(basename(srcPath));
    }
  });
}

/**
 * Remove Quench harness from the staged copy of traveler.js (not the repo source).
 */
function stripQuenchHarness() {
  const travelerPath = join(STAGING, "scripts", "traveler.js");
  if (!existsSync(travelerPath)) {
    throw new Error("Staged scripts/traveler.js missing after copy");
  }

  let source = readFileSync(travelerPath, "utf8");

  source = source.replace(
    /^import \{ registerAllSuites \} from "\.\.\/tests\/quench\/index\.js";\r?\n/m,
    ""
  );

  source = source.replace(
    /\r?\n\/\/ -+\r?\n\/\/ Quench integration tests[\s\S]*?\r?\n\}\);\r?\n?/,
    "\n"
  );

  if (/registerAllSuites|tests\/quench/.test(source)) {
    throw new Error(
      "Failed to strip Quench harness from staged scripts/traveler.js — update stripQuenchHarness() patterns"
    );
  }

  writeFileSync(travelerPath, source);
  log("Stripped Quench test harness from staged scripts/traveler.js");
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
  return result.status === 0;
}

function createZip() {
  mkdirSync(dirname(ZIP_PATH), { recursive: true });
  rmSync(ZIP_PATH, { force: true });

  const parent = dirname(STAGING);
  const folder = basename(STAGING);

  // Windows 10+ tar supports -a (auto zip); also works on Linux/macOS.
  if (run("tar", ["-a", "-cf", ZIP_PATH, "-C", parent, folder])) {
    return;
  }

  if (run("zip", ["-r", ZIP_PATH, folder], { cwd: parent })) {
    return;
  }

  if (process.platform === "win32") {
    const staging = STAGING.replace(/'/g, "''");
    const zipPath = ZIP_PATH.replace(/'/g, "''");
    const ps =
      `Import-Module Microsoft.PowerShell.Archive -ErrorAction Stop; ` +
      `Compress-Archive -Path '${staging}' -DestinationPath '${zipPath}' -Force`;
    if (run("powershell", ["-NoProfile", "-Command", ps])) {
      return;
    }
  }

  throw new Error(
    "Could not create zip (tried: tar -a, zip, Compress-Archive). " +
    "Install Git for Windows (includes tar) or enable PowerShell Microsoft.PowerShell.Archive."
  );
}

copyRuntimeTree();
stripQuenchHarness();
createZip();

log(`Created ${ZIP_PATH}`);
log(`Extract so you have: …/Data/modules/${MODULE_ID}/module.json`);
log("Then enable Traveler in your world's module list.");
