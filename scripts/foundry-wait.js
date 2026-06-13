#!/usr/bin/env node
/**
 * foundry-wait.js — polls Foundry until the HTTP server is accepting connections
 * and the /api/status endpoint responds successfully.
 *
 * Usage:
 *   FOUNDRY_URL=http://localhost:30000 \
 *   FOUNDRY_WAIT_TIMEOUT=300           \
 *   node scripts/foundry-wait.js
 */

const BASE_URL = process.env.FOUNDRY_URL          ?? "http://localhost:30000";
const TIMEOUT  = parseInt(process.env.FOUNDRY_WAIT_TIMEOUT ?? "300", 10); // seconds
const INTERVAL = 5; // seconds between polls

const STATUS_URL = `${BASE_URL}/api/status`;
const deadline   = Date.now() + TIMEOUT * 1_000;

console.log(`[foundry-wait] Waiting up to ${TIMEOUT}s for Foundry at ${STATUS_URL}`);

async function checkStatus() {
  const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return { ready: false, detail: `HTTP ${res.status}` };
  const body = await res.json().catch(() => ({}));
  return { ready: true, detail: JSON.stringify(body.status ?? "ok") };
}

async function checkRoot() {
  const res = await fetch(BASE_URL, {
    signal: AbortSignal.timeout(8_000),
    redirect: "follow"
  });
  // Any HTTP response means the server socket is accepting connections.
  return res.status > 0;
}

async function poll() {
  while (Date.now() < deadline) {
    try {
      const [status, rootOk] = await Promise.all([
        checkStatus().catch((err) => ({ ready: false, detail: err.message })),
        checkRoot().catch(() => false)
      ]);

      if (status.ready && rootOk) {
        console.log(`[foundry-wait] Foundry is ready (status: ${status.detail})`);
        process.exit(0);
      }

      console.log(
        `[foundry-wait] Not ready yet — status: ${status.detail}, root: ${rootOk ? "ok" : "fail"}`
      );
    } catch (err) {
      console.log(`[foundry-wait] ${err.message} — retrying in ${INTERVAL}s…`);
    }

    await new Promise((r) => setTimeout(r, INTERVAL * 1_000));
  }

  console.error(`[foundry-wait] Timed out after ${TIMEOUT}s — Foundry did not become ready.`);
  process.exit(1);
}

poll();
