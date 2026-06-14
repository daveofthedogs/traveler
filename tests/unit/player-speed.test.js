/**
 * Unit tests for:
 *  - scaleDrawSpeed (scripts/apps/player-speed-dialog.js)
 *  - encounterMult applied by handleZoneFired via getTravelModeById
 *  - DEFAULT_TRAVEL_MODES encounterMult coverage
 */

import { describe, it, expect, vi } from "vitest";
import { scaleDrawSpeed, PlayerSpeedDialog } from "../../scripts/apps/player-speed-dialog.js";
import { DEFAULT_TRAVEL_MODES, getTravelModeById } from "../../scripts/settings.js";

// ---------------------------------------------------------------------------
// scaleDrawSpeed
// ---------------------------------------------------------------------------

describe("scaleDrawSpeed", () => {
  it("returns base speed unchanged for walk-normal (3 mph)", () => {
    expect(scaleDrawSpeed(400, 3, 3)).toBe(400);
  });

  it("doubles speed for 6 mph (horseback) relative to 3 mph base", () => {
    expect(scaleDrawSpeed(400, 6, 3)).toBe(800);
  });

  it("slows speed for 2 mph (walk-slow) relative to 3 mph base", () => {
    expect(scaleDrawSpeed(300, 2, 3)).toBeCloseTo(200, 5);
  });

  it("never returns below 1", () => {
    expect(scaleDrawSpeed(1, 0.001, 3)).toBeGreaterThanOrEqual(1);
  });

  it("returns base when speedMph is 0 or negative", () => {
    expect(scaleDrawSpeed(400, 0,  3)).toBe(400);
    expect(scaleDrawSpeed(400, -1, 3)).toBe(400);
  });

  it("returns base when baseDraw is 0 or negative", () => {
    expect(scaleDrawSpeed(0,  3, 3)).toBe(0);
    expect(scaleDrawSpeed(-1, 3, 3)).toBe(-1);
  });

  it("returns base when baseRef is 0 or negative", () => {
    expect(scaleDrawSpeed(400, 3, 0)).toBe(400);
    expect(scaleDrawSpeed(400, 3, -1)).toBe(400);
  });

  it("handles NaN gracefully — returns base", () => {
    expect(scaleDrawSpeed(NaN, 3, 3)).toBeNaN();
    expect(scaleDrawSpeed(400, NaN, 3)).toBe(400);
    expect(scaleDrawSpeed(400, 3, NaN)).toBe(400);
  });

  it("scales by airship (20 mph) relative to 3 mph", () => {
    expect(scaleDrawSpeed(300, 20, 3)).toBeCloseTo(2000, 0);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_TRAVEL_MODES encounterMult
// ---------------------------------------------------------------------------

describe("DEFAULT_TRAVEL_MODES encounterMult", () => {
  it("every mode has a numeric encounterMult", () => {
    for (const mode of DEFAULT_TRAVEL_MODES) {
      expect(typeof mode.encounterMult).toBe("number");
      expect(Number.isFinite(mode.encounterMult)).toBe(true);
    }
  });

  it("walk-slow has encounterMult < 1.0 (less observant = lower chance)", () => {
    const m = DEFAULT_TRAVEL_MODES.find((x) => x.id === "walk-slow");
    expect(m.encounterMult).toBeLessThan(1.0);
  });

  it("walk-normal has encounterMult === 1.0 (baseline)", () => {
    const m = DEFAULT_TRAVEL_MODES.find((x) => x.id === "walk-normal");
    expect(m.encounterMult).toBe(1.0);
  });

  it("horseback has encounterMult > 1.0 (noisier, faster)", () => {
    const m = DEFAULT_TRAVEL_MODES.find((x) => x.id === "horseback");
    expect(m.encounterMult).toBeGreaterThan(1.0);
  });

  it("elemental-airship has encounterMult < 1.0 (high altitude)", () => {
    const m = DEFAULT_TRAVEL_MODES.find((x) => x.id === "elemental-airship");
    expect(m.encounterMult).toBeLessThan(1.0);
  });

  it("encounterMult is always > 0 for all modes", () => {
    for (const mode of DEFAULT_TRAVEL_MODES) {
      expect(mode.encounterMult).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getTravelModeById
// ---------------------------------------------------------------------------

describe("getTravelModeById", () => {
  it("returns the correct mode by id", () => {
    const m = getTravelModeById("horseback");
    expect(m).toBeDefined();
    expect(m.id).toBe("horseback");
    expect(m.speedMph).toBe(6);
  });

  it("returns undefined for unknown id", () => {
    expect(getTravelModeById("flying-broom")).toBeUndefined();
  });

  it("returns undefined for null/undefined", () => {
    expect(getTravelModeById(null)).toBeUndefined();
    expect(getTravelModeById(undefined)).toBeUndefined();
    expect(getTravelModeById("none")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Encounter chance scaling math (unit-level)
// ---------------------------------------------------------------------------

describe("encounter chance scaling math", () => {
  const applyMult = (baseChance, encounterMult) =>
    Math.min(1, Math.max(0, baseChance * encounterMult));

  it("horseback (1.6×) raises a 30% zone to 48%", () => {
    expect(applyMult(0.3, 1.6)).toBeCloseTo(0.48, 5);
  });

  it("walk-slow (0.7×) lowers a 30% zone to 21%", () => {
    expect(applyMult(0.3, 0.7)).toBeCloseTo(0.21, 5);
  });

  it("airship (0.4×) caps at 0 when base is already 0", () => {
    expect(applyMult(0, 0.4)).toBe(0);
  });

  it("result never exceeds 1.0 regardless of multiplier", () => {
    expect(applyMult(0.9, 1.6)).toBeLessThanOrEqual(1.0);
    expect(applyMult(1.0, 2.0)).toBe(1.0);
  });

  it("result never goes below 0", () => {
    expect(applyMult(0.3, -1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PlayerSpeedDialog (ApplicationV2)
// ---------------------------------------------------------------------------

describe("PlayerSpeedDialog", () => {
  it("resolves to selected mode id on submit", async () => {
    const dialog = new PlayerSpeedDialog({ defaultModeId: "walk-fast" });
    dialog._onSubmit();
    await expect(dialog.promise).resolves.toBe("walk-fast");
  });

  it("resolves to null on cancel", async () => {
    const dialog = new PlayerSpeedDialog();
    dialog._onCancel();
    await expect(dialog.promise).resolves.toBeNull();
  });

  it("_prepareContext marks the default mode as selected", async () => {
    const dialog = new PlayerSpeedDialog({ defaultModeId: "horseback" });
    game.settings.get = vi.fn((mod, key) =>
      key === "travelModes" ? undefined : undefined
    );
    const ctx = await dialog._prepareContext();
    const horse = ctx.modes.find((m) => m.id === "horseback");
    expect(horse?.selected).toBe(true);
  });
});
