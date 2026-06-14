/**
 * Programmatic scene fixtures for Quench integration tests.
 *
 * All fixtures create real Foundry Documents and clean up after themselves.
 * No manually-built world data is required.
 *
 * Usage:
 *   import { SceneFixture } from "./fixtures.js";
 *
 *   before(async function() { ctx = await buildSceneFixture(this); });
 *   after(async  () => { await ctx.teardown(); });
 */

/** Default Mocha timeout for Quench integration tests (ms). CI runners are slower than local. */
export const QUENCH_TEST_TIMEOUT = 30_000;

/**
 * Wrap a Quench batch body in a root Mocha suite with a CI-safe timeout.
 * Quench defaults to 2000ms per test; async Foundry document I/O often exceeds that on GHA.
 * @param {Function} describe from Quench context
 * @param {() => void} fn batch body (before/after/describe/it registrations)
 */
export function integrationBatch(describe, fn) {
  describe("integration", function() {
    this.timeout(180_000);
    fn();
  });
}

/**
 * Run SceneFixture.build with a Mocha timeout suited to Foundry document I/O.
 * @param {Mocha.Context} hook
 */
export async function buildSceneFixture(hook) {
  hook.timeout(180_000);
  return SceneFixture.build();
}

const MODULE_ID = "traveler";

/** Foundry create APIs sometimes return a document or a one-element array. */
function unwrapDoc(doc) {
  return Array.isArray(doc) ? doc[0] : doc;
}

/** Load `scene` on the live canvas so pathfinding and region APIs are available. */
async function activateSceneOnCanvas(scene) {
  if (canvas.scene?.id !== scene.id) {
    await scene.view();
  }
  if (!canvas.ready) {
    await new Promise((resolve) => Hooks.once("canvasReady", resolve));
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/**
 * Resolve a traveler.changeLevel behavior on a region (canvas-backed when possible).
 * @param {RegionDocument} regionDoc
 * @returns {import("../../scripts/behaviors/change-level.js").TravelerChangeLevelBehavior|null}
 */
export function getChangeLevelBehavior(regionDoc) {
  const doc = unwrapDoc(regionDoc);
  if (!doc?.id) return null;

  const sceneId = doc.parent?.id ?? doc.scene?.id ?? canvas.scene?.id;
  const scene = game.scenes?.get?.(sceneId);
  const region = scene?.regions?.get?.(doc.id) ?? doc;
  const raw = region.behaviors?.contents ?? region.behaviors ?? [];
  const list = Array.isArray(raw) ? raw : [...raw];
  return list.find((b) => b.type === `${MODULE_ID}.changeLevel`) ?? null;
}

// ---------------------------------------------------------------------------
// SceneFixture
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FixtureContext
 * @property {Scene}          scene
 * @property {WallDocument}   wall         Vertical wall at x = 300
 * @property {RegionDocument} cliffRegion  Region east of x = 500 (stairs mode, no check)
 * @property {RegionDocument} checkRegion  Region east of x = 700 (cliff mode, requires check)
 * @property {TokenDocument}  token        Controlled player token at (50, 450)
 * @property {function(): Promise<void>} teardown
 */

export const SceneFixture = {
  /**
   * Create a fully configured test scene.
   * @returns {Promise<FixtureContext>}
   */
  async build() {
    const scene = await Scene.create({
      name: `Traveler CI ${Date.now()}`,
      width:  1000,
      height: 1000,
      grid: {
        type:     CONST.GRID_TYPES?.SQUARE ?? 1,
        size:     100,
        distance: 5,
        units:    "ft"
      },
      padding:  0,
      tokenVision: false   // disable fog so pathfinding tests are not blocked
    });

    await scene.update({ active: true });
    await activateSceneOnCanvas(scene);

    // ------------------------------------------------------------------
    // Walls
    // ------------------------------------------------------------------

    // Vertical wall at x = 300, full height — splits left and right areas
    const wall = unwrapDoc(await WallDocument.create(
      { c: [300, 0, 300, 1000], move: CONST.WALL_MOVEMENT_TYPES?.NORMAL ?? 1 },
      { parent: scene }
    ));

    // A gap in the wall at y = 400–500 (one grid cell) allows passage
    const wallGap = unwrapDoc(await WallDocument.create(
      { c: [300, 500, 300, 1000], move: CONST.WALL_MOVEMENT_TYPES?.NORMAL ?? 1 },
      { parent: scene }
    ));

    // ------------------------------------------------------------------
    // Regions
    // ------------------------------------------------------------------

    // Stairs region — automatic pass, elevation 10
    const cliffRegion = unwrapDoc(await RegionDocument.create({
      name: "Stairwell",
      shapes: [{
        type:   "rectangle",
        x:      450,
        y:      0,
        width:  100,
        height: 1000
      }]
    }, { parent: scene }));

    // Cliff region — requires a roll check, DC 1 (always passes with 1d20)
    const checkRegion = unwrapDoc(await RegionDocument.create({
      name: "Cliff Face",
      shapes: [{
        type:   "rectangle",
        x:      600,
        y:      0,
        width:  100,
        height: 1000
      }]
    }, { parent: scene }));

    const cliffCreated = await cliffRegion.createEmbeddedDocuments("RegionBehavior", [{
      type: `${MODULE_ID}.changeLevel`,
      system: {
        mode:            "stairs",
        targetElevation: 10,
        requiresCheck:   false
      }
    }]);
    const cliffBehavior = unwrapDoc(cliffCreated);

    const checkCreated = await checkRegion.createEmbeddedDocuments("RegionBehavior", [{
      type: `${MODULE_ID}.changeLevel`,
      system: {
        mode:            "cliff",
        targetElevation: 30,
        requiresCheck:   true,
        checkLabel:      "Climb Check",
        checkFormula:    "1d20",
        checkDC:         1,
        failureDamage:   "",
        allowRetry:      false
      }
    }]);
    const checkBehavior = unwrapDoc(checkCreated);

    // ------------------------------------------------------------------
    // Token
    // ------------------------------------------------------------------

    // Place a basic actor-less token the test can control
    const token = unwrapDoc(await TokenDocument.create({
      name:      "CI Hero",
      x:         50,
      y:         400,
      width:     1,
      height:    1,
      actorId:   null,
      elevation: 0
    }, { parent: scene }));

    // ------------------------------------------------------------------
    // Teardown helper
    // ------------------------------------------------------------------

    return {
      scene,
      wall,
      wallGap,
      cliffRegion,
      checkRegion,
      cliffBehavior,
      checkBehavior,
      token,
      /**
       * Delete all created documents.
       * Skipped when `window.TRAVELER_KEEP_WORLD === true` so the GM can
       * inspect the live world after a TRAVELER_KEEP_WORLD=true test run.
       */
      teardown: async () => {
        if (globalThis.TRAVELER_KEEP_WORLD) {
          console.log(
            `[Traveler fixtures] Keeping scene "${scene?.name}" (TRAVELER_KEEP_WORLD=true).`
          );
          return;
        }
        try { await scene?.delete(); } catch {}
      }
    };
  }
};

// ---------------------------------------------------------------------------
// WallFixture — add/remove a single wall for focused wall tests
// ---------------------------------------------------------------------------

export const WallFixture = {
  /**
   * Create a horizontal wall across the entire scene at y = `yPos`.
   * @param {Scene}  scene
   * @param {number} yPos
   */
  async createHorizontal(scene, yPos) {
    return WallDocument.create(
      { c: [0, yPos, 1000, yPos], move: CONST.WALL_MOVEMENT_TYPES?.NORMAL ?? 1 },
      { parent: scene }
    );
  }
};
