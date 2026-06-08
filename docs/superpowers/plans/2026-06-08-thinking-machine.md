# Thinking Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-canvas thinking tool where Claude Code decomposes nodes (as an LLM-judge) via a CLI + MCP server, and a React Flow web canvas renders/edits a shared `board.json` live.

**Architecture:** A single-writer `core` library (zod schema + atomic file writes) owns all mutations to `board.json`. A `cli` (`tm`) and an `mcp` server are thin wrappers over `core` so Claude Code can drive a board. A small Express sidecar serves the React Flow web canvas, exposes REST writes through `core`, and broadcasts external file changes via SSE for live reload. A `thinking-machine` skill teaches Claude Code the command surface and the decompose→confirm→commit method.

**Tech Stack:** TypeScript, pnpm workspaces, zod, commander, `@modelcontextprotocol/sdk`, Express + SSE + chokidar, Vite + React + `@xyflow/react`, vitest (integration tests against real temp files — no mocks).

---

## File Structure

```
thinking-machine/
  pnpm-workspace.yaml            workspace definition
  package.json                   root scripts
  tsconfig.base.json             shared TS config
  packages/
    core/
      src/schema.ts              zod schema + inferred types + migrate()
      src/paths.ts               resolve board path, temp/lock paths
      src/board.ts               loadBoard / saveBoard (atomic + lockfile)
      src/layout.ts              place new nodes (radial under parent)
      src/ops.ts                 addNode/updateNode/deleteNode/link/setFacet/promote/decompose
      src/index.ts               public exports
      test/board.test.ts         atomic + lock round-trip
      test/ops.test.ts           every operation
    cli/
      src/index.ts               commander program over core
      test/cli.test.ts           spawn the built CLI against a temp board
    mcp/
      src/index.ts               MCP server exposing core ops as tools
      test/mcp.test.ts           in-process client calls each tool
  apps/web/
    server/sidecar.ts            Express: REST (core) + SSE + chokidar watch
    server/sidecar.test.ts       REST write + external-edit SSE event
    index.html                   Vite entry
    src/main.tsx                 React root
    src/api.ts                   REST + SSE client to sidecar
    src/boardToFlow.ts           board.json -> React Flow nodes/edges
    src/ThinkNode.tsx            custom React Flow node (kind + facet dots)
    src/FacetDrawer.tsx          node facet editor
    src/QuickAdd.tsx             dump-first capture input
    src/App.tsx                  canvas + live reload wiring
    src/App.test.tsx             boardToFlow mapping unit test
  skill/thinking-machine/SKILL.md   the decompose method + command reference
```

Build order is strict: **core → cli → mcp → sidecar → web → skill**. Each phase ends green.

---

## Phase 0: Workspace setup

### Task 0: Initialize the monorepo

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`

- [ ] **Step 1: Init git and workspace files**

Run from project root:
```bash
git init
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Create root `package.json`:
```json
{
  "name": "thinking-machine",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  }
}
```

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 2: Create the core package skeleton**

Create `packages/core/package.json`:
```json
{
  "name": "@tm/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": { "zod": "^3.23.0" }
}
```

Create `packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: dependencies resolve, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: initialize pnpm workspace and core package"
```

---

## Phase 1: core library

### Task 1: Schema and types

**Files:**
- Create: `packages/core/src/schema.ts`
- Test: `packages/core/test/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/schema.test.ts
import { describe, it, expect } from "vitest";
import { BoardSchema, migrate, CURRENT_VERSION } from "../src/schema.js";

describe("schema", () => {
  it("parses a minimal valid board", () => {
    const board = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", rootType: "objective", x: 0, y: 0, facets: {} }],
      edges: [],
    };
    expect(() => BoardSchema.parse(board)).not.toThrow();
  });

  it("rejects an edge with an unknown type", () => {
    const bad = {
      version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
      nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {} }],
      edges: [{ from: "app", to: "x", type: "bogus" }],
    };
    expect(() => BoardSchema.parse(bad)).toThrow();
  });

  it("migrate() bumps a version-0 board to current", () => {
    const old = { id: "b1", title: "T", rootId: "app", nodes: [], edges: [] };
    const migrated = migrate(old as any);
    expect(migrated.version).toBe(CURRENT_VERSION);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test`
Expected: FAIL — cannot find module `../src/schema.js`.

- [ ] **Step 3: Write the schema**

```typescript
// packages/core/src/schema.ts
import { z } from "zod";

export const CURRENT_VERSION = 1;

export const NodeKind = z.enum(["root", "branch", "atom"]);
export const RootType = z.enum(["objective", "cause", "decision", "concept"]);
export const EdgeType = z.enum(["decomposition", "dependency"]);

export const NodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: NodeKind,
  rootType: RootType.optional(),
  x: z.number(),
  y: z.number(),
  // facet key -> list of thought items (strings in v1). Domain-specific keys allowed.
  facets: z.record(z.string(), z.array(z.string())),
});

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeType,
});

export const BoardSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  domainHint: z.string().optional(),
  rootId: z.string().min(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Board = z.infer<typeof BoardSchema>;

export const SEED_FACETS = [
  "definition", "essentials", "dependencies",
  "priorities", "considerations", "perspectives",
] as const;

/** Bring any older/unversioned board up to CURRENT_VERSION. One-way, additive. */
export function migrate(raw: any): Board {
  const b = { ...raw };
  if (b.version === undefined) b.version = CURRENT_VERSION;
  if (b.version > CURRENT_VERSION) {
    throw new Error(`Board version ${b.version} is newer than supported ${CURRENT_VERSION}`);
  }
  b.nodes = (b.nodes ?? []).map((n: any) => ({ facets: {}, x: 0, y: 0, ...n }));
  b.edges = b.edges ?? [];
  return BoardSchema.parse(b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema.ts packages/core/test/schema.test.ts
git commit -m "feat(core): board zod schema, types, and migrate()"
```

### Task 2: Atomic load/save with lockfile

