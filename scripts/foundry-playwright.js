/**
 * Shared Playwright helpers for Foundry CI scripts (bootstrap + Quench runner).
 */

import "./load-env.js";
import { chromium } from "playwright";

export const BASE_URL   = process.env.FOUNDRY_URL       ?? "http://localhost:30000";
export const ADMIN_KEY   = process.env.FOUNDRY_ADMIN_KEY ?? "admin";
export const WORLD_ID    = process.env.FOUNDRY_WORLD     ?? "traveler-ci";

const NAV_TIMEOUT = parseInt(process.env.FOUNDRY_NAV_TIMEOUT ?? "120000", 10);
const NAV_WAIT_UNTIL = "domcontentloaded";

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
}

/** @param {import('playwright').Browser} browser */
export async function newFoundryPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  return page;
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
 * Authenticate when Foundry redirects to /auth (from setup, join, or game).
 * @param {import('playwright').Page} page
 */
export async function authenticateSetup(page) {
  if (!page.url().includes("/auth")) return;

  console.log("[foundry] Authenticating…");

  const password = page.locator([
    "input[name='adminPassword']",
    "input[name='adminKey']",
    "input[type='password']"
  ].join(", ")).first();
  await password.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
  await password.fill(ADMIN_KEY);

  const loginBtn = page.locator([
    'button[type="submit"]',
    'button:has-text("Log In")',
    'button:has-text("LOG IN")'
  ].join(", ")).first();
  await loginBtn.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
  await loginBtn.click();
  await page.waitForURL((url) => !url.pathname.includes("/auth"), {
    timeout: NAV_TIMEOUT,
    waitUntil: NAV_WAIT_UNTIL
  });
  await dismissBlockingDialogs(page);
}

/**
 * Accept the Foundry EULA when redirected to /license (first launch).
 * The form renders after domcontentloaded — wait for controls before interacting.
 * @param {import('playwright').Page} page
 */
export async function acceptLicenseAgreement(page) {
  if (!page.url().includes("/license")) return;

  console.log("[foundry] Accepting EULA…");

  const agreeBtn = page.locator([
    'button[data-action="accept"]',
    "#sign",
    'button[name="accept"]',
    'button:has-text("Agree")'
  ].join(", ")).first();
  await agreeBtn.waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const termsLabel = page.locator('label:has-text("I agree to these terms")').first();
  const checkbox = page.locator("#eula-agree, input[name='agree']").first();

  if (await termsLabel.count() > 0) {
    await termsLabel.click();
  } else if (await checkbox.count() > 0) {
    await checkbox.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    await checkbox.check();
  }

  if (await checkbox.count() > 0 && !(await checkbox.isChecked())) {
    throw new Error("EULA checkbox did not become checked — cannot accept license.");
  }

  await agreeBtn.click();

  await page.waitForURL((url) => !url.pathname.includes("/license"), {
    timeout: NAV_TIMEOUT,
    waitUntil: NAV_WAIT_UNTIL
  });
}

/**
 * Open the setup UI (authenticated) and return the page URL.
 * @param {import('playwright').Page} page
 */
export async function openSetup(page) {
  await gotoWithRetry(page, `${BASE_URL}/setup`);
  await authenticateSetup(page);
  await acceptLicenseAgreement(page);
  await authenticateSetup(page);
  if (!page.url().includes("/setup")) {
    await gotoWithRetry(page, `${BASE_URL}/setup`);
    await authenticateSetup(page);
  }
  await dismissBlockingDialogs(page);
  await page.waitForTimeout(2_000);
  return page.url();
}

/**
 * Close Setup tours (e.g. Backups Overview) and other modals that block UI clicks.
 * Foundry v14 auto-starts Shepherd tours on first Setup login.
 * @param {import('playwright').Page} page
 */
