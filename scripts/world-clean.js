#!/usr/bin/env node
/**
 * world-clean.js — reset the CI test world back to its pristine state.
 *
 * Foundry writes scene data, actor data, journal entries, etc. into
 * tests/world/ as you run tests (especially with TRAVELER_KEEP_WORLD=true).
 * This script removes all Foundry-generated subdirectories and database
 * files while preserving the world.json manifest.
 *
 * Usage:  npm run world:clean
 */

import { readdirSync, rmSync, statSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR  = resolve(__dirname, "../tests/world");

// Files and directories to keep — everything else is Foundry-generated data.
const KEEP = new Set(["world.json"]);

console.log(`[world-clean] Cleaning ${WORLD_DIR} …`);

let removed = 0;
for (const entry of readdirSync(WORLD_DIR)) {
  if (KEEP.has(entry)) continue;
  const full = join(WORLD_DIR, entry);
  try {
    const stat = statSync(full);
    if (stat.isDirectory()) {
      rmSync(full, { recursive: true, force: true });
      console.log(`  removed dir:  ${entry}/`);
    } else {
      rmSync(full);
      console.log(`  removed file: ${entry}`);
    }
    removed++;
  } catch (err) {
    console.warn(`  warning: could not remove ${entry} — ${err.message}`);
  }
}

if (removed === 0) {
  console.log("  (nothing to remove — world is already clean)");
} else {
  console.log(`[world-clean] Done. Removed ${removed} item(s).`);
}
