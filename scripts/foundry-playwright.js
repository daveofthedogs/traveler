/**
 * Shared Playwright helpers for Foundry CI scripts (bootstrap + Quench runner).
 */

import { chromium } from "playwright";

export const BASE_URL  = process.env.FOUNDRY_URL       ?? "http://localhost:30000";
export const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? "admin";

const NAV_TIMEOUT = parseInt(process.env.FOUNDRY_NAV_TIMEOUT ?? "60000", 10);

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Navigate with retries — Foundry may restart briefly during first boot.
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {object} [opts]
 */
export async function gotoWithRetry(page, url, opts = {}) {
  const attempts = opts.attempts ?? 6;
  const waitUntil = opts.waitUntil ?? "domcontentloaded";
  let lastErr;

  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil, timeout: NAV_TIMEOUT });
      return page.url();
    } catch (err) {
      lastErr = err;
      console.warn(`[foundry] goto attempt ${i}/${attempts} failed for ${url}: ${err.message}`);
      await page.waitForTimeout(Math.min(5_000 * i, 20_000));
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Setup / auth
// ---------------------------------------------------------------------------

/**
 * Authenticate to the Foundry setup application when redirected to /auth.
 * @param {import('playwright').Page} page
 */
export async function authenticateSetup(page) {
  const url = page.url();
  if (!url.includes("/auth")) return;

  console.log("[foundry] Authenticating to setup…");
  const password = page.locator("input[name='adminKey'], input[type='password']").first();
  await password.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
  await password.fill(ADMIN_KEY);
  await page.locator("button[type='submit']").first().click();
  await page.waitForURL(/\/setup/, { timeout: NAV_TIMEOUT });
}

/**
 * Open the setup UI (authenticated) and return the page URL.
 * @param {import('playwright').Page} page
 */
export async function openSetup(page) {
  await gotoWithRetry(page, `${BASE_URL}/setup`);
  await authenticateSetup(page);
  if (!page.url().includes("/setup")) {
    await gotoWithRetry(page, `${BASE_URL}/setup`);
    await authenticateSetup(page);
  }
  return page.url();
}

// ---------------------------------------------------------------------------
// Join / game
// ---------------------------------------------------------------------------

/**
 * Navigate to the game join screen and enter as GM.
 * @param {import('playwright').Page} page
 */
export async function joinWorldAsGM(page) {
  await gotoWithRetry(page, `${BASE_URL}/join`);
  await authenticateSetup(page);

  if (!page.url().includes("/join")) {
    await gotoWithRetry(page, `${BASE_URL}/join`);
  }

  if (page.url().includes("/join")) {
    console.log("[foundry] Joining world as Gamemaster…");
    const userSelect = page.locator("select#userid");
    if (await userSelect.count() > 0) {
      const gmOption = page.locator("select#userid option").filter({ hasText: /game\s*master|gm/i });
      if (await gmOption.count() > 0) {
        await page.selectOption("select#userid", {
          label: (await gmOption.first().innerText()).trim()
        });
      }
    }
    const joinBtn = page.locator("button[name='join'], button:has-text('Join Game Session')").first();
    await joinBtn.click({ timeout: NAV_TIMEOUT });
  }

  console.log("[foundry] Waiting for canvas…");
  await page.waitForSelector("#board", { timeout: NAV_TIMEOUT });
  await page.waitForTimeout(3_000);
}