export async function dismissBlockingDialogs(page) {
  await skipSetupToursViaApi(page);

  for (let round = 0; round < 12; round++) {
    let dismissed = false;

    const shepherdSkip = page.locator([
      ".shepherd-footer button:has-text('Skip')",
      ".shepherd-footer button:has-text('Skip Tour')",
      "button.shepherd-button:has-text('Skip')",
      ".shepherd-cancel-icon",
      ".tour-overlay button:has-text('Skip')",
      ".tour-overlay button:has-text('Next')",
      ".tour-overlay button:has-text('Finish')"
    ].join(", ")).first();

    if (await isVisible(shepherdSkip)) {
      console.log("[foundry] Dismissing tour (skip)…");
      await shepherdSkip.click({ timeout: 5_000 }).catch(() => {});
      dismissed = true;
      await page.waitForTimeout(400);
    }

    const shepherdAdvance = page.locator([
      ".shepherd-footer button:has-text('Next')",
      ".shepherd-footer button:has-text('Finish')",
      ".shepherd-footer button:has-text('Done')",
      ".shepherd-footer button:has-text('Complete')",
      ".shepherd-footer .shepherd-button-primary"
    ].join(", ")).first();

    if (!dismissed && await isVisible(shepherdAdvance)) {
      console.log("[foundry] Advancing tour step…");
      await shepherdAdvance.click({ timeout: 5_000 }).catch(() => {});
      dismissed = true;
      await page.waitForTimeout(400);
    }

    const modalClose = page.locator([
      ".window-app:not(.minimized) button.header-control.close",
      ".window-app:not(.minimized) [data-action='close']",
      "button:has-text('Close')",
      "button:has-text('Got it')",
      "button:has-text('Dismiss')",
      "[data-action='close']"
    ].join(", ")).first();

    if (!dismissed && await isVisible(modalClose)) {
      console.log("[foundry] Closing modal…");
      await modalClose.click({ timeout: 5_000 }).catch(() => {});
      dismissed = true;
      await page.waitForTimeout(400);
    }

    if (!dismissed && await hasVisibleOverlay(page)) {
      await page.keyboard.press("Escape");
      dismissed = true;
      await page.waitForTimeout(400);
    }

    if (!dismissed) break;
  }
}

/** @param {import('playwright').Locator} locator */
async function isVisible(locator) {
  if (await locator.count() === 0) return false;
  return locator.first().isVisible().catch(() => false);
}

/** @param {import('playwright').Page} page */
async function hasVisibleOverlay(page) {
  const overlay = page.locator([
    ".shepherd-modal-overlay-container",
    ".shepherd-element",
    ".tour-overlay",
    ".window-app:not(.minimized)"
  ].join(", ")).first();
  return isVisible(overlay);
}

/** Mark in-progress Setup tours complete when Foundry client APIs are available. */
async function skipSetupToursViaApi(page) {
  await page.evaluate(async () => {
    const tours = globalThis.foundry?.nue?.tours;
    if (!tours) return;

    for (const tour of tours.contents ?? []) {
      try {
        if (typeof tour.complete === "function") await tour.complete();
        else if (typeof tour.exit === "function") await tour.exit();
      } catch {
        // Fall back to UI dismissal below.
      }
    }
  }).catch(() => {});
}

/**
 * Confirm Foundry's "World Data Migration" dialog when launching a world from Setup.
 * Appears when coreVersion/systemVersion in world.json lag behind the installed packages.
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} True when the dialog was confirmed.
 */
async function confirmWorldMigrationIfPresent(page) {
  const beginBtn = page.locator([
    "dialog.dialog button:has-text('Begin Migration')",
    ".dialog-form button:has-text('Begin Migration')",
    "button[data-action='yes']:has-text('Begin Migration')"
  ].join(", ")).first();

  try {
    await beginBtn.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return false;
  }

  console.log("[foundry] Confirming world data migration…");
  await dismissBlockingDialogs(page);
  await removeTourOverlays(page);

  const backup = page.locator('input[name="createBackup"]');
  if (await backup.count() > 0 && await backup.isChecked().catch(() => false)) {
    await backup.uncheck().catch(() => {});
  }

  try {
    await beginBtn.click({ timeout: 10_000 });
  } catch {
    await beginBtn.evaluate((el) => el.click());
  }
  await page.waitForTimeout(500);
  return true;
}

/** Remove tour overlays that block clicks on Setup dialogs (e.g. Backups tour). */
async function removeTourOverlays(page) {
  await page.evaluate(() => {
    for (const selector of [".tour-overlay", ".shepherd-modal-overlay-container", ".shepherd-element"]) {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    }
  }).catch(() => {});
}

