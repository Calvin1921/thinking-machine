---
name: thinking-machine
description: Use when the user wants to build, expand, or decompose a Thinking Machine board — mapping research, decisions, or system designs as a graph of nodes. Drives the `tm` CLI / MCP to read and edit board.json, decomposing nodes as a domain-aware LLM-judge with the user confirming before commit.
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

## The discipline: propose → confirm → commit

NEVER write a large decomposition silently. Always:
1. Read the node: `tm show --node <id> --json`.
2. Propose `{ decomposition, edges?, facets? }` to the user as plain text + the rationale.
3. Ask which children/facets to keep (all / some / edit).
4. Commit the confirmed set in ONE call: `tm decompose <id> --json '<proposal>'`.

A proposal should usually be 3–6 children — not 30. Breadth comes from iterating, not
from one explosion.

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
| `tm decompose <id> --json '<proposal>'` | commit a full proposal in one shot (preferred write path) |

`tm decompose` proposal shape:
```json
{
  "decomposition": [{ "label": "Frontend", "kind": "branch" }, { "label": "Database", "kind": "atom" }],
  "edges": [{ "fromLabel": "Frontend", "toLabel": "Backend", "type": "dependency" }],
  "facets": { "considerations": ["scope creep is the #1 killer"] }
}
```
`edges[].fromLabel`/`toLabel` reference the `label`s of the children you're creating in the
same call. `facets` are added to the node being decomposed (the `<id>`), not the children.

## MCP equivalents

If the MCP server is connected, the same operations are tools: `tm_init`, `tm_show`,
`tm_add_node`, `tm_link`, `tm_set_facet`, `tm_promote`, `tm_decompose` (same input shapes
as the CLI). Prefer these in-session; fall back to the CLI otherwise. The MCP server reads
the board path from the `TM_BOARD` env var.

## Domain-aware decomposition method

Given a node + its ancestor path + the board's `domainHint` + sibling labels:
1. Infer the domain (software, business, decision, operations, research, …).
2. Choose 3–6 child parts that are MECE-ish and worth deeper thought.
3. Choose the 4–6 facet lenses that fit the domain; seed 1–3 items each where you have
   genuine signal — leave the rest empty for the user.
4. Add dependency edges only for real shared dependencies.
5. Present, confirm, then `tm decompose`.

The web canvas live-updates as you commit. New child nodes are placed to the right of
their parent automatically — tell the user to fit-view if they fall outside the viewport.
