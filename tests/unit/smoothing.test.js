import { describe, it, expect } from "vitest";
import { chaikin, catmullRom } from "../../scripts/smoothing.js";

describe("chaikin", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
  ];

  it("returns a copy unchanged when fewer than 3 points", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const out = chaikin(pts);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
  });

  it("produces more points after one iteration", () => {
    const out = chaikin(square, 1);
    expect(out.length).toBeGreaterThan(square.length);
  });

  it("preserves first and last points for open paths", () => {
    const out = chaikin(square, 1, false);
    expect(out[0]).toEqual(square[0]);
    expect(out[out.length - 1]).toEqual(square[square.length - 1]);
  });

  it("increases point count with more iterations", () => {
    const one = chaikin(square, 1).length;
    const two = chaikin(square, 2).length;
    expect(two).toBeGreaterThan(one);
  });
});

describe("catmullRom", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 }
  ];

  it("returns a copy when fewer than 2 points", () => {
    expect(catmullRom([{ x: 5, y: 5 }])).toEqual([{ x: 5, y: 5 }]);
  });

  it("samples additional points along segments", () => {
    const out = catmullRom(line, 4, 0.5);
    expect(out.length).toBeGreaterThan(line.length);
  });

  it("starts at the first control point", () => {
    const out = catmullRom(line, 2, 0.5);
    expect(out[0].x).toBeCloseTo(0);
    expect(out[0].y).toBeCloseTo(0);
  });

  it("handles coincident control points without throwing", () => {
    const dup = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(() => catmullRom(dup, 2, 0.5)).not.toThrow();
  });
});
