/**
 * Unit tests for pure settings helpers (scripts/settings.js).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeSettings,
  applyColorNumbers,
  applyMapScaling,
  DEFAULTS,
  DEFAULT_TRAVEL_MODES,
  PLAYER_ROUTE_MODE,
  getPlayerRouteMode,
  getTravelModes,
  getTravelModeById,
  getSceneDistanceConfig,
  getSettings,
  getStageScale,
  getCameraScaleForPath,
  getMapPixelSize,
  getViewPixelSizeForScale
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

  it("defaults defaultElevation to 0 when missing", () => {
    const { defaultElevation, ...rest } = DEFAULTS;
    expect(normalizeSettings(rest).defaultElevation).toBe(0);
  });

  it("preserves explicit defaultElevation", () => {
    expect(normalizeSettings({ ...DEFAULTS, defaultElevation: 12 }).defaultElevation).toBe(12);
  });

  it("defaults travelMode to none when missing", () => {
    const { travelMode, ...rest } = DEFAULTS;
    expect(normalizeSettings(rest).travelMode).toBe("none");
  });

  it("defaults labelFollowPath to true when undefined", () => {
    const { labelFollowPath, ...rest } = DEFAULTS;
    expect(normalizeSettings(rest).labelFollowPath).toBe(true);
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

// ---------------------------------------------------------------------------
// getTravelModes / getTravelModeById
// ---------------------------------------------------------------------------

describe("getTravelModes", () => {
  it("returns defaults when setting is empty", () => {
    game.settings.get = () => [];
    const modes = getTravelModes();
    expect(modes.length).toBe(DEFAULT_TRAVEL_MODES.length);
    expect(modes[0].id).toBe(DEFAULT_TRAVEL_MODES[0].id);
  });

  it("returns a deep clone of configured modes", () => {
    const custom = [{ id: "custom", label: "Custom", speedMph: 10 }];
    game.settings.get = () => custom;
    const modes = getTravelModes();
    expect(modes).toEqual(custom);
    expect(modes).not.toBe(custom);
  });
});

describe("getTravelModeById", () => {
  beforeEach(() => {
    game.settings.get = vi.fn((mod, key) => {
      if (key === "travelModes") return undefined;
      return undefined;
    });
  });

  it("returns undefined for null or none", () => {
    expect(getTravelModeById(null)).toBeUndefined();
    expect(getTravelModeById("none")).toBeUndefined();
  });

  it("finds a mode by id", () => {
    expect(getTravelModeById("horseback")?.label).toBe("Horseback");
  });
});

// ---------------------------------------------------------------------------
// getSceneDistanceConfig
// ---------------------------------------------------------------------------

describe("getSceneDistanceConfig", () => {
  it("uses scene flag override when enabled", () => {
    const scene = {
      getFlag: () => ({ enabled: true, distancePerSquare: 100, units: "miles" }),
      grid: { distance: 5, units: "ft" }
    };
    const cfg = getSceneDistanceConfig(scene);
    expect(cfg.distancePerSquare).toBe(100);
    expect(cfg.units).toBe("miles");
    expect(cfg.overridden).toBe(true);
  });

  it("falls back to scene grid distance", () => {
    const scene = {
      getFlag: () => null,
      grid: { distance: 5, units: "ft" }
    };
    const cfg = getSceneDistanceConfig(scene);
    expect(cfg.distancePerSquare).toBe(5);
    expect(cfg.units).toBe("ft");
    expect(cfg.overridden).toBe(false);
  });

  it("defaults to 1 when scene is null", () => {
    const cfg = getSceneDistanceConfig(null);
    expect(cfg.distancePerSquare).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getSettings / getStageScale / getCameraScaleForPath / getMapPixelSize
// ---------------------------------------------------------------------------

describe("getSettings", () => {
  it("returns settings with colour numbers applied", () => {
    game.settings.get = () => ({ ...DEFAULTS, lineColor: "#ff0000" });
    const s = getSettings();
    expect(s.lineColorNum).toBe(0xff0000);
  });
});

describe("getStageScale", () => {
  it("returns stage scale when available", () => {
    canvas.stage = { scale: { x: 1.5 } };
    expect(getStageScale()).toBe(1.5);
  });

  it("falls back to worldTransform.a", () => {
    canvas.stage = { worldTransform: { a: 0.8 } };
    expect(getStageScale()).toBe(0.8);
  });
});

describe("getViewPixelSizeForScale", () => {
  it("returns null when screen is unavailable", () => {
    canvas.app.renderer.screen = null;
    expect(getViewPixelSizeForScale(1)).toBeNull();
  });

  it("computes view size from screen and scale", () => {
    canvas.app.renderer.screen = { width: 1920, height: 1080 };
    const size = getViewPixelSizeForScale(2);
    expect(size.width).toBe(960);
    expect(size.height).toBe(540);
  });
});

describe("getMapPixelSize", () => {
  it("returns null when scene is missing", () => {
    const saved = canvas.scene;
    canvas.scene = null;
    expect(getMapPixelSize()).toBeNull();
    canvas.scene = saved;
  });

  it("uses view size when screen is available", () => {
    canvas.app.renderer.screen = { width: 1920, height: 1080 };
    canvas.stage = { scale: { x: 1 } };
    const size = getMapPixelSize();
    expect(size).toEqual({ width: 1920, height: 1080 });
  });

  it("falls back to scene dimensions", () => {
    canvas.app.renderer.screen = null;
    canvas.scene = {
      ...canvas.scene,
      dimensions: { sceneWidth: 4000, sceneHeight: 3000 }
    };
    const size = getMapPixelSize();
    expect(size).toEqual({ width: 4000, height: 3000 });
  });
});

describe("getCameraScaleForPath", () => {
  beforeEach(() => {
    canvas.app.renderer.screen = { width: 1920, height: 1080 };
    canvas.scene = {
      ...canvas.scene,
      width: 4000,
      height: 3000,
      dimensions: { sceneWidth: 4000, sceneHeight: 3000 }
    };
  });

  it("returns null when totalLen is zero", () => {
    expect(getCameraScaleForPath(0)).toBeNull();
  });

  it("returns a scale clamped between min and max", () => {
    const scale = getCameraScaleForPath(5000);
    expect(scale).toBeGreaterThanOrEqual(0.2);
    expect(scale).toBeLessThanOrEqual(3);
  });

  it("returns larger scale for shorter paths", () => {
    const short = getCameraScaleForPath(500);
    const long  = getCameraScaleForPath(50000);
    expect(short).toBeGreaterThan(long);
  });
});
