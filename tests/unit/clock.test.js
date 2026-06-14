/**
 * Unit tests for scripts/clock.js
 *
 * Tests pure math functions: computeTravelSeconds and formatTravelDuration.
 * advanceClock is async and calls game.time.advance; its behaviour is tested
 * in the Quench integration suite.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeTravelSeconds, formatTravelDuration, advanceClock } from "../../scripts/clock.js";

// ---------------------------------------------------------------------------
// computeTravelSeconds
// ---------------------------------------------------------------------------

describe("computeTravelSeconds", () => {
  // Reference: 100px path, 100px/square grid, 1 unit/square, speed 1 mph
  // = (100/100)*1 = 1 unit, 1/1*3600 = 3600 s
  it("returns 3600 for 1 unit at 1 mph", () => {
    expect(computeTravelSeconds(100, 100, 1, 1)).toBe(3600);
  });

  it("scales linearly with distance", () => {
    // Double the path length → double the time
    expect(computeTravelSeconds(200, 100, 1, 1)).toBe(7200);
  });

  it("scales inversely with speed", () => {
    // 2× speed → half the time
    expect(computeTravelSeconds(100, 100, 1, 2)).toBe(1800);
  });

  it("handles a realistic overland scenario", () => {
    // 500 px path on a 100px/square grid where 1 square = 5 miles, speed 3 mph
    // totalUnits = (500/100)*5 = 25 miles
    // seconds = (25/3)*3600 = 30000 s
    expect(computeTravelSeconds(500, 100, 5, 3)).toBeCloseTo(30000, 0);
  });

  it("returns 0 for zero-length path", () => {
    expect(computeTravelSeconds(0, 100, 1, 3)).toBe(0);
  });

  it("returns 0 for zero grid size", () => {
    expect(computeTravelSeconds(100, 0, 1, 3)).toBe(0);
  });

  it("returns 0 for zero distance per square", () => {
    expect(computeTravelSeconds(100, 100, 0, 3)).toBe(0);
  });

  it("returns 0 for zero speed", () => {
    expect(computeTravelSeconds(100, 100, 1, 0)).toBe(0);
  });

  it("returns 0 for negative speed", () => {
    expect(computeTravelSeconds(100, 100, 1, -1)).toBe(0);
  });

  it("returns 0 for NaN inputs", () => {
    expect(computeTravelSeconds(NaN, 100, 1, 3)).toBe(0);
    expect(computeTravelSeconds(100, NaN, 1, 3)).toBe(0);
    expect(computeTravelSeconds(100, 100, NaN, 3)).toBe(0);
    expect(computeTravelSeconds(100, 100, 1, NaN)).toBe(0);
  });

  it("handles geo-scale map: 100 miles/square, 6 mph horseback", () => {
    // 10 squares at 100 miles each = 1000 miles
    // 1000 / 6 * 3600 = 600000 seconds ≈ 166.67 hours ≈ 6.94 days
    const s = computeTravelSeconds(1000, 100, 100, 6);
    expect(s).toBeCloseTo(600000, -2); // within 100s
  });
});

// ---------------------------------------------------------------------------
// formatTravelDuration
// ---------------------------------------------------------------------------

describe("formatTravelDuration", () => {
  it("formats 0 seconds as '0 min'", () => {
    expect(formatTravelDuration(0)).toBe("0 min");
  });

  it("formats negative seconds as '0 min'", () => {
    expect(formatTravelDuration(-100)).toBe("0 min");
  });

  it("formats < 1 minute", () => {
    expect(formatTravelDuration(30)).toBe("< 1 min");
  });

  it("formats exactly 1 minute", () => {
    expect(formatTravelDuration(60)).toBe("1 min");
  });

  it("formats 90 seconds as 2 min (rounded)", () => {
    expect(formatTravelDuration(90)).toBe("2 min");
  });

  it("formats 1 hour exactly", () => {
    expect(formatTravelDuration(3600)).toBe("1 hr");
  });

  it("formats 1 hour 30 minutes", () => {
    expect(formatTravelDuration(5400)).toBe("1 hr 30 min");
  });

  it("formats exactly 24 hours as 1 day", () => {
    expect(formatTravelDuration(86400)).toBe("1 day");
  });

  it("formats 1 day 6 hours", () => {
    expect(formatTravelDuration(86400 + 21600)).toBe("1 day 6 hr");
  });

  it("formats 2 days 3 hours 45 minutes", () => {
    const s = 2 * 86400 + 3 * 3600 + 45 * 60;
    expect(formatTravelDuration(s)).toBe("2 days 3 hr 45 min");
  });

  it("uses plural 'days' for 2+", () => {
    expect(formatTravelDuration(2 * 86400)).toBe("2 days");
  });

  it("uses singular 'day' for exactly 1", () => {
    expect(formatTravelDuration(86400)).toBe("1 day");
  });

  it("handles NaN gracefully", () => {
    expect(formatTravelDuration(NaN)).toBe("0 min");
  });
});

// ---------------------------------------------------------------------------
// advanceClock
// ---------------------------------------------------------------------------

describe("advanceClock", () => {
  beforeEach(() => {
    game.user.isGM = true;
    game.settings.get = vi.fn((mod, key) => {
      if (key === "worldClockEnabled") return true;
      if (key === "travelModes") return undefined;
      return undefined;
    });
    game.time = { advance: vi.fn(async () => {}) };
    ui.notifications.info = vi.fn();
    canvas.grid.size = 100;
    canvas.scene = {
      ...canvas.scene,
      grid: { distance: 5, units: "miles" },
      getFlag: () => null
    };
  });

  it("does nothing when user is not GM", async () => {
    game.user.isGM = false;
    await advanceClock(500, "walk-normal");
    expect(game.time.advance).not.toHaveBeenCalled();
  });

  it("does nothing when worldClockEnabled is off", async () => {
    game.settings.get = vi.fn(() => false);
    await advanceClock(500, "walk-normal");
    expect(game.time.advance).not.toHaveBeenCalled();
  });

  it("advances game.time when enabled and mode is valid", async () => {
    await advanceClock(300, "walk-normal");
    expect(game.time.advance).toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalled();
  });

  it("does nothing when modeId is missing or invalid", async () => {
    await advanceClock(300, null);
    await advanceClock(300, "none");
    expect(game.time.advance).not.toHaveBeenCalled();
  });
});
