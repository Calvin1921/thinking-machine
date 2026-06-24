# Guided Flywheel — Phase 3 Implementation Plan (reuse + UI + rationale)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the guided flywheel — cross-board cache reuse with context surfacing (human decides reuse-vs-reverify), a structured "pick this if X" rationale field rendered in the node drawer alongside provenance/sources/verifiedAt, and the `verifiedAt` ISO hardening flagged by the Phase 2 review.

**Architecture:** Still Claude-in-the-loop; core stays pure. The library cache gains an originating-context field; on a cross-board hit the skill surfaces the context and the human chooses (machine=objective / human=subjective, spec §2.5). The web `FacetDrawer` already receives the full board node, so the verification panel is a read-only render with no `boardToFlow` change. Builds on Phase 2 (merged at `bf422a8`).

**Tech Stack:** TypeScript (ESM, `.js` specifiers), zod 3.23 (`.datetime()` available), vitest, pnpm, commander, MCP SDK, React (FacetDrawer). Spec: `docs/superpowers/specs/2026-06-24-guided-flywheel-design.md` §2.4–§2.5, §5 (Phase 3), §6.

## Global Constraints

- Core stays **pure**: no `Date.now()`/`Math.random()`/argless `new Date()`. Clock only at CLI/MCP boundary.
- Schema changes **additive & optional**; `verifiedAt` is TIGHTENED from `z.string()` to `z.string().datetime()` — this is back-compat because every existing value (CLI/MCP stamps `new Date().toISOString()`, tests use `"2026-06-24T00:00:00.000Z"`) is valid ISO-8601. `CURRENT_VERSION` stays `1`.
- `lookupCache` (Phase 2, returns the payload) MUST keep working unchanged — add a NEW `lookupCacheEntry` for context; do not break the existing signature/CLI `cache-get`.
- Cache key stays topic-only (`slug(topic)`); the originating context is STORED in the entry and SURFACED on reuse, never folded into the key (per the chosen design — max reuse, no silent wrong-context bleed).
- Tests are vitest in `packages/<pkg>/test/`. CLI/MCP tests run built `dist` — build before test.
- DRY, YAGNI, TDD, frequent commits.

---

### Task 1: Schema — ISO-harden `verifiedAt` + add `rationale` field

**Files:**
- Modify: `packages/core/src/schema.ts`
- Test: `packages/core/test/schema.test.ts`