**Files:**
- Create: `packages/core/src/paths.ts`, `packages/core/src/board.ts`
- Test: `packages/core/test/board.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/board.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBoard, saveBoard, newBoard } from "../src/board.js";

let dir: string, file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-")); file = join(dir, "board.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("board io", () => {
  it("round-trips a new board", () => {
    const b = newBoard("My Idea", "objective");
    saveBoard(file, b);
    const loaded = loadBoard(file);
    expect(loaded.title).toBe("My Idea");
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].kind).toBe("root");
  });

  it("save is atomic: no temp file left behind", () => {
    const b = newBoard("X", "cause");
    saveBoard(file, b);
    const { readdirSync } = require("node:fs");
    expect(readdirSync(dir).filter((f: string) => f.includes(".tmp"))).toHaveLength(0);
  });

  it("load migrates an unversioned file on disk", () => {
    writeFileSync(file, JSON.stringify({
      id: "b", title: "Legacy", rootId: "r",
      nodes: [{ id: "r", label: "R", kind: "root" }], edges: [],
    }));
    const loaded = loadBoard(file);
    expect(loaded.version).toBe(1);
    expect(loaded.nodes[0].facets).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test board`
Expected: FAIL — cannot find `../src/board.js`.

- [ ] **Step 3: Implement paths and atomic io**

```typescript
// packages/core/src/paths.ts
export const tmpPath = (file: string) => `${file}.${process.pid}.tmp`;
export const lockPath = (file: string) => `${file}.lock`;
```

```typescript
// packages/core/src/board.ts
import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { Board, migrate, CURRENT_VERSION, SEED_FACETS } from "./schema.js";
import { tmpPath, lockPath } from "./paths.js";

export function newBoard(title: string, rootType: "objective" | "cause" | "decision" | "concept"): Board {
  const facets = Object.fromEntries(SEED_FACETS.map((k) => [k, [] as string[]]));
  return {
    version: CURRENT_VERSION, id: "board", title, rootId: "root",
    nodes: [{ id: "root", label: title, kind: "root", rootType, x: 0, y: 0, facets }],
    edges: [],
  };
}

export function loadBoard(file: string): Board {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return migrate(raw);
}

/** Atomic write: write temp, then rename over the target. */
export function saveBoard(file: string, board: Board): void {
  const tmp = tmpPath(file);
  writeFileSync(tmp, JSON.stringify(board, null, 2));
  renameSync(tmp, file);
}

/** Acquire an exclusive lockfile, run fn, release. Retries with backoff. */
export function withLock<T>(file: string, fn: () => T, retries = 50): T {
  const lock = lockPath(file);
  let fd: number | undefined;
  for (let i = 0; i < retries; i++) {
    try { fd = openSync(lock, "wx"); break; }
    catch { const until = Date.now() + 20; while (Date.now() < until) { /* spin */ } }
  }
  if (fd === undefined) throw new Error(`Could not acquire lock on ${file}`);
  try { return fn(); }
  finally { closeSync(fd); if (existsSync(lock)) unlinkSync(lock); }
}

/** Read-modify-write a board under lock. The single write path for all mutations. */
export function mutate(file: string, fn: (board: Board) => Board): Board {
  return withLock(file, () => {
    const next = fn(loadBoard(file));
    saveBoard(file, next);
    return next;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test board`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/paths.ts packages/core/src/board.ts packages/core/test/board.test.ts
git commit -m "feat(core): atomic load/save with lockfile and mutate()"
```

### Task 3: Layout helper

**Files:**
- Create: `packages/core/src/layout.ts`
- Test: `packages/core/test/layout.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/layout.test.ts
import { describe, it, expect } from "vitest";
import { placeChildren } from "../src/layout.js";

