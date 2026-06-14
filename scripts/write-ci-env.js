#!/usr/bin/env node
/**
 * Write a Docker Compose `.env` file with proper quoting for special characters.
 * Used by GitHub Actions before `npm run foundry:up`.
 *
 * Required process.env keys:
 *   FOUNDRY_LICENSE_KEY, FOUNDRY_ADMIN_KEY, FOUNDRY_USERNAME, FOUNDRY_PASSWORD
 *
 * Optional:
 *   FOUNDRY_RELEASE_URL — presigned Foundry zip URL (skips foundryvtt.com auth download)
 *   CONTAINER_VERBOSE — set to "true" for felddy debug logging in CI
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = [
  "FOUNDRY_LICENSE_KEY",
  "FOUNDRY_ADMIN_KEY",
  "FOUNDRY_USERNAME",
  "FOUNDRY_PASSWORD"
];

const OPTIONAL = [
  "FOUNDRY_RELEASE_URL",
  "CONTAINER_VERBOSE"
];

/** @param {string} value */
function formatEnvValue(value) {
  if (/[\s#"'\\$`!]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

const lines = [];
const missing = [];

for (const key of REQUIRED) {
  const value = process.env[key]?.trim() ?? "";
  if (!value) {
    missing.push(key);
    continue;
  }
  lines.push(`${key}=${formatEnvValue(value)}`);
}

if (missing.length) {
  console.error(
    `[write-ci-env] Missing required GitHub Actions secrets: ${missing.join(", ")}`
  );
  console.error(
    "[write-ci-env] Configure them under Settings → Secrets and variables → Actions."
  );
  process.exit(1);
}

for (const key of OPTIONAL) {
  const value = process.env[key]?.trim();
  if (value) {
    lines.push(`${key}=${formatEnvValue(value)}`);
  }
}

if (!process.env.CONTAINER_VERBOSE?.trim()) {
  lines.push("CONTAINER_VERBOSE=true");
}

writeFileSync(resolve(ROOT, ".env"), `${lines.join("\n")}\n`);
console.log(`[write-ci-env] Wrote .env (${lines.length} variables, values not printed).`);