**Interfaces:**
- `Node.verifiedAt` becomes `z.string().datetime().optional()`.
- New `Node.rationale?: z.string()` — the "pick this if X" text.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/schema.test.ts`:

```ts
it("accepts a rationale and an ISO verifiedAt; rejects a non-ISO verifiedAt", () => {
  const base = (verifiedAt: string, rationale?: string) => ({
    version: CURRENT_VERSION, id: "b1", title: "T", rootId: "app",
    nodes: [{ id: "app", label: "App", kind: "root", x: 0, y: 0, facets: {},
      provenance: "verified", verifiedAt, ...(rationale ? { rationale } : {}) }],
    edges: [],
  });
  expect(() => BoardSchema.parse(base("2026-06-24T00:00:00.000Z", "pick this if you want zero-config"))).not.toThrow();
  expect(() => BoardSchema.parse(base("banana"))).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test -- schema`
Expected: FAIL — `"banana"` currently parses (verifiedAt is a bare string); rationale unknown-key is fine but the reject assertion fails.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/schema.ts` `NodeSchema`: change the `verifiedAt` line to

```ts
  verifiedAt: z.string().datetime().optional(),   // ISO-8601; tightened in Phase 3 (cached payloads cross the trust boundary)
```

and add after `sources`:

```ts
  rationale: z.string().optional(),   // "pick this if X" — why you'd choose this option
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test -- schema`
Expected: PASS. Also run the full core suite to confirm no existing fixture used a non-ISO verifiedAt: `pnpm --filter @tm/core test`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema.ts packages/core/test/schema.test.ts
git commit -m "feat(core): ISO-harden verifiedAt + add rationale field"
```

---

### Task 2: Core op — `setNodeRationale`

**Files:**
- Modify: `packages/core/src/ops.ts`
- Test: `packages/core/test/ops.test.ts`

**Interfaces:**
- `setNodeRationale(board, nodeId, text: string): Board` — sets `rationale`; empty string clears it (mirrors `setNodeImage`).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/ops.test.ts`:

```ts
import { setNodeRationale } from "../src/ops.js";

it("setNodeRationale sets and clears a node's rationale", () => {
  let b = newBoard("App", "objective");
  b = setNodeRationale(b, "root", "pick this if you want zero-config deploys");
  expect(b.nodes.find((n) => n.id === "root")!.rationale).toBe("pick this if you want zero-config deploys");
  b = setNodeRationale(b, "root", "");
  expect(b.nodes.find((n) => n.id === "root")!.rationale).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test -- ops`
Expected: FAIL — `setNodeRationale` not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/ops.ts`, after `setNodeImage`:

```ts
/** Set (or clear) a node's "pick this if X" rationale. Empty string clears it. */
export function setNodeRationale(board: Board, nodeId: string, text: string): Board {
  requireNode(board, nodeId);
  return { ...board, nodes: board.nodes.map((n) => (n.id === nodeId ? { ...n, rationale: text || undefined } : n)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test -- ops`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/test/ops.test.ts
git commit -m "feat(core): setNodeRationale op"
```

---

### Task 3: Core library — context on cache entries (`lookupCacheEntry`)

**Files:**
- Modify: `packages/core/src/library.ts`
- Test: `packages/core/test/library.test.ts`

**Interfaces:**
- `cacheSubtree(libDir, topic, payload, context?: string): void` — stores `{ topic, context, payload }` (context optional; back-compat — the 4th arg is new).
- `lookupCache(libDir, topic): unknown | null` — UNCHANGED (still returns `payload`).
- New `lookupCacheEntry(libDir, topic): { context?: string; payload: unknown } | null` — returns context + payload, or null on miss/unreadable.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/library.test.ts`:

```ts
import { lookupCacheEntry } from "../src/library.js";

it("stores and surfaces the originating context on reuse", () => {
  cacheSubtree(dir, "Hosting", { nodes: [{ label: "Vercel" }] }, "static blog");
  expect(lookupCache(dir, "hosting")).toEqual({ nodes: [{ label: "Vercel" }] });        // unchanged
  expect(lookupCacheEntry(dir, "hosting")).toEqual({ context: "static blog", payload: { nodes: [{ label: "Vercel" }] } });
});

it("lookupCacheEntry returns null on a miss", () => {
  expect(lookupCacheEntry(dir, "nope")).toBeNull();
});

it("context is optional (back-compat with 3-arg cacheSubtree)", () => {
  cacheSubtree(dir, "Plain", { a: 1 });
  expect(lookupCacheEntry(dir, "plain")).toEqual({ context: undefined, payload: { a: 1 } });
});
```

(`dir`, `cacheSubtree`, `lookupCache` are already imported in this test file from Phase 2.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/core test -- library`
Expected: FAIL — `lookupCacheEntry` not exported; `cacheSubtree` 4th arg ignored.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/library.ts`, update `cacheSubtree` and add `lookupCacheEntry`:

```ts
/** Write a verified subtree payload (and its originating context) under the topic's key. */
export function cacheSubtree(libDir: string, topic: string, payload: unknown, context?: string): void {
  mkdirSync(libDir, { recursive: true });
  writeFileSync(entryPath(libDir, topic), JSON.stringify({ topic, context, payload }, null, 2));
}

/** Read the cached payload for a topic, or null on a miss / unreadable entry. */
export function lookupCache(libDir: string, topic: string): unknown | null {
  const entry = lookupCacheEntry(libDir, topic);
  return entry ? entry.payload : null;
}

/** Read the full cache entry (context + payload) for a topic, or null on miss/unreadable. */
export function lookupCacheEntry(libDir: string, topic: string): { context?: string; payload: unknown } | null {
  const file = entryPath(libDir, topic);
  if (!existsSync(file)) return null;
  try {
    const { context, payload } = JSON.parse(readFileSync(file, "utf8")) as { context?: string; payload: unknown };
    return { context, payload };
  } catch {
    return null;
  }
}
```

(Keep the existing imports; `lookupCache` now delegates to `lookupCacheEntry` — DRY.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/core test -- library`
Expected: PASS (including the existing Phase 2 round-trip/miss tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/library.ts packages/core/test/library.test.ts
git commit -m "feat(core): cache entry context + lookupCacheEntry"
```

---

### Task 4: CLI — `rationale`, `--context`, `cache-entry`

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: `setNodeRationale`, `lookupCacheEntry` (plus existing `cacheSubtree`).
- `tm rationale <id> <text...>` — set the node rationale (mirror `note`'s passThrough so text may start with `-`; join words). `'none'`/empty clears.
- `tm cache-put <topic> --json <payload> [--context <text>]` — add the `--context` option.
- `tm cache-entry <topic>` — print `{context, payload}` via `lookupCacheEntry` (over `lib()`).

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/test/cli.test.ts`:

```ts
it("rationale sets the pick-this-if text shown by show --node", () => {
  run(["init", "App", "--root-type", "objective"]);
  run(["rationale", "root", "pick", "this", "if", "you", "want", "zero-config"]);
  expect(JSON.parse(run(["show", "--node", "root"])).rationale).toBe("pick this if you want zero-config");
});

it("cache-put --context is surfaced by cache-entry", () => {
  run(["init", "App", "--root-type", "objective"]);
  const payload = JSON.stringify({ nodes: [{ label: "Vercel" }] });
  run(["--lib", join(dir, "library"), "cache-put", "Hosting", "--json", payload, "--context", "static blog"]);
  const entry = JSON.parse(run(["--lib", join(dir, "library"), "cache-entry", "Hosting"]));
  expect(entry).toEqual({ context: "static blog", payload: { nodes: [{ label: "Vercel" }] } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/cli build && pnpm --filter @tm/cli test`
Expected: FAIL — unknown commands / unknown `--context`.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/index.ts`: add `setNodeRationale, lookupCacheEntry` to the `@tm/core` import. Add the `--context` option to the existing `cache-put` command (`.option("--context <text>", "originating context for this cache entry")`) and pass `opts.context` as the 4th arg to `cacheSubtree(lib(), topic, JSON.parse(opts.json), opts.context)`. Then add:

```ts
program.command("rationale <id> <text...>")
  .description("set a node's 'pick this if X' rationale (use 'none' to clear). Text may start with '-'.")
  .passThroughOptions()
  .action((id, text) => {
    const joined = (text as string[]).join(" ");
    mutate(file(), (b) => setNodeRationale(b, id, joined === "none" ? "" : joined));
  });

program.command("cache-entry <topic>")
  .description("print the cached entry {context, payload} for <topic> (or null)")
  .action((topic) => { out(lookupCacheEntry(lib(), topic)); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/cli build && pnpm --filter @tm/cli test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): rationale, cache --context, cache-entry"
```

---

### Task 5: MCP — `tm_set_rationale`, cache `context`, `tm_cache_entry`

**Files:**
- Modify: `packages/mcp/src/index.ts`
- Test: `packages/mcp/test/mcp.test.ts`

**Interfaces:**
- Consumes: `setNodeRationale`, `lookupCacheEntry`.
- `tm_set_rationale` {board,nodeId,text} → `setNodeRationale` via mutate ('' clears).
- `tm_cache_put` gains optional `context: z.string().optional()` arg, passed as the 4th arg to `cacheSubtree`.
- `tm_cache_entry` {board,topic} → `resolveBoard(board)` then `ok(lookupCacheEntry(libDir, topic))`.

- [ ] **Step 1: Write the failing test**

Add to `packages/mcp/test/mcp.test.ts`:

```ts
it("tm_set_rationale + tm_cache_entry surface rationale and context", async () => {
  const c = await connect();
  const { id } = payload(await c.callTool({ name: "tm_create_board", arguments: { title: "App", rootType: "objective" } }));
  await c.callTool({ name: "tm_set_rationale", arguments: { board: id, nodeId: "root", text: "pick this if low budget" } });
  const root = payload(await c.callTool({ name: "tm_show", arguments: { board: id, nodeId: "root" } }));
  expect(root.rationale).toBe("pick this if low budget");

  await c.callTool({ name: "tm_cache_put", arguments: { board: id, topic: "Hosting", payload: { a: 1 }, context: "static blog" } });
  const entry = payload(await c.callTool({ name: "tm_cache_entry", arguments: { board: id, topic: "Hosting" } }));
  expect(entry).toEqual({ context: "static blog", payload: { a: 1 } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tm/mcp build && pnpm --filter @tm/mcp test`
Expected: FAIL — unknown tools / unknown `context` arg.

- [ ] **Step 3: Write minimal implementation**

In `packages/mcp/src/index.ts`: add `setNodeRationale, lookupCacheEntry` to the import. Add `context: z.string().optional()` to `tm_cache_put`'s schema and pass it: `cacheSubtree(libDir, topic, payload, context)`. Add:

```ts
server.tool("tm_set_rationale", "Set a node's 'pick this if X' rationale (empty string clears)",
  { board: z.string().describe(BOARD_DESC), nodeId: z.string(), text: z.string() },
  async ({ board, nodeId, text }) =>
    ok(mutate(resolveBoard(board), (b) => setNodeRationale(b, nodeId, text))));

server.tool("tm_cache_entry", "Read the cached entry {context, payload} for a topic (or null)",
  { board: z.string().describe(BOARD_DESC), topic: z.string() },
  async ({ board, topic }) => { resolveBoard(board); return ok(lookupCacheEntry(libDir, topic)); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tm/mcp build && pnpm --filter @tm/mcp test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/index.ts packages/mcp/test/mcp.test.ts
git commit -m "feat(mcp): tm_set_rationale, cache context, tm_cache_entry"
```

---

### Task 6: Web — verification panel in `FacetDrawer`

**Files:**
- Modify: `apps/web/src/FacetDrawer.tsx`, `apps/web/src/styles.css`
- Test: (visual — the drawer receives the full node; no boardToFlow change)

**Interfaces:**
- `FacetDrawer` already gets the full `node: BNode`, which now carries `provenance/contentKind/sources/verifiedAt/volatility/rationale`. Render a read-only verification panel when any are present.

- [ ] **Step 1: Add the verification panel**

In `apps/web/src/FacetDrawer.tsx`, after the `<div className="dsub">…</div>` line (before the status `facet`), insert:

```tsx
{(node.provenance || node.rationale || node.sources?.length) && (
  <div className="verif">
    {node.provenance && (
      <span className={`t-prov prov-${node.provenance}`}>{node.provenance}</span>
    )}
    {node.contentKind && <span className="verif-kind">{node.contentKind}</span>}
    {node.verifiedAt && <span className="verif-at">checked {node.verifiedAt.slice(0, 10)}</span>}
    {node.volatility && <span className="verif-vol">TTL: {node.volatility}</span>}
    {node.rationale && <div className="verif-rationale">{node.rationale}</div>}
    {node.sources?.length ? (
      <ul className="verif-sources">
        {node.sources.map((s) => (
          <li key={s}><a href={s} target="_blank" rel="noreferrer">{s}</a></li>
        ))}
      </ul>
    ) : null}
  </div>
)}
```

- [ ] **Step 2: Style it**

In `apps/web/src/styles.css`, append:

```css
.verif { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin: 8px 0 12px; padding: 8px; background: #14161b; border-radius: 6px; }
.verif-kind, .verif-at, .verif-vol { font-size: 11px; color: #9aa3b2; }
.verif-rationale { flex-basis: 100%; font-size: 13px; color: #cdd3dc; font-style: italic; }
.verif-sources { flex-basis: 100%; margin: 0; padding-left: 16px; font-size: 12px; }
.verif-sources a { color: #6aa3ff; word-break: break-all; }
```

- [ ] **Step 3: Typecheck + verify**

Run: `pnpm --filter @tm/web build` (find the exact package name in `apps/web/package.json`) — expect a clean typecheck/build. Then run the web tests: `pnpm --filter @tm/web test` — expect existing tests still green (no test changed; this is a render-only addition).

- [ ] **Step 4: Visual check (optional, non-blocking)**

If a dev server is handy, open a board with a verified node and confirm the panel shows the badge, sources as links, and the rationale. Capture `docs/smoke-verif-panel.png` (matches the existing `docs/smoke-*.png` convention). Skip if the browser tooling isn't readily available — the typecheck/build is sufficient evidence for a render-only change.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/FacetDrawer.tsx apps/web/src/styles.css docs/smoke-verif-panel.png 2>/dev/null; git add apps/web/src/FacetDrawer.tsx apps/web/src/styles.css
git commit -m "feat(web): verification panel (provenance, sources, rationale) in FacetDrawer"
```

---

### Task 7: Skill — cross-board reuse surfacing + rationale writeback

**Files:**
- Modify: `skill/thinking-machine/SKILL.md`

**Interfaces:**
- Consumes: `tm cache-entry`, `tm cache-put --context`, `tm rationale`, plus existing C′ commands.

- [ ] **Step 1: Update the C′ section**

In `skill/thinking-machine/SKILL.md`, update the C′ verification section's cache steps to:

```markdown
- CACHE CHECK (cross-board, context-aware): `tm cache-entry "<topic>"`. On a HIT, read its
  `context`. If the cached context MATCHES this board's context, graft it (instant reuse). If it
  DIFFERS (e.g. cached from "static blog", now on a "video platform"), SURFACE it to the user —
  "cached from <context>; reuse or re-verify for <this context>?" — and let them choose. Never
  silently reuse across a different context.
- After verifying, cache WITH context: `tm cache-put "<topic>" --json '{...}' --context "<this board's context>"`.
- For each option, write its "pick this if X" rationale: `tm rationale <id> "pick this if …"`.
  This renders in the node drawer alongside provenance and sources.
```

- [ ] **Step 2: Command-existence check**

Confirm `cache-entry`, `rationale`, and `cache-put --context` exist in `packages/cli/src/index.ts`, and `tm_cache_entry`/`tm_set_rationale`/`tm_cache_put`(context) in `packages/mcp/src/index.ts`. Fix any drift.

- [ ] **Step 3: Dry-run (REQUIRED)**

Build the CLI, then in a temp dir run, using the absolute CLI path `/Users/calvinho/Projects/mine/2026-06_thinking_machine/packages/cli/dist/index.js`:

```bash
B=$(mktemp -d); BF="$B/b.json"; L="$B/library"
node <CLI> -f "$BF" init "Hosting" --root-type decision
node <CLI> -f "$BF" rationale root "pick this if you want zero-config"
node <CLI> -f "$BF" show --node root            # expect rationale set
node <CLI> -f "$BF" --lib "$L" cache-put "Hosting" --json '{"nodes":[{"label":"Vercel"}]}' --context "static blog"
node <CLI> -f "$BF" --lib "$L" cache-entry "Hosting"   # expect {context:"static blog", payload:{...}}
```

Paste commands + output into the report.

- [ ] **Step 4: Commit**

```bash
git add skill/thinking-machine/SKILL.md
git commit -m "docs(skill): cross-board cache surfacing + rationale writeback"
```

---

## Self-Review

**Spec coverage (Phase 3, spec §5):**
- Cross-board library reuse w/ context surfacing → Task 3 (`lookupCacheEntry` + context) + Tasks 4/5 (`cache-entry`, `--context`) + Task 7 (surface + human decides). ✓
- Provenance UI polish (sources/verifiedAt/stale in the drawer) → Task 6. ✓
- "pick this if X" rationale rendering → Task 1 (field) + Task 2 (op) + Tasks 4/5 (CLI/MCP) + Task 6 (drawer render) + Task 7 (skill writes it). ✓
- `verifiedAt` ISO hardening (P2 carry-forward) → Task 1. ✓
- Deferred / out of scope: an automated verifier service (still Claude-in-the-loop by decision); a per-context cache key (rejected in favor of topic-key + surfacing). Correctly absent.

**Placeholder scan:** none — every code step shows full code; the one optional step (Task 6 screenshot) is explicitly optional with typecheck as the gate.

**Type consistency:** `lookupCacheEntry` return `{ context?: string; payload: unknown }` is identical across Task 3 (core), Task 4 (CLI `cache-entry`), Task 5 (MCP `tm_cache_entry`). `setNodeRationale(board, id, text)` consistent Task 2 ↔ CLI (4) ↔ MCP (5). `cacheSubtree`'s new 4th `context?` arg consistent across Tasks 3/4/5. `rationale` field (Task 1) consumed by Task 2 op and Task 6 render.

## Open questions (resolved here)
- Cross-board context → topic-key + store/surface context, human decides (chosen design).
- Rationale storage → structured `Node.rationale` field (not inline facet string), rendered read-only in the drawer; written by the skill via `tm rationale`.
- `verifiedAt` validation → `z.string().datetime()` (zod 3.23); back-compat since all stamped values are ISO.