describe("placeChildren", () => {
  it("fans children out to the right of the parent", () => {
    const parent = { x: 100, y: 100 };
    const pts = placeChildren(parent, 3);
    expect(pts).toHaveLength(3);
    expect(pts.every((p) => p.x > parent.x)).toBe(true);
    // middle child roughly level with parent, others above/below
    expect(pts[1].y).toBeCloseTo(parent.y, 0);
    expect(pts[0].y).toBeLessThan(pts[2].y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test layout`
Expected: FAIL — cannot find `../src/layout.js`.

- [ ] **Step 3: Implement layout**

```typescript
// packages/core/src/layout.ts
export interface Pt { x: number; y: number; }

const DX = 320;   // horizontal gap parent -> child
const DY = 150;   // vertical gap between siblings

/** Place `count` children to the right of `parent`, vertically centered. */
export function placeChildren(parent: Pt, count: number): Pt[] {
  const startY = parent.y - ((count - 1) * DY) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: parent.x + DX, y: startY + i * DY }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test layout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/layout.ts packages/core/test/layout.test.ts
git commit -m "feat(core): child node layout helper"
```

### Task 4: Board operations

**Files:**
- Create: `packages/core/src/ops.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/ops.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/ops.test.ts
import { describe, it, expect } from "vitest";
import { newBoard } from "../src/board.js";
import { addNode, linkNodes, setFacet, promoteFacetItem, decompose } from "../src/ops.js";

describe("ops", () => {
  it("addNode appends a node and a decomposition edge to its parent", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "Frontend", parentId: "root", kind: "branch" });
    expect(b.nodes).toHaveLength(2);
    const child = b.nodes.find((n) => n.label === "Frontend")!;
    expect(child.x).toBeGreaterThan(b.nodes[0].x);
    expect(b.edges).toContainEqual({ from: "root", to: child.id, type: "decomposition" });
  });

  it("linkNodes adds a dependency cross-link", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "FE", parentId: "root", kind: "branch" });
    b = addNode(b, { label: "API", parentId: "root", kind: "atom" });
    const fe = b.nodes.find((n) => n.label === "FE")!.id;
    const api = b.nodes.find((n) => n.label === "API")!.id;
    b = linkNodes(b, fe, api, "dependency");
    expect(b.edges).toContainEqual({ from: fe, to: api, type: "dependency" });
  });

  it("setFacet replaces a facet's items", () => {
    let b = newBoard("App", "objective");
    b = setFacet(b, "root", "essentials", ["one", "two"], "set");
    expect(b.nodes[0].facets.essentials).toEqual(["one", "two"]);
    b = setFacet(b, "root", "essentials", ["three"], "add");
    expect(b.nodes[0].facets.essentials).toEqual(["one", "two", "three"]);
  });

  it("promoteFacetItem turns a facet item into a child node", () => {
    let b = newBoard("App", "objective");
    b = setFacet(b, "root", "dependencies", ["Deployment"], "set");
    b = promoteFacetItem(b, "root", "dependencies", 0);
    expect(b.nodes.find((n) => n.label === "Deployment")).toBeTruthy();
    expect(b.nodes[0].facets.dependencies).toEqual([]); // removed from facet
  });

  it("decompose commits children + edges + facets in one shot", () => {
    let b = newBoard("App", "objective");
    b = decompose(b, "root", {
      decomposition: [
        { label: "FE", kind: "branch" },
        { label: "BE", kind: "branch" },
      ],
      edges: [{ fromLabel: "FE", toLabel: "BE", type: "dependency" }],
      facets: { considerations: ["scope creep"] },
    });
    expect(b.nodes).toHaveLength(3);
    expect(b.edges.filter((e) => e.type === "decomposition")).toHaveLength(2);
    expect(b.edges.filter((e) => e.type === "dependency")).toHaveLength(1);
    expect(b.nodes[0].facets.considerations).toContain("scope creep");
  });

  it("addNode throws on an unknown parent", () => {
    const b = newBoard("App", "objective");
    expect(() => addNode(b, { label: "x", parentId: "nope", kind: "atom" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test ops`
Expected: FAIL — cannot find `../src/ops.js`.

- [ ] **Step 3: Implement ops**

```typescript
// packages/core/src/ops.ts
import { Board, Node, EdgeType } from "./schema.js";
import { placeChildren } from "./layout.js";

let counter = 0;
/** Deterministic-enough id without Date.now/Math.random (unavailable in some runtimes). */
function genId(board: Board, label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "node";
  let id = base;
  while (board.nodes.some((n) => n.id === id)) id = `${base}-${++counter}`;
  return id;
}

function requireNode(board: Board, id: string): Node {
  const n = board.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No node with id "${id}"`);
  return n;
}

export interface AddNodeInput { label: string; parentId: string; kind: "branch" | "atom"; }

export function addNode(board: Board, input: AddNodeInput): Board {
  const parent = requireNode(board, input.parentId);
  const [pt] = placeChildren(parent, 1);
  const id = genId(board, input.label);
  const node: Node = { id, label: input.label, kind: input.kind, x: pt.x, y: pt.y, facets: {} };
  return {
    ...board,
    nodes: [...board.nodes, node],
    edges: [...board.edges, { from: parent.id, to: id, type: "decomposition" }],
  };
}

export function linkNodes(board: Board, from: string, to: string, type: EdgeType): Board {
  requireNode(board, from); requireNode(board, to);
  if (board.edges.some((e) => e.from === from && e.to === to && e.type === type)) return board;
  return { ...board, edges: [...board.edges, { from, to, type }] };
}

export function setFacet(board: Board, nodeId: string, facet: string, items: string[], mode: "set" | "add"): Board {
  const node = requireNode(board, nodeId);
  const current = node.facets[facet] ?? [];
  const next = mode === "set" ? items : [...current, ...items];
  const nodes = board.nodes.map((n) => (n.id === nodeId ? { ...n, facets: { ...n.facets, [facet]: next } } : n));
  return { ...board, nodes };
}

export function promoteFacetItem(board: Board, nodeId: string, facet: string, index: number): Board {
  const node = requireNode(board, nodeId);
  const items = node.facets[facet] ?? [];
  const label = items[index];
  if (label === undefined) throw new Error(`No item ${index} in facet "${facet}"`);
  const remaining = items.filter((_, i) => i !== index);
  const withRemoved = setFacet(board, nodeId, facet, remaining, "set");
  return addNode(withRemoved, { label, parentId: nodeId, kind: "branch" });
}

export interface DecomposeInput {
  decomposition: { label: string; kind: "branch" | "atom" }[];
  edges?: { fromLabel: string; toLabel: string; type: EdgeType }[];
  facets?: Record<string, string[]>;
}

/** Commit a full LLM proposal: children, cross-edges, and facet seeds in one shot. */
export function decompose(board: Board, nodeId: string, input: DecomposeInput): Board {
  const parent = requireNode(board, nodeId);
  const pts = placeChildren(parent, input.decomposition.length);
  const labelToId: Record<string, string> = {};
  let b = board;
  input.decomposition.forEach((child, i) => {
    const id = genId(b, child.label);
    labelToId[child.label] = id;
    b = {
      ...b,
      nodes: [...b.nodes, { id, label: child.label, kind: child.kind, x: pts[i].x, y: pts[i].y, facets: {} }],
      edges: [...b.edges, { from: parent.id, to: id, type: "decomposition" as const }],
    };
  });
  for (const e of input.edges ?? []) {
    const from = labelToId[e.fromLabel], to = labelToId[e.toLabel];
    if (!from || !to) throw new Error(`decompose edge references unknown child label`);
    b = linkNodes(b, from, to, e.type);
  }
  for (const [facet, items] of Object.entries(input.facets ?? {})) {
    b = setFacet(b, nodeId, facet, items, "add");
  }
  return b;
}
```

```typescript
// packages/core/src/index.ts
export * from "./schema.js";
export * from "./board.js";
export * from "./layout.js";
export * from "./ops.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test`
Expected: PASS (all core tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/src/index.ts packages/core/test/ops.test.ts
git commit -m "feat(core): node ops, promote, and one-shot decompose"
```

---

## Phase 2: CLI (`tm`)

### Task 5: CLI command surface

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Create the package**

`packages/cli/package.json`:
```json
{
  "name": "@tm/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "tm": "./dist/index.js" },
  "scripts": { "test": "vitest run", "build": "tsc -p tsconfig.json" },
  "dependencies": { "@tm/core": "workspace:*", "commander": "^12.0.0" }
}
```

`packages/cli/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

```typescript
// packages/cli/test/cli.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(__dirname, "../dist/index.js");
let dir: string, board: string;
const run = (args: string[]) =>
  execFileSync("node", [CLI, "--file", board, ...args], { encoding: "utf8" });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-cli-")); board = join(dir, "board.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tm cli", () => {
  it("init creates a board with one root", () => {
    run(["init", "My Plan", "--root-type", "objective"]);
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.title).toBe("My Plan");
    expect(b.nodes).toHaveLength(1);
  });

  it("add + show --json reflects the new node", () => {
    run(["init", "App", "--root-type", "objective"]);
    run(["add", "Frontend", "--parent", "root", "--kind", "branch"]);
    const out = JSON.parse(run(["show", "--json"]));
    expect(out.nodes.map((n: any) => n.label)).toContain("Frontend");
  });

  it("decompose commits a JSON proposal", () => {
    run(["init", "App", "--root-type", "objective"]);
    const proposal = JSON.stringify({
      decomposition: [{ label: "FE", kind: "branch" }, { label: "BE", kind: "branch" }],
      edges: [{ fromLabel: "FE", toLabel: "BE", type: "dependency" }],
      facets: { considerations: ["scope creep"] },
    });
    run(["decompose", "root", "--json", proposal]);
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.nodes).toHaveLength(3);
    expect(b.edges.some((e: any) => e.type === "dependency")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tm/cli build && pnpm --filter @tm/cli test`
Expected: FAIL — `dist/index.js` missing or commands undefined.

- [ ] **Step 4: Implement the CLI**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import {
  newBoard, loadBoard, saveBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose,
} from "@tm/core";

const program = new Command();
program.name("tm").description("Thinking Machine board CLI").option("-f, --file <path>", "board file", "board.json");

const file = () => program.opts().file as string;
const out = (obj: unknown) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");

program.command("init <title>")
  .option("--root-type <type>", "objective|cause|decision|concept", "objective")
  .action((title, opts) => {
    if (existsSync(file())) throw new Error(`${file()} already exists`);
    saveBoard(file(), newBoard(title, opts.rootType));
  });

program.command("show")
  .option("--node <id>", "show a single node")
  .option("--json", "machine-readable output")
  .action((opts) => {
    const b = loadBoard(file());
    if (opts.node) { const n = b.nodes.find((x) => x.id === opts.node); if (!n) throw new Error("no such node"); return out(n); }
    if (opts.json) return out(b);
    process.stdout.write(`${b.title} (${b.nodes.length} nodes, ${b.edges.length} edges)\n`);
    for (const n of b.nodes) process.stdout.write(`  ${n.id} [${n.kind}] ${n.label}\n`);
  });

program.command("add <label>")
  .requiredOption("--parent <id>", "parent node id")
  .option("--kind <kind>", "branch|atom", "branch")
  .action((label, opts) => { mutate(file(), (b) => addNode(b, { label, parentId: opts.parent, kind: opts.kind })); });

program.command("link <from> <to>")
  .option("--type <type>", "decomposition|dependency", "dependency")
  .action((from, to, opts) => { mutate(file(), (b) => linkNodes(b, from, to, opts.type)); });

program.command("facet <id> <facet> <mode> [items...]")
  .description("mode = set|add")
  .action((id, facet, mode, items) => { mutate(file(), (b) => setFacet(b, id, facet, items, mode)); });

program.command("promote <id> <facet> <index>")
  .action((id, facet, index) => { mutate(file(), (b) => promoteFacetItem(b, id, facet, Number(index))); });

program.command("decompose <id>")
  .requiredOption("--json <proposal>", "JSON {decomposition, edges?, facets?}")
  .action((id, opts) => { mutate(file(), (b) => decompose(b, id, JSON.parse(opts.json))); });

try { program.parse(); }
catch (err) { process.stderr.write(`Error: ${(err as Error).message}\n`); process.exit(1); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tm/cli build && pnpm --filter @tm/cli test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): tm command surface over core (init/show/add/link/facet/promote/decompose)"
```

---

## Phase 3: MCP server

### Task 6: MCP tools over core

**Files:**
- Create: `packages/mcp/package.json`, `packages/mcp/tsconfig.json`, `packages/mcp/src/index.ts`
- Test: `packages/mcp/test/mcp.test.ts`

- [ ] **Step 1: Create the package**

`packages/mcp/package.json`:
```json
{
  "name": "@tm/mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "tm-mcp": "./dist/index.js" },
  "scripts": { "test": "vitest run", "build": "tsc -p tsconfig.json" },
  "dependencies": { "@tm/core": "workspace:*", "@modelcontextprotocol/sdk": "^1.0.0", "zod": "^3.23.0" }
}
```

`packages/mcp/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

```typescript
// packages/mcp/test/mcp.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/index.js";

let dir: string, board: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tm-mcp-")); board = join(dir, "board.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = buildServer(board);
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("mcp tools", () => {
  it("tm_init then tm_add creates nodes", async () => {
    const c = await connect();
    await c.callTool({ name: "tm_init", arguments: { title: "App", rootType: "objective" } });
    await c.callTool({ name: "tm_add_node", arguments: { label: "FE", parentId: "root", kind: "branch" } });
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.nodes.map((n: any) => n.label)).toContain("FE");
  });

  it("tm_decompose commits a proposal", async () => {
    const c = await connect();
    await c.callTool({ name: "tm_init", arguments: { title: "App", rootType: "objective" } });
    await c.callTool({ name: "tm_decompose", arguments: {
      nodeId: "root",
      decomposition: [{ label: "FE", kind: "branch" }, { label: "BE", kind: "branch" }],
    }});
    const b = JSON.parse(readFileSync(board, "utf8"));
    expect(b.nodes).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tm/mcp test`
Expected: FAIL — cannot find `../src/index.js`.

- [ ] **Step 4: Implement the server**

```typescript
// packages/mcp/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import {
  newBoard, loadBoard, saveBoard, mutate,
  addNode, linkNodes, setFacet, promoteFacetItem, decompose,
} from "@tm/core";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

export function buildServer(file: string): McpServer {
  const server = new McpServer({ name: "thinking-machine", version: "0.1.0" });

  server.tool("tm_init", "Create a new board",
    { title: z.string(), rootType: z.enum(["objective", "cause", "decision", "concept"]) },
    async ({ title, rootType }) => {
      if (existsSync(file)) throw new Error(`${file} already exists`);
      saveBoard(file, newBoard(title, rootType));
      return ok({ created: true });
    });

  server.tool("tm_show", "Read the whole board or one node",
    { nodeId: z.string().optional() },
    async ({ nodeId }) => {
      const b = loadBoard(file);
      return ok(nodeId ? b.nodes.find((n) => n.id === nodeId) : b);
    });

  server.tool("tm_add_node", "Add a child node under a parent",
    { label: z.string(), parentId: z.string(), kind: z.enum(["branch", "atom"]) },
    async (a) => ok(mutate(file, (b) => addNode(b, a))));

  server.tool("tm_link", "Add an edge between two nodes",
    { from: z.string(), to: z.string(), type: z.enum(["decomposition", "dependency"]) },
    async ({ from, to, type }) => ok(mutate(file, (b) => linkNodes(b, from, to, type))));

  server.tool("tm_set_facet", "Set or add items to a node facet",
    { nodeId: z.string(), facet: z.string(), items: z.array(z.string()), mode: z.enum(["set", "add"]) },
    async ({ nodeId, facet, items, mode }) => ok(mutate(file, (b) => setFacet(b, nodeId, facet, items, mode))));

  server.tool("tm_promote", "Promote a facet item into its own node",
    { nodeId: z.string(), facet: z.string(), index: z.number() },
    async ({ nodeId, facet, index }) => ok(mutate(file, (b) => promoteFacetItem(b, nodeId, facet, index))));

  server.tool("tm_decompose", "Commit a full decomposition proposal in one shot",
    {
      nodeId: z.string(),
      decomposition: z.array(z.object({ label: z.string(), kind: z.enum(["branch", "atom"]) })),
      edges: z.array(z.object({ fromLabel: z.string(), toLabel: z.string(), type: z.enum(["decomposition", "dependency"]) })).optional(),
      facets: z.record(z.string(), z.array(z.string())).optional(),
    },
    async ({ nodeId, decomposition, edges, facets }) =>
      ok(mutate(file, (b) => decompose(b, nodeId, { decomposition, edges, facets }))));

  return server;
}

// stdio entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.env.TM_BOARD ?? "board.json";
  const server = buildServer(file);
  server.connect(new StdioServerTransport());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tm/mcp test`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp
git commit -m "feat(mcp): MCP server exposing core ops as tools"
```

---

## Phase 4: Web sidecar

### Task 7: Express sidecar with REST + SSE

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/server/sidecar.ts`
- Test: `apps/web/server/sidecar.test.ts`

- [ ] **Step 1: Create the package**

`apps/web/package.json`:
```json
{
  "name": "@tm/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --import tsx server/sidecar.ts & vite",
    "test": "vitest run",
    "build": "vite build"
  },
  "dependencies": {
    "@tm/core": "workspace:*",
    "express": "^4.19.0",
    "chokidar": "^3.6.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@xyflow/react": "^12.0.0"
  },
  "devDependencies": {
    "vite": "^5.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tsx": "^4.16.0",
    "@types/express": "^4.17.0"
  }
}
```

`apps/web/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM"] }, "include": ["src", "server"] }
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/server/sidecar.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBoard, saveBoard } from "@tm/core";
import { createSidecar } from "./sidecar.js";

let dir: string, board: string, server: ReturnType<typeof createSidecar>, base: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "tm-side-"));
  board = join(dir, "board.json");
  saveBoard(board, newBoard("App", "objective"));
  server = createSidecar(board);
  const addr = await server.listen(0);
  base = `http://127.0.0.1:${addr.port}`;
});
afterEach(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });

describe("sidecar", () => {
  it("GET /api/board returns the board", async () => {
    const res = await fetch(`${base}/api/board`);
    const b = await res.json();
    expect(b.title).toBe("App");
  });

  it("POST /api/add adds a node through core", async () => {
    await fetch(`${base}/api/add`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "FE", parentId: "root", kind: "branch" }),
    });
    const b = await (await fetch(`${base}/api/board`)).json();
    expect(b.nodes.map((n: any) => n.label)).toContain("FE");
  });

  it("emits an SSE 'board' event when the file changes externally", async () => {
    const events: string[] = [];
    const es = await fetch(`${base}/api/events`);
    const reader = es.body!.getReader();
    const read = (async () => {
      const { value } = await reader.read();
      events.push(new TextDecoder().decode(value));
    })();
    // external edit (simulating CLI/MCP writing the file)
    const b = newBoard("Changed", "cause");
    writeFileSync(board, JSON.stringify(b, null, 2));
    await new Promise((r) => setTimeout(r, 300));
    await read.catch(() => {});
    reader.cancel();
    expect(events.join("")).toContain("event: board");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tm/web test`
Expected: FAIL — cannot find `./sidecar.js`.

- [ ] **Step 4: Implement the sidecar**

```typescript
// apps/web/server/sidecar.ts
import express from "express";
import chokidar from "chokidar";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { loadBoard, mutate, addNode, linkNodes, setFacet, updateNodePosition } from "@tm/core";

export function createSidecar(file: string) {
  const app = express();
  app.use(express.json());
  const clients = new Set<express.Response>();

  app.get("/api/board", (_req, res) => res.json(loadBoard(file)));

  app.post("/api/add", (req, res) => {
    const b = mutate(file, (board) => addNode(board, req.body));
    res.json(b);
  });
  app.post("/api/link", (req, res) => {
    const { from, to, type } = req.body;
    res.json(mutate(file, (board) => linkNodes(board, from, to, type)));
  });
  app.post("/api/facet", (req, res) => {
    const { nodeId, facet, items, mode } = req.body;
    res.json(mutate(file, (board) => setFacet(board, nodeId, facet, items, mode)));
  });
  app.post("/api/move", (req, res) => {
    const { nodeId, x, y } = req.body;
    res.json(mutate(file, (board) => updateNodePosition(board, nodeId, x, y)));
  });

  app.get("/api/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  // Broadcast on external file changes (CLI/MCP writes). Ignore our own atomic temp files.
  const watcher = chokidar.watch(file, { ignoreInitial: true });
  const broadcast = () => {
    for (const c of clients) c.write(`event: board\ndata: {}\n\n`);
  };
  watcher.on("change", broadcast);

  let server: Server | undefined;
  return {
    app,
    listen: (port: number) =>
      new Promise<AddressInfo>((resolve) => { server = app.listen(port, () => resolve(server!.address() as AddressInfo)); }),
    close: async () => { await watcher.close(); await new Promise<void>((r) => server?.close(() => r())); },
  };
}
```

- [ ] **Step 5: Add `updateNodePosition` to core**

Add to `packages/core/src/ops.ts`:
```typescript
export function updateNodePosition(board: Board, nodeId: string, x: number, y: number): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) };
}
```
Re-export is already covered by `export * from "./ops.js"`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @tm/web test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/server packages/core/src/ops.ts
git commit -m "feat(web): express sidecar with REST writes and SSE file-watch; core node move"
```

---

## Phase 5: React Flow canvas

### Task 8: board.json → React Flow mapping

**Files:**
- Create: `apps/web/src/boardToFlow.ts`
- Test: `apps/web/src/boardToFlow.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/boardToFlow.test.ts
import { describe, it, expect } from "vitest";
import { boardToFlow } from "./boardToFlow.js";
import { newBoard, addNode, linkNodes } from "@tm/core";

describe("boardToFlow", () => {
  it("maps nodes and typed edges", () => {
    let b = newBoard("App", "objective");
    b = addNode(b, { label: "FE", parentId: "root", kind: "branch" });
    const fe = b.nodes.find((n) => n.label === "FE")!.id;
    b = addNode(b, { label: "API", parentId: "root", kind: "atom" });
    const api = b.nodes.find((n) => n.label === "API")!.id;
    b = linkNodes(b, fe, api, "dependency");

    const { nodes, edges } = boardToFlow(b);
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toMatchObject({ id: "root", type: "think", position: { x: 0, y: 0 } });
    const dep = edges.find((e) => e.source === fe && e.target === api)!;
    expect(dep.data.type).toBe("dependency");
    expect(dep.animated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/web test boardToFlow`
Expected: FAIL — cannot find `./boardToFlow.js`.

- [ ] **Step 3: Implement the mapping**

```typescript
// apps/web/src/boardToFlow.ts
import type { Board, Node as BNode } from "@tm/core";
import { SEED_FACETS } from "@tm/core";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";

export interface ThinkNodeData {
  label: string;
  kind: BNode["kind"];
  rootType?: string;
  sub: string;
  filledFacets: boolean[];   // one per seed facet, for the preview dots
}

export function boardToFlow(board: Board): { nodes: FlowNode<ThinkNodeData>[]; edges: FlowEdge[] } {
  const nodes = board.nodes.map((n) => ({
    id: n.id,
    type: "think",
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      kind: n.kind,
      rootType: n.rootType,
      sub: n.kind === "root" ? (n.rootType ?? "root") : n.kind,
      filledFacets: SEED_FACETS.map((f) => (n.facets[f]?.length ?? 0) > 0),
    },
  }));

  const edges = board.edges.map((e, i) => ({
    id: `e${i}`,
    source: e.from,
    target: e.to,
    animated: e.type === "dependency",
    style: e.type === "dependency"
      ? { stroke: "#f0a868", strokeDasharray: "5 5" }
      : { stroke: "#5ce0c6" },
    data: { type: e.type },
  }));

  return { nodes, edges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/web test boardToFlow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/boardToFlow.ts apps/web/src/boardToFlow.test.ts
git commit -m "feat(web): map board.json to React Flow nodes/edges"
```

### Task 9: Custom node, drawer, quick-add, and live canvas

**Files:**
- Create: `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`,
  `apps/web/src/api.ts`, `apps/web/src/ThinkNode.tsx`, `apps/web/src/FacetDrawer.tsx`,
  `apps/web/src/QuickAdd.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`

This task is UI wiring (no unit test — verified by the manual smoke test in Task 10). Build each file, then run the smoke test.

- [ ] **Step 1: Vite entry + config**

`apps/web/index.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8" /><title>Thinking Machine</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```

`apps/web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
```

Set the sidecar port: in `server/sidecar.ts` entrypoint (append at bottom):
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.env.TM_BOARD ?? "board.json";
  createSidecar(file).listen(8787).then(() => console.log("sidecar on :8787"));
}
```

- [ ] **Step 2: API client**

`apps/web/src/api.ts`:
```typescript
import type { Board } from "@tm/core";

export const getBoard = (): Promise<Board> => fetch("/api/board").then((r) => r.json());

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export const addNode = (label: string, parentId: string, kind: "branch" | "atom") => post("/api/add", { label, parentId, kind });
export const moveNode = (nodeId: string, x: number, y: number) => post("/api/move", { nodeId, x, y });
export const setFacet = (nodeId: string, facet: string, items: string[], mode: "set" | "add") =>
  post("/api/facet", { nodeId, facet, items, mode });

/** Subscribe to external board changes (CLI/MCP edits). */
export function onBoardChange(cb: () => void): () => void {
  const es = new EventSource("/api/events");
  es.addEventListener("board", cb);
  return () => es.close();
}
```

- [ ] **Step 3: Custom React Flow node**

`apps/web/src/ThinkNode.tsx`:
```typescript
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ThinkNodeData } from "./boardToFlow.js";

const KIND_BORDER: Record<string, string> = { root: "#c78bff", branch: "#323a47", atom: "#323a47" };

export function ThinkNode({ data, selected }: NodeProps & { data: ThinkNodeData }) {
  return (
    <div className={`think ${data.kind} ${selected ? "sel" : ""}`} style={{ borderColor: KIND_BORDER[data.kind] }}>
      <Handle type="target" position={Position.Left} />
      <div className="t-label">{data.label}</div>
      <div className="t-sub">{data.sub}</div>
      <div className="t-dots">
        {data.filledFacets.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

- [ ] **Step 4: Facet drawer**

`apps/web/src/FacetDrawer.tsx`:
```typescript
import { useState, useEffect } from "react";
import type { Node as BNode } from "@tm/core";
import { SEED_FACETS } from "@tm/core";
import { setFacet } from "./api.js";

export function FacetDrawer({ node, onClose, onSaved }: { node: BNode | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!node) return;
    setDraft(Object.fromEntries(SEED_FACETS.map((f) => [f, (node.facets[f] ?? []).join("\n")])));
  }, [node]);
  if (!node) return null;

  const save = async (facet: string) => {
    const items = draft[facet].split("\n").map((s) => s.trim()).filter(Boolean);
    await setFacet(node.id, facet, items, "set");
    onSaved();
  };

  return (
    <div className="drawer open">
      <button className="drawer-close" onClick={onClose}>×</button>
      <h2>{node.label}</h2>
      <div className="dsub">{node.kind === "root" ? node.rootType : node.kind}</div>
      {SEED_FACETS.map((f) => (
        <div className="facet" key={f}>
          <label>{f}</label>
          <textarea
            value={draft[f] ?? ""}
            placeholder="One thought per line…"
            onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
            onBlur={() => save(f)}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Quick-add (dump-first capture)**

`apps/web/src/QuickAdd.tsx`:
```typescript
import { useState } from "react";
import { addNode } from "./api.js";

export function QuickAdd({ rootId, onAdded }: { rootId: string; onAdded: () => void }) {
  const [text, setText] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = text.trim();
    if (!label) return;
    await addNode(label, rootId, "atom"); // dump as a loose atom under root; reorganize later
    setText("");
    onAdded();
  };
  return (
    <form className="quickadd" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dump a thought…  (Enter)" />
    </form>
  );
}
```

- [ ] **Step 6: App (canvas + live reload)**

`apps/web/src/App.tsx`:
```typescript
import { useCallback, useEffect, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges, type Node as FlowNode, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import type { Board } from "@tm/core";
import { boardToFlow } from "./boardToFlow.js";
import { ThinkNode } from "./ThinkNode.js";
import { FacetDrawer } from "./FacetDrawer.js";
import { QuickAdd } from "./QuickAdd.js";
import { getBoard, moveNode, onBoardChange } from "./api.js";

const nodeTypes = { think: ThinkNode };

export default function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const b = await getBoard();
    setBoard(b);
    setFlowNodes(boardToFlow(b).nodes);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onBoardChange(refresh), [refresh]);   // live reload on CLI/MCP edits

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((ns) => applyNodeChanges(changes, ns));
    for (const c of changes) {
      if (c.type === "position" && c.dragging === false && c.position) {
        moveNode(c.id, c.position.x, c.position.y);
      }
    }
  }, []);

  if (!board) return <div className="loading">Loading board…</div>;
  const edges = boardToFlow(board).edges;
  const selectedNode = board.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="app">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => setSelected(n.id)}
        fitView
      >
        <Background color="#262c36" gap={24} />
        <Controls />
      </ReactFlow>
      <QuickAdd rootId={board.rootId} onAdded={refresh} />
      <FacetDrawer node={selectedNode} onClose={() => setSelected(null)} onSaved={refresh} />
    </div>
  );
}
```

`apps/web/src/main.tsx`:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 7: Styles (dark, restrained — anti-slop)**

`apps/web/src/styles.css`:
```css
:root { --bg:#0d0f12; --panel:#171b22; --line:#262c36; --line2:#323a47; --ink:#e6e9ef; --dim:#9aa3b2; --accent:#7c9cff; --accent2:#5ce0c6; --root:#c78bff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, system-ui, sans-serif; }
.app, .react-flow { width: 100vw; height: 100vh; }
.loading { display: grid; place-items: center; height: 100vh; color: var(--dim); }
.think { background: var(--panel); border: 1px solid var(--line2); border-radius: 8px; padding: 9px 12px; min-width: 120px; }
.think.root { background: #1c1526; }
.think.atom { border-style: dashed; }
.think.sel { box-shadow: 0 0 0 3px rgba(92,224,198,.15); }
.t-label { font-size: 13px; font-weight: 600; }
.t-sub { font-size: 10px; color: #5c6573; margin-top: 2px; }
.t-dots { display: flex; gap: 3px; margin-top: 6px; }
.t-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--line2); }
.t-dots i.on { background: var(--accent); }
.quickadd { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 20; }
.quickadd input { width: 360px; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--line2); background: var(--panel); color: var(--ink); font-size: 13px; }
.drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 360px; background: #13161b; border-left: 1px solid var(--line); padding: 20px; overflow: auto; z-index: 30; }
.drawer-close { position: absolute; top: 12px; right: 14px; background: none; border: none; color: var(--dim); font-size: 20px; cursor: pointer; }
.drawer h2 { font-size: 18px; margin: 4px 0 2px; }
.dsub { color: #5c6573; font-size: 11px; margin-bottom: 14px; }
.facet { margin-bottom: 14px; }
.facet label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim); margin-bottom: 5px; }
.facet textarea { width: 100%; min-height: 56px; resize: vertical; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); font: inherit; font-size: 12.5px; padding: 8px; }
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/index.html apps/web/vite.config.ts apps/web/src
git commit -m "feat(web): React Flow canvas, custom node, facet drawer, quick-add, live reload"
```

### Task 10: Manual smoke test of the full loop

**Files:** none (verification only).

- [ ] **Step 1: Seed a board with the CLI**

```bash
cd apps/web
node ../../packages/cli/dist/index.js --file board.json init "Ship an MVP Web App" --root-type objective
```

- [ ] **Step 2: Start the app**

Run: `pnpm --filter @tm/web dev`
Open: `http://localhost:5173`
Expected: a single purple root node "Ship an MVP Web App" appears, fit to view.

