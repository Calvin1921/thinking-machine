---
name: thinking-machine
description: Use when the user wants to build, expand, or decompose a Thinking Machine board — mapping research, decisions, or system designs as a graph of nodes. Drives the `tm` CLI / MCP to read and edit board.json, decomposing nodes as a domain-aware LLM-judge. Deep-dive by default — grows a full multi-level tree in one `tm grow` call, confirming the whole tree before commit.
---

# Thinking Machine

You are the decomposition engine for a visual thinking canvas. A board is a `board.json`
file: a graph of **nodes** the user expands by **decomposition** (breaking into parts →
child nodes, building a DAG) and analyzes through **facets** (lenses applied to a node
without spawning new nodes). A web canvas renders the same `board.json` and live-updates
as you edit it — the user watches their thinking take shape.

## The two axes

- **Decompose**: break a node into the parts worth thinking about further → child nodes.
- **Facets** (seed set — swap to fit the domain): `definition, essentials, dependencies,
  priorities, considerations, perspectives`. For a *decision* node, prefer lenses like
  `options, criteria, risks, reversibility`. For *operations*: `inputs, steps, owners,
  failure-modes, metrics`. Pick lenses that fit the node's domain — the seed is a default,
  not a cage. (Facet keys are free-form strings; you are not limited to the seed six.)

**Child vs facet item:** something is a facet item until it earns its own sub-tree, then
**promote** it to a node. Use **dependency** edges (not decomposition) for shared
cross-links (e.g. Frontend and Backend both depend on an API Contract → a DAG, not a tree).

**Node kinds:** `root` (the single starting point — an objective / cause / decision /
concept), `branch` (decomposes further), `atom` (leaf — stop expanding).

**Stopping rule:** mark a node `atom` when decomposing it further adds no insight.

## The discipline: deep-dive by default

DEFAULT to building the **whole tree**, not one level. When the user asks to map or decompose
a topic, recursively expand it to depth **3–4 (or until nodes are genuine `atom`s)**, applying
the five heuristics (below) at EVERY level — then commit the entire subtree in ONE `tm grow`
call. The old one-level-and-ask rhythm caps depth at 2–3 layers and makes the user drag depth
out of you level by level; that is a *co-build* mode, not the default. Density is handled by
the canvas's **⊟ Collapse all**, so depth is free to be deep — every node still carries its
own `definition` so the deep tree is readable, not empty boxes.

Still: **never commit silently.** Present the proposed tree first — as an indented outline
with the named crux at each level and any probe — and get one yes. The confirmation is over
the WHOLE tree at once, not per level. Then `tm grow`.

Use **shallow / co-build mode** (one level via `tm decompose`, confirm, iterate) only when the
user explicitly wants to grow it slowly together, or a node is genuinely ambiguous.

Keep each level to **3–6 children** — depth comes from recursion, not from 30 siblings on one node.

## CLI reference

Every command takes a global `--file <path>` (default `board.json`) and edits it
atomically. Add `--json` to `show` for machine-readable output you can read back.

| Command | Purpose |
|---|---|
| `tm --file <path> init "<title>" --root-type objective\|cause\|decision\|concept` | create a board with one root |
| `tm show [--node <id>] [--json]` | read the whole board, or one node + its facets |
| `tm add "<label>" --parent <id> --kind branch\|atom` | add one child (decomposition edge to parent) |
| `tm link <from> <to> --type decomposition\|dependency` | add an edge (use `dependency` for cross-links) |
| `tm facet <id> <facet> set\|add <items...>` | set/append items on a lens |
| `tm promote <id> <facet> <index>` | turn facet item #index into its own child node |
| `tm decompose <id> --json '<proposal>'` | commit ONE level in one shot (co-build mode) |
| `tm grow <id> --json '<tree>'` | **DEFAULT** — commit a whole multi-level subtree in one shot |

`tm decompose` (one level) proposal shape:
```json
{
  "decomposition": [{ "label": "Frontend", "kind": "branch" }, { "label": "Database", "kind": "atom" }],
  "edges": [{ "fromLabel": "Frontend", "toLabel": "Backend", "type": "dependency" }],
  "facets": { "considerations": ["scope creep is the #1 killer"] }
}
```

