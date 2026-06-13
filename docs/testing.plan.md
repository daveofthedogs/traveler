---
name: Testing Infrastructure
overview: |
  Add Vitest unit tests for pure-logic modules, Quench integration tests that
  run inside a live Foundry instance, and a GitHub Actions CI pipeline that
  runs both automatically on every push/PR.  Integration tests create all
  required scenes, regions, and tokens programmatically — no manually-built
  world required.
todos:
  - id: t1
    content: Write docs/testing.plan.md
    status: done
  - id: t2
    content: Create package.json
    status: pending
  - id: t3
    content: Create vitest.config.js
    status: pending
  - id: t4
    content: Create tests/setup.js — Foundry global mocks
    status: pending
  - id: t5
    content: Create tests/unit/astar.test.js
    status: pending
  - id: t6
    content: Create tests/unit/proposals.test.js
    status: pending
  - id: t7
    content: Create tests/unit/change-level.test.js
    status: pending
  - id: t8
    content: Create tests/unit/settings.test.js
    status: pending
  - id: t9
    content: Create tests/quench/fixtures.js
    status: pending
  - id: t10
    content: Create tests/quench/pathfinding.quench.js
    status: pending
  - id: t11
    content: Create tests/quench/region-behavior.quench.js
    status: pending
  - id: t12
    content: Create tests/quench/player-route.quench.js
    status: pending
  - id: t13
    content: Create tests/quench/index.js
    status: pending
  - id: t14
    content: Create tests/world/world.json
    status: pending
  - id: t15
    content: Create docker-compose.test.yml
    status: pending
  - id: t16
    content: Create scripts/run-quench.js
    status: pending
  - id: t17
    content: Create scripts/foundry-wait.js
    status: pending
  - id: t18
    content: Create .github/workflows/ci.yml
    status: pending
  - id: t19
    content: Update CHANGELOG.md
    status: pending
isProject: true
---

# Testing Infrastructure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CI Pipeline (GitHub Actions / local)                           │
│                                                                 │
│  Job 1: unit-tests (no Docker, < 30 s)                         │
│    npm test  →  Vitest                                          │
│      tests/unit/astar.test.js                                   │
│      tests/unit/proposals.test.js                               │
│      tests/unit/change-level.test.js                            │
│      tests/unit/settings.test.js                                │
│                                                                 │
│  Job 2: integration-tests (Docker, ~5 min)                      │
│    docker-compose.test.yml                                      │
│      └─ felddy/foundryvtt:14  (port 30000)                      │
│           mounts: ./  →  /data/modules/traveler                 │
│           mounts: tests/world  →  /data/worlds/traveler-ci      │
│    npm run foundry:wait  →  polls /api/status until ready       │
│    npm run test:integration  →  Playwright headless             │
│      scripts/run-quench.js                                      │
│        logs in as GM, triggers quench.runAll()                  │
│        captures JSON results, exits 0/1                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Unit Testing: Vitest

### Why Vitest

- **Native ESM** — no Babel transform needed; imports work as-is
- **`vi.stubGlobal`** — cleanly replaces `canvas`, `game`, `CONST`, etc.
- **Inline coverage** via V8 (`npm run coverage` → HTML + JSON reports)
- **Watch mode** (`npm run test:watch`) for TDD loops
- **Same API as Jest** — if you've used Jest, you know Vitest

### What is unit-testable (pure logic)

| Module | Tests |
|---|---|
| `scripts/pathfinding/astar.js` | Path on open grid; wall blocking; node budget; partial path; same-cell edge case |
| `scripts/pathfinding/fog-checker.js` | `fogBoundaryAnchor` step logic |
| `scripts/proposals.js` | add / get / remove / getAll / clear / size |
| `scripts/behaviors/change-level.js` | `_checkPrerequisites` (status, item, no-req); `_resolveTargetElevation` |
| `scripts/settings.js` | `normalizeSettings`; `applyMapScaling`; `applyColorNumbers` |

### Global mock strategy (`tests/setup.js`)

All Foundry browser globals are stubbed with `vi.stubGlobal` so tests run in
Node.  The stubs provide just enough surface area for the tested units:

```js
vi.stubGlobal("canvas", {
  grid: {
    size: 100,
    getOffset: ({ x, y }) => ({ i: Math.floor(y / 100), j: Math.floor(x / 100) }),
    getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }),
    getNeighbors: (i, j) => [
      { i: i-1, j }, { i: i+1, j }, { i, j: j-1 }, { i, j: j+1 },
      { i: i-1, j: j-1 }, { i: i-1, j: j+1 }, { i: i+1, j: j-1 }, { i: i+1, j: j+1 }
    ]
  },
  walls: { checkCollision: () => false }   // overridden per-test where needed
});
```

---

## Integration Testing: Quench

### Quench overview (for reference)

