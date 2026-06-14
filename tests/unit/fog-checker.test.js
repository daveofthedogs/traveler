import { describe, it, expect, beforeEach, vi } from "vitest";
import { isExplored, fogBoundaryAnchor } from "../../scripts/pathfinding/fog-checker.js";

describe("isExplored", () => {
  beforeEach(() => {
    canvas.visibility = { explored: null };
    canvas.app.renderer = { extract: null };
  });

  it("returns true when canvas.visibility is absent", () => {
    canvas.visibility = null;
    expect(isExplored({ x: 50, y: 50 })).toBe(true);
  });

  it("returns true when explored texture is not initialised", () => {
    expect(isExplored({ x: 50, y: 50 })).toBe(true);
  });

  it("returns true when explored is not a RenderTexture", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    canvas.visibility.explored = { not: "a texture" };
    expect(isExplored({ x: 10, y: 10 })).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns true when alpha channel is non-zero", () => {
    canvas.visibility.explored = new PIXI.RenderTexture();
    canvas.app.renderer = {
      extract: {
        pixels: vi.fn(() => new Uint8Array([0, 0, 0, 128]))
      }
    };
    expect(isExplored({ x: 10, y: 10 })).toBe(true);
  });

  it("returns false when alpha channel is zero", () => {
    canvas.visibility.explored = new PIXI.RenderTexture();
    canvas.app.renderer = {
      extract: {
        pixels: vi.fn(() => new Uint8Array([0, 0, 0, 0]))
      }
    };
    expect(isExplored({ x: 10, y: 10 })).toBe(false);
  });

  it("returns true when sampling fails", () => {
    canvas.visibility.explored = new PIXI.RenderTexture();
    canvas.app.renderer = { extract: null };
    expect(isExplored({ x: 10, y: 10 })).toBe(true);
  });
});

describe("fogBoundaryAnchor", () => {
  beforeEach(() => {
    canvas.grid.size = 100;
    canvas.visibility = { explored: null };
  });

  it("returns origin when canvas.grid is missing", () => {
    canvas.grid = null;
    const origin = { x: 0, y: 0 };
    expect(fogBoundaryAnchor(origin, { x: 500, y: 0 })).toEqual(origin);
    canvas.grid = { size: 100 };
  });

  it("returns origin when origin and dest are the same", () => {
    const pt = { x: 100, y: 100 };
    expect(fogBoundaryAnchor(pt, pt)).toEqual(pt);
  });

  it("returns dest when the entire ray is explored", () => {
    canvas.visibility = { explored: null }; // all explored
    const origin = { x: 0, y: 0 };
    const dest   = { x: 300, y: 0 };
    const anchor = fogBoundaryAnchor(origin, dest);
    expect(anchor.x).toBeCloseTo(dest.x, 0);
  });

  it("stops at the last explored point before fog", () => {
    canvas.visibility.explored = new PIXI.RenderTexture();
    let call = 0;
    canvas.app.renderer = {
      extract: {
        pixels: vi.fn(() => {
          call++;
          // First few samples explored, later ones fogged
          return new Uint8Array([0, 0, 0, call <= 2 ? 255 : 0]);
        })
      }
    };
    const origin = { x: 0, y: 0 };
    const dest   = { x: 500, y: 0 };
    const anchor = fogBoundaryAnchor(origin, dest);
    expect(anchor.x).toBeLessThan(dest.x);
    expect(anchor.x).toBeGreaterThanOrEqual(origin.x);
  });
});
