# Architecture & Technical Decisions

How Thinking Machine is structured, and the deliberate calls on what infrastructure it does — and does **not** — need. Principle throughout (the project's quality canon): *monolith-first, boring over clever, distribute only under measured pressure.* Every "no" below comes with the trigger that would flip it to "yes," so these are decisions, not dogma.

## Current shape (already sound)

```
  packages/core         ← pure domain. deps: zod only.
    schema.ts           browser-safe: types + zod + migrate()  ── NEVER imports fs
    ops.ts, layout.ts   pure graph operations
    judge.ts            THE portable judgment spec (prompt + contract) — pure
    board.ts boards.ts  fs persistence  ── fs lives HERE, segregated
    recall.ts           lexical TF-DF cross-board search
    library.ts          fs-backed cache of verified subtrees
  packages/cli          thin adapter over core (commander) + claudeCliJudge
  packages/mcp          thin adapter over core (MCP SDK) — commit-only tools
  apps/web              React Flow renderer + 6 layout algorithms + Express sidecar
```

This is **ports & adapters**: `core` owns logic, surfaces are 1-line triggers, `Judge` is a port with `claudeCliJudge` as its one adapter. The critical discipline already in place — **keep `schema.ts` + pure ops browser-safe; segregate everything that touches `fs`** (the `library.ts` comment says it outright: *"the browser must not pull fs in"*). Preserve this. New pure code (e.g. the diagram serializer) goes browser-safe; new IO goes in an adapter.

---

## Technical decisions

### 1. Database? → **No. Keep flat JSON files.**
Boards are small (median 25 nodes, largest 353), single-user, single-writer. JSON files give you git-diffable history, human inspection, and **portability — which is a differentiator, not an accident** ("the format is the product"). Atomic `tmp + rename` writes are already the right robustness primitive.
- A DB adds an ops surface, a migration story, and kills portability for zero benefit at this scale.
- **Revisit when:** you have concurrent writers across processes, or a single store exceeds ~10k boards and full-scan load hurts. Even then, reach for **SQLite as a derived index/cache — never as the source of truth.** The JSON files stay canonical.

### 2. RAG? → **No — and this isn't a RAG problem.**
Classic RAG chunks unstructured text, embeds it, and retrieves chunks to ground a generation. TM's recall retrieves **whole structured nodes** (with provenance) to *seed* a new decomposition. The retrieval target is a graph node, not a text chunk; there's no generation to "augment." So don't import the RAG architecture — you'd be solving a problem you don't have.
- What you *may* want is narrower: **semantic recall** (embeddings for search), upgrading today's lexical match so "slop"≈"generic", "wedge"≈"niche" connect. That's a search quality upgrade, not RAG.

### 3. Embeddings / vector search? → **Not yet. Lexical is correct for now; make embeddings an optional, derived index later.**
Recall today loads the store and TF-DF ranks it. At ~2,900 nodes that's <100ms and has **zero model dependency** — a real virtue. Embeddings would improve recall (synonyms, paraphrase) but introduce an embedding-model dependency and an index to maintain.
- **Design when you add it:** embed each node once into a **derived index** (`.tmind/index` or `sqlite-vec`), updated incrementally *in the board write-path* — never re-embed the whole store per query. Keep lexical as the zero-dep fallback. Put the embedder behind a port (like `Judge`), default to a cheap/local model, and isolate the dep in its own module/package (`@tm/recall-embed`) so `core` stays lean.
- **Revisit when:** users report recall "misses obvious related boards," or the corpus is large enough that lexical precision drops. Not before — it's speculative complexity today (canon: *evolvability over speculation*).

### 4. Daemon / persistent server? → **No. Keep the on-demand sidecar.**
`tmind ui` spawns the Express sidecar serving the prebuilt canvas bundle (Vite is build-time only) and auto-frees the port — that's a *view*, spawned on demand, not a service. A persistent daemon adds lifecycle, port, and staleness problems for a single-user tool.
- The tempting reasons — "keep the recall index warm," "watch files and reindex" — are only justified under concurrent multi-process writes. Prefer **reindex-on-write inside the write-path** over a background watcher; it's simpler and can't drift.
- **Revisit when:** CLI + MCP + web genuinely write concurrently and need a shared warm index, or you offer a hosted/multi-user mode. That's a different product; don't pre-build it.

### 5. The interview loop (Phase 1) → **stateless in core; state lives in the caller.**
The gap→question→answer→re-decompose loop is multi-turn, but it needs **no session store**. `core` stays pure: `decompose(ctx) → JudgeResult` (commit *or* gap). If it's a gap, the **adapter** (MCP agent turn, or CLI interactive prompt) asks the user and calls again with the answer folded into `ctx`. The board persists only the *resolved* answer (as context/a node). No DB, no session daemon — the conversation is the state.

### 6. LLM as a port → **keep it pluggable; treat output as untrusted.**
`Judge` is already a port; the only adapter shells out to `claude -p`. Keep that seam — don't hardcode a provider. Validate every judge proposal against a strict zod schema before it mutates a board (the LLM is an external dependency crossing a trust boundary).

---

## Where new code goes (folder placement)

| New capability | Package / file | Pure or IO |
|---|---|---|
| `gap`, `probe`, `confidence` types + migrate | `core/schema.ts` | pure, browser-safe |
| `JudgeResult` union + prompt contract | `core/judge.ts` | pure |
| probe → status derivation | `core/ops.ts` | pure |
| **Mermaid / ASCII serializer** (`board → string`) | `core/serialize.ts` (new) | pure, **browser-safe** (no fs) |
| interview loop | `cli/judge-cli.ts`, `mcp/index.ts` | IO (adapter) |
| form-follows-meaning (judge emits `layout`) | `core/judge.ts` emits data; `apps/web` renders | pure decision, IO render |
| causal edge / why-chain | `core/schema.ts` (edge type) + `core/judge.ts` | pure |
| embeddings (later) | `@tm/recall-embed` (new package) | IO, isolated dep |

Rules that keep it clean:
- **New pure logic never imports `fs`** — if it needs persistence, that's an adapter call. This keeps the web bundle buildable.
- **One serializer, shared** — the text (Mermaid/ASCII) and the web (React Flow) render from the *same* `core` structure; don't duplicate layout logic across surfaces.
- **Tests colocate** (`*.test.ts` beside source, as the repo already does), real systems only — golden LLM fixtures + `mkdtemp` stores, no mocks.

---

## Non-goals (explicit anti-over-engineering)

- No database, no ORM, no migrations framework — flat JSON is the source of truth.
- No RAG pipeline, no vector DB service — recall retrieves structured nodes, not chunks.
- No persistent daemon / microservices — one binary + an on-demand view.
- No internal reasoning search (MCTS/self-consistency) — the judge LLM already does that; TM structures and grounds it.

The whole system stays: **a pure core, thin adapters, flat portable files, and an on-demand canvas** — small enough to hold in your head, which is itself the quality bar.
