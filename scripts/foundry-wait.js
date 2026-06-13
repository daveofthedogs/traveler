#!/usr/bin/env node
/**
 * foundry-wait.js — polls the Foundry /api/status endpoint until the
 * instance reports it is ready, then exits 0.  Exits 1 on timeout.
 *
 * Usage:
 *   FOUNDRY_URL=http://localhost:30000 \
 *   FOUNDRY_WAIT_TIMEOUT=180           \
 *   node scripts/foundry-wait.js
 */

const BASE_URL = process.env.FOUNDRY_URL          ?? "http://localhost:30000";
const TIMEOUT  = parseInt(process.env.FOUNDRY_WAIT_TIMEOUT ?? "180", 10); // seconds
const INTERVAL = 5; // seconds between polls

const STATUS_URL = `${BASE_URL}/api/status`;
const deadline   = Date.now() + TIMEOUT * 1_000;

console.log(`[foundry-wait] Waiting up to ${TIMEOUT}s for Foundry at ${STATUS_URL}`);

async function poll() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        console.log(`[foundry-wait] Foundry is ready (status: ${JSON.stringify(body.status ?? "ok")})`);
        process.exit(0);
      }
      console.log(`[foundry-wait] HTTP ${res.status} — not ready yet`);
    } catch (err) {
      console.log(`[foundry-wait] ${err.message} — retrying in ${INTERVAL}s…`);
    }

    await new Promise((r) => setTimeout(r, INTERVAL * 1_000));
  }

  console.error(`[foundry-wait] Timed out after ${TIMEOUT}s — Foundry did not become ready.`);
  process.exit(1);
}

poll();
