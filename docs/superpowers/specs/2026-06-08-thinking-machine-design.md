# Thinking Machine — Design Spec (v1)

**Date:** 2026-06-08
**Status:** Draft for review
**Scope:** Single deep canvas + the CLI / MCP / Skill / Web visualizer loop around it.

---

## 1. What it is

A visual canvas for mapping thinking — research, decisions, system breakdowns — as a
graph of nodes. Each node can be **decomposed** into parts (building a DAG) and examined
through **facets** (analytical lenses). The decomposition intelligence is provided by
**Claude Code acting as an LLM-judge**, driven through a CLI and MCP server and guided by
a dedicated Skill. The web app is the **live visual surface** over a shared `board.json`.

Not a generic mind-map: the differentiator is **domain-aware, LLM-judged decomposition**
with a human-in-the-loop, surfaced visually and editable from both the terminal (agent)
and the canvas (human).

## 2. Two axes of a node (the core mental model)

- **Decomposition** — break a node into *parts you will keep thinking about* → child nodes.
  Builds the tree/DAG. (e.g. `Web App → FE, BE, DB`)
- **Facets** — a lens-grid applied to any node *without* spawning new nodes. Seed set:
  `Definition, Essentials, Dependencies, Priorities, Considerations, Perspectives`.
  The seed is a **default, not a cage** — the LLM-judge swaps/extends lenses to fit the
  node's domain (business, decision, operations, research, system).

**Resolution rule** for "is X a child or a facet item?" — it is a **facet item** (e.g.
"deployment" under Dependencies) until it earns its own sub-tree, then it is **promoted**
to a node. The model is a **DAG, not a pure tree**: cross-links express shared
dependencies (e.g. FE and BE both depend on the API Contract).

**Node kinds:** `root` (objective / cause / decision / concept) · `branch` (decomposes
further) · `atom` (leaf — stop expanding). Atom is the explicit stopping rule for
"expand until it can't."

## 3. Architecture

```
board.json  ── single source of truth (nodes, edges, facets, meta)
   ▲
   │  atomic read-modify-write (+ lockfile)
   │
 core lib (TypeScript + zod schema)  ── ALL board operations live here
   ▲           ▲            ▲
   │           │            │
  CLI        MCP server    Web sidecar (Express)
 `tm ...`   (tools)        ├─ REST read/write (→ core)
                           └─ file-watch board.json → SSE → browser

 Skill `thinking-machine` ── teaches Claude Code the CLI/MCP vocabulary +
                             the decomposition method + facet selection +
                             the propose→confirm→commit discipline.

 Web canvas (React + React Flow) ── renders board.json, manual edit writes
                                    back through the sidecar, live-reloads on SSE.
```

**Why this shape:** intelligence lives in the *skill prompt* (no app-side LLM calls, no
API-key management); `core` is the single writer so CLI, MCP, and web never clobber each
other; CLI and MCP are thin wrappers (no logic duplication).

## 4. Components

### 4.1 `core` (library)
- **Owns the schema** (zod) and all mutations. Nothing else writes `board.json` directly.
- **Atomic writes:** read → modify → write-temp → rename, guarded by a lockfile.
  Last-write-wins is the accepted concurrency model for single-user v1.
- Operations: `loadBoard`, `saveBoard`, `addNode`, `updateNode`, `deleteNode`,
  `linkNodes` (decomposition | dependency), `unlink`, `setFacet`, `promoteFacetItem`,
  `setKind`, `layout` (assign x/y for new nodes).
- **Schema version** field; a `migrate(board)` step runs on load.

### 4.2 `cli` (`tm`)
Thin commander-based wrapper over `core`. Commands (initial set):
- `tm init [name]` — create a board.
- `tm show [--node <id>]` — print board / node + facets (agent-readable).
- `tm add <label> [--parent <id>] [--kind branch|atom]`
- `tm link <from> <to> [--type decomposition|dependency]`
- `tm facet <id> <facet> <set|add> <text...>`
- `tm promote <id> <facet> <itemIndex>` — facet item → new node.
- `tm rm <id>` / `tm rename <id> <label>` / `tm kind <id> <kind>`
- `tm decompose <id> --json '<proposal>'` — first-class command that commits a full
  decomposition proposal in one shot: creates child nodes, decomposition edges, optional
  dependency cross-links, and seeds facets. Accepts the exact `{ decomposition[], facets[],
  edges[] }` shape the skill produces, validates via zod, lays out new nodes via
  `core.layout`, and returns the created ids. This is the agent's primary write path after
  the human confirms; `add`/`link`/`facet` remain for fine-grained manual edits.
- Output is structured (JSON with `--json`) so Claude Code can read state back.

### 4.3 `mcp` (server)
Exposes the same `core` operations as MCP tools (`tm_show`, `tm_add_node`,
`tm_decompose`, `tm_set_facet`, `tm_promote`, …) so Claude Code can drive a board
in-session. Resolves the board path from an env var / tool arg.

### 4.4 `skill` (`thinking-machine`)
Markdown skill that:
- Documents every CLI command and MCP tool with examples.
- Encodes the **decomposition method**: given a node + ancestor path + domain hint +
  siblings, propose `{ decomposition[], facets[], rationale }`.
