# Thinking Machine

A thinking canvas where the intelligence lives in the CLI. You map research, decisions,
and system designs as a graph of nodes; an LLM-judge decomposes each node into the parts
worth thinking about further; a React Flow canvas live-updates as the board is edited
from the terminal.

**Why it exists:** chat answers *for* you, and notes bury what you concluded. Thinking
Machine keeps reasoning as a durable, git-diffable `board.json` graph — grown step by
step, with one honesty rule enforced by the type system: when the judge lacks the
information to decompose a node, it must plant a **gap** (the question that would
unblock it) instead of inventing children.

```
board.json  ── single source of truth (nodes, edges)
   ▲ atomic read-modify-write (+ lockfile), schema-validated before every write
 core lib ── ALL board operations; the Judge is a port (claude -p is one adapter)
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
| `packages/core` | zod schema + migrations, atomic-write/lockfile store, graph ops, judge contract, cross-board recall |
| `packages/cli` | `tm` — commander CLI over core, incl. the embedded judge (`grow-auto`) and `tm ui` |
| `packages/mcp` | MCP server exposing core ops as tools |
| `apps/web` | Express sidecar (REST + SSE) + React Flow canvas, 6 layout algorithms |
| `skill/thinking-machine` | the decomposition method + command reference |

## How thinking is kept honest

- **One mechanic — decompose.** Break a node into the parts worth thinking about
  further → child nodes. Shared dependencies are cross-edges, so a board is a DAG,
  not a pure tree. Leaves are atoms.
- **Commit or gap, never both.** The judge's output contract is a discriminated
  union: either children, or a gap (`intent | structure | reality` + the one question
  that would unblock the most). There is no representable state for "confident
  children over missing information". `tm gap` / `tm resolve` plant and close
  frontier flags; the canvas draws open gaps as the map's edge.
- **Provenance is typed, not vibes.** Nodes carry
  `drafted | verified | refuted | informed-opinion | stale`; `tm verify` records a
  check, `tm refresh-stale` downgrades verifications past their TTL, and cross-board
  recall prints provenance per line — borrowed conclusions are never silently
  trusted.
- **LLM output is untrusted input.** Every judge proposal is strict-parsed against
  the zod contract before it can mutate a board, and the whole board is validated
  again before every write. Malformed output fails loud; it never commits.

## Tradeoffs

- **Flat JSON files over a database.** Boards are single-user and small; files are
  git-diffable, human-inspectable, and portable — the format is the product. The
  cost is whole-file reads and a lockfile instead of transactions. The revisit
  trigger (and why SQLite would only ever be a derived index) is in
  [ARCHITECTURE.md](ARCHITECTURE.md).
- **Lexical recall over embeddings.** Cross-board search is TF-DF ranking: fast at
  the current corpus size with zero model dependency. The cost is no synonym
  matching. Embeddings stay a future derived index behind a port until recall
  precision measurably hurts.
- **`claude -p` as the only judge adapter.** No API-key setup for the target user
  (already inside Claude Code), at the cost of a CLI dependency. The `Judge` port
  keeps another provider one adapter away.

## Develop

```bash
pnpm install
pnpm -r build          # builds core → cli → mcp → web in dependency order
pnpm -r test           # 157 tests: 83 core · 19 cli · 18 mcp · 37 web

# create a board and open the canvas
mkdir boards
node packages/cli/dist/index.js --dir boards new "My Idea" --root-type objective
node packages/cli/dist/index.js ui --dir boards        # sidecar + canvas on :8787
```

`tm ui` auto-frees a stale port before starting. Edit the board from a second
terminal (`tm add`, `tm grow`, `tm gap`, …) and the canvas live-updates over SSE.

## Design docs

| Doc | What it answers |
|---|---|
| [NORTH_STAR.md](NORTH_STAR.md) | What the tool is for, the honesty rules, the test of success |
| [BUILD_RECONCILIATION.md](BUILD_RECONCILIATION.md) | North star vs. shipped code — capability scorecard + dependency-ordered build plan |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Structure, and the deliberate infrastructure decisions (DB? RAG? daemon? — each "no" with its revisit trigger) |
| [EVALUATION.md](EVALUATION.md) | How each capability is proven — deterministic layer in CI, behavioral layer with pass-rate bars |

Original design spec and implementation plans: `docs/superpowers/`.

## Status

v1 shipped: deep canvas, full CLI + MCP + skill, live-reload loop, and the gap-aware
judge (commit-or-gap contract, PR #12). Open, in dependency order: automated
interview loop, typed probes, Mermaid/ASCII serializer, causal why-chains — see
[BUILD_RECONCILIATION.md](BUILD_RECONCILIATION.md).