[Quench](https://github.com/Ethaks/FVTT-Quench) is a Foundry VTT module that
embeds Mocha + Chai inside Foundry's runtime.  Test suites are registered via
`Hooks.once("quenchReady", (quench) => { quench.registerBatch(...) })`.

Install it alongside the traveler module in the Docker world.

### Fixture approach: programmatic scene creation

All scenes, regions, tokens, and walls are created in Quench `before()` hooks
and deleted in `after()` hooks.  No manually-built world is required.

```js
// tests/quench/fixtures.js
export async function buildTestScene() {
  const scene = await Scene.create({
    name: "Traveler CI",
    width: 1000, height: 1000,
    grid: { size: 100, type: CONST.GRID_TYPES.SQUARE }
  });
  await scene.update({ active: true });

  // A wall from (300,0) to (300,1000) — splits the scene vertically
  const wall = await WallDocument.create(
    { c: [300, 0, 300, 1000], move: 1 },
    { parent: scene }
  );

  // A region on the right side (x > 500) with traveler.changeLevel behavior
  const region = await RegionDocument.create({
    name: "Cliff Top",
    shapes: [{ type: "rectangle", x: 500, y: 0, width: 500, height: 1000 }],
    behaviors: [{
      type: "traveler.changeLevel",
      system: { mode: "cliff", targetElevation: 30, requiresCheck: true,
                checkFormula: "1d20", checkDC: 10, allowRetry: false }
    }]
  }, { parent: scene });

  const token = await TokenDocument.create(
    { name: "Hero", x: 50, y: 450, width: 1, height: 1 },
    { parent: scene }
  );

  return { scene, wall, region, token };
}
```

### Quench test suites

| File | Tests |
|---|---|
| `pathfinding.quench.js` | A* on real canvas; wall avoidance; fog boundary |
| `region-behavior.quench.js` | Prerequisite blocking; automatic pass; check dialog lifecycle |
| `player-route.quench.js` | Immediate mode plays route; approval mode queues to ProposalStore; approve/reject round-trip |

---

## Docker Setup

### `docker-compose.test.yml`

Uses the community `felddy/foundryvtt` image which handles license activation.

```yaml
services:
  foundry:
    image: felddy/foundryvtt:14
    environment:
      FOUNDRY_LICENSE_KEY: ${FOUNDRY_LICENSE_KEY}
      FOUNDRY_ADMIN_KEY:   ${FOUNDRY_ADMIN_KEY}
      FOUNDRY_USERNAME:    ${FOUNDRY_USERNAME}
      FOUNDRY_PASSWORD:    ${FOUNDRY_PASSWORD}
      CONTAINER_PRESERVE_CONFIG: "true"
    volumes:
      - .:/data/Data/modules/traveler          # mount live module code
      - ./tests/world:/data/Data/worlds/traveler-ci
    ports:
      - "30000:30000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:30000/api/status"]
      interval: 10s
      timeout: 5s
      retries: 18    # up to 3 min
      start_period: 90s
```

### What goes in `tests/world/`

A minimal world manifest — no scene data (Quench creates everything):

```
tests/world/
  world.json          ← world manifest (system, modules list)
```

---

## CI Environments

### GitHub Actions (recommended — you already have it)

Add `.github/workflows/ci.yml`.  Secrets to add in repo Settings → Secrets:

| Secret | Value |
|---|---|
| `FOUNDRY_LICENSE_KEY` | Your 32-char license key from foundryvtt.com |
| `FOUNDRY_ADMIN_KEY` | Any password (used for the Docker admin panel) |
| `FOUNDRY_USERNAME` | Your foundryvtt.com email |
| `FOUNDRY_PASSWORD` | Your foundryvtt.com password |

GitHub Actions ubuntu-latest runners include Docker and docker-compose.
GitHub Pro: 3,000 min/month for private repos — a 5-min integration run costs
5 credits, so ~600 runs/month before hitting limits.

### CircleCI equivalent

```yaml
# .circleci/config.yml
version: 2.1
jobs:
  test:
    machine:
      image: ubuntu-2204:current     # full VM — docker-compose works natively
    steps:
      - checkout
      - run: npm ci
      - run: npm test                 # Vitest
      - run:
          command: docker-compose -f docker-compose.test.yml up -d
          environment:
            FOUNDRY_LICENSE_KEY: $FOUNDRY_LICENSE_KEY
            FOUNDRY_ADMIN_KEY:   $FOUNDRY_ADMIN_KEY
            FOUNDRY_USERNAME:    $FOUNDRY_USERNAME
            FOUNDRY_PASSWORD:    $FOUNDRY_PASSWORD
      - run: npm run foundry:wait
      - run: npm run test:integration
      - run:
          command: docker-compose -f docker-compose.test.yml down
          when: always
```

Store the same four env vars in CircleCI → Project Settings → Environment Variables.

---

## npm scripts

```json
{
  "scripts": {
    "test":             "vitest run",
    "test:watch":       "vitest",
    "coverage":         "vitest run --coverage",
    "test:integration": "node scripts/run-quench.js",
    "foundry:wait":     "node scripts/foundry-wait.js"
  }
}
```