/**
 * Launch the CI world through the Setup POST handler.
 * This bypasses the client-side "World Data Migration" dialog — migrations run on the server.
 * @param {import('playwright').Page} page
 */
async function launchWorldViaSetupApi(page) {
  console.log("[foundry] Launching world via Setup API…");

  const result = await page.evaluate(async (worldId) => {
    const body = new URLSearchParams({ action: "launchWorld", world: worldId });
    const res = await fetch("/setup", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      credentials: "include"
    });

    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, json: JSON.parse(text) };
    } catch {
      return { ok: res.ok, status: res.status, text: text.slice(0, 300) };
    }
  }, WORLD_ID);

  if (result.json?.error) {
    throw new Error(`Setup launchWorld failed: ${result.json.error}`);
  }
  if (!result.ok && !result.json) {
    throw new Error(`Setup launchWorld failed: HTTP ${result.status} ${result.text ?? ""}`);
  }
}

/** Poll /api/status until a world session is active (post-launch migration complete). */
async function waitForActiveWorld() {
  const deadline = Date.now() + NAV_TIMEOUT;
  console.log("[foundry] Waiting for world to finish launching…");

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/status`, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const body = await res.json();
        if (body.active) {
          console.log("[foundry] World is active ✓");
          return;
        }
      } else {
        await res.text().catch(() => {});
      }
    } catch {
      // Foundry may be busy migrating and not respond yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    `World "${WORLD_ID}" did not become active within ${NAV_TIMEOUT / 1000}s. ` +
    "Check Foundry logs for migration errors."
  );
}

/** Poll /api/status until no world session is active. */
async function waitForInactiveWorld(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/status`, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const body = await res.json();
        if (!body.active) return;
      } else {
        await res.text().catch(() => {});
      }
    } catch {
      // Foundry may be busy shutting down.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function fetchWorldStatus() {
  try {
    const res = await fetch(`${BASE_URL}/api/status`, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) return res.json();
  } catch {
    // ignore
  }
  return null;
}

/**
 * Deactivate the running world via POST /join (admin password required).
 * @param {import('playwright').Page} page
 */
async function shutdownWorldViaSetupApi(page) {
  if (!page.url().includes("/join")) {
    await gotoWithRetry(page, `${BASE_URL}/join`);
    await authenticateSetup(page);
  }

  const result = await page.evaluate(async (adminKey) => {
    const res = await fetch("/join", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "shutdown", adminPassword: adminKey }),
      credentials: "include"
    });
    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, json: JSON.parse(text) };
    } catch {
      return { ok: res.ok, status: res.status, text: text.slice(0, 300) };
    }
  }, ADMIN_KEY);

  if (!result.ok || result.json?.status !== "success") {
    throw new Error(
      `Failed to deactivate world: HTTP ${result.status} ` +
      `${result.json?.message ?? result.text ?? ""}`
    );
  }

  await waitForInactiveWorld();
}

/**
 * Log out the current GM / shut down the world so a fresh browser can join as Gamemaster.
 * Bootstrap calls this before closing; joinWorldAsGM calls it when the GM slot is taken.
 * @param {import('playwright').Page} page
 */
