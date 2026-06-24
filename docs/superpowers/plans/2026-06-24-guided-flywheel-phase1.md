# Guided Flywheel — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the DRAFT-only guided experience on the existing engine — fog-entry (LOCATE), widen/deepen, duplicate-resolution, a Guide-mode toggle, and a provenance field that renders — so the cognitive-offload flywheel can be used end-to-end as a probe.

**Architecture:** Additive only. Three new tiny core primitives (`detectCollisions` query, `setNodeProvenance`, `setGuideMode`) plus two optional schema fields (`Node.provenance`, `Board.guideMode`). LOCATE / widen / deepen / duplicate-resolution are **skill behaviors** that orchestrate existing ops (`decompose`, `grow`, `link`, `facet`) + the new collision query — no new verbs. The web canvas renders a provenance badge mirroring the existing status pill.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), zod, vitest, pnpm workspaces, commander (CLI), React Flow (web). Spec: `docs/superpowers/specs/2026-06-24-guided-flywheel-design.md`.

## Global Constraints

- Core ops are **pure** `(board, ...args) => Board`, immutable (spread, never mutate). Follow `packages/core/src/ops.ts`.
- **No `Date.now()` / `Math.random()` / argless `new Date()`** anywhere in core (breaks replay). Ids via the existing `genId` pattern.
- Schema changes are **additive and optional**, back-compat through `migrate()` in `packages/core/src/schema.ts`. `CURRENT_VERSION` stays `1`.
- Tests are vitest, in `packages/<pkg>/test/*.test.ts`, importing from `../src/<mod>.js` (note the `.js` specifier on TS source).
- **CLI tests run the built `dist/index.js`** — run `pnpm --filter @tm/cli build` before `pnpm --filter @tm/cli test`.
- Provenance enum values (verbatim): `drafted` | `verified` | `informed-opinion` | `stale`. Phase 1 only ever sets `drafted`.
- DRY, YAGNI, TDD, frequent commits.

---

### Task 1: Schema — `provenance` field + `guideMode` flag

**Files:**
- Modify: `packages/core/src/schema.ts`
- Test: `packages/core/test/schema.test.ts`

**Interfaces:**
- Consumes: existing `NodeSchema`, `BoardSchema`, `migrate`, `CURRENT_VERSION`.
- Produces: `NodeProvenance` (zod enum + inferred type); `Node.provenance?: NodeProvenance`; `Board.guideMode?: boolean`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/schema.test.ts`:

```ts
import { BoardSchema, NodeProvenance, migrate, CURRENT_VERSION } from "../src/schema.js";

it("accepts a node provenance and a board guideMode", () => {
  const board = {
    version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app", guideMode: true,
    nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {}, provenance: "drafted" }],
    edges: [],
  };
  expect(() => BoardSchema.parse(board)).not.toThrow();
  expect(NodeProvenance.options).toContain("informed-opinion");
});

it("rejects an unknown provenance value", () => {
  const bad = {
    version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
    nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {}, provenance: "bogus" }],
    edges: [],
  };
  expect(() => BoardSchema.parse(bad)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test -- schema`
Expected: FAIL — `NodeProvenance` is not exported / `provenance: "drafted"` rejected.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/schema.ts`, after the `NodeStatus` enum (line ~10) add:

```ts
// Content provenance / trust level (spec §2.4). `verified` is reserved for factual content
// that passed a source-check; subjective content tops out at `informed-opinion`; past-TTL
// content downgrades to `stale`. Phase 1 only ever sets `drafted`. Absent = untracked.
export const NodeProvenance = z.enum(["drafted", "verified", "informed-opinion", "stale"]);
```

In `NodeSchema` (after the `status` line ~38) add:

```ts
  provenance: NodeProvenance.optional(),
```

In `BoardSchema` (after `domainHint` line ~61) add:

```ts
  guideMode: z.boolean().optional(),   // Guide posture ON gates interactive prompts (spec §1)
```

In the type exports block (after `export type NodeStatus = ...` line ~75) add:

```ts
export type NodeProvenance = z.infer<typeof NodeProvenance>;
```

(No `migrate()` change needed — both fields are optional and additive.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test -- schema`
Expected: PASS (all schema tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema.ts packages/core/test/schema.test.ts
git commit -m "feat(core): add Node.provenance + Board.guideMode schema fields"
```

---

### Task 2: Core ops — `setNodeProvenance` + `setGuideMode`

**Files:**
- Modify: `packages/core/src/ops.ts`
- Test: `packages/core/test/ops.test.ts`

**Interfaces:**
- Consumes: `Board`, `NodeProvenance` from `./schema.js`; existing `requireNode`.
- Produces:
  - `setNodeProvenance(board: Board, nodeId: string, prov: NodeProvenance | ""): Board` — `""` clears.
  - `setGuideMode(board: Board, on: boolean): Board` — `false` omits the field (Explore default).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/ops.test.ts` (match the existing import style at the top of that file — it imports from `../src/ops.js` and builds a board with `newBoard`):

```ts
import { setNodeProvenance, setGuideMode } from "../src/ops.js";

it("setNodeProvenance sets and clears a node's provenance", () => {
  let b = newBoard("App", "objective");
  b = setNodeProvenance(b, "root", "drafted");
  expect(b.nodes.find((n) => n.id === "root")!.provenance).toBe("drafted");
  b = setNodeProvenance(b, "root", "");
  expect(b.nodes.find((n) => n.id === "root")!.provenance).toBeUndefined();
});

it("setGuideMode toggles the board flag, omitting it when off", () => {
  let b = newBoard("App", "objective");
  b = setGuideMode(b, true);
  expect(b.guideMode).toBe(true);
  b = setGuideMode(b, false);
  expect(b.guideMode).toBeUndefined();
});
```

(If `newBoard` isn't already imported in `ops.test.ts`, add it to that file's import from `../src/board.js`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test -- ops`
Expected: FAIL — `setNodeProvenance` / `setGuideMode` not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/ops.ts`, update the import on line 2 to include `NodeProvenance`:

```ts
import { Board, Node, EdgeType, NodeStatus, NodeProvenance, BoardLayout, Section, SectionKind } from "./schema.js";
```

Add after `setNodeStatus` (line ~84):

```ts
/** Set (or clear) a node's content provenance/trust badge. Empty string clears it. */
export function setNodeProvenance(board: Board, nodeId: string, prov: NodeProvenance | ""): Board {
  requireNode(board, nodeId);
  const next = prov === "" ? undefined : NodeProvenance.parse(prov);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, provenance: next } : n)) };
}