- Enforces **propose → human confirms → commit** (no silent bulk explosions; cap a
  single decomposition proposal, surface it, wait for the user's pick).
- Explains domain-aware facet selection (seed 6, swap per domain).

### 4.5 `web` (canvas)
- **React + React Flow (`@xyflow/react`)**. Custom node component renders label, kind
  styling (root/branch/atom), and facet-fill dots. Two edge types: decomposition
  (solid) and dependency (dashed).
- **Capture modes:**
  - **Dump-first** — a quick-add input drops loose, unparented nodes to organize later.
  - **AI-assist (via agent)** — the agent creates/edits nodes through CLI/MCP; the canvas
    reflects changes live. (In-app prompt box that shells to the agent is a later phase.)
- **Facet drawer** — click a node → side drawer with the lens-grid; edit writes back.
- **Live reload** — subscribes to the sidecar's SSE; re-renders on external edits.
- **Sidecar** (small Express server) owns REST read/write (through `core`) and watches
  the board file to broadcast external (CLI/MCP) changes.

## 5. Data model (`board.json`)

```jsonc
{
  "version": 1,
  "id": "webapp",
  "title": "Ship an MVP Web App",
  "domainHint": "software",            // optional; guides LLM facet selection
  "rootId": "app",
  "nodes": [
    {
      "id": "app",
      "label": "MVP Web App",
      "kind": "root",                  // root | branch | atom
      "rootType": "objective",         // objective | cause | decision | concept (root only)
      "x": 300, "y": 360,
      "facets": {
        "definition": ["..."],
        "essentials": ["..."],
        "dependencies": ["..."],
        "priorities": ["..."],
        "considerations": ["..."],
        "perspectives": ["..."]
        // domain-specific keys allowed, e.g. "reversibility", "cost"
      }
    }
  ],
  "edges": [
    { "from": "app", "to": "fe", "type": "decomposition" },
    { "from": "fe",  "to": "api", "type": "dependency" }
  ]
}
```

- Facet values are arrays of strings (v1). Items may later carry metadata (promotable,
  linked-node-id) — additive, version-gated.
- Edge `type` distinguishes the two axes; `decomposition` edges form the spanning tree,
  `dependency` edges are the DAG cross-links.

## 6. Primary flows

**Decompose (agent-driven):**
1. User in Claude Code: *"decompose the Backend node for operational risk."*
2. Skill → agent reads node via `tm show --node be --json`.
3. Agent proposes `{ decomposition, facets, rationale }`, shows it, asks which to keep.
4. On confirm: `tm add ... --parent be`, `tm facet be considerations add ...` via core.
5. Sidecar file-watch fires → SSE → canvas live-updates.

**Manual (human-driven):** drag a node, quick-add a dump node, edit a facet in the
drawer → REST → core → board.json → (no SSE needed; optimistic local update).

**Promote:** facet item "Deployment" under Dependencies → `tm promote app dependencies 0`
→ becomes a `branch` node linked by a decomposition edge.

## 7. Error / edge / empty states

- **Empty board** — canvas shows a single "start from one root" prompt (objective / cause /
  decision / concept chooser).
- **Empty facet** — drawer shows "click to fill in your thinking," not a blank.
- **Lock contention** — core retries with backoff; surfaces a clear error if it can't
  acquire the lock.
- **Schema mismatch** — `migrate()` on load; refuse + back up the file if version is newer
  than the binary understands.
- **Sidecar down** — CLI/MCP still work (they use core directly); the canvas shows a
  "disconnected — reload to sync" banner.
- **Invalid edit from agent** — zod validation in core rejects with a structured error the
  CLI/MCP surface back to the agent.

## 8. Testing strategy

Integration tests against real files (no mocks, per house rule):
- `core` round-trips: create → mutate → reload → assert; atomic-write survives a
  simulated mid-write crash; lockfile prevents interleaved writes.
- `cli` end-to-end on a temp board: each command mutates the file as expected; `--json`
  output is parseable.
- `mcp` tools invoked against a temp board produce identical results to the CLI.
- `web` sidecar: external file edit triggers an SSE event; REST write hits core.
- One **full-loop test**: CLI edit → SSE received by a headless web client.

## 9. Stack

| Layer | Choice |
|---|---|
| Canvas | React + React Flow (`@xyflow/react`), Vite |
| Core / CLI / MCP | TypeScript, zod, commander, `@modelcontextprotocol/sdk` |
| Sidecar | Express + SSE, `chokidar` file-watch |
| Persistence | `board.json` on disk (localStorage mirror optional); DB deferred |
| LLM | Claude Code via Skill (no in-app API calls in v1) |

## 10. Out of scope (v1)

Galaxy / multi-canvas overview · clustering · real-time multi-user collab · auth ·
in-app prompt box that spawns the agent (agent runs in Claude Code for now) ·
database persistence · mobile layout.

## 11. Open questions (non-blocking)

- Auto-layout algorithm for agent-created nodes (start: simple radial/tree placement in
  `core.layout`; revisit if it looks messy).
- Whether facet items become structured objects in v1 or stay strings (leaning strings,
  promote-by-index for now).
