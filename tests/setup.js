/**
 * Vitest global setup — stubs all Foundry VTT browser globals so unit tests
 * run in Node without a browser or live Foundry instance.
 *
 * Each stub is minimal: only the surface area consumed by the tested modules
 * is implemented.  Tests that need different behaviour can override via
 * vi.mocked() or vi.spyOn() after importing this setup.
 */

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// canvas — grid topology + wall collision
// ---------------------------------------------------------------------------

vi.stubGlobal("canvas", {
  grid: {
    size: 100,

    /** Pixel → grid offset  {i: row, j: col} */
    getOffset({ x, y }) {
      return { i: Math.floor(y / 100), j: Math.floor(x / 100) };
    },

    /** Grid offset → pixel centre */
    getCenterPoint({ i, j }) {
      return { x: j * 100 + 50, y: i * 100 + 50 };
    },

    /**
     * 8-directional square-grid neighbours.
     * Tests that need a hex grid or restricted connectivity can override
     * canvas.grid.getNeighbors in their describe/beforeEach block.
     */
    getNeighbors(i, j) {
      return [
        { i: i - 1, j: j - 1 }, { i: i - 1, j }, { i: i - 1, j: j + 1 },
        { i,       j: j - 1 },                    { i,       j: j + 1 },
        { i: i + 1, j: j - 1 }, { i: i + 1, j }, { i: i + 1, j: j + 1 }
      ];
    }
  },

  /** By default no walls block anything — override per test. */
  walls: {
    checkCollision: vi.fn(() => false)
  },

  visibility: {
    explored: null   // Phase 2 fog sampler; tests replace with a mock texture
  },

  scene: {
    id: "test-scene",
    regions: null,
    levels: new Map()
  },

  app: { renderer: { extract: null } },

  // canvas.stage.toGlobal — identity transform by default
  stage: { toGlobal: (pt) => ({ x: pt.x, y: pt.y }) }
});

// ---------------------------------------------------------------------------
// game
// ---------------------------------------------------------------------------

vi.stubGlobal("game", {
  user: {
    id: "test-user-gm",
    name: "Test GM",
    color: "#ff6400",
    isGM: true
  },

  settings: {
    get: vi.fn((module, key) => {
      if (key === "playerRouteMode") return "off";
      if (key === "routeSettings")   return {};
      return undefined;
    }),
    register: vi.fn(),
    registerMenu: vi.fn()
  },

  socket: {
    emit: vi.fn(),
    on:   vi.fn()
  },

  users: {
    get: vi.fn((id) => ({ id, name: "Test User", color: "#44dd44" }))
  }
});

// ---------------------------------------------------------------------------
// CONST
// ---------------------------------------------------------------------------

vi.stubGlobal("CONST", {
  REGION_EVENTS: {
    TOKEN_MOVE_IN:  "tokenMoveIn",
    TOKEN_MOVE_OUT: "tokenMoveOut",
    TOKEN_ENTER:    "tokenEnter",
    TOKEN_EXIT:     "tokenExit"
  },
  GRID_TYPES: {
    SQUARE:      1,
    HEXODDR:     2,
    HEXEVENR:    3,
    HEXODDQ:     4,
    HEXEVENQ:    5,
    GRIDLESS:    0
  },
  WALL_MOVEMENT_TYPES: { NONE: 0, NORMAL: 1 }
});

// ---------------------------------------------------------------------------
// foundry namespace
// ---------------------------------------------------------------------------

vi.stubGlobal("foundry", {
  utils: {
    randomID: () => `mock-id-${Math.random().toString(36).slice(2, 9)}`,
    deepClone: (x) => JSON.parse(JSON.stringify(x)),
    mergeObject: (target, source, opts = {}) => {
      const out = { ...target };
      for (const [k, v] of Object.entries(source ?? {})) {
        if (opts.inplace === false) out[k] = v;
        else out[k] = v;
      }
      return out;
    },
    getProperty: (obj, key) => {
      return key.split(".").reduce((o, k) => o?.[k], obj);
    }
  },

  data: {
    regionBehaviors: {
      // Minimal base class for TravelerChangeLevelBehavior to extend
      RegionBehaviorType: class RegionBehaviorType {
        constructor(data = {}) {
          Object.assign(this, data);
        }
        static defineSchema() { return {}; }
      }
    },
    fields: {
      StringField:  class { constructor(opts = {}) { this.opts = opts; } },
      NumberField:  class { constructor(opts = {}) { this.opts = opts; } },
      BooleanField: class { constructor(opts = {}) { this.opts = opts; } },
      ObjectField:  class { constructor(opts = {}) { this.opts = opts; } }
    }
  },

  applications: {
    api: {
      ApplicationV2: class ApplicationV2 {
        constructor(opts = {}) { this.options = opts; }
        async render() {}
        async close() {}
      },
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      DialogV2: {
        confirm: vi.fn(async () => true)
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

vi.stubGlobal("Hooks", {
  once: vi.fn(),
  on:   vi.fn(),
  off:  vi.fn(),
  call: vi.fn()
});

// ---------------------------------------------------------------------------
// ui
// ---------------------------------------------------------------------------

vi.stubGlobal("ui", {
  notifications: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn()
  }
});

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

vi.stubGlobal("ChatMessage", {
  getSpeaker: vi.fn(() => ({})),
  create:     vi.fn(async () => ({}))
});

// ---------------------------------------------------------------------------
// Roll
// ---------------------------------------------------------------------------

vi.stubGlobal("Roll", class Roll {
  constructor(formula, data = {}) {
    this.formula = formula;
    this.data    = data;
    this.total   = 10;   // default roll result — override in specific tests
  }
  async evaluate() { return this; }
  async toMessage() { return {}; }
});

// ---------------------------------------------------------------------------
// Dialog (legacy — used in reject-proposal path)
// ---------------------------------------------------------------------------

vi.stubGlobal("Dialog", class Dialog {
  constructor(config) { this._config = config; }
  render() {}
});

// ---------------------------------------------------------------------------
// PIXI (stub — renderer.js / tool.js are excluded from coverage anyway)
// ---------------------------------------------------------------------------

vi.stubGlobal("PIXI", {
  Container: class { addChild() {} destroy() {} },
  Graphics:  class {
    clear()       { return this; }
    lineStyle()   { return this; }
    moveTo()      { return this; }
    lineTo()      { return this; }
    beginFill()   { return this; }
    drawCircle()  { return this; }
    endFill()     { return this; }
  },
  RenderTexture: class {},
  Rectangle:     class { constructor(x, y, w, h) {} },
  Extract:       class { pixels() { return new Uint8Array([0, 0, 0, 255]); } }
});
