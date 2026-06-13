/**
 * Unit tests for pure settings helpers (scripts/settings.js).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeSettings,
  applyColorNumbers,
  applyMapScaling,
  DEFAULTS,
  PLAYER_ROUTE_MODE,
  getPlayerRouteMode
} from "../../scripts/settings.js";

// ---------------------------------------------------------------------------
// normalizeSettings
// ---------------------------------------------------------------------------

describe("normalizeSettings", () => {
  it("returns a copy with numeric strings coerced to numbers", () => {
    const result = normalizeSettings({ ...DEFAULTS, lineWidth: "8" });
    expect(result.lineWidth).toBe(8);
  });

  it("clamps sampleStepPx to minimum 1", () => {
    expect(normalizeSettings({ ...DEFAULTS, sampleStepPx: 0 }).sampleStepPx).toBe(1);
    expect(normalizeSettings({ ...DEFAULTS, sampleStepPx: -5 }).sampleStepPx).toBe(1);
    expect(normalizeSettings({ ...DEFAULTS, sampleStepPx: 10 }).sampleStepPx).toBe(10);
  });

  it("clamps labelFontSize to 200 maximum", () => {
    expect(normalizeSettings({ ...DEFAULTS, labelFontSize: 999 }).labelFontSize).toBe(200);
  });

  it("converts dashLength=0 to null", () => {
    expect(normalizeSettings({ ...DEFAULTS, dashLength: 0 }).dashLength).toBeNull();
  });

  it("converts gapLength=0 to null", () => {
    expect(normalizeSettings({ ...DEFAULTS, gapLength: 0 }).gapLength).toBeNull();
  });

  it("preserves positive dashLength", () => {
    expect(normalizeSettings({ ...DEFAULTS, dashLength: 20 }).dashLength).toBe(20);
  });

  it("coerces showDot to boolean", () => {
    expect(normalizeSettings({ ...DEFAULTS, showDot: 1 }).showDot).toBe(true);
    expect(normalizeSettings({ ...DEFAULTS, showDot: 0 }).showDot).toBe(false);
  });

  it("defaults dotTokenUuid to empty string when undefined", () => {
    const { dotTokenUuid, ...rest } = DEFAULTS;
    expect(normalizeSettings(rest).dotTokenUuid).toBe("");
  });

  it("preserves levelId null", () => {
    expect(normalizeSettings({ ...DEFAULTS, levelId: null }).levelId).toBeNull();
  });

  it("preserves levelId string", () => {
    expect(normalizeSettings({ ...DEFAULTS, levelId: "abc123" }).levelId).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// applyColorNumbers
// ---------------------------------------------------------------------------

describe("applyColorNumbers", () => {
  it("converts lineColor hex string to a number", () => {
    const result = applyColorNumbers({ ...DEFAULTS, lineColor: "#ff0000" });
    expect(result.lineColorNum).toBe(0xff0000);
  });

  it("converts dotColor hex string to a number", () => {
    const result = applyColorNumbers({ ...DEFAULTS, dotColor: "#00ff00" });
    expect(result.dotColorNum).toBe(0x00ff00);
  });

  it("converts labelColor hex string to a number", () => {
    const result = applyColorNumbers({ ...DEFAULTS, labelColor: "#0000ff" });
    expect(result.labelColorNum).toBe(0x0000ff);
  });

  it("handles colours without leading #", () => {
    const result = applyColorNumbers({ ...DEFAULTS, lineColor: "ff6400" });
    expect(result.lineColorNum).toBe(0xff6400);
  });
});

// ---------------------------------------------------------------------------
// applyMapScaling
// ---------------------------------------------------------------------------

describe("applyMapScaling", () => {
  it("returns settings unchanged when scaleWithMap is false", () => {
    const settings = { ...DEFAULTS, scaleWithMap: false };
    const result = applyMapScaling(settings);
    expect(result.lineWidth).toBe(DEFAULTS.lineWidth);
  });

  it("scales lineWidth based on map size", () => {
    // Provide a large map — should produce a lineWidth > default
    const settings = { ...DEFAULTS, scaleWithMap: true, scaleMultiplier: 1 };
    const result = applyMapScaling(settings, { width: 6000, height: 4000 });
    expect(result.lineWidth).toBeGreaterThan(0);
  });

  it("respects scaleMultiplier", () => {
    const base    = applyMapScaling({ ...DEFAULTS, scaleWithMap: true, scaleMultiplier: 1 },
                                    { width: 3000, height: 3000 });
    const doubled = applyMapScaling({ ...DEFAULTS, scaleWithMap: true, scaleMultiplier: 2 },
                                    { width: 3000, height: 3000 });
    expect(doubled.lineWidth).toBeCloseTo(base.lineWidth * 2, 0);
  });

  it("ensures lineWidth is at least 1", () => {
    const result = applyMapScaling(
      { ...DEFAULTS, scaleWithMap: true, scaleMultiplier: 0.0001 },
      { width: 1, height: 1 }
    );
    expect(result.lineWidth).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// PLAYER_ROUTE_MODE constants
// ---------------------------------------------------------------------------

describe("PLAYER_ROUTE_MODE", () => {
  it("has the three expected values", () => {
    expect(PLAYER_ROUTE_MODE.OFF).toBe("off");
    expect(PLAYER_ROUTE_MODE.IMMEDIATE).toBe("immediate");
    expect(PLAYER_ROUTE_MODE.APPROVAL).toBe("approval");
  });
});

// ---------------------------------------------------------------------------
// getPlayerRouteMode
// ---------------------------------------------------------------------------

describe("getPlayerRouteMode", () => {
  it('returns "off" when game.settings.get throws (pre-init)', () => {
    game.settings.get = () => { throw new Error("Not ready"); };
    expect(getPlayerRouteMode()).toBe("off");
    // Restore
    game.settings.get = () => "off";
  });

  it("returns the value from game.settings", () => {
    game.settings.get = () => "approval";
    expect(getPlayerRouteMode()).toBe("approval");
    game.settings.get = () => "off";
  });
});
