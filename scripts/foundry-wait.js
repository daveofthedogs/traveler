#!/usr/bin/env node
/**
 * foundry-wait.js — polls Foundry until the HTTP server is accepting connections
 * and the /api/status endpoint responds successfully.
 *
 * On timeout or a dead container, prints docker compose ps + recent container logs.
 *
 * Usage:
 *   FOUNDRY_URL=http://localhost:30000 \
 *   FOUNDRY_WAIT_TIMEOUT=600           \
 *   node scripts/foundry-wait.js
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT         = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = "docker/compose.test.yml";
const ENV_FILE     = resolve(ROOT, ".env");
const BASE_URL     = process.env.FOUNDRY_URL ?? "http://localhost:30000";
const TIMEOUT      = parseInt(process.env.FOUNDRY_WAIT_TIMEOUT ?? "600", 10);
const INTERVAL     = 5;

const STATUS_URL = `${BASE_URL}/api/status`;
const deadline   = Date.now() + TIMEOUT * 1_000;

function composeArgs(subcommand) {
  const args = ["compose"];
  if (existsSync(ENV_FILE)) {
    args.push("--env-file", ENV_FILE);
  }
  args.push("-f", COMPOSE_FILE, ...subcommand);
  return args;
}

function runCompose(subcommand) {
  return spawnSync("docker", composeArgs(subcommand), {
    encoding: "utf8",
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function dumpContainerDiagnostics(reason) {
  console.error(`\n[foundry-wait] ── Docker diagnostics (${reason}) ──`);

  const ps = runCompose(["ps", "-a"]);
  if (ps.stdout?.trim()) console.error(ps.stdout.trim());
  if (ps.stderr?.trim()) console.error(ps.stderr.trim());

  const logs = runCompose(["logs", "--tail=120", "foundry"]);
  if (logs.stdout?.trim()) console.error(logs.stdout.trim());
  if (logs.stderr?.trim()) console.error(logs.stderr.trim());

  console.error("[foundry-wait] ── end diagnostics ──\n");
}

function containerState() {
  const result = runCompose(["ps", "--format", "{{.State}}", "foundry"]);
  const status = result.stdout?.trim().toLowerCase() ?? "";
  if (!status) return "unknown";
  if (status.includes("exited") || status.includes("dead")) return "exited";
  if (status.includes("running")) return "running";
  return status;
}

async function checkStatus() {
  const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    await res.text().catch(() => {});
    return { ready: false, detail: `HTTP ${res.status}` };
  }
  const body = await res.json().catch(() => ({}));
  return { ready: true, detail: JSON.stringify(body.status ?? "ok") };
}

async function checkRoot() {
  const res = await fetch(BASE_URL, {
    signal: AbortSignal.timeout(8_000),
    redirect: "follow"
  });
  await res.text().catch(() => {});
  return res.status > 0;
}

async function poll() {
  console.log(`[foundry-wait] Waiting up to ${TIMEOUT}s for Foundry at ${STATUS_URL}`);

  while (Date.now() < deadline) {
    const state = containerState();
    if (state === "exited") {
      console.error("[foundry-wait] Foundry container exited before the server became ready.");
      dumpContainerDiagnostics("container exited");
      return false;
    }

    try {
      const [status, rootOk] = await Promise.all([
        checkStatus().catch((err) => ({ ready: false, detail: err.message })),
        checkRoot().catch(() => false)
      ]);

      if (status.ready && rootOk) {
        console.log(`[foundry-wait] Foundry is ready (status: ${status.detail})`);
        return true;
      }

      console.log(
        `[foundry-wait] Not ready yet — container: ${state}, ` +
        `status: ${status.detail}, root: ${rootOk ? "ok" : "fail"}`
      );
    } catch (err) {
      console.log(`[foundry-wait] ${err.message} — retrying in ${INTERVAL}s…`);
    }

    await new Promise((r) => setTimeout(r, INTERVAL * 1_000));
  }

  console.error(`[foundry-wait] Timed out after ${TIMEOUT}s — Foundry did not become ready.`);
  console.error(
    "[foundry-wait] First boot downloads Foundry + dnd5e + Quench and can take several minutes. " +
    "If logs stall at 'Requesting CSRF tokens', verify FOUNDRY_USERNAME/FOUNDRY_PASSWORD secrets " +
    "or set FOUNDRY_RELEASE_URL to a presigned Foundry zip URL."
  );
  dumpContainerDiagnostics("timeout");
  return false;
}

try {
  const ready = await poll();
  process.exitCode = ready ? 0 : 1;
} catch (err) {
  console.error(`[foundry-wait] Fatal: ${err.message}`);
  dumpContainerDiagnostics("fatal error");
  process.exitCode = 1;
}

// Let libuv close fetch / docker exec handles before Node exits (avoids Windows crash).
await new Promise((r) => setTimeout(r, 100));