/** Turn the Guide posture on/off for the board. Off omits the flag (Explore is the default). */
export function setGuideMode(board: Board, on: boolean): Board {
  return { ...board, guideMode: on ? true : undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test -- ops`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/test/ops.test.ts
git commit -m "feat(core): setNodeProvenance + setGuideMode ops"
```

---

### Task 3: Core — `detectCollisions` (the duplicate-resolution primitive)

**Files:**
- Modify: `packages/core/src/ops.ts`
- Test: `packages/core/test/ops.test.ts`

**Interfaces:**
- Consumes: `Board` from `./schema.js`.
- Produces: `detectCollisions(board: Board, labels: string[]): { label: string; existingId: string }[]` — for each proposed label that case-insensitively matches an existing node's label, returns the proposed label and the existing node id. Skill/CLI use this to drive the `[link | rename | facet]` prompt before committing a decompose.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/ops.test.ts`:

```ts
import { detectCollisions, decompose } from "../src/ops.js";

it("detectCollisions reports proposed labels that match existing nodes (case-insensitive)", () => {
  let b = newBoard("Web App", "objective");
  b = decompose(b, "root", { decomposition: [{ label: "Frontend", kind: "branch" }] });
  const hits = detectCollisions(b, ["frontend", "Backend"]);
  expect(hits).toHaveLength(1);
  expect(hits[0].label).toBe("frontend");
  expect(b.nodes.find((n) => n.id === hits[0].existingId)!.label).toBe("Frontend");
});

it("detectCollisions returns empty when nothing matches", () => {
  const b = newBoard("Web App", "objective");
  expect(detectCollisions(b, ["Backend", "Data"])).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test -- ops`
Expected: FAIL — `detectCollisions` not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/ops.ts`, add (near the other query-ish helpers, e.g. after `linkNodes`):

```ts
/**
 * Find proposed child labels that collide with an existing node label (case-insensitive).
 * The Guide layer uses this to force a [link / rename / make-facet] choice instead of
 * silently creating a duplicate node — TM is a DAG, not a tree (spec §2.3).
 */
export function detectCollisions(board: Board, labels: string[]): { label: string; existingId: string }[] {
  const byLower = new Map(board.nodes.map((n) => [n.label.toLowerCase(), n.id]));
  const hits: { label: string; existingId: string }[] = [];
  for (const label of labels) {
    const existingId = byLower.get(label.toLowerCase());
    if (existingId) hits.push({ label, existingId });
  }
  return hits;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test -- ops`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/test/ops.test.ts
git commit -m "feat(core): detectCollisions query for duplicate-resolution"
```

---

### Task 4: CLI — `provenance`, `guide`, `collisions` commands

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`

**Interfaces:**
- Consumes (from `@tm/core`): `setNodeProvenance`, `setGuideMode`, `detectCollisions`, plus existing `loadBoard`, `mutate`.
- Produces three CLI commands:
  - `tm provenance <id> <value>` — value ∈ {drafted, verified, informed-opinion, stale, none}; `none` clears.
  - `tm guide <on|off>` — toggle Guide mode.
  - `tm collisions --labels "<a,b,c>"` — print JSON `[{label, existingId}]` for labels colliding with the board.

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/test/cli.test.ts`:

```ts
it("provenance sets a node's badge shown by show --node", () => {
  run(["init", "App", "--root-type", "objective"]);
  run(["provenance", "root", "drafted"]);
  const node = JSON.parse(run(["show", "--node", "root"]));
  expect(node.provenance).toBe("drafted");
});

it("guide on sets the board flag", () => {
  run(["init", "App", "--root-type", "objective"]);
  run(["guide", "on"]);
  const b = JSON.parse(readFileSync(board, "utf8"));
  expect(b.guideMode).toBe(true);
});

it("collisions reports proposed labels matching existing nodes", () => {
  run(["init", "App", "--root-type", "objective"]);
  run(["add", "Frontend", "--parent", "root", "--kind", "branch"]);
  const hits = JSON.parse(run(["collisions", "--labels", "frontend,Backend"]));
  expect(hits).toHaveLength(1);
  expect(hits[0].label).toBe("frontend");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/cli build && pnpm --filter @tm/cli test`
Expected: FAIL — unknown commands `provenance` / `guide` / `collisions`.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/index.ts`, add to the `@tm/core` import list (lines 4-9): `setNodeProvenance, setGuideMode, detectCollisions`.

Add these commands (e.g. after the `status` command, ~line 82):

```ts
program.command("provenance <id> <value>")
  .description("set node provenance: drafted|verified|informed-opinion|stale (use 'none' to clear)")
  .action((id, value) => { mutate(file(), (b) => setNodeProvenance(b, id, value === "none" ? "" : value)); });

program.command("guide <state>")
  .description("turn Guide posture on|off for this board")
  .action((state) => { mutate(file(), (b) => setGuideMode(b, state === "on")); });

program.command("collisions")
  .description("print proposed labels that collide with existing nodes: --labels \"A,B,C\"")
  .requiredOption("--labels <csv>", "comma-separated proposed labels")
  .action((opts) => {
    const labels = (opts.labels as string).split(",").map((s) => s.trim()).filter(Boolean);
    out(detectCollisions(loadBoard(file()), labels));
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/cli build && pnpm --filter @tm/cli test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): provenance, guide, collisions commands"
```

---

### Task 5: Skill — the Guide method (LOCATE, widen/deepen, duplicate-resolution, mode)

**Files:**
- Modify: `skill/thinking-machine/SKILL.md`

**Interfaces:**
- Consumes: the `tm` CLI verbs (existing `init/new/decompose/grow/link/facet/promote/status` + new `guide/provenance/collisions`).
- Produces: documented procedure the agent follows. No unit test; verified by a dry-run walkthrough (Step 3).

- [ ] **Step 1: Add a "Guide method" section to SKILL.md**

Append a section with this content (adapt headings to the file's existing style):

```markdown
## Guide method (the flywheel)

Turn on with `tm guide on`. In Guide mode, follow this loop. The machine does the OBJECTIVE
work (decompose, lay out, detect duplicates, draft options); the HUMAN owns the SUBJECTIVE
judgment (which itch matters, which option fits, when to stop). Never fake either (spec §2.5).

0. LOCATE (only when the user has no question — fog). Propose 3-6 candidate signals/questions
   about the topic and ask the user which itches most (they own the CHARGE). Converge to ONE
   center — never hand back a menu. Seed it with `tm init "<center>"` (or `tm new`).
1. WIDEN (default first move). Propose a SHALLOW breadth map — the major parts, ~5-9 peers,
   one level, no recursion. Before committing, run `tm collisions --labels "A,B,C"` and resolve
   each hit (see Duplicate resolution). Commit with `tm decompose <center> --json '{...}'`, then
   `tm provenance <id> drafted` on new nodes.
2. STEER. Present the territory; ask the user to pick ONE center to go deeper.
3. DEEPEN (vertical). On the chosen node, propose options with a "pick this if X" rationale,
   then `tm grow <id> --json '{...}'` along that spine toward atoms. Collapse siblings. Mark
   new nodes `drafted` (Phase 1 does no verification).
4. PRIORITISE. Use `tm status <id> <todo|running|...>` to mark what matters; this is the user's call.
5. ADVANCE / recurse: pop back, pick the next center, repeat. Stop at atoms (kind "atom").

### Duplicate resolution (never create a silent duplicate)
When `tm collisions` reports a proposed label already on the board, ask the user which it is:
- Same thing  → `tm link <parentId> <existingId> --type dependency --label needs`  (DAG, one node)
- Different    → rename the proposed label, then decompose with the new label
- A concern    → `tm facet <parentId> considerations add "<label>"`  (cross-cutting, not a child)
```

- [ ] **Step 2: Self-check the doc for accuracy**

Verify every `tm` command named in the new section exists in `packages/cli/src/index.ts` (init, new, collisions, decompose, provenance, grow, status, link, facet). Fix any drift.

- [ ] **Step 3: Dry-run verification (no code)**

In a scratch dir, manually walk the loop once to confirm the commands compose:

```bash
cd "$(mktemp -d)"
node <path-to>/packages/cli/dist/index.js init "Web App" --root-type objective
node <path-to>/.../index.js guide on
node <path-to>/.../index.js decompose root --json '{"decomposition":[{"label":"Frontend","kind":"branch"},{"label":"Backend","kind":"branch"}]}'
node <path-to>/.../index.js collisions --labels "Frontend,Design"   # expect Frontend reported
node <path-to>/.../index.js provenance root drafted
node <path-to>/.../index.js show
```

Expected: each command succeeds; `collisions` reports `Frontend`; `show` lists the tree.

- [ ] **Step 4: Commit**

```bash
git add skill/thinking-machine/SKILL.md
git commit -m "docs(skill): add Guide method (LOCATE, widen/deepen, duplicate-resolution)"
```

---

### Task 6: Web — render the provenance badge on the node card

**Files:**
- Modify: `apps/web/src/boardToFlow.ts` (carry `provenance` into `ThinkNodeData`)
- Modify: `apps/web/src/ThinkNode.tsx` (render the badge)
- Modify: `apps/web/src/styles.css` (badge style)

**Interfaces:**
- Consumes: `Node.provenance` from the board JSON (Task 1).
- Produces: a small badge on each card whose provenance is set. Verified visually (this is a render change; no unit test — mirrors how `status` is already handled).

- [ ] **Step 1: Carry `provenance` into the flow node data**

In `apps/web/src/boardToFlow.ts`, find the `ThinkNodeData` type and the place each node is mapped to flow data (the same spot that sets `status`). Add `provenance?: string` to `ThinkNodeData`, and set `provenance: n.provenance` alongside `status: n.status` in the mapping.

- [ ] **Step 2: Render the badge**

In `apps/web/src/ThinkNode.tsx`, add after the status block (after line ~35):

```tsx
{data.provenance && (
  <div className={`t-prov prov-${data.provenance}`}>{data.provenance}</div>
)}
```

- [ ] **Step 3: Style it**

In `apps/web/src/styles.css`, add:

```css
.t-prov { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; opacity: .7; margin-top: 2px; }
.prov-drafted { color: #9aa3b2; }
.prov-verified { color: #4ade80; }
.prov-informed-opinion { color: #6aa3ff; }
.prov-stale { color: #f0a868; }
```

- [ ] **Step 4: Verify visually**

Run the web sidecar against a board that has a `drafted` node (use the Task-5 dry-run board), open the canvas, confirm the `drafted` badge shows on the card. Capture a screenshot to `docs/smoke-provenance.png` (matches the existing `docs/smoke-*.png` convention).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/boardToFlow.ts apps/web/src/ThinkNode.tsx apps/web/src/styles.css docs/smoke-provenance.png
git commit -m "feat(web): render node provenance badge"
```

---

## Self-Review

**Spec coverage (Phase 1 scope, spec §5):**
- LOCATE fog-entry → Task 5 (skill, interactive). ✓
- Widen/deepen → Task 5 (skill over `decompose`/`grow`). ✓
- Duplicate-resolution `[link/rename/facet]` → Task 3 (`detectCollisions`) + Task 4 (CLI) + Task 5 (resolution flow). ✓
- Guide/Explore mode toggle (spec §1) → Task 1 (`guideMode`) + Task 2 (`setGuideMode`) + Task 4 (CLI). ✓
- Provenance field exists and renders, all `drafted` (spec §5 Phase 1) → Task 1 (schema) + Task 2 (op) + Task 4 (CLI) + Task 6 (web). ✓
- Verification / cache / TTL / classify → intentionally **out of scope** (Phase 2). Not planned here, by design.

**Placeholder scan:** none — every code step shows full code; the only "locate the spot" instruction (Task 6 Step 1) points at the existing `status` mapping as the exact pattern to mirror.

**Type consistency:** `NodeProvenance` enum (Task 1) is used identically in `setNodeProvenance` (Task 2), the CLI `provenance` command (Task 4), and the web badge (Task 6). `detectCollisions` return shape `{label, existingId}` is consistent across Task 3 (core), Task 4 (CLI `collisions`), and Task 5 (skill consumption). `setGuideMode(board, boolean)` consistent Task 2 ↔ Task 4.

**Open questions deferred to Phase 2 (not blockers for this plan):** per-claim CLASSIFY, TTL volatility, render-first correction UX, library key normalization — all live in spec §6 and none are touched by Phase 1.