export async function releaseWorldSession(page) {
  console.log("[foundry] Releasing world session…");

  if (await page.locator("#board").count() > 0) {
    await page.evaluate(async () => {
      const g = globalThis.game;
      if (typeof g?.logOut === "function") await g.logOut();
      else window.location.assign("/users/logout");
    });
    await page.waitForURL(/\/(join|setup|auth|license)/, { timeout: NAV_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(1_500);

    if (await page.locator("#board").count() > 0) {
      await shutdownWorldViaSetupApi(page);
    }
    return;
  }

  await shutdownWorldViaSetupApi(page);
}

async function isGmJoinSlotBlocked(page) {
  const userSelect = page.locator('select[name="userid"], select#userid').first();
  if (await userSelect.count() === 0) return false;

  return userSelect.locator("option").filter({ hasText: /game\s*master|gamemaster/i }).first()
    .evaluate((el) => el.disabled)
    .catch(() => false);
}

/** Free the GM join slot when bootstrap left an active session. */
async function ensureGmJoinAvailable(page) {
  if (!await isGmJoinSlotBlocked(page)) return;

  console.log("[foundry] Gamemaster slot occupied — releasing session…");
  await releaseWorldSession(page);

  const status = await fetchWorldStatus();
  if (!status?.active) {
    await launchWorldFromSetup(page);
  }

  if (!page.url().includes("/join")) {
    await gotoWithRetry(page, `${BASE_URL}/join`);
    await authenticateSetup(page);
  }

  await page.locator('select[name="userid"], select#userid, button[name="join"], button:has-text("Join Game Session")').first()
    .waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  if (await isGmJoinSlotBlocked(page)) {
    throw new Error("Gamemaster slot is still occupied after releasing the world session.");
  }
}

// ---------------------------------------------------------------------------
// Join / game
// ---------------------------------------------------------------------------

async function selectJoinFormOptions(page) {
  const worldSelect = page.locator(
    'select[name="world"], select#worldid, select[name="worldId"]'
  ).first();
  if (await worldSelect.count() > 0) {
    try {
      await worldSelect.selectOption({ value: WORLD_ID });
    } catch {
      await worldSelect.selectOption({ label: /traveler/i }).catch(() => {});
    }
  }

  const userSelect = page.locator('select[name="userid"], select#userid').first();
  if (await userSelect.count() === 0) return;

  await userSelect.waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  const gmOption = userSelect.locator('option:not([disabled])')
    .filter({ hasText: /game\s*master|gamemaster/i });
  if (await gmOption.count() > 0) {
    const value = await gmOption.first().getAttribute("value");
    if (value) await userSelect.selectOption(value);
    return;
  }

  if (await userSelect.locator("option").filter({ hasText: /game\s*master|gamemaster/i }).count() > 0) {
    throw new Error(
      "Gamemaster is listed on the join screen but disabled — an existing session is still active."
    );
  }

  const firstUser = userSelect.locator('option[value]:not([value=""])').first();
  const value = await firstUser.getAttribute("value");
  if (value) await userSelect.selectOption(value);
}

async function clickJoinButton(page) {
  const joinBtn = page.locator([
    'button[name="join"]',
    'form[data-action="join"] button[type="submit"]',
    'form#join-game-form button[type="submit"]',
    'button[type="submit"]:has-text("Join Game")',
    'button:has-text("Join Game Session")'
  ].join(", ")).first();

  await joinBtn.waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  const submitJoin = async () => {
    if (await joinBtn.count() > 0) {
      await joinBtn.click({ timeout: NAV_TIMEOUT });
      return;
    }

    const form = page.locator('form[data-action="join"], form#join-game-form').first();
    if (await form.count() > 0) {
      await form.evaluate((el) => el.requestSubmit());
      return;
    }

    throw new Error(
      `Join button not found at ${page.url()}. ` +
      "The world may not be launched — check Setup and dnd5e under /data/Data/systems/."
    );
  };

  await Promise.all([
    page.waitForURL(/\/game(?:\/|$|\?)/, { timeout: NAV_TIMEOUT }),
    submitJoin()
  ]);
}

/**
 * Launch the CI world from Setup when no game session is active yet.
 * @param {import('playwright').Page} page
 */
async function launchWorldFromSetup(page) {
  console.log("[foundry] Launching world from Setup…");
  await openSetup(page);

  const worldsTab = page.locator(
    "a[data-tab='worlds'], nav a:has-text('Game Worlds'), button:has-text('Game Worlds')"
  ).first();
  await dismissBlockingDialogs(page);

  if (await worldsTab.count() > 0) {
    await worldsTab.click({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
  }

  await dismissBlockingDialogs(page);

  try {
    await launchWorldViaSetupApi(page);
  } catch (apiErr) {
    console.warn(`[foundry] Setup API launch failed (${apiErr.message}); falling back to UI launch…`);

    const launchBtn = page.locator([
      `[data-package-id='${WORLD_ID}'] [data-action='worldLaunch']`,
      `[data-package-id='${WORLD_ID}'] a.control.play`,
      `article:has-text('Traveler CI') [data-action='worldLaunch']`,
      `li:has-text('Traveler CI') [data-action='worldLaunch']`,
      `[data-package-id='${WORLD_ID}'] button:has-text('Launch')`,
      `button:has-text('Launch World')`
    ].join(", ")).first();

    if (await launchBtn.count() === 0) {
      throw new Error(
        `Could not find Launch button for world "${WORLD_ID}" in Setup. ` +
        "Ensure dnd5e is installed under /data/Data/systems/."
      );
    }

    const worldCard = page.locator(`[data-package-id='${WORLD_ID}']`).first();
    await worldCard.scrollIntoViewIfNeeded();
    await worldCard.hover().catch(() => {});

    try {
      await launchBtn.click({ timeout: 10_000 });
    } catch {
      await launchBtn.evaluate((el) => el.click());
    }

    await dismissBlockingDialogs(page);
    await removeTourOverlays(page);
    await confirmWorldMigrationIfPresent(page);
  }

  await waitForActiveWorld();

  if (!/\/(game|join)/.test(page.url())) {
    console.log("[foundry] World launched via API — navigating to join…");
    await gotoWithRetry(page, `${BASE_URL}/join`);
    await authenticateSetup(page);
  }
}

/**
 * Navigate to the game join screen and enter as GM.
 * @param {import('playwright').Page} page
 */
export async function joinWorldAsGM(page) {
  await gotoWithRetry(page, `${BASE_URL}/game`);
  await authenticateSetup(page);
  await acceptLicenseAgreement(page);
  await authenticateSetup(page);

  if (await page.locator("#board").count() > 0) {
    console.log("[foundry] Game canvas already loaded");
    await page.waitForTimeout(3_000);
    return;
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const status = await fetchWorldStatus();
  if (!status?.active || /no active game session/i.test(bodyText)) {
    await launchWorldFromSetup(page);
  }

  if (await page.locator("#board").count() > 0) {
    console.log("[foundry] Game canvas loaded after world launch");
    await page.waitForTimeout(3_000);
    return;
  }

  await gotoWithRetry(page, `${BASE_URL}/join`);
  await authenticateSetup(page);

  if (!page.url().includes("/join")) {
    await gotoWithRetry(page, `${BASE_URL}/join`);
    await authenticateSetup(page);
  }

  await page.locator('select[name="userid"], select#userid, button[name="join"], button:has-text("Join Game Session")').first()
    .waitFor({ state: "visible", timeout: NAV_TIMEOUT });

  console.log("[foundry] Joining world as Gamemaster…");
  await dismissBlockingDialogs(page);
  await ensureGmJoinAvailable(page);
  await selectJoinFormOptions(page);
  await clickJoinButton(page);

  console.log("[foundry] Waiting for canvas…");
  await waitForCanvasReady(page);
  await enableRequiredModules(page);
  await dismissBlockingDialogs(page);
  await page.waitForTimeout(3_000);
}

/** Re-enable CI modules after a generational world migration disables them. */
async function enableRequiredModules(page) {
  await page.waitForFunction(() => globalThis.game?.ready === true, { timeout: NAV_TIMEOUT });

  const changed = await page.evaluate(async () => {
    const current = { ...(game.settings.get("core", "moduleConfiguration") ?? {}) };
    let updated = false;
    for (const id of ["traveler", "quench"]) {
      if (!current[id]) {
        current[id] = true;
        updated = true;
      }
    }
    if (!updated) return false;
    await game.settings.set("core", "moduleConfiguration", current);
    return true;
  });

  if (changed) {
    console.log("[foundry] Enabled traveler + quench modules; reloading…");
    await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForFunction(() => {
      const g = globalThis.game;
      return g?.ready
        && g.modules?.get("traveler")?.active
        && g.modules?.get("quench")?.active;
    }, { timeout: NAV_TIMEOUT });
    await waitForCanvasReady(page);
    await page.waitForTimeout(2_000);
  }
}

/** Wait until Foundry finishes booting the joined world session. */
async function waitForCanvasReady(page) {
  await page.waitForFunction(() => globalThis.game?.ready === true, { timeout: NAV_TIMEOUT });
}
