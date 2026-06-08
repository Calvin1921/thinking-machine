# Thinking Machine

A visual canvas for mapping thinking — research, decisions, system designs — as a graph of
nodes. You expand a node by **decomposition** (breaking it into parts → child nodes, building
a DAG) and analyze it through **facets** (lenses applied to a node without spawning new ones).

The decomposition intelligence is **Claude Code acting as a domain-aware LLM-judge**, driving
the board through a CLI and MCP server guided by a skill. The web canvas renders the same
`board.json` and **live-updates** as the board is edited from the terminal.

```
board.json  ── single source of truth (nodes, edges, facets)
   ▲ atomic read-modify-write (+ lockfile)
 core lib ── ALL board operations (zod schema)
   ▲          ▲            ▲
  CLI (tm)   MCP server   Web sidecar (Express)
                          ├─ REST read/write → core
                          └─ chokidar file-watch → SSE → React Flow canvas

 Skill `thinking-machine` ── teaches Claude Code the command vocabulary + the
                             decompose → confirm → commit method.
```

## Packages

| Path | What |
|---|---|
| `packages/core` | zod schema + atomic-write/lockfile board store + node ops |
| `packages/cli` | `tm` — commander CLI over core |
| `packages/mcp` | MCP server exposing core ops as tools |
| `apps/web` | Express sidecar (REST + SSE) + React Flow canvas |
| `skill/thinking-machine` | the decomposition method + command reference |

## The two axes

- **Decompose** → child nodes (the tree/DAG). `Web App → Frontend, Backend, Database`.
- **Facets** → lenses on a node: `definition, essentials, dependencies, priorities,
  considerations, perspectives` (a seed set; the LLM-judge swaps lenses per domain).
- A facet item becomes a node when it earns its own sub-tree (**promote**). Shared
  dependencies are **dependency** cross-edges → a DAG, not a pure tree. Leaves are **atoms**.

## Develop

```bash
pnpm install
pnpm -r build          # builds core → cli → mcp → web in dependency order
pnpm -r test           # 24 tests across all packages

# seed + run the canvas
cd apps/web
node ../../packages/cli/dist/index.js --file board.json init "My Idea" --root-type objective
pnpm dev               # sidecar on :8787 + Vite on :5173

# edit the board from the terminal and watch the canvas live-update
node ../../packages/cli/dist/index.js --file board.json decompose root --json \
  '{"decomposition":[{"label":"Frontend","kind":"branch"},{"label":"Backend","kind":"branch"}],"edges":[{"fromLabel":"Frontend","toLabel":"Backend","type":"dependency"}]}'
```

Design spec and implementation plan live in `docs/superpowers/`.

## Status

v1: single deep canvas, full CLI + MCP + skill + live-reload loop. Deferred: galaxy/multi-canvas
overview, real-time collab, auth, DB persistence.