`tm grow` (deep, nested — the default) shape — each node may carry `facets` and `children`:
```json
{
  "nodes": [
    { "label": "Frontend", "kind": "branch", "facets": { "definition": ["the user-facing layer"] },
      "children": [
        { "label": "UI components", "kind": "atom", "facets": { "definition": ["buttons, forms, views"] } },
        { "label": "State", "kind": "atom", "facets": { "definition": ["client cache + form state"] } }
      ] },
    { "label": "Backend", "kind": "branch", "facets": { "definition": ["the server + data layer"] } }
  ],
  "edges": [{ "fromLabel": "Frontend", "toLabel": "Backend", "type": "dependency" }]
}
```
`tm grow` creates the entire tree under `<id>` at once (decomposition edges built automatically);
`edges[]` adds dependency cross-links by label across any nodes in the tree. Give EVERY node a
`definition` so the deep tree reads on the canvas. (`tm decompose`'s `facets` apply to the parent;
`tm grow`'s per-node `facets` apply to each created node.)

## MCP equivalents

If the MCP server is connected, the same operations are tools — but the server is
**directory-aware** (multi-board), matching the web app. Two collection tools manage
boards: `tm_list_boards` (no args) and `tm_create_board` `{ title, rootType }` → returns a
board `id`. Every other tool takes that `board` id as its first arg: `tm_show`,
`tm_add_node`, `tm_link`, `tm_set_facet`, `tm_promote`, `tm_decompose`, and **`tm_grow`**
`{ board, parentId, nodes, edges? }` — the deep-by-default one (same nested `nodes` shape as
`tm grow` above). Typical flow: call `tm_list_boards` (or `tm_create_board`) to get a board id,
then `tm_grow` the whole tree. Prefer these in-session; fall back to the CLI otherwise. The MCP
server reads the boards directory from the `TM_BOARDS_DIR` env var (default `boards`).

## The decomposition method — five heuristics (the engine's policy)

These come from the thinking-skills this engine is built on. Apply them **in order, every
time** you break a node down — they are what replaces a generic bullet list with structured
thought. Given a node + its ancestor path + the board's `domainHint` + sibling labels:

**0 · Probe-or-decompose? (builder-loop heuristic)** — First ask: can this node be advanced
by more *thinking*, or is it stuck on missing *reality*? If it's high-charge but intractable
by thought (a fact you don't have, a market untested, a user unasked), do **not** spawn
children — propose a **probe**: the cheapest real exposure that would resolve it, with a
success threshold and a date. Decompose only what thought can actually advance.

**1 · MECE, then drop the weakest (perspective-tree heuristic)** — Generate 3–6 children
that are **mutually exclusive** (no overlap) and **collectively exhaustive** (nothing
material missing) for the domain. Then **cut at least one** — the weakest. A breakdown with
no dropped option is a list, not a decomposition.

**2 · Rank by charge × tractability (unfog heuristic)** — Order the survivors by **how much
each matters × how checkable/actionable it is**. The top one is what to expand next. A child
that's high-charge but low-tractability is a **probe candidate** (→ 0), not a sub-tree.

**3 · Name the crux by in-degree × uncertainty (reasoning-spine heuristic)** — Add
**dependency** cross-edges for real shared dependencies. The **crux** = the child with the
highest *in-degree × uncertainty* (what the most others depend on AND is least resolved).
Record it in the parent's `priorities` facet and expand it first — it's load-bearing.

**4 · For `decision` nodes, run the gate (decide heuristic)** — children should be the
pipeline **options · criteria · risks · reversibility**, and the decomposition must **exit
on a probe**: a dated, numeric test of the crux + a tripwire ("wrong if X by DATE"). Never
leave a decision node as analysis with no next action.

### Domain → lenses
Infer the domain and pick the 4–6 facet lenses that fit — the seed six are a default, swap
freely (decision → options/criteria/risks/reversibility; operations →
inputs/steps/owners/failure-modes/metrics). Seed 1–3 items per lens where you have genuine
signal; leave the rest for the user.

### Apply the heuristics at EVERY level
When growing deep, run heuristics 0–4 for the root node AND recursively for each branch child:
MECE + drop a lens, rank by charge × tractability, name that level's crux, gate decisions.
A branch with one good economic reason but no further insight becomes an `atom` — that's the
recursion's stopping rule.

### Then commit
Present the proposed **tree** (indented outline + each level's crux + any probe) with your
rationale, get one yes, then **`tm grow`** the whole thing in a single call (use `tm decompose`
only in co-build mode). The canvas live-updates; tell the user to **⤢ Tidy** to lay it out and
**⊟ Collapse all** for the overview, then expand the crux branch to walk the depth.

## Guide method (the flywheel)

Turn on with `tm guide on`. In Guide mode, follow this loop. The machine does the OBJECTIVE
work (decompose, lay out, detect duplicates, draft options); the HUMAN owns the SUBJECTIVE
judgment (which itch matters, which option fits, when to stop). Never fake either (spec §2.5).

0. **LOCATE** (only when the user has no question — fog). Propose 3–6 candidate signals/questions
   about the topic and ask the user which itches most (they own the CHARGE). Converge to ONE
   center — never hand back a menu. Seed it with `tm init "<center>"` (or `tm new`).
1. **WIDEN** (default first move). Propose a SHALLOW breadth map — the major parts, ~5–9 peers,
   one level, no recursion. Before committing, run `tm collisions --labels "A,B,C"` and resolve
   each hit (see Duplicate resolution below). Commit with `tm decompose <nodeId> --json '{...}'`,
   then `tm provenance <id> drafted` on new nodes.
2. **STEER**. Present the territory; ask the user to pick ONE center to go deeper.
3. **DEEPEN** (vertical). On the chosen node, propose options with a "pick this if X" rationale,
   then `tm grow <nodeId> --json '{...}'` along that spine toward atoms. Collapse siblings. Mark
   new nodes `drafted` (Phase 1 does no verification).
4. **PRIORITISE**. Use `tm status <id> <todo|running|...>` to mark what matters; this is the
   user's call.
5. **ADVANCE / recurse**: pop back, pick the next center, repeat. Stop at atoms (kind `atom`).

### Duplicate resolution (never create a silent duplicate)

When `tm collisions` reports a proposed label already on the board, ask the user which it is:

- **Same thing** → `tm link <parentId> <existingId> --type dependency --label needs`
  (DAG, one node — do not create a second)
- **Different** → rename the proposed label, then decompose with the new label
- **A concern** → `tm facet <parentId> considerations add "<label>"`
  (cross-cutting, not a child)

### Mode toggle

| State | Command | Effect |
|---|---|---|
| Enter Guide mode | `tm guide on` | Sets `guideMode: true` on the board |
| Exit Guide mode | `tm guide off` | Clears flag; reverts to deep-dive default |

Guide mode is a board-level flag — it persists across sessions until turned off. The CLI table
above (`tm show`) does not surface it directly; use `tm show --json` and check `guideMode`.

### C′ verification — what happens on DEEPEN (the trust layer)

Render first, verify after; never block the flow (spec §2.4–§2.5). The machine drafts and
classifies; you (Claude) do the source work and write results back. Steps:

1. CACHE CHECK (cross-board, context-aware): `tm cache-entry "<topic>"`. On a HIT, read its
   `context`. If the cached context MATCHES this board's context, graft it (instant reuse via
   `tm grow`). If it DIFFERS (e.g. cached from "static blog", now on a "video platform"),
   SURFACE it to the user — "cached from <context>; reuse or re-verify for <this context>?" —
   and let them choose. Never silently reuse across a different context. On a MISS, continue.
2. DRAFT + RENDER. `tm grow <nodeId> --json '{...}'`, then `tm provenance <id> drafted` on
   new nodes. The user sees options immediately.
3. CLASSIFY per option (factual vs subjective) — do NOT classify the whole node; a "hosting"
   node mixes factual options (providers) with a subjective "which fits me".
4. VERIFY in the background, upgrading in place:
   - FACTUAL → WebSearch the claim, judge it, then
     `tm verify <id> --provenance verified --kind factual --sources <url1,url2> --volatility <static|weeks|volatile>`.
     Pick volatility by how fast it rots (pricing → volatile; "what is HTTP" → static).
   - SUBJECTIVE → present 2–3 competing credible takes ("pick this if X"), then
     `tm verify <id> --provenance informed-opinion --kind subjective`. Never fake `verified`.
   - If sources are thin/uncertain → leave it `drafted` (honest), don't upgrade.
5. CACHE WITH CONTEXT: `tm cache-put "<topic>" --json '{...}' --context "<this board's context>"`
   so a later visit on the same context is instant and a cross-context hit is surfaced honestly.
6. RATIONALE WRITEBACK. For each option node, write its "pick this if X" rationale:
   `tm rationale <id> "pick this if …"`. This renders in the node drawer alongside provenance
   and sources, so the user sees the decision logic without re-reading the thread.
7. STALENESS. Run `tm refresh-stale` when revisiting a board; `stale` nodes should be
   re-verified before you rely on them.

Never silently overwrite content the user already acted on — if verification changes a
material answer, say so ("this changed since you saw it"), don't swap it quietly.
