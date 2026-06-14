import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildRouteFromPoints,
  createRouteRecord,
  getSceneRoutes,
  setSceneRoutes
} from "../../scripts/routes.js";
import { DEFAULTS } from "../../scripts/settings.js";

describe("buildRouteFromPoints", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 400, y: 100 }
  ];

  it("returns path, settings, smoothPoints, and elevations", () => {
    const result = buildRouteFromPoints(points, DEFAULTS);
    expect(result).toHaveProperty("path");
    expect(result).toHaveProperty("settings");
    expect(result).toHaveProperty("smoothPoints");
    expect(result).toHaveProperty("elevations");
    expect(result.path.length).toBeGreaterThan(0);
  });

  it("uses chaikin smoothing when configured", () => {
    const result = buildRouteFromPoints(points, {
      ...DEFAULTS,
      smoothingMode: "chaikin",
      chaikinIterations: 1
    });
    expect(result.smoothPoints.length).toBeGreaterThan(points.length);
  });

  it("passes through points unchanged with smoothingMode none", () => {
    const result = buildRouteFromPoints(points, {
      ...DEFAULTS,
      smoothingMode: "none",
      sampleStepPx: 1000
    });
    expect(result.smoothPoints).toEqual(points);
  });

  it("interpolates elevations along the path when waypoints carry elevation", () => {
    const elevated = [
      { x: 0, y: 0, elevation: 0 },
      { x: 200, y: 0, elevation: 20 }
    ];
    const result = buildRouteFromPoints(elevated, { ...DEFAULTS, sampleStepPx: 50 });
    expect(result.elevations).not.toBeNull();
    expect(result.elevations.length).toBe(result.path.length);
    expect(result.elevations[0]).toBe(0);
    expect(result.elevations[result.elevations.length - 1]).toBeCloseTo(20, 0);
  });

  it("returns null elevations when no waypoint has elevation data", () => {
    const result = buildRouteFromPoints(points, DEFAULTS);
    expect(result.elevations).toBeNull();
  });

  it("applies map scaling when scaleWithMap is true", () => {
    canvas.scene = {
      ...canvas.scene,
      width: 6000,
      height: 4000,
      dimensions: { sceneWidth: 6000, sceneHeight: 4000 }
    };
    canvas.app.renderer.screen = { width: 1920, height: 1080 };
    const result = buildRouteFromPoints(points, {
      ...DEFAULTS,
      scaleWithMap: true,
      scaleMapSize: { width: 6000, height: 4000 }
    });
    expect(result.settings.lineWidth).toBeGreaterThan(DEFAULTS.lineWidth);
  });
});

describe("createRouteRecord", () => {
  it("creates a route with id, timestamps, and empty encounters", () => {
    const route = createRouteRecord(
      [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      DEFAULTS,
      "Test Route"
    );
    expect(route.id).toBeTruthy();
    expect(route.name).toBe("Test Route");
    expect(route.encounters).toEqual([]);
    expect(route.createdAt).toBeLessThanOrEqual(Date.now());
    expect(route.points).toHaveLength(2);
  });

  it("preserves elevation on waypoints", () => {
    const route = createRouteRecord([{ x: 0, y: 0, elevation: 15 }], DEFAULTS);
    expect(route.points[0].elevation).toBe(15);
  });

  it("omits elevation when not finite", () => {
    const route = createRouteRecord([{ x: 0, y: 0, elevation: NaN }], DEFAULTS);
    expect(route.points[0]).not.toHaveProperty("elevation");
  });
});

describe("getSceneRoutes / setSceneRoutes", () => {
  const mockScene = {
    getFlag: vi.fn(() => [{ id: "r1", name: "Route 1" }]),
    setFlag: vi.fn(async () => {})
  };

  beforeEach(() => {
    mockScene.getFlag.mockClear();
    mockScene.setFlag.mockClear();
  });

  it("getSceneRoutes returns cloned routes from scene flag", () => {
    const routes = getSceneRoutes(mockScene);
    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe("r1");
    expect(mockScene.getFlag).toHaveBeenCalledWith("traveler", "routes");
  });

  it("getSceneRoutes returns empty array when scene is null", () => {
    expect(getSceneRoutes(null)).toEqual([]);
  });

  it("setSceneRoutes writes routes to scene flag", async () => {
    const routes = [{ id: "r2" }];
    await setSceneRoutes(routes, mockScene);
    expect(mockScene.setFlag).toHaveBeenCalledWith("traveler", "routes", routes);
  });

  it("setSceneRoutes is a no-op when scene is null", async () => {
    await setSceneRoutes([{ id: "x" }], null);
    expect(mockScene.setFlag).not.toHaveBeenCalled();
  });
});