- [ ] **Step 3: Verify live reload from the CLI (the core promise)**

In a second terminal:
```bash
cd apps/web
node ../../packages/cli/dist/index.js --file board.json decompose root --json \
  '{"decomposition":[{"label":"Frontend","kind":"branch"},{"label":"Backend","kind":"branch"},{"label":"Database","kind":"atom"}],"facets":{"considerations":["scope creep is the #1 killer"]}}'
```
Expected: **without refreshing**, three children fan out from the root, connected by teal decomposition edges.

- [ ] **Step 4: Verify manual edits**
- Click the root → drawer opens → type lines under "Considerations" → blur → reload page → text persists.
- Drag a node → reload page → position persists.
- Type a thought in Quick-Add → Enter → a dashed atom node appears under root.

- [ ] **Step 5: Commit any fixes, then tag the milestone**

```bash
git add -A
git commit -m "test: full-loop smoke test passes (CLI edit -> live canvas)"
git tag v0.1.0-canvas
```

---

## Phase 6: The skill

### Task 11: `thinking-machine` skill

**Files:**
- Create: `skill/thinking-machine/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: thinking-machine
description: Use when the user wants to build, expand, or decompose a Thinking Machine board — mapping research, decisions, or system designs as a graph of nodes. Drives the `tm` CLI / MCP to read and edit board.json, decomposing nodes as a domain-aware LLM-judge with the user confirming before commit.
---

# Thinking Machine

You are the decomposition engine for a visual thinking canvas. A board is a `board.json`
file: a graph of **nodes** the user expands by **decomposition** (breaking into parts →
child nodes, building a DAG) and analyzes through **facets** (lenses applied to a node
without spawning new nodes).

## The two axes

- **Decompose**: break a node into the parts worth thinking about further → child nodes.
- **Facets** (seed set — swap to fit the domain): `definition, essentials, dependencies,
  priorities, considerations, perspectives`. For a *decision* node, prefer lenses like
  `options, criteria, risks, reversibility`. For *operations*: `inputs, steps, owners,
  failure-modes, metrics`. Pick lenses that fit the node's domain — the seed is a default,
  not a cage.

**Child vs facet item:** something is a facet item until it earns its own sub-tree, then
**promote** it to a node. Use **dependency** edges (not decomposition) for shared
cross-links (e.g. Frontend and Backend both depend on an API Contract → a DAG, not a tree).

**Stopping rule:** mark a node `atom` when decomposing it further adds no insight.

## The discipline: propose → confirm → commit

NEVER write a large decomposition silently. Always:
1. Read the node: `tm show --node <id> --json`.
2. Propose `{ decomposition, edges?, facets? }` to the user as plain text + the rationale.
3. Ask which children/facets to keep (all / some / edit).
4. Commit the confirmed set in ONE call: `tm decompose <id> --json '<proposal>'`.

A proposal should usually be 3–6 children — not 30. Breadth comes from iterating, not
from one explosion.

## CLI reference (each command edits board.json atomically)

| Command | Purpose |
|---|---|
| `tm --file <path> init "<title>" --root-type objective\|cause\|decision\|concept` | new board |
| `tm show [--node <id>] [--json]` | read board / node |
| `tm add "<label>" --parent <id> --kind branch\|atom` | one child |
| `tm link <from> <to> --type decomposition\|dependency` | edge |
| `tm facet <id> <facet> set\|add <items...>` | edit a lens |
| `tm promote <id> <facet> <index>` | facet item → node |
| `tm decompose <id> --json '{"decomposition":[{"label":"FE","kind":"branch"}],"edges":[{"fromLabel":"FE","toLabel":"BE","type":"dependency"}],"facets":{"considerations":["scope creep"]}}'` | full proposal in one shot |

## MCP equivalents

If the MCP server is connected, the same operations are tools: `tm_init`, `tm_show`,
`tm_add_node`, `tm_link`, `tm_set_facet`, `tm_promote`, `tm_decompose`. Prefer these
in-session; fall back to the CLI otherwise.

## Domain-aware decomposition method

Given a node + its ancestor path + the board's `domainHint` + sibling labels:
1. Infer the domain (software, business, decision, operations, research, …).
2. Choose 3–6 child parts that are MECE-ish and worth deeper thought.
3. Choose the 4–6 facet lenses that fit the domain; seed 1–3 items each where you have
   genuine signal — leave the rest empty for the user.
4. Add dependency edges only for real shared dependencies.
5. Present, confirm, then `tm decompose`.

The web canvas live-updates as you commit — the user watches their thinking take shape.
```

