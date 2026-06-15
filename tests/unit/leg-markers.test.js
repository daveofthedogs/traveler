import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  legMarkerIntervalToHours,
  resolveEffectiveTravelMode,
  computeLegMarkerPoints
} from "../../scripts/leg-markers.js";
import { DEFAULTS, DEFAULT_TRAVEL_MODES } from "../../scripts/settings.js";

describe("legMarkerIntervalToHours", () => {
  it("converts hours", () => {
    expect(legMarkerIntervalToHours(12, "h")).toBe(12);
  });

  it("converts minutes", () => {
    expect(legMarkerIntervalToHours(30, "min")).toBe(0.5);
  });

  it("converts days", () => {
    expect(legMarkerIntervalToHours(1, "d")).toBe(24);
  });

  it("returns null for invalid values", () => {
    expect(legMarkerIntervalToHours(0, "h")).toBeNull();
    expect(legMarkerIntervalToHours(-1, "h")).toBeNull();
  });
});

describe("resolveEffectiveTravelMode", () => {
  beforeEach(() => {
    global.game = {
      settings: {
        get: vi.fn((_module, key) => {
          if (key === "routeSettings") return { ...DEFAULTS, travelMode: "horseback" };
          return null;
        })
      }
    };
  });

  it("prefers route travel mode", () => {
    expect(resolveEffectiveTravelMode({ travelMode: "coach" })).toEqual({ modeId: "coach", source: "route" });
  });

  it("falls back to world default", () => {
    expect(resolveEffectiveTravelMode({ travelMode: "none" })).toEqual({ modeId: "horseback", source: "global" });
  });

  it("falls back to walk-normal when nothing else is set", () => {
    global.game.settings.get = vi.fn(() => ({ ...DEFAULTS, travelMode: "none" }));
    expect(resolveEffectiveTravelMode({ travelMode: "none" })).toEqual({ modeId: "walk-normal", source: "default" });
  });
});

describe("computeLegMarkerPoints", () => {
  const scene = {
    grid: { size: 100, distance: 5, units: "mi" }
  };

  beforeEach(() => {
    global.canvas = { grid: { size: 100 }, scene };
    global.game = {
      settings: {
        get: vi.fn((_module, key) => {
          if (key === "travelModes") return DEFAULT_TRAVEL_MODES;
          if (key === "routeSettings") return DEFAULTS;
          return null;
        })
      }
    };
  });

  it("returns no markers when disabled", () => {
    const path = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    expect(computeLegMarkerPoints(path, { ...DEFAULTS, showLegMarkers: false }, scene)).toEqual([]);
  });

  it("places markers every 12 hours along a straight route", () => {
    const path = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const settings = {
      ...DEFAULTS,
      showLegMarkers: true,
      legMarkerInterval: 12,
      legMarkerIntervalUnit: "h",
      travelMode: "walk-normal"
    };
    const markers = computeLegMarkerPoints(path, settings, scene);
    expect(markers).toHaveLength(1);
    expect(markers[0].hours).toBe(12);
    expect(markers[0].x).toBeCloseTo(720, 0);
    expect(markers[0].y).toBeCloseTo(0, 0);
  });

  it("places multiple markers for shorter intervals", () => {
    const path = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const settings = {
      ...DEFAULTS,
      showLegMarkers: true,
      legMarkerInterval: 6,
      legMarkerIntervalUnit: "h",
      travelMode: "walk-normal"
    };
    const markers = computeLegMarkerPoints(path, settings, scene);
    expect(markers).toHaveLength(2);
    expect(markers[0].x).toBeCloseTo(360, 0);
    expect(markers[1].x).toBeCloseTo(720, 0);
  });
});