- [ ] **Step 2: Verify the skill end-to-end (manual)**

With the canvas running (Task 10) and the skill installed:
- Tell Claude Code: *"Decompose the Backend node for operational risk."*
- Expected: the agent runs `tm show --node <backend-id> --json`, proposes 3–6 children +
  domain-fit facets as text, asks for confirmation, then on approval runs `tm decompose`,
  and the canvas updates live.

- [ ] **Step 3: Commit**

```bash
git add skill/thinking-machine/SKILL.md
git commit -m "feat(skill): thinking-machine decomposition method and command reference"
```

---

## Self-Review

**Spec coverage:**
- §2 two axes (decompose + facets) → Tasks 4 (decompose/setFacet), 8 (mapping), 11 (method). ✓
- §3 single-writer core → Task 2 (`mutate` + lock), used by CLI/MCP/sidecar. ✓
- §4.1 core ops incl. promote/layout → Tasks 3, 4. ✓
- §4.2 CLI incl. first-class `tm decompose` → Task 5. ✓
- §4.3 MCP tools → Task 6. ✓
- §4.4 skill → Task 11. ✓
- §4.5 web: React Flow, dump-first + AI-assist, facet drawer, live reload, sidecar → Tasks 7–10. ✓
- §5 data model (version, kinds, edge types, domainHint) → Task 1 schema. ✓
- §7 empty/error/lock/schema states → Task 1 (migrate version guard), Task 2 (lock retry/throw), Task 9 (empty facet placeholder, loading state), Task 5 (CLI error exit). ✓
- §8 testing (real temp files, full-loop) → Tasks 2,4,5,6,7,8 unit; Task 10 full loop. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. ✓

**Type consistency:** `mutate`, `addNode({label,parentId,kind})`, `decompose(board,id,{decomposition,edges,facets})`, `setFacet(...,mode)`, `updateNodePosition`, `boardToFlow`, `SEED_FACETS`, `ThinkNodeData` are defined once and used consistently across CLI, MCP, sidecar, and web. ✓

**Gap fixed during review:** `updateNodePosition` (needed by the sidecar `/api/move` and web drag-persist) was not in the original core ops list — added in Task 7 Step 5.
